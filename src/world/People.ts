import * as THREE from "three";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";

// Realistic rigged civilians (Microsoft Rocketbox, MIT). Clips: Idle, Idle2, Walk, Run, Wave.
export const npcModels = ["rb-m1", "rb-f1", "rb-m2", "rb-f2", "rb-m3", "rb-f3", "rb-f4"];
const skinTones = ["#5a3424", "#6e4330", "#4a2a1d", "#7b4b33", "#3f241a"];
const outfit = [
  "#d9d2c3",
  "#2f5d8a",
  "#a3462f",
  "#e2b13c",
  "#3d6b4f",
  "#6b4a8a",
  "#f1ece2",
  "#1f2a33",
];

/** Normalise scale, add shadows and re-tint skin / clothing for variety. */
export function prepare(model: THREE.Object3D, seed: number, palette?: Record<string, string>) {
  // Rocketbox rigs are authored in metres; measure the head bone rather than the (bind-pose)
  // mesh bounds, and only correct if something is clearly off.
  model.updateMatrixWorld(true);
  const head = model.getObjectByName("Bip01_Head");
  if (head) {
    const y = head.getWorldPosition(new THREE.Vector3()).y;
    if (y > 0.5 && (y < 1.3 || y > 1.9)) model.scale.multiplyScalar(1.62 / y);
  }
  model.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    o.castShadow = true;
    o.receiveShadow = true;
    o.frustumCulled = false;
    const list = Array.isArray(o.material) ? o.material : [o.material];
    const next = list.map((m: THREE.Material, i: number) => {
      const c = (m as THREE.MeshStandardMaterial).clone();
      const name = m.name.toLowerCase();
      if (name.includes("skin"))
        c.color.set(palette?.skin || skinTones[seed % skinTones.length]);
      else if (palette?.[name]) c.color.set(palette[name]);
      else if (
        ["shirt", "purple", "lightblue", "red_dark", "suit", "white"].includes(name) &&
        !palette
      )
        c.color.set(outfit[(seed * 3 + i) % outfit.length]);
      c.roughness = Math.max(0.55, c.roughness);
      c.metalness = 0;
      return c;
    });
    o.material = Array.isArray(o.material) ? next : next[0];
  });
  return model;
}

export class Rig {
  mixer: THREE.AnimationMixer;
  actions: Record<string, THREE.AnimationAction> = {};
  oneShot: THREE.AnimationAction | null = null;
  /** Which idle loop plays when standing still. */
  idle = "Idle";
  private stride = 0;
  constructor(
    public model: THREE.Object3D,
    clips: THREE.AnimationClip[],
    strideOffset = 0,
  ) {
    this.stride = strideOffset;
    this.mixer = new THREE.AnimationMixer(model);
    for (const clip of clips) {
      const a = this.mixer.clipAction(clip);
      if (clip.name === "Wave" || clip.name === "Interact") {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = false;
      } else a.play();
      a.setEffectiveWeight(clip.name === "Idle" ? 1 : 0);
      this.actions[clip.name] = a;
    }
    this.mixer.addEventListener("finished", (e) => {
      if (e.action === this.oneShot) this.oneShot = null;
    });
  }
  /** Blend locomotion by ground speed in m/s. */
  locomote(speed: number, dt: number, walkSpeed = 1.05, runSpeed = 3.1) {
    if (speed > 0.2 && this.oneShot) {
      this.oneShot.fadeOut(0.15);
      this.oneShot = null;
    }
    const run = THREE.MathUtils.smoothstep(speed, 1.8, 3.7);
    const walk = THREE.MathUtils.smoothstep(speed, 0.03, 0.45) * (1 - run);
    const gesture = this.oneShot ? 1 : 0;
    const idle = Math.max(0, 1 - walk - run) * (1 - gesture);
    const k = 1 - Math.exp(-dt * 10);
    const set = (name: string, w: number) => {
      const a = this.actions[name];
      if (a) a.setEffectiveWeight(THREE.MathUtils.lerp(a.getEffectiveWeight(), w, k));
    };
    set(this.idle, idle);
    if (this.idle !== "Idle") set("Idle", 0);
    else if (this.actions.Idle2) set("Idle2", 0);
    set("Walk", walk * (1 - gesture));
    set("Run", run * (1 - gesture));
    // Both clips describe the same left/right contact cycle. Sharing phase prevents
    // opposing strides from cancelling each other during a walk-to-run transition.
    const walkAction = this.actions.Walk, runAction = this.actions.Run;
    const walkStride = (walkAction?.getClip().duration ?? 1) * walkSpeed;
    const runStride = (runAction?.getClip().duration ?? 1) * runSpeed;
    this.stride = (this.stride + Math.max(0, speed) * dt / THREE.MathUtils.lerp(walkStride, runStride, run)) % 1;
    for (const action of [walkAction, runAction]) if (action) {
      action.setEffectiveTimeScale(0);
      action.time = this.stride * action.getClip().duration;
    }
    // The player's source clip already carries hip rotation and vertical weight
    // transfer. Preserve that performance without layering sine-wave arm motion
    // or moving the entire character to chase whichever foot happens to be lowest.
    this.mixer.update(dt);
  }

