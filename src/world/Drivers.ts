import * as THREE from "three";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import { prepare } from "./People";

const V = THREE.Vector3;
export const driverSeats = {
  sedan: { x: -0.4, y: 0.57, z: -0.08, scale: 0.86, recline: 0.06 },
  suv: { x: -0.4, y: 0.75, z: -0.09, scale: 0.95, recline: 0.06 },
  danfo: { x: -0.48, y: 1.12, z: -1.45, scale: 1, recline: 0 },
  keke: { x: 0, y: 0.91, z: -0.38, scale: 0.93, recline: 0 },
  // Low, reclined sports-car seat: the head must stay under the actual GLB roof.
  player: { x: -0.42, y: 0.51, z: -0.48, scale: 0.94, recline: 0.45 },
};
export type DriverKind = keyof typeof driverSeats;
export const steeringWheels = {
  sedan: { x: -0.4, y: 0.91, z: -0.45, radius: 0.15, tilt: -0.4 },
  suv: { x: -0.4, y: 1.08, z: -0.45, radius: 0.15, tilt: -0.4 },
  danfo: { x: -0.48, y: 1.52, z: -1.88, radius: 0.19, tilt: -0.55 },
};
/** Physical contact points on the wheel rim, or the tricycle's handlebar grips. */
export function driverGrips(kind: DriverKind): [THREE.Vector3, THREE.Vector3] {
  if (kind === "player") return [new V(driverSeats.player.x - 0.183, 0.92, -0.759), new V(driverSeats.player.x + 0.177, 0.92, -0.759)];
  if (kind === "keke") return [new V(-0.2, 1.26, -0.78), new V(0.2, 1.26, -0.78)];
  const wheel = steeringWheels[kind], a = Math.PI / 4;
  return [-1, 1].map(side => new V(wheel.x + side * wheel.radius * Math.cos(a), wheel.y + wheel.radius * Math.sin(a) * Math.cos(wheel.tilt), wheel.z + wheel.radius * Math.sin(a) * Math.sin(wheel.tilt))) as [THREE.Vector3, THREE.Vector3];
}
const boneName = (name: string) => name.replace(/[ _]/g, "").toLowerCase();
function bone(model: THREE.Object3D, name: string) {
  let found: THREE.Object3D | undefined;
  model.traverse(o => { if (boneName(o.name) === boneName(name)) found = o; });
  return found;
}
function aim(model: THREE.Object3D, jointName: string, childName: string, direction: THREE.Vector3) {
  const joint = bone(model, jointName), child = bone(model, childName);
  if (!joint || !child || !joint.parent) return;
  model.updateMatrixWorld(true);
  const from = child.getWorldPosition(new V()).sub(joint.getWorldPosition(new V())).normalize();
  const delta = new THREE.Quaternion().setFromUnitVectors(from, direction.clone().normalize());
  const rotation = delta.multiply(joint.getWorldQuaternion(new THREE.Quaternion()));
  joint.quaternion.copy(joint.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(rotation));
  model.updateMatrixWorld(true);
}
/** Two-bone IK keeps the wrist at its own vehicle's control, with elbows below/outside. */
function reach(model: THREE.Object3D, side: "L" | "R", target: THREE.Vector3) {
  const upper = `Bip01 ${side} UpperArm`, forearm = `Bip01 ${side} Forearm`, hand = `Bip01 ${side} Hand`;
  const shoulder = bone(model, upper)!.getWorldPosition(new V());
  const elbow = bone(model, forearm)!.getWorldPosition(new V());
  const wrist = bone(model, hand)!.getWorldPosition(new V());
  const a = shoulder.distanceTo(elbow), b = elbow.distanceTo(wrist);
  const direction = target.clone().sub(shoulder), distance = Math.min(direction.length(), a + b - 0.001);
  direction.normalize();
  const along = (distance * distance + a * a - b * b) / (2 * distance);
  const pole = new V(side === "L" ? 0.5 : -0.5, -1, 0);
  pole.addScaledVector(direction, -pole.dot(direction)).normalize();
  const desiredElbow = shoulder.clone().addScaledVector(direction, along).addScaledVector(pole, Math.sqrt(Math.max(0, a * a - along * along)));
  aim(model, upper, forearm, desiredElbow.sub(shoulder));
  const actualElbow = bone(model, forearm)!.getWorldPosition(new V());
  aim(model, forearm, hand, target.clone().sub(actualElbow));
}

