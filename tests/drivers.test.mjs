import test from "node:test";
import assert from "node:assert/strict";
import { readFile, unlink, mkdir } from "node:fs/promises";
import { build } from "esbuild";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";

await mkdir(new URL("../work/", import.meta.url), { recursive: true });
const runtime = new URL("../work/driver-tests.mjs", import.meta.url);
await build({ stdin: { contents: 'export * from "./src/world/Drivers"; export { Traffic } from "./src/world/Vehicles";', resolveDir: process.cwd(), loader: "ts" }, bundle: true, format: "esm", platform: "node", outfile: runtime.pathname, external: ["three", "three/*"], logLevel: "error" });
const { alignPlayerControls, createDriver, poseDriver, placeDriver, driverSeats, driverGrips, Traffic } = await import(runtime.href);
await unlink(runtime);

// Keep the real mesh, skeleton and bind transforms; skip texture decoding in Node.
const character = name => asset(`people/${name}.glb`);
async function asset(file) {
  const b = await readFile(new URL(`../public/assets/${file}`, import.meta.url));
  const size = b.readUInt32LE(12), json = JSON.parse(b.subarray(20, 20 + size));
  json.materials = json.materials.map(m => ({ name: m.name, pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1] } }));
  delete json.images; delete json.textures;
  const text = JSON.stringify(json), encoded = Buffer.from(text.padEnd(Math.ceil(text.length / 4) * 4, " "));
  const binary = b.subarray(20 + size), result = Buffer.alloc(20 + encoded.length + binary.length);
  b.copy(result, 0, 0, 12); result.writeUInt32LE(result.length, 8); result.writeUInt32LE(encoded.length, 12); result.writeUInt32LE(0x4e4f534a, 16);
  encoded.copy(result, 20); binary.copy(result, 20 + encoded.length);
  return (await new GLTFLoader().parseAsync(result.buffer.slice(result.byteOffset, result.byteOffset + result.byteLength), "")).scene;
}

for (const name of ["player", "rb-m1", "rb-f1", "rb-m2"]) {
  test(`${name} bends at the knees, reaches forward and bakes a finite seated mesh without changing the walker`, async () => {
    const source = await character(name), posed = clone(source);
    const hip = poseDriver(posed);
    const point = part => posed.getObjectByName(`Bip01_L_${part}`).getWorldPosition(new THREE.Vector3()).sub(hip);
    assert.ok(point("Calf").z > 0.3 && Math.abs(point("Calf").y) < 0.2, "knees must bend forward at seat height");
    assert.ok(point("Foot").y < -0.35, "feet must reach down from the knees");
    const before = source.getObjectByName("Bip01_L_Thigh").quaternion.clone();
    const driver = createDriver(source);
    assert.deepEqual(source.getObjectByName("Bip01_L_Thigh").quaternion.toArray(), before.toArray());
    const bounds = new THREE.Box3().setFromObject(driver), dimensions = bounds.getSize(new THREE.Vector3());
    assert.ok(dimensions.y > 1 && dimensions.y < 1.65, "seated body must be shorter than a standing avatar");
    assert.ok(bounds.min.z < -0.6, "legs face the vehicle's -Z direction");
    driver.traverse(o => {
      assert.equal(o.isSkinnedMesh, undefined, "traffic must not require per-frame skinning");
      if (!o.isMesh) return;
      const p = o.geometry.getAttribute("position");
      for (let i = 0; i < p.count; i++) assert.ok(Number.isFinite(p.getX(i)) && Number.isFinite(p.getY(i)) && Number.isFinite(p.getZ(i)));
    });
  });
}

