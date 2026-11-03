import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, unlink } from "node:fs/promises";
import { build } from "esbuild";
import * as THREE from "three";
import { validScore } from "../shared/games.mjs";
await mkdir(new URL("../work/", import.meta.url), { recursive: true });
const target = new URL("../work/missions-tests.mjs", import.meta.url);
await build({ entryPoints: ["src/world/Missions.ts"], bundle: true, format: "esm", platform: "node", outfile: target.pathname, external: ["three", "three/*"], logLevel: "error" });
const { Missions, dispatchRoute, bays, tokenSpots, TAXI_SECONDS, inBay } = await import(target.href);
await unlink(target);

function host() {
  const h = {
    scene: new THREE.Scene(), colliders: [], mode: "drive", position: new THREE.Vector3(), yaw: 0, reduced: true,
    speed: 0, messages: [], sound: null,
    get focus() { return this.position; },
    speedNow() { return this.speed; },
    free: () => true,
    callbacks: { message: (m) => h.messages.push(m) },
  };
  return h;
}
const run = (m, seconds, dt = 0.05) => { for (let t = 0; t < seconds; t += dt) m.update(dt); };

test("countdown holds the clock, then dispatch completes in route order", () => {
  const h = host(), m = new Missions(h, () => 0);
  m.start("dispatch");
  run(m, 2.9); assert.equal(m.phase, "countdown"); assert.equal(m.elapsed, 0);
  run(m, 0.2); assert.equal(m.phase, "running");
  // Speeding through a ring doesn't count; slowing down does.
  h.position.set(dispatchRoute[0].x, 0, dispatchRoute[0].z); h.speed = 10; run(m, 0.2); assert.equal(m.step, 0);
  h.speed = 1;
  for (const [i, t] of dispatchRoute.entries()) { h.position.set(t.x, 0, t.z); run(m, 1.5); assert.equal(m.step, i + 1); }
  assert.equal(m.phase, "finished"); assert.equal(m.count, 4);
  assert.ok(validScore({ game: "dispatch", durationMs: Math.max(30000, m.result.durationMs) }));
  assert.ok(h.messages.some((s) => s.includes("The Gallery")));
});

test("taxi counts completed trips, needs a full stop and ends after five minutes", () => {
  const h = host(), m = new Missions(h, () => 0.5);
  h.position.set(3.4, 0, 80); m.start("taxi"); run(m, 3.1);
  const pickup = m.target; assert.equal(pickup.kind, "pickup");
  h.position.set(pickup.x, 0, pickup.z); h.speed = 3; run(m, 2); assert.equal(m.target.kind, "pickup", "rolling past is not a pickup");
  h.speed = 0; run(m, 1); assert.equal(m.target.kind, "drop"); assert.ok(m.aboard);
  const drop = m.target; assert.ok(Math.hypot(drop.x - pickup.x, drop.z - pickup.z) > 70);
  h.position.set(drop.x, 0, drop.z); run(m, 1); assert.equal(m.count, 1); assert.equal(m.target.kind, "pickup");
  const lastDrop = m.lastDrop;
  h.position.set(500, 0, 500); run(m, TAXI_SECONDS);
  assert.equal(m.phase, "finished");
  assert.deepEqual(m.result, { moves: 1, durationMs: Math.round(lastDrop * 1000) });
  assert.equal(validScore({ game: "taxi", ...m.result }), false, "a trip in a few seconds is impossible and rejected");
  assert.equal(m.telemetry().remaining, 0);
});

test("parking needs an aligned, stopped car in each bay and counts scrapes", () => {
  const h = host(), m = new Missions(h);
  m.start("parking"); run(m, 3.1);
  assert.equal(h.colliders.length, bays.length * 4, "cones are solid");
  assert.equal(inBay(bays[0].x, bays[0].z, 0, bays[0]), false, "a car across the street isn't parked");
  m.onImpact(3); m.onImpact(3); run(m, 1); m.onImpact(0.2); m.onImpact(4);
  assert.equal(m.scrapes, 2, "one scrape per bump, gentle touches ignored");
  h.yaw = -Math.PI / 2; h.speed = 0;
  for (const [i, b] of bays.entries()) { h.position.set(b.x + 0.4, 0, b.z - 0.3); run(m, 1); assert.equal(m.count, i + 1); }
  assert.equal(m.phase, "finished"); assert.equal(m.result.moves, 2);
  m.cancel(); assert.equal(h.colliders.length, 0, "cones are removed afterwards");
});

test("the hunt places ten tokens and finishes when the last is collected", () => {
  const h = host(), m = new Missions(h);
  m.start("hunt"); run(m, 3.1);
  assert.equal(m.tokens.length, tokenSpots.length); assert.equal(m.locksCar, false, "you can walk during the hunt");
  h.mode = "walk";
  for (const t of m.tokens.slice(0, -1)) { h.position.set(t.x + 1, 0, t.z); run(m, 0.1); }
  assert.equal(m.count, 9); assert.equal(m.phase, "running");
  h.position.set(m.tokens.at(-1).x, 0, m.tokens.at(-1).z); run(m, 0.1);
  assert.equal(m.phase, "finished");
});

test("tokens and stops avoid obstacles by moving to the nearest free spot", () => {
  const h = host(); h.free = (x, z) => Math.hypot(x - 10, z - 10) > 2;
  const m = new Missions(h);
  const [x, z] = m.place(10, 10, 0.5, true);
  assert.ok(Math.hypot(x - 10, z - 10) > 2 && Math.hypot(x - 10, z - 10) < 3);
});
