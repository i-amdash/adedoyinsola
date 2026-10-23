import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, unlink } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { build } from "esbuild";
import * as THREE from "three";

// Bundle the neighbourhood builder (it spans several modules) and build it headless.
async function loadDistrict() {
  const dir = path.resolve("work");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, "district-test-runtime.mjs");
  await build({
    entryPoints: [path.resolve("src/world/District.ts")],
    bundle: true,
    format: "esm",
    platform: "node",
    outfile: file,
    external: ["three", "three/*"],
    logLevel: "error",
  });
  return { mod: await import(pathToFileURL(file).href + "?" + Date.now()), file };
}

test("the estate builds finite, batched geometry with clear roads and reachable destinations", async () => {
  const previous = globalThis.document;
  globalThis.document = {
    createElement: () => ({ width: 1, height: 1, getContext: () => null }),
    createElementNS: () => ({ addEventListener() {}, removeEventListener() {}, set src(_v) {} }),
  };
  const { mod, file } = await loadDistrict();
  try {
    const scene = new THREE.Scene();
    const surfaces = [];
    // Record real street construction before batching, where box boundaries are exact.
    for (const method of ["roads", "median"]) {
      const original = mod.District.prototype[method];
      mod.District.prototype[method] = function () {
        const batch = this.kit.b, box = batch.box;
        batch.box = function (material, w, h, d, x, y, z, ...rotation) {
          if (!rotation.some(Boolean)) surfaces.push({ w, h, d, x, y, z });
          return box.call(this, material, w, h, d, x, y, z, ...rotation);
        };
        try { return original.call(this); } finally { batch.box = box; }
      };
    }
    const district = new mod.District(scene, 4);
    const overlap = (a, b, axis, extent) => Math.min(a[axis] + a[extent] / 2, b[axis] + b[extent] / 2) - Math.max(a[axis] - a[extent] / 2, b[axis] - b[extent] / 2) > 1e-6;
    for (const [label, boxes] of [
      ["asphalt", surfaces.filter(b => Math.abs(b.y + b.h / 2) < 1e-6)],
      ["paving and drain bridges", surfaces.filter(b => Math.abs(b.y + b.h / 2 - .16) < 1e-6)],
      ["kerb blocks and end caps", surfaces.filter(b => (b.h === .32 && b.y === .06) || (b.h === .3 && b.y === .05) || (b.h === .26 && b.y === .04))],
    ]) {
      assert.ok(boxes.length > 10, `expected to inspect real ${label}`);
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++)
        assert.ok(!(overlap(boxes[i], boxes[j], "x", "w") && overlap(boxes[i], boxes[j], "z", "d")), `${label} overlap and will flicker: ${JSON.stringify([boxes[i], boxes[j]])}`);
    }
    let meshes = 0,
      triangles = 0;
    scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        meshes++;
        const p = o.geometry.getAttribute("position");
        for (let i = 0; i < p.count; i += 7)
          assert.ok(Number.isFinite(p.getX(i)) && Number.isFinite(p.getY(i)) && Number.isFinite(p.getZ(i)));
        triangles += (o.geometry.index?.count || p.count) / 3;
      }
    });
    assert.ok(meshes < 200, `Expected batching to keep meshes below 200, got ${meshes}`);
    assert.ok(triangles > 100000, `Expected a detailed neighbourhood, got ${triangles} triangles`);
    console.log(`meshes ${meshes} triangles ${Math.round(triangles)} colliders ${district.colliders.length} lamps ${district.lamps.length} canopies ${district.canopies.length} parking ${district.parking.length}`);
    assert.ok(district.colliders.length > 100);
    assert.ok(district.lamps.length > 10);
    assert.ok(district.canopies.length > 30);
    const blocked = (x, z, r = 1.0) =>
      district.colliders.some((b) => x > b.min.x - r && x < b.max.x + r && z > b.min.z - r && z < b.max.z + r);
    // Both carriageways must be drivable end to end.
    for (const x of [3.4, 6.9, -3.4, -6.9])
      for (let z = -178; z <= 130; z += 2) assert.equal(blocked(x, z), false, `Lane ${x} blocked at ${z}`);
    // Cross roads are open between the avenue and the side roads.
    for (const j of [-112, -65, -20, 28, 110]) for (let x = -66; x <= 66; x += 2) assert.equal(blocked(x, j), false, `Junction road ${j} blocked at ${x}`);
    // Destination arrival points sit on open footpath.
    for (const [x, z] of [
      [-14, 2],
      [14, -42],
      [-14, -88],
      [14, 65],
    ])
      assert.equal(blocked(x, z, 0.4), false, `Arrival blocked at ${x},${z}`);
    assert.equal(blocked(23.6, -2, 0), true, "Block of flats must have collision");
    assert.equal(district.groundHeight(12.5, 50), 0.16);
    assert.equal(district.groundHeight(5, 50), 0);
    district.dispose();
    assert.equal(scene.children.length, 0);
  } finally {
    globalThis.document = previous;
    await unlink(file).catch(() => {});
  }
});