test("all moving vehicles get one driver who stays attached through turns; parked vehicles stay empty", async () => {
  const traffic = new Traffic(new THREE.Scene(), [[20, 50, 0]]);
  const source = await character("rb-m1");
  for (let i = 0; i < 3; i++) traffic.setDrivers(source, i);
  traffic.setDrivers(source, 0);
  assert.equal(traffic.agents.length, 16);
  const positions = traffic.agents.map(a => {
    const drivers = a.v.root.children.filter(c => c.name === "Seated driver");
    assert.equal(drivers.length, 1);
    assert.ok(drivers[0].position.y > 0.5);
    return drivers[0].position.clone();
  });
  for (let i = 0; i < 600; i++) traffic.update(1 / 60, new THREE.Vector3(1000, 0, 1000), 1);
  traffic.agents.forEach((a, i) => assert.ok(a.v.root.getObjectByName("Seated driver").position.distanceTo(positions[i]) < 1e-9));
  assert.ok(traffic.parked.every(v => !v.root.getObjectByName("Seated driver")));
  traffic.dispose();
});

for (const name of ["player", "rb-m1", "rb-f1", "rb-m2"]) {
  test(`${name} hands contact both controls in every vehicle fit`, async () => {
    const source = await character(name);
    for (const kind of Object.keys(driverSeats)) {
      const model = clone(source), seat = driverSeats[kind], hip = poseDriver(model, kind);
      const grips = driverGrips(kind);
      for (const [i, side] of ["L", "R"].entries()) {
        const p = model.getObjectByName(`Bip01_${side}_Finger2`).getWorldPosition(new THREE.Vector3()).sub(hip);
        const inCar = new THREE.Vector3(-p.x, p.y, -p.z).multiplyScalar(seat.scale).add(new THREE.Vector3(seat.x, seat.y, seat.z));
        assert.ok(inCar.distanceTo(grips[i]) < 0.015, `${name}/${kind}/${side} misses the grip by ${inCar.distanceTo(grips[i])}m`);
      }
    }
  });
}
test("player head clears the actual roof and windscreen; grips meet the actual steering wheel", async () => {
  const car = await asset("car-concept.glb");
  car.rotation.y = Math.PI; car.updateMatrixWorld(true);
  let bounds = new THREE.Box3().setFromObject(car);
  car.scale.setScalar(4.7 / bounds.getSize(new THREE.Vector3()).z); car.updateMatrixWorld(true);
  bounds.setFromObject(car); const center = bounds.getCenter(new THREE.Vector3());
  car.position.set(-center.x, -bounds.min.y + 0.02, -center.z); car.updateMatrixWorld(true);
  alignPlayerControls(car);
  const driver = placeDriver(createDriver(await character("player")), "player"); driver.updateMatrixWorld(true);
  assert.ok(driver.position.x < -0.35, "player sits in the left driving position");
  const cabin = [car.getObjectByName("BodyRoofPanel"), car.getObjectByName("BodyWindshield")];
  cabin.forEach(o => o.traverse(m => { if(m.isMesh) for(const material of Array.isArray(m.material) ? m.material : [m.material]) material.side = THREE.DoubleSide; }));
  const ray = new THREE.Raycaster(), point = new THREE.Vector3();
  let checked = 0;
  driver.traverse(o => {
    if (!o.isMesh || !o.material.name.includes("head")) return;
    const p = o.geometry.getAttribute("position");
    for (let i = 0; i < p.count; i += 3) {
      point.fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld);
      ray.set(point, new THREE.Vector3(0,1,0));
      const hit = ray.intersectObjects(cabin, true)[0];
      assert.ok(hit && hit.distance > 0.012, `head vertex clips through cabin: ${point.toArray()}`);
      checked++;
    }
  });
  assert.ok(checked > 100);
  for (const grip of driverGrips("player")) {
    let nearest = Infinity;
    car.traverse(o => {
      if(!o.isMesh || !o.name.startsWith("InteriorSteeringWheel")) return;
      const p=o.geometry.getAttribute("position");
      for(let i=0;i<p.count;i++) nearest = Math.min(nearest,point.fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld).distanceTo(grip));
    });
    assert.ok(nearest < 0.025, `grip misses real wheel geometry by ${nearest}m`);
  }
});
