import * as THREE from "three";

/** This asset is Z-up inside BodyUnderside, with wheel axles along X.
 * Strip the exported steering pose; retain only rotation around the axle.
 * Steering owns the hub, while the tyre/rim/disc spin beneath it. */
export class WheelRig {
  spin = new THREE.Group();
  front: boolean;
  phase: number;
  constructor(public hub: THREE.Object3D) {
    this.front = hub.name.includes("Front");
    const q = hub.quaternion;
    this.phase = 2 * Math.atan2(q.x, q.w);
    hub.quaternion.identity();
    const parts = [...hub.children];
    hub.add(this.spin);
    for (const part of parts) {
      if (part.name.includes("BrakePad")) {
        part.applyMatrix4(new THREE.Matrix4().makeRotationX(this.phase));
      } else this.spin.add(part);
    }
    this.update(0, 0);
  }
  update(angle: number, steer: number) {
    this.hub.rotation.set(0, 0, this.front ? steer : 0);
    this.spin.rotation.set(this.phase + angle, 0, 0);
  }
}

export type Planar = { x: number; z: number };
/** Camera-relative velocity, independent of the avatar's visual turn. */
export function walkingVelocity(velocity: Planar, ix: number, iz: number, heading: number, sprint: boolean, dt: number, amount = 1) {
  const length = Math.hypot(ix, iz);
  const speed = length ? ((sprint ? 4.1 : 1.4) * Math.min(1, Math.max(0, amount))) / length : 0;
  const x = (Math.cos(heading) * ix + Math.sin(heading) * iz) * speed;
  const z = (-Math.sin(heading) * ix + Math.cos(heading) * iz) * speed;
  const reversing = x * velocity.x + z * velocity.z < 0;
  const response = length ? (reversing ? 16 : 9) : 12;
  const blend = 1 - Math.exp(-response * dt);
  velocity.x += (x - velocity.x) * blend;
  velocity.z += (z - velocity.z) * blend;
  if (!length && Math.hypot(velocity.x, velocity.z) < 0.015) velocity.x = velocity.z = 0;
}

/** Short substeps prevent tunnelling, and resolve both axes for natural wall sliding. */
export function moveWalker(position: Planar, velocity: Planar, dt: number, free: (p: Planar) => boolean) {
  const startX = position.x, startZ = position.z;
  const steps = Math.max(1, Math.ceil(Math.hypot(velocity.x, velocity.z) * dt / 0.08));
  const dx = velocity.x * dt / steps, dz = velocity.z * dt / steps;
  for (let i = 0; i < steps; i++) {
    const next = { x: position.x + dx, z: position.z + dz };
    if (free(next)) { position.x = next.x; position.z = next.z; }
    else {
      if (free({ x: position.x + dx, z: position.z })) position.x += dx;
      else velocity.x = 0;
      if (free({ x: position.x, z: position.z + dz })) position.z += dz;
      else velocity.z = 0;
    }
  }
  return dt > 0 ? Math.hypot(position.x - startX, position.z - startZ) / dt : 0;
}

/** A critically damped turn: shoulders build momentum rather than snapping to input. */
export function walkingTurn(yaw: number, rate: number, target: number, dt: number) {
  const error = Math.atan2(Math.sin(yaw - target), Math.cos(yaw - target));
  const response = 9, decay = Math.exp(-response * dt);
  const momentum = rate + response * error;
  const nextError = (error + momentum * dt) * decay;
  // A sudden change of destination must not carry the body past the new heading.
  if (error * nextError < 0) return { yaw: yaw - error, rate: 0 };
  return { yaw: yaw + nextError - error, rate: (rate - response * momentum * dt) * decay };
}
