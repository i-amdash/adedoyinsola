import test from "node:test";
import assert from "node:assert/strict";
import {mkdir,unlink} from 'node:fs/promises';
import {build} from 'esbuild';
import * as THREE from 'three';
await mkdir(new URL('../work/',import.meta.url),{recursive:true});
const target=new URL('../work/race-tests.mjs',import.meta.url);
await build({entryPoints:['src/world/World.ts'],bundle:true,format:'esm',platform:'node',outfile:target.pathname,external:['three','three/*'],logLevel:'error'});
const {World}=await import(target.href);await unlink(target);
const noop=()=>{};
function fixture() {
  const w=Object.create(World.prototype);
  Object.assign(w,{
    active:true,paused:false,reduced:true,time:0,lastPublish:0,routeAge:0,
    race:'countdown',countdown:3,checkpoint:0,raceTime:0,
    mode:'drive',position:new THREE.Vector3(3.3,0,82),walkPos:new THREE.Vector3(),velocity:new THREE.Vector3(),yaw:0,
    car:new THREE.Group(),gate:new THREE.Group(),markers:[],
    atmosphere:{night:{value:0},sunDirection:new THREE.Vector3(),sun:{color:new THREE.Color()},update:noop,collectNoAO:noop},
    district:{update:noop},traffic:{update:noop,obstacles:()=>[]},crowd:{update:noop,obstacles:()=>[]},puffs:{update:noop},
    updateCamera:noop,updateRoute:noop,nightLights:noop,onUpdate:noop,drive(dt){this.position.z-=dt*10;},
    placeGate:noop,
  });
  return w;
}
test('countdown locks motion, excludes countdown time, pauses with the panel and then starts',()=>{
  globalThis.document={hidden:false};
  const w=fixture();
  for(let i=0;i<40;i++) w.tick(.05);
  assert.ok(Math.abs(w.countdown-1)<1e-6);assert.equal(w.race,'countdown');assert.equal(w.raceTime,0);assert.equal(w.position.z,82);
  w.paused=true; const count=w.countdown;
  for(let i=0;i<20;i++) w.tick(.05);
  assert.equal(w.countdown,count);
  w.paused=false;document.hidden=true;w.tick(.05);assert.equal(w.countdown,count);
  document.hidden=false;for(let i=0;i<21;i++)w.tick(.05);
  assert.equal(w.race,'running');assert.ok(w.raceTime<.051);
  w.tick(.05);assert.ok(w.position.z<82);assert.ok(w.raceTime>0);
});
test('finishing the final checkpoint transitions once and stops the timer',()=>{
  globalThis.document={hidden:false};
  const w=fixture();w.race='running';w.raceTime=40;w.checkpoint=6;w.position.set(-5.2,0,70);w.drive=noop;
  w.tick(.05);assert.equal(w.race,'finished');assert.equal(w.checkpoint,7);assert.equal(w.gate.visible,false);
  w.tick(.05);assert.equal(w.raceTime,40.05);
});

test('fast travel places every destination within immediate interaction range',()=>{
  globalThis.document={hidden:false};
  const w=fixture();w.walker=new THREE.Group();w.enter=noop;w.drive=noop;
  for (const id of ['about','projects','arcade','contact']) {
    w.travel(id);w.tick(.05);assert.equal(w.near,id,`${id} must be immediately accessible after arrival`);
  }
});
