import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createApp } from "../server/app.mjs";
import { createPlayerStore } from "../server/players.mjs";
import { rankScores, validScore } from "../shared/games.mjs";
async function fixture(t) {
  const directory = await mkdtemp(tmpdir() + "/avenue-games-");
  let now = Date.now();
  const server = createApp({directory, now: () => now}).listen(0, "127.0.0.1");
  await new Promise(r => server.once("listening",r));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { await new Promise(r => server.close(r)); await rm(directory,{recursive:true,force:true}); });
  const req = (path, body, cookie) => fetch(base+path,{method:body === undefined ? "GET":"POST",headers:{...(body === undefined?{}:{"Content-Type":"application/json"}),...(cookie?{cookie}:{})},body:body === undefined?undefined:JSON.stringify(body)});
  async function player(username) {
    const r = await req("/api/players/register",{username,password:"test-passphrase-1234"});
    assert.equal(r.status,200);
    return {cookie:r.headers.get("set-cookie").split(";")[0],...(await r.json())};
  }
  async function score(p, game, durationMs, moves) {
    const a = await req("/api/games/attempts",{game},p.cookie);
    assert.equal(a.status,200);
    const {id} = await a.json(); now += durationMs+3000;
    const r = await req("/api/games/results",{attemptId:id,game,durationMs,moves},p.cookie);
    assert.equal(r.status,200,JSON.stringify(await r.clone().json()));
    return {id, result: await r.json()};
  }
  return {req,player,score,directory,advance:ms => now+=ms};
}
test("players have secure, separate sessions; passwords are hashed; accounts persist", async t => {
  const f=await fixture(t), p=await f.player("test_player");
  const stored=await createPlayerStore(f.directory).read();
  assert.notEqual(stored.players[0].hash,"test-passphrase-1234");
  assert.equal((await f.req("/api/players/session",undefined,p.cookie)).status,200);
  assert.equal((await (await f.req("/api/auth/session",undefined,p.cookie)).json()).authenticated,false);
  assert.equal((await f.req("/api/players/register",{username:"TEST_PLAYER",password:"test-passphrase-1234"})).status,409);
  assert.equal((await f.req("/api/players/login",{username:"test_player",password:"wrong-password"})).status,401);
  const login=await f.req("/api/players/login",{username:"TEST_PLAYER",password:"test-passphrase-1234"});
  assert.equal(login.status,200); assert.match(login.headers.get("set-cookie"),/HttpOnly/); assert.match(login.headers.get("set-cookie"),/SameSite=Strict/);
  assert.equal((await f.req("/api/players/register",{username:"bad",password:"short"})).status,400);
  assert.ok(!(await readFile(f.directory+"/players.json","utf8")).includes("test-passphrase-1234"));
  await f.req("/api/players/logout",{},p.cookie);
  assert.equal((await f.req("/api/games/attempts",{game:"sprint"},p.cookie)).status,401);
});
test("ranked results require an owned started attempt and reject premature, invalid or expired runs", async t => {
  const f=await fixture(t), p=await f.player("player_one"), other=await f.player("player_two");
  assert.equal((await f.req("/api/games/attempts",{game:"memory"})).status,401);
  const a=await (await f.req("/api/games/attempts",{game:"memory"},p.cookie)).json();
  const input={attemptId:a.id,game:"memory",durationMs:5000,moves:6};
  assert.equal((await f.req("/api/games/results",input,other.cookie)).status,409);
  assert.equal((await f.req("/api/games/results",input,p.cookie)).status,400);
  f.advance(9000);
  assert.equal((await f.req("/api/games/results",{...input,moves:5},p.cookie)).status,400);
  assert.equal((await f.req("/api/games/results",{...input,durationMs:-1},p.cookie)).status,400);
  const requests=await Promise.all([f.req("/api/games/results",input,p.cookie),f.req("/api/games/results",input,p.cookie)]);
  assert.deepEqual(requests.map(r=>r.status),[200,200]);
  assert.equal((await createPlayerStore(f.directory).read()).scores.length,1);
  const expired=await (await f.req("/api/games/attempts",{game:"memory"},p.cookie)).json(); f.advance(3610001);
  assert.equal((await f.req("/api/games/results",{...input,attemptId:expired.id},p.cookie)).status,409);
});
test("shared rankings retain best per user, separate games, rank ties and survive store restarts", async t => {
  const f=await fixture(t), a=await f.player("alfa"), b=await f.player("bravo"), c=await f.player("charlie");
  await f.score(a,"sprint",30000); await f.score(a,"sprint",35000); await f.score(b,"sprint",28000); await f.score(c,"sprint",28000);
  await f.score(a,"memory",20000,7); await f.score(b,"memory",30000,6); await f.score(c,"memory",25000,6);
  let board=await (await f.req("/api/games/leaderboard?game=sprint",undefined,a.cookie)).json();
  assert.equal(board.total,3); assert.deepEqual(board.entries.map(s=>s.rank),[1,1,3]); assert.equal(board.me.durationMs,30000);
  board=await (await f.req("/api/games/leaderboard?game=memory")).json();
  assert.deepEqual(board.entries.map(s=>s.username),["charlie","bravo","alfa"]);
  assert.equal(board.me,null); assert.ok(!JSON.stringify(board).includes("hash"));
  assert.equal((await createPlayerStore(f.directory).read()).scores.length,7);
});
test("local sessions share deterministic ordering and reject corrupt scores", () => {
  const base={game:"memory",completedAt:"2026-10-22T00:00:00Z"};
  const scores=[{...base,id:"a",durationMs:10000,moves:10},{...base,id:"b",durationMs:30000,moves:6},{...base,id:"c",durationMs:20000,moves:6},{...base,id:"d",durationMs:20000,moves:6}];
  assert.deepEqual(rankScores(scores).map(s=>[s.id,s.rank]),[["c",1],["d",1],["b",3],["a",4]]);
  for (const s of [{game:"unknown",durationMs:10},{game:"sprint",durationMs:NaN},{game:"memory",durationMs:5000,moves:2},{game:"sprint",durationMs:30000,moves:6}]) assert.equal(validScore(s),false);
});
