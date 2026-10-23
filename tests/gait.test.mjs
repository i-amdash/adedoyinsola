import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdir, unlink } from "node:fs/promises";
import { build } from "esbuild";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";

await mkdir("work", { recursive: true });
const runtime = new URL("../work/gait-test-runtime.mjs", import.meta.url);
await build({ stdin: { contents: 'export { Rig } from "./src/world/People"; export { snapShadowAnchor } from "./src/world/Shadows";', resolveDir: process.cwd(), loader: "ts" }, bundle: true, format: "esm", platform: "node", outfile: runtime.pathname, external: ["three", "three/*"], logLevel: "error" });
const { Rig, snapShadowAnchor } = await import(runtime.href);
await unlink(runtime);

// Exercise the actual exported animation tracks and skeleton, without texture decoding.
const b=await readFile('public/assets/people/player.glb');
const size=b.readUInt32LE(12), json=JSON.parse(b.subarray(20,20+size));
json.materials=json.materials.map(m=>({name:m.name,pbrMetallicRoughness:{baseColorFactor:[1,1,1,1]}}));
delete json.images;delete json.textures;
const text=JSON.stringify(json), encoded=Buffer.from(text.padEnd(Math.ceil(text.length/4)*4,' '));
const binary=b.subarray(20+size),result=Buffer.alloc(20+encoded.length+binary.length);
b.copy(result,0,0,12);result.writeUInt32LE(result.length,8);result.writeUInt32LE(encoded.length,12);result.writeUInt32LE(0x4e4f534a,16);encoded.copy(result,20);binary.copy(result,20+encoded.length);
const gltf=await new GLTFLoader().parseAsync(result.buffer.slice(result.byteOffset,result.byteOffset+result.byteLength),'');

test("the real player clips share stride phase through acceleration, sprinting and stopping", () => {
  const rig = new Rig(clone(gltf.scene), gltf.animations);
  for (const speed of [0, .2, .7, 1.4, 2.8, 4.1, 3, 1.4, .3, 0]) {
    for (let i = 0; i < 120; i++) {
      rig.locomote(speed, 1 / 60);
      const walk = rig.actions.Walk, run = rig.actions.Run;
      assert.ok(Math.abs(walk.time / walk.getClip().duration - run.time / run.getClip().duration) < 1e-9);
      assert.ok(Number.isFinite(rig.model.position.y));
    }
  }
  assert.ok(rig.actions.Idle.getEffectiveWeight() > .999);
  assert.ok(rig.actions.Walk.getEffectiveWeight() < .001);
  const before = rig.actions.Walk.time;
  rig.locomote(0, 1);
  assert.equal(rig.actions.Walk.time, before, "stationary feet must not keep cycling");
});

test("the original root motion survives export and the walk/run loops close without a joint snap", () => {
  for (const name of ["Walk", "Run"]) {
    const clip = gltf.animations.find(c => c.name === name);
    assert.ok(clip.tracks.some(t => t.name === "Bip01.quaternion"), "hips must rotate with the stride");
    const position = clip.tracks.find(t => t.name === "Bip01.position");
    assert.ok(position, "hips must retain authored vertical weight transfer");
    const heights = [...position.values].filter((_, i) => i % 3 === 1);
    const verticalRange = Math.max(...heights) - Math.min(...heights);
    assert.ok(verticalRange > .025 && verticalRange < .1, `bounded source motion: ${verticalRange}`);
    for (const axis of [0, 2]) {
      const values = [...position.values].filter((_, i) => i % 3 === axis);
      assert.ok(Math.max(...values) - Math.min(...values) < 1e-6, "the animation must not drift away from the controller");
    }
    for (const track of clip.tracks.filter(t => t.name.endsWith(".quaternion"))) {
      const first = new THREE.Quaternion().fromArray(track.values).normalize();
      const last = new THREE.Quaternion().fromArray(track.values, track.values.length - 4).normalize();
      assert.ok(first.angleTo(last) < .015, `loop boundary pops at ${track.name}`);
    }
  }
});

test("shadow sampling stays on whole light-space texels while moving in every street direction", () => {
  const texel = 96 / 4096;
  for (const direction of [new THREE.Vector3(.6, .35, -.7).normalize(), new THREE.Vector3(-.3, .9, .2).normalize(), new THREE.Vector3(.01, 1, .02).normalize()]) {
    for (let i = 0; i < 200; i++) {
      const focus = new THREE.Vector3(-24 + i * .017, 1.5, 65 - i * .031);
      const anchor = snapShadowAnchor(new THREE.Vector3(), focus, direction, texel);
      const light = new THREE.DirectionalLight();
      light.target.position.copy(anchor); light.position.copy(anchor).addScaledVector(direction, 160);
      light.shadow.camera.left = light.shadow.camera.bottom = -48;
      light.shadow.camera.right = light.shadow.camera.top = 48;
      light.shadow.camera.updateProjectionMatrix();
      light.updateMatrixWorld(true); light.target.updateMatrixWorld(true); light.shadow.updateMatrices(light);
      const projectedOrigin = new THREE.Vector3().applyMatrix4(light.shadow.matrix).multiplyScalar(4096);
      for (const coordinate of [projectedOrigin.x, projectedOrigin.y])
        assert.ok(Math.abs(coordinate - Math.round(coordinate)) < .0001, `a fixed world point must stay on the same shadow sample grid: ${direction.toArray()}, ${coordinate}`);
      assert.ok(anchor.distanceTo(focus.setY(0)) < texel, "snapping must not displace the shadow frustum visibly");
    }
  }
});

test("pausing freezes the authored pose; locomotion settles back to idle without accumulating offsets", () => {
  const rig = new Rig(clone(gltf.scene), gltf.animations);
  for (let i = 0; i < 300; i++) rig.locomote(1.4, 1 / 60);
  const hips = rig.model.getObjectByName("Bip01");
  const before = hips.quaternion.clone(), position = hips.position.clone();
  for (let i = 0; i < 120; i++) rig.locomote(1.4, 0);
  assert.ok(hips.quaternion.angleTo(before) < 1e-6);
  assert.ok(hips.position.distanceTo(position) < 1e-6);
  for (let i = 0; i < 300; i++) rig.locomote(0, 1 / 60);
  assert.ok(rig.actions.Idle.getEffectiveWeight() > .999);
  assert.equal(rig.model.position.y, 0, "no foot-following correction may accumulate on the model root");
});
