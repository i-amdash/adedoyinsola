import * as THREE from "three";

const right = new THREE.Vector3();
const up = new THREE.Vector3();
const worldUp = new THREE.Vector3(0, 1, 0);

/** Snap in the light's image plane, where shadow texels actually live. */
export function snapShadowAnchor(target: THREE.Vector3, focus: THREE.Vector3, direction: THREE.Vector3, texel: number) {
  right.crossVectors(worldUp, direction);
  if (right.lengthSq() < 1e-8) right.set(1, 0, 0);
  else right.normalize();
  up.crossVectors(direction, right).normalize();
  target.set(focus.x, 0, focus.z);
  const x = target.dot(right), y = target.dot(up);
  target.addScaledVector(right, Math.round(x / texel) * texel - x);
  target.addScaledVector(up, Math.round(y / texel) * texel - y);
  return target;
}
