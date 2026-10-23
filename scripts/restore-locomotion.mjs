// Restore the original Rocketbox actor's hip rotation/height and full cycle ends.
// The old in-place conversion stripped the entire root transform, locking the hips.
// Run from the project root. Source animation licence: public/assets/people/LICENSE-Rocketbox.md.
import { readFile, writeFile } from "node:fs/promises";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { Quaternion, MathUtils } from "three";

const file = "public/assets/people/player.glb";
const glb = await readFile(file), jsonSize = glb.readUInt32LE(12);
const json = JSON.parse(glb.subarray(20, 20 + jsonSize));
const buffers = [glb.subarray(28 + jsonSize)];
let length = buffers[0].length;
const append = (values, type, count, bounds = {}) => {
  const data = Buffer.from(new Float32Array(values).buffer);
  const view = json.bufferViews.push({ buffer: 0, byteOffset: length, byteLength: data.length }) - 1;
  buffers.push(data); length += data.length;
  return json.accessors.push({ bufferView: view, componentType: 5126, count, type, ...bounds }) - 1;
};
for (const name of ["Walk", "Run"]) {
  const url = `https://raw.githubusercontent.com/microsoft/Microsoft-Rocketbox/master/Assets/Animations/all_animations_max_motextr_xy/m_${name.toLowerCase()}_neutral_01.max.fbx`;
  // Cache is optional and never shipped to the browser.
  let source;
  try { source = await readFile(`work/source-${name.toLowerCase()}.fbx`); }
  catch { const response = await fetch(url); if (!response.ok) throw new Error(`Unable to fetch ${name} source`); source = Buffer.from(await response.arrayBuffer()); }
  const clip = new FBXLoader().parse(source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength), "").animations[0];
  const target = json.animations.find(animation => animation.name === name);
  const targets = new Set(target.channels.filter(c => c.target.path === "rotation").map(c => c.target.node));
  const root = json.nodes.findIndex(node => node.name === "Bip01"); targets.add(root);
  target.channels = []; target.samplers = [];
  const addTrack = (node, track, path, values = track.values) => {
    const input = append(track.times, "SCALAR", track.times.length, { min: [track.times[0]], max: [track.times.at(-1)] });
    const output = append(values, path === "rotation" ? "VEC4" : "VEC3", track.times.length);
    const sampler = target.samplers.push({ input, output, interpolation: "LINEAR" }) - 1;
    target.channels.push({ sampler, target: { node, path } });
  };
  for (const node of targets) {
    const track = clip.tracks.find(t => t.name === `${json.nodes[node].name.replaceAll(" ", "_")}.quaternion`);
    if (!track) throw new Error(`Missing source rotation: ${json.nodes[node].name}`);
    // The actor's last arm pose differs slightly from the first. Distribute that
    // residual over the last fifth of the cycle instead of snapping at the seam.
    const rotations = Array.from(track.values);
    const first = new Quaternion().fromArray(rotations).normalize();
    const last = new Quaternion().fromArray(rotations, rotations.length - 4).normalize();
    const correction = first.clone().multiply(last.clone().invert());
    for (let i = 0; i < track.times.length; i++) {
      const weight = MathUtils.smoothstep(track.times[i] / clip.duration, .8, 1);
      const q = new Quaternion().fromArray(rotations, i * 4).normalize();
      q.premultiply(new Quaternion().slerp(correction, weight)).normalize().toArray(rotations, i * 4);
    }
    addTrack(node, track, "rotation", rotations);
  }
  const hips = clip.tracks.find(t => t.name === "Bip01.position");
  const base = json.nodes[root].translation;
  const values = Array.from(hips.values, (v, i) => i % 3 === 1 ? v * 0.01 : base[i % 3]);
  addTrack(root, hips, "translation", values); // Only vertical motion; simulation owns X/Z.
}
json.buffers[0].byteLength = length;
const data = Buffer.concat(buffers), text = Buffer.from(JSON.stringify(json));
const padded = Buffer.alloc(Math.ceil(text.length / 4) * 4, 0x20); text.copy(padded);
const result = Buffer.alloc(28 + padded.length + data.length);
glb.copy(result, 0, 0, 12); result.writeUInt32LE(result.length, 8);
result.writeUInt32LE(padded.length, 12); result.writeUInt32LE(0x4e4f534a, 16); padded.copy(result, 20);
result.writeUInt32LE(data.length, 20 + padded.length); result.writeUInt32LE(0x004e4942, 24 + padded.length); data.copy(result, 28 + padded.length);
await writeFile(file, result);
console.log("Restored complete Walk/Run cycles, hip rotation and vertical motion; horizontal movement remains in place.");
