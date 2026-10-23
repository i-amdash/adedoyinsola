import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as THREE from "three";
test("vehicle GLB is complete, has valid buffer ranges, and usable dimensions", async () => {
  const data = await readFile(
    new URL("../public/assets/car-concept.glb", import.meta.url),
  );
  assert.equal(data.readUInt32LE(0), 0x46546c67);
  assert.equal(data.readUInt32LE(4), 2);
  assert.equal(data.readUInt32LE(8), data.length);
  const size = data.readUInt32LE(12);
  const json = JSON.parse(data.subarray(20, 20 + size).toString());
  const binarySize = data.readUInt32LE(20 + size);
  assert.equal(28 + size + binarySize, data.length);
  for (const b of json.bufferViews)
    assert.ok((b.byteOffset || 0) + b.byteLength <= binarySize);
  const scene = new THREE.Group();
  const nodes = json.nodes.map((n) => {
    const o = new THREE.Object3D();
    if (n.matrix) o.applyMatrix4(new THREE.Matrix4().fromArray(n.matrix));
    else {
      if (n.translation) o.position.fromArray(n.translation);
      if (n.rotation) o.quaternion.fromArray(n.rotation);
      if (n.scale) o.scale.fromArray(n.scale);
    }
    return o;
  });
  json.nodes.forEach((n, i) =>
    n.children?.forEach((j) => nodes[i].add(nodes[j])),
  );
  json.scenes[0].nodes.forEach((i) => scene.add(nodes[i]));
  scene.updateMatrixWorld(true);
  const bounds = new THREE.Box3();
  json.nodes.forEach((n, i) => {
    if (n.mesh !== undefined)
      json.meshes[n.mesh].primitives.forEach((p) => {
        const a = json.accessors[p.attributes.POSITION];
        if (a.min && a.max)
          bounds.union(
            new THREE.Box3(
              new THREE.Vector3().fromArray(a.min),
              new THREE.Vector3().fromArray(a.max),
            ).applyMatrix4(nodes[i].matrixWorld),
          );
      });
  });
  const dimensions = bounds.getSize(new THREE.Vector3());
  assert.ok(dimensions.z > 3 && dimensions.z < 8);
  assert.ok(dimensions.y > 1 && dimensions.y < 3);
  assert.ok(dimensions.x > 1 && dimensions.x < 4);
  assert.equal(
    json.nodes.filter((n) => /^Wheel(Front|Rear)[LR]$/.test(n.name)).length,
    4,
  );
});

for (const name of ["player", "rb-m1", "rb-m2", "rb-m3", "rb-f1", "rb-f2", "rb-f3", "rb-f4"])
  test(`${name} model contains a complete rig and idle/walk/run clips`, async () => {
    const data = await readFile(
      new URL(`../public/assets/people/${name}.glb`, import.meta.url),
    );
    assert.equal(data.readUInt32LE(0), 0x46546c67);
    assert.equal(data.readUInt32LE(8), data.length);
    const size = data.readUInt32LE(12),
      json = JSON.parse(data.subarray(20, 20 + size).toString());
    assert.ok(json.skins.length > 0);
    const names = json.animations.map((a) => a.name);
    for (const clip of ["Idle", "Idle2", "Walk", "Run", "Wave"])
      assert.ok(names.includes(clip), `${name} is missing ${clip}`);
    for (const view of json.bufferViews)
      assert.ok(
        (view.byteOffset || 0) + view.byteLength <= json.buffers[0].byteLength,
      );
  });

test("all local street material maps are present", async () => {
  for (const material of ["asphalt", "plaster", "paving"])
    for (const map of ["color", "normal", "roughness"]) {
      const b = await readFile(
        new URL(
          `../public/assets/materials/${material}-${map}.jpg`,
          import.meta.url,
        ),
      );
      assert.equal(b[0], 255);
      assert.equal(b[1], 216);
      assert.equal(b.at(-2), 255);
      assert.equal(b.at(-1), 217);
    }
});
