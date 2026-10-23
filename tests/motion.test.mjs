import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdir, unlink } from "node:fs/promises";
import { build } from "esbuild";
import * as THREE from "three";
await mkdir(new URL("../work/",import.meta.url),{recursive:true});
const target=new URL("../work/motion-tests.mjs",import.meta.url);
await build({entryPoints:["src/world/Motion.ts"],bundle:true,format:"esm",platform:"node",outfile:target.pathname,external:["three"],logLevel:"error"});
const {WheelRig,walkingVelocity,walkingTurn,moveWalker}=await import(target.href);
await unlink(target);
test("actual GLB hubs retain axle alignment and stationary calipers through full wheel rotations", async () => {
  const b=await readFile(new URL("../public/assets/car-concept.glb",import.meta.url));
  const gltf=JSON.parse(b.subarray(20,20+b.readUInt32LE(12)).toString());
  for (const node of gltf.nodes.filter(n=>/^Wheel(Front|Rear)[LR]$/.test(n.name))) {
    const hub=new THREE.Group(); hub.name=node.name; hub.applyMatrix4(new THREE.Matrix4().fromArray(node.matrix));
    const pad=new THREE.Object3D(); pad.name="BrakePad"; hub.add(pad);
    const tire=new THREE.Object3D(); tire.name="Tire"; hub.add(tire);
    const position=hub.position.clone(), wheel=new WheelRig(hub), padRotation=pad.quaternion.clone();
    for (const steer of [-0.5,0,0.5]) for(let a=0;a<Math.PI*4;a+=.17) {
      wheel.update(a,steer); hub.updateMatrixWorld(true);
      const axle=new THREE.Vector3(1,0,0).applyQuaternion(tire.getWorldQuaternion(new THREE.Quaternion()));
      const expected=new THREE.Vector3(1,0,0).applyAxisAngle(new THREE.Vector3(0,0,1),wheel.front?steer:0);
      assert.ok(axle.distanceTo(expected)<1e-6,`${node.name} wobbled`);
      assert.ok(hub.position.distanceTo(position)<1e-9); assert.ok(pad.quaternion.angleTo(padRotation)<1e-6);
    }
  }
});
test("walking normalises diagonals, brakes quickly, reverses without an orbit and is frame-rate stable", () => {
  const run=(fps,ix,iz)=>{const v={x:0,z:0},p={x:0,z:0};for(let i=0;i<fps*2;i++){walkingVelocity(v,ix,iz,0,false,1/fps);moveWalker(p,v,1/fps,()=>true);}return {p,v};};
  const straight=run(60,0,-1), diagonal=run(60,1,-1);
  assert.ok(Math.abs(Math.hypot(diagonal.v.x,diagonal.v.z)-1.4)<.001);
  assert.ok(Math.abs(Math.hypot(diagonal.p.x,diagonal.p.z)-Math.abs(straight.p.z))<.001);
  assert.ok(Math.abs(run(30,0,-1).p.z-run(120,0,-1).p.z)<.06);
  const v={x:0,z:-1.4};
  for(let i=0;i<12;i++) walkingVelocity(v,0,1,0,false,1/60);
  assert.equal(v.x,0); assert.ok(v.z>1, "reverse input should establish a new direction within 200ms");
  for(let i=0;i<24;i++) walkingVelocity(v,0,0,0,false,1/60);
  assert.ok(Math.hypot(v.x,v.z)<.02);
});
test("walking slides along walls, cannot tunnel and reports zero animation speed when blocked", () => {
  const p={x:0,z:0},v={x:4,z:-4};
  moveWalker(p,v,.5,p=>p.x<.2);
  assert.ok(p.x<.2);assert.ok(p.z< -1.9);assert.equal(v.x,0);
  const p2={x:0,z:0},v2={x:5,z:0};
  moveWalker(p2,v2,1,p=>p.x<.3 || p.x>.4);
  assert.ok(p2.x<.3);
  assert.equal(moveWalker({x:0,z:0},{x:2,z:1},.05,()=>false),0);
});

test("turns accelerate smoothly, take the shortest arc and settle consistently across frame rates", () => {
  const simulate = fps => {
    let state = { yaw: 0, rate: 0 };
    for (let i = 0; i < fps; i++) {
      const next = walkingTurn(state.yaw, state.rate, Math.PI / 2, 1 / fps);
      assert.ok(next.yaw >= state.yaw && next.yaw <= Math.PI / 2);
      state = next;
    }
    return state;
  };
  assert.ok(walkingTurn(0, 0, Math.PI, 1 / 60).yaw < .04, "first frame must not snap the shoulders");
  assert.ok(Math.abs(simulate(30).yaw - simulate(120).yaw) < 1e-8);
  assert.ok(Math.abs(simulate(60).yaw - Math.PI / 2) < .003);
  let state = { yaw: Math.PI - .1, rate: 0 };
  for (let i = 0; i < 60; i++) state = walkingTurn(state.yaw, state.rate, -Math.PI + .1, 1 / 60);
  assert.ok(Math.abs(state.yaw - (Math.PI + .1)) < .001, "crossing +/-pi must not spin the long way");
});