/** Pose in source (+Z forward) space, with the pelvis used as the seating anchor. */
export function poseDriver(model: THREE.Object3D, kind: DriverKind = "player") {
  model.updateMatrixWorld(true);
  const seat = driverSeats[kind], hip = bone(model, "Bip01 Pelvis")!.getWorldPosition(new V());
  const head = bone(model, "Bip01 Head")!, gaze = head.getWorldQuaternion(new THREE.Quaternion());
  if (seat.recline) {
    aim(model, "Bip01 Spine", "Bip01 Spine1", new V(0, Math.cos(seat.recline), -Math.sin(seat.recline)));
    // Recline the torso while keeping the face looking along the road.
    head.quaternion.copy(head.parent!.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(gaze));
    model.updateMatrixWorld(true);
  }
  const grips = driverGrips(kind);
  for (const [index, side, sign] of [[0, "L", 1], [1, "R", -1]] as const) {
    aim(model, `Bip01 ${side} Thigh`, `Bip01 ${side} Calf`, new V(sign * 0.025, -0.09, 0.38));
    aim(model, `Bip01 ${side} Calf`, `Bip01 ${side} Foot`, new V(0, -0.37, 0.12));
    aim(model, `Bip01 ${side} Foot`, `Bip01 ${side} Toe0`, new V(0, -0.02, 0.17));
    const hand = `Bip01 ${side} Hand`, middle = `Bip01 ${side} Finger2`;
    const palmLength = bone(model, hand)!.getWorldPosition(new V()).distanceTo(bone(model, middle)!.getWorldPosition(new V()));
    const forward = new V(0, kind === "keke" ? -0.35 : -0.12, 1).normalize();
    // The finger base contacts the rim; the wrist sits one palm-length behind it.
    const grip = grips[index], contact = new V(-(grip.x - seat.x), grip.y - seat.y, -(grip.z - seat.z)).divideScalar(seat.scale).add(hip);
    reach(model, side, contact.addScaledVector(forward, -palmLength));
    aim(model, hand, middle, forward);
    // Close the fingers around the rim instead of leaving a flat, outstretched hand.
    for (let digit = 1; digit <= 4; digit++) {
      aim(model, `Bip01 ${side} Finger${digit}`, `Bip01 ${side} Finger${digit}1`, new V(0, -0.9, 0.35));
      aim(model, `Bip01 ${side} Finger${digit}1`, `Bip01 ${side} Finger${digit}2`, new V(0, -0.45, -0.8));
    }
  }
  return hip;
}

/** Bake each model/vehicle fit once; traffic instances share ordinary mesh geometry. */
export function createDriver(source: THREE.Object3D, seed = 0, kind: DriverKind = "player") {
  const model = prepare(cloneSkeleton(source), seed);
  const hip = poseDriver(model, kind);
  model.traverse(o => { if (o instanceof THREE.SkinnedMesh) o.skeleton.update(); });
  const driver = new THREE.Group();
  driver.name = "Seated driver";
  const vertex = new V();
  model.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    const geometry = o.geometry.clone(), positions = geometry.getAttribute("position");
    for (let i = 0; i < positions.count; i++) {
      o.getVertexPosition(i, vertex);
      vertex.applyMatrix4(o.matrixWorld).sub(hip);
      positions.setXYZ(i, -vertex.x, vertex.y, -vertex.z);
    }
    geometry.deleteAttribute("skinIndex"); geometry.deleteAttribute("skinWeight"); geometry.morphAttributes = {};
    positions.needsUpdate = true;
    geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, o.material);
    mesh.name = "Driver " + o.name; mesh.castShadow = true; mesh.receiveShadow = true;
    driver.add(mesh);
  });
  return driver;
}
export function placeDriver(template: THREE.Group, kind: DriverKind) {
  const seat = driverSeats[kind], driver = template.clone();
  driver.position.set(seat.x, seat.y, seat.z);
  driver.scale.setScalar(seat.scale);
  return driver;
}

/** Convert the concept car's centre-mounted controls to the left driving position.
 * Call after the GLB's scale, orientation and ground alignment have been applied. */
export function alignPlayerControls(model: THREE.Object3D) {
  model.updateMatrixWorld(true);
  const controls: THREE.Object3D[] = [];
  model.traverse(o => {
    if (!o.name.startsWith("InteriorSteering")) return;
    for (let parent = o.parent; parent && parent !== model; parent = parent.parent)
      if (parent.name.startsWith("InteriorSteering")) return;
    controls.push(o);
  });
  for (const control of controls) {
    const target = control.getWorldPosition(new V()).add(new V(driverSeats.player.x, 0, 0));
    control.position.copy(control.parent!.worldToLocal(target));
  }
  model.updateMatrixWorld(true);
}
