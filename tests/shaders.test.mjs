import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

// With MSAA, the GPU may run a fragment shader for a pixel whose centre lies just outside the
// triangle, so interpolated varyings (UVs, normals) can overshoot their [0, 1] range. pow() of a
// negative base is NaN, and bloom smears a single NaN pixel into a large black blob. Guard bases.
test("GLSL pow() bases built from varyings are clamped", () => {
  const dir = new URL("../src/world/", import.meta.url);
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".ts"))) {
    const src = readFileSync(new URL(f, dir), "utf8");
    for (const m of src.matchAll(/(?<![.\w])pow\(\s*([^,]+),/g)) {
      const base = m[1].trim();
      if (/^(clamp|max|abs|saturate)\(/.test(base) || /^[a-zA-Z_]\w*$/.test(base) || /^[\d.]+$/.test(base)) continue;
      assert.fail(`${f}: unguarded pow base "${base}"`);
    }
  }
});

test("post-processing scrubs non-finite pixels before bloom and in the grade", () => {
  const src = readFileSync(new URL("../src/world/Atmosphere.ts", import.meta.url), "utf8");
  assert.match(src, /materialHighPassFilter[\s\S]*floatBitsToUint/);
  assert.match(src, /bool nonFinite\(vec3 c\)/);
});