  gesture(name = "Wave") {
    const a = this.actions[name];
    if (!a || this.oneShot) return;
    a.reset();
    a.setEffectiveWeight(1);
    a.fadeIn(0.25);
    a.play();
    this.oneShot = a;
  }
}

type Walker = {
  rig: Rig;
  x: number;
  from: number;
  to: number;
  dir: number;
  pause: number;
  speed: number;
  waved: number;
  currentSpeed: number;
};

export class Crowd {
  walkers: Walker[] = [];
  group = new THREE.Group();
  constructor(scene: THREE.Scene) {
    scene.add(this.group);
  }
  add(gltf: GLTF, index: number) {
    // Footpath stretches between the junctions on both sides of the avenue.
    const segments: [number, number][] = [
      [-104, -73],
      [-57, -28],
      [-12, 20],
      [36, 102],
      [-176, -120],
    ];
    for (let k = 0; k < 2; k++) {
      const seed = index * 2 + k;
      const model = prepare(cloneSkeleton(gltf.scene), seed);
      const [from, to] = segments[(seed * 3) % segments.length];
      const side = seed % 2 ? 1 : -1;
      const z = from + ((seed * 7.3) % 1) * (to - from) + 2;
      const rig = new Rig(model, gltf.animations, (seed * 0.37) % 1);
      const standing = k === 1 && index % 2 === 0;
      const w: Walker = {
        rig,
        x: side * (standing ? 14.2 : 11.1 + ((seed * 1.7) % 1.5)),
        from,
        to,
        dir: seed % 3 ? 1 : -1,
        pause: standing ? 1e9 : (seed % 4) * 1.5,
        speed: 1.25 + (seed % 5) * 0.08,
        waved: 0,
        currentSpeed: 0,
      };
      model.position.set(w.x, 0.16, Math.min(to, Math.max(from, z)));
      if (standing) {
        model.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
        rig.idle = "Idle2";
      }
      rig.mixer.setTime((seed * 1.37) % 3);
      this.group.add(model);
      this.walkers.push(w);
    }
  }
  update(dt: number, player: THREE.Vector3, playerOnFoot: boolean, reduced: boolean) {
    for (const w of this.walkers) {
      const m = w.rig.model;
      const dx = player.x - m.position.x,
        dz = player.z - m.position.z,
        dist = Math.hypot(dx, dz);
      w.waved -= dt;
      let speed = 0;
      if (playerOnFoot && dist < 5.5) {
        // Turn to greet the visitor once in a while.
        const yaw = Math.atan2(dx, dz);
        m.rotation.y += Math.atan2(Math.sin(yaw - m.rotation.y), Math.cos(yaw - m.rotation.y)) * Math.min(1, dt * 5);
        if (w.waved <= 0) {
          w.rig.gesture("Wave");
          w.waved = 12;
        }
      } else if (w.pause > 0) w.pause -= dt;
      else if (!reduced) {
        w.currentSpeed = THREE.MathUtils.damp(w.currentSpeed, w.speed, 5, dt);
        speed = w.currentSpeed;
        m.position.z += w.dir * speed * dt;
        const yaw = w.dir > 0 ? 0 : Math.PI;
        m.rotation.y += Math.atan2(Math.sin(yaw - m.rotation.y), Math.cos(yaw - m.rotation.y)) * Math.min(1, dt * 6);
        if (m.position.z > w.to || m.position.z < w.from) {
          m.position.z = THREE.MathUtils.clamp(m.position.z, w.from, w.to);
          w.dir *= -1;
          w.pause = 1.5 + Math.random() * 4;
        }
      }
      if (!speed) w.currentSpeed = 0;
      // Skip animation work for people far from the camera.
      if (dist < 90) w.rig.locomote(speed, dt);
    }
  }
  obstacles() {
    return this.walkers.map((w) => ({
      x: w.rig.model.position.x,
      z: w.rig.model.position.z,
      r: 0.35,
    }));
  }
  dispose() {
    for (const w of this.walkers) w.rig.mixer.stopAllAction();
    this.group.removeFromParent();
  }
}
