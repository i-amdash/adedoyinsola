import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { createCloud } from "../server/cloud.mjs";

test("Vercel cannot silently fall back to ephemeral filesystem storage", () => {
  assert.throws(() => createCloud({ VERCEL: "1", DATA_BACKEND: "local" }), /SUPABASE/);
  assert.throws(() => createCloud({ DATA_BACKEND: "supabase" }), /SUPABASE/);
  assert.equal(createCloud({ DATA_BACKEND: "local" }), null);
});

test("the Supabase SQL enforces private access, atomic game completion and shared rankings", async t => {
  // Execute the actual setup against isolated PostgreSQL; Supabase supplies these
  // roles and its storage schema in production. No remote credentials or data used.
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls; create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit integer,allowed_mime_types text[]);");
  const sql = await readFile(new URL("../supabase/setup.sql", import.meta.url), "utf8");
  await db.exec(sql); await db.exec(sql); // Setup is safe to rerun.
  const query = async (sql, params = []) => (await db.query(sql, params)).rows;
  await t.test("every app table has RLS and denies public reads and writes", async () => {
    const tables = await query("select tablename, rowsecurity from pg_tables where schemaname='public'");
    assert.equal(tables.length, 6);
    for (const { tablename, rowsecurity } of tables) {
      assert.equal(rowsecurity, true);
      for (const role of ["anon", "authenticated"]) for (const grant of ["SELECT", "INSERT", "UPDATE", "DELETE"])
        assert.equal((await query("select has_table_privilege($1,$2,$3) as allowed", [role, tablename, grant]))[0].allowed, false);
    }
    const functions = await query("select p.oid,p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'portfolio_%'");
    assert.equal(functions.length, 3);
    for (const fn of functions) {
      assert.equal(fn.prosecdef, false);
      assert.equal((await query("select has_function_privilege('anon',$1,'EXECUTE') as allowed", [fn.oid]))[0].allowed, false);
    }
  });
  const a = randomUUID(), b = randomUUID(), c = randomUUID(), attempt = randomUUID();
  await query("insert into portfolio_players(id,username,password_hash) values ($1,'player_a','test-hash'),($2,'player_b','test-hash'),($3,'player_c','test-hash')", [a, b, c]);
  await t.test("usernames are unique regardless of case", async () => {
    await assert.rejects(query("insert into portfolio_players(username,password_hash) values ('PLAYER_A','other-hash')"), { code: "23505" });
  });
  await t.test("only the owner can complete an elapsed attempt and retries cannot duplicate it", async () => {
    await query("insert into portfolio_attempts(id,player_id,game,starts_at,expires_at) values ($1,$2,'memory',now()-interval '1 minute',now()+interval '1 hour')", [attempt, a]);
    await assert.rejects(query("select portfolio_finish_game($1,$2,'memory',10000,8)", [b, attempt]), { code: "PT409" });
    const score = (await query("select portfolio_finish_game($1,$2,'memory',10000,8) as result", [a, attempt]))[0].result;
    assert.equal(score.player_id, a); assert.equal(score.moves, 8);
    const retry = (await query("select portfolio_finish_game($1,$2,'memory',9000,6) as result", [a, attempt]))[0].result;
    assert.equal(retry.moves, 8); assert.equal(retry.duration_ms, 10000);
    assert.equal((await query("select count(*)::int as count from portfolio_scores"))[0].count, 1);
    assert.equal((await query("select count(*)::int as count from portfolio_attempts"))[0].count, 0);
  });
  await t.test("future and expired attempts are rejected", async () => {
    const future = randomUUID();
    await query("insert into portfolio_attempts(id,player_id,game,starts_at,expires_at) values ($1,$2,'memory',now()+interval '3 seconds',now()+interval '1 hour')", [future, a]);
    await assert.rejects(query("select portfolio_finish_game($1,$2,'memory',1000,6)", [a, future]), { code: "PT400" });
    await query("update portfolio_attempts set expires_at=now()-interval '1 minute' where id=$1", [future]);
    await assert.rejects(query("select portfolio_finish_game($1,$2,'memory',1000,6)", [a, future]), { code: "PT409" });
  });
  await t.test("each player gets one best score with shared ranks for ties", async () => {
    await query("insert into portfolio_scores(id,player_id,game,duration_ms,moves) values ($1,$2,'memory',10000,8),($3,$4,'memory',12000,6),($5,$4,'memory',14000,10)", [randomUUID(), b, randomUUID(), c, randomUUID()]);
    const board = (await query("select portfolio_leaderboard('memory',$1) as result", [a]))[0].result;
    assert.equal(board.total, 3); assert.deepEqual(board.entries.map(row => row.rank), [1, 2, 2]);
    assert.equal(board.me.playerId, a); assert.equal(board.me.rank, 2);
    assert.ok(board.entries.every(row => !('password_hash' in row)));
    assert.equal((await query("select portfolio_leaderboard('sprint') as result"))[0].result.total, 0);
  });
  await t.test("rate limits share counters and reset after expiration", async () => {
    assert.equal((await query("select portfolio_rate_hit('test',1000) as result"))[0].result.totalHits, 1);
    assert.equal((await query("select portfolio_rate_hit('test',1000) as result"))[0].result.totalHits, 2);
    await query("update portfolio_rate_limits set expires_at=now()-interval '1 second' where key='test'");
    assert.equal((await query("select portfolio_rate_hit('test',1000) as result"))[0].result.totalHits, 1);
  });
});
