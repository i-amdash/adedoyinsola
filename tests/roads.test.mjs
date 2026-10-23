import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, unlink, mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import ts from "typescript";

async function load(file) {
  const source = await readFile(new URL(`../src/world/${file}.ts`, import.meta.url), "utf8");
  const dir = path.resolve("work");
  await mkdir(dir, { recursive: true });
  const out = path.join(dir, `${file}-test-runtime.mjs`);
  await writeFile(
    out,
    ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    }).outputText,
  );
  try {
    return await import(pathToFileURL(out).href);
  } finally {
    await unlink(out).catch(() => {});
  }
}

test("GPS routes stay on the road network and reach every destination", async () => {
  const { route, avenues, streets } = await load("roads");
  const onRoad = ([x, z]) =>
    avenues.some((a) => Math.abs(x - a.x) <= a.width / 2 + 0.01 && z >= a.from && z <= a.to) ||
    streets.some((s) => Math.abs(z - s.z) <= s.width / 2 + 0.01 && x >= s.from && x <= s.to);
  const places = [
    [-14, 2],
    [14, -42],
    [-14, -88],
    [14, 65],
  ];
  for (const from of [
    [3.3, 86],
    [-67, -100],
    [70, 30],
    [0, -170],
  ])
    for (const to of places) {
      const path = route(from, to);
      assert.deepEqual(path[0], from);
      assert.deepEqual(path.at(-1), to);
      for (const p of path.slice(1, -1)) assert.ok(onRoad(p), `off-road point ${p}`);
      let length = 0;
      for (let i = 1; i < path.length; i++)
        length += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
      const direct = Math.hypot(to[0] - from[0], to[1] - from[1]);
      assert.ok(length < direct * 3 + 60, `route too long: ${length} vs ${direct}`);
    }
});
