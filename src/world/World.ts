import * as THREE from "three";
import { WheelRig, walkingVelocity, walkingTurn, moveWalker } from "./Motion";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { District } from "./District";
import { Atmosphere, type Quality, type TimeOfDay } from "./Atmosphere";
import { Traffic, setVehicleNight, contactShadow } from "./Vehicles";
import { Crowd, Rig, prepare, npcModels } from "./People";
import { alignPlayerControls, createDriver, placeDriver } from "./Drivers";
import { SkidMarks, Puffs, Motes } from "./Effects";
import { Soundscape } from "./Audio";
import { destinations, raceRoute, type Destination, type Telemetry } from "../types";
import { route, BOUNDS, LANES } from "./roads";

const V = THREE.Vector3;
const damp = THREE.MathUtils.damp;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const dampAngle = (a: number, b: number, k: number, dt: number) =>
  a + wrap(b - a) * (1 - Math.exp(-k * dt));
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const start = { x: LANES.inner, z: 86 };

export type WorldCallbacks = {
  update: (t: Telemetry) => void;
  enter: (d: Destination) => void;
  map: () => void;
  error: () => void;
  progress?: (p: number) => void;
  message?: (text: string) => void;
  quality?: (q: Quality) => void;
  time?: (t: TimeOfDay) => void;
};

export class World {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(55, 1, 0.15, 2200);
  renderer: THREE.WebGLRenderer;
  atmosphere: Atmosphere;
  district: District;
  traffic: Traffic;
  crowd: Crowd;
  skids: SkidMarks;
  puffs: Puffs;
  motes: Motes;
  sound: Soundscape | null = null;
  manager = new THREE.LoadingManager();
  clock = new THREE.Clock();
  keys = new Set<string>();
  car = new THREE.Group();
  carBody = new THREE.Group();
  driver?: THREE.Group;
  walker = new THREE.Group();
  walkBody = new THREE.Group();
  wheels: WheelRig[] = [];
  markers: { group: THREE.Group; icon: THREE.Sprite; ring: THREE.Mesh; id: Destination }[] = [];
  colliders: THREE.Box3[] = [];
  rig?: Rig;
  // Car state (world-space velocity enables drifting).
  position = new V(start.x, 0, start.z);
  velocity = new V();
  yaw = 0;
  steer = 0;
  wheelSpin = 0;
  carYaw = 0;
  // On-foot state.
  walkPos = new V();
  walkYaw = 0;
  walkSpeed = 0;
  walkTurnRate = 0;
  walkVelocity = { x: 0, z: 0 };
  mode: "drive" | "walk" = "drive";
  // Camera.
  cameraMode = 0;
  camHeading = 0;
  orbit = 0;
  pitch = 0.22;
  lastLook = -10;
  shake = 0;
  dragging: { x: number; y: number } | null = null;
  transition = 1;
  transitionFrom = new V();
  transitionLook = new V();
  lookAt = new V();
  // Session.
  active = false;
  paused = false;
  disposed = false;
  reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  time = 0;
  raf = 0;
  near: Destination | null = null;
  waypoint: Destination | null = null;
  routePoints: [number, number][] = [];
  routeAge = 99;
  race: "idle" | "countdown" | "running" | "finished" = "idle";
  countdown = 0;
  checkpoint = 0;
  raceTime = 0;
  gate = new THREE.Group();
  quality: Quality;
  adaptive = true;
  fps = { frames: 0, time: 0, low: 0 };
  lastPublish = 0;
  cleanup: Array<() => void> = [];
  observer: ResizeObserver;
  streetLights: THREE.PointLight[] = [];
  headlights: THREE.SpotLight[] = [];
  carLamps: { head: THREE.MeshStandardMaterial[]; brake: THREE.MeshStandardMaterial[] } = {
    head: [],
    brake: [],
  };
  throttle = 0;
  braking = false;
  onUpdate: WorldCallbacks["update"];
  onEnter: WorldCallbacks["enter"];
  onMap: WorldCallbacks["map"];
  onError: WorldCallbacks["error"];
  callbacks: WorldCallbacks;

  constructor(
    private host: HTMLDivElement,
    callbacks: WorldCallbacks,
    options: { time?: TimeOfDay; quality?: Quality; adaptive?: boolean } = {},
  ) {
    this.callbacks = callbacks;
    this.onUpdate = callbacks.update;
    this.onEnter = callbacks.enter;
    this.onMap = callbacks.map;
    this.onError = callbacks.error;
    const coarse = matchMedia("(pointer: coarse)").matches || innerWidth < 820;
    this.quality = options.quality || (coarse ? "high" : "ultra");
    this.adaptive = options.adaptive ?? !options.quality;
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: false,
      powerPreference: "high-performance",
      stencil: false,
    });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.host.appendChild(this.renderer.domElement);
    this.renderer.domElement.setAttribute(
      "aria-label",
      "Interactive 3D neighbourhood. Use the navigation buttons for accessible portfolio content.",
    );
    this.manager.onProgress = (_url, loaded, total) =>
      this.callbacks.progress?.(total ? loaded / total : 1);

    this.atmosphere = new Atmosphere(this.renderer, this.scene, this.camera);
    this.atmosphere.setTime(options.time || "golden", true);
    this.district = new District(
      this.scene,
      Math.min(8, this.renderer.capabilities.getMaxAnisotropy()),
      this.manager,
    );
    this.colliders.push(...this.district.colliders);
    this.traffic = new Traffic(this.scene, this.district.parking);
    this.traffic.onHorn = (x, z) => {
      const d = Math.hypot(x - this.focus.x, z - this.focus.z);
      this.sound?.horn(Math.max(0, 1 - d / 60), 0.85);
    };
    this.crowd = new Crowd(this.scene);
    this.skids = new SkidMarks(this.scene);
    this.puffs = new Puffs(this.scene);
    this.motes = new Motes(this.scene);
    this.makeCar();
    this.makeLights();
    this.loadCharacters();
    this.makeMarkers();
    this.setQuality(this.quality);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
    this.bind();
    this.introCamera(0);
    this.animate();
  }

  get focus() {
    return this.mode === "walk" ? this.walkPos : this.position;
  }

  // ---------------------------------------------------------------- setup
  makeCar() {
    this.car.position.copy(this.position);
    this.scene.add(this.car);
    this.car.add(this.carBody);
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 5.4), contactShadow());
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.03;
    this.car.add(blob);
    new GLTFLoader(this.manager).load(
      "/assets/car-concept.glb",
      (gltf) => {
        if (this.disposed) return;
        const model = gltf.scene;
        model.rotation.y = Math.PI;
        model.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(model);
        model.scale.setScalar(4.7 / bounds.getSize(new V()).z);
        model.updateMatrixWorld(true);
        bounds.setFromObject(model);
        const c = bounds.getCenter(new V());
        model.position.set(-c.x, -bounds.min.y + 0.02, -c.z);
        alignPlayerControls(model);
        model.traverse((o) => {
          if (o instanceof THREE.Mesh) {
            o.castShadow = true;
            o.receiveShadow = true;
            for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
              if (!(m instanceof THREE.MeshStandardMaterial)) continue;
              m.envMapIntensity = 1;
              if (m.name.startsWith("Paint 1") && m instanceof THREE.MeshPhysicalMaterial) {
                m.color.set("#2b7a5e");
                m.roughness = 0.22;
                m.metalness = 0.75;
                m.clearcoat = 1;
                m.clearcoatRoughness = 0.06;
              }
              if (m.name === "Glass" && m instanceof THREE.MeshPhysicalMaterial) {
                m.transmission = 0;
                m.transparent = true;
                m.opacity = 0.18;
                m.depthWrite = false;
                m.color.set("#c2dad9");
                m.metalness = 0.08;
              }
              if (m.name === "Headlight") {
                m.emissive.set("#fff3d6");
                this.carLamps.head.push(m);
              }
              if (m.name === "Brakelight") {
                m.emissive.set("#ff2410");
                this.carLamps.brake.push(m);
              }
            }
          }
          if (/^Wheel(Front|Rear)[LR]$/.test(o.name)) {
            this.wheels.push(new WheelRig(o));
          }
        });
        this.carBody.add(model);
      },
      undefined,
      () => console.warn("Vehicle model unavailable."),
    );
  }

  makeLights() {
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight("#ffc98c", 0, 22, 1.6);
      l.visible = false;
      this.streetLights.push(l);
      this.scene.add(l);
    }
    for (const x of [-0.62, 0.62]) {
      const s = new THREE.SpotLight("#fff1d6", 0, 55, 0.42, 0.55, 1.4);
      s.position.set(x, 0.8, -2.2);
      s.target.position.set(x * 2.5, 0, -16);
      s.visible = false;
      this.car.add(s, s.target);
      this.headlights.push(s);
    }
  }

  loadCharacters() {
    const loader = new GLTFLoader(this.manager);
    loader.load("/assets/people/player.glb", (gltf) => {
      if (this.disposed) return;
      this.driver = placeDriver(createDriver(gltf.scene, 0), "player");
      this.driver.visible = this.mode === "drive";
      this.carBody.add(this.driver);
      const model = prepare(gltf.scene, 0);
      model.rotation.y = Math.PI;
      this.walkBody.add(model);
      this.walker.add(this.walkBody);
      const blob = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), contactShadow());
      blob.rotation.x = -Math.PI / 2;
      blob.position.y = 0.04;
      this.walker.add(blob);
      this.rig = new Rig(model, gltf.animations);
    });
    this.walker.visible = false;
    this.scene.add(this.walker);
    npcModels.forEach((name, i) =>
      loader.load(`/assets/people/${name}.glb`, (gltf: GLTF) => {
        if (!this.disposed) {
          this.crowd.add(gltf, i);
          if (i < 3) this.traffic.setDrivers(gltf.scene, i);
        }
      }),
    );
  }

  makeMarkers() {
    const columnMat = (color: THREE.Color) =>
      new THREE.ShaderMaterial({
        uniforms: { color: { value: color }, time: { value: 0 } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform vec3 color; uniform float time; varying vec2 vUv;
          void main(){ float a = pow(clamp(1.0 - vUv.y, 0.0, 1.0), 1.6) * (0.55 + 0.1 * sin(time * 3.0 + vUv.x * 40.0));
          gl_FragColor = vec4(color * 1.6, a * 0.55);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          }`,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      });
    for (const d of destinations) {
      const g = new THREE.Group();
      const color = new THREE.Color(d.color);
      const column = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 2.6, 48, 1, true), columnMat(color));
      column.position.y = 1.3;
      g.add(column);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(2.25, 2.45, 64),
        new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(2), transparent: true, opacity: 0.9, depthWrite: false }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.2;
      g.add(ring);
      const c = document.createElement("canvas");
      c.width = c.height = 128;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "rgba(10,18,15,0.85)";
      ctx.beginPath();
      ctx.arc(64, 64, 58, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = d.color;
      ctx.lineWidth = 7;
      ctx.stroke();
      ctx.fillStyle = d.color;
      ctx.font = "700 46px 'DM Sans', Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(d.symbol, 64, 68);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, fog: false }));
      icon.scale.setScalar(1.15);
      icon.position.y = 4.2;
      g.add(icon);
      g.position.set(d.x, 0, d.z);
      this.scene.add(g);
      this.markers.push({ group: g, icon, ring, id: d.id });
    }
    const gm = new THREE.MeshBasicMaterial({ color: new THREE.Color("#d0f59a").multiplyScalar(2), transparent: true, opacity: 0.85 });
    for (const x of [-5.5, 5.5]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 5, 0.16), gm);
      post.position.set(x, 2.5, 0);
      this.gate.add(post);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(11, 0.16, 0.16), gm);
    beam.position.y = 5;
    this.gate.add(beam);
    this.gate.visible = false;
    this.scene.add(this.gate);
  }

  // ---------------------------------------------------------------- input
  bind() {
    const down = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t?.closest("input,textarea,select,[contenteditable=true]") || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (t?.closest("button") && [" ", "enter"].includes(k)) return;
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k) && this.active && !this.paused)
        e.preventDefault();
      this.keys.add(k);
      if (e.repeat || !this.active) return;
      if (k === "m") this.onMap();
      if (this.paused) return;
      if (k === "e" && this.near) this.onEnter(this.near);
      if (k === "f") this.toggleMode();
      if (k === "h" && this.mode === "drive") this.sound?.horn(1, 1);
      if (k === "t") this.cycleTime();
      if (k === "c") {
        this.cameraMode = (this.cameraMode + 1) % 3;
        this.orbit = 0;
      }
      if (k === "r") this.reset();
    };
    const keyup = (e: KeyboardEvent) => this.keys.delete(e.key.toLowerCase());
    const blur = () => this.keys.clear();
    const visibility = () => {
      this.keys.clear();
      this.clock.getDelta();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", keyup);
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", visibility);
    const canvas = this.renderer.domElement;
    const pd = (e: PointerEvent) => {
      this.dragging = { x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
    };
    const pm = (e: PointerEvent) => {
      if (!this.dragging) return;
      this.orbit -= (e.clientX - this.dragging.x) * 0.006;
      this.pitch = THREE.MathUtils.clamp(this.pitch + (e.clientY - this.dragging.y) * 0.004, -0.05, 0.85);
      this.dragging = { x: e.clientX, y: e.clientY };
      this.lastLook = this.time;
    };
    const pu = () => (this.dragging = null);
    const lost = (e: Event) => {
      e.preventDefault();
      this.onError();
    };
    canvas.addEventListener("pointerdown", pd);
    canvas.addEventListener("pointermove", pm);
    canvas.addEventListener("pointerup", pu);
    canvas.addEventListener("pointercancel", pu);
    canvas.addEventListener("webglcontextlost", lost);
    this.cleanup.push(() => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", keyup);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", visibility);
      canvas.removeEventListener("pointerdown", pd);
      canvas.removeEventListener("pointermove", pm);
      canvas.removeEventListener("pointerup", pu);
      canvas.removeEventListener("pointercancel", pu);
      canvas.removeEventListener("webglcontextlost", lost);
    });
  }

  // ---------------------------------------------------------------- public API
  enter() {
    if (!this.active) {
      this.active = true;
      this.transition = 0;
      this.transitionFrom.copy(this.camera.position);
      this.transitionLook.copy(this.lookAt);
      this.camHeading = this.yaw;
    }
    this.keys.clear();
  }
  async setSound(on: boolean) {
    if (!this.sound) this.sound = new Soundscape();
    await this.sound.setEnabled(on);
  }
  setTime(t: TimeOfDay) {
    this.atmosphere.setTime(t);
    this.callbacks.time?.(t);
  }
  cycleTime() {
    const order: TimeOfDay[] = ["golden", "night", "day"];
    this.setTime(order[(order.indexOf(this.atmosphere.time) + 1) % order.length]);
  }
  setWaypoint(d: Destination | null) {
    this.waypoint = d;
    this.routeAge = 99;
    this.sound?.blip(d ? 990 : 520);
  }
  honk() {
    this.sound?.horn(1, 1);
  }
  reset() {
    this.mode = "drive";
    this.walker.visible = false;
    this.position.set(start.x, 0, start.z);
    this.velocity.set(0, 0, 0);
    this.yaw = 0;
    this.steer = 0;
    this.throttle = 0;
    this.walkVelocity = { x: 0, z: 0 };
    for (const wheel of this.wheels) wheel.update(this.wheelSpin, 0);
    this.camHeading = 0;
    this.orbit = 0;
    this.race = "idle";
    this.gate.visible = false;
  }
  toggleMode() {
    if (this.race === "countdown" || this.race === "running") {
      this.callbacks.message?.("Finish or end the sprint before stepping out.");
      return;
    }
    if (this.mode === "drive") {
      if (this.velocity.length() > 4) {
        this.callbacks.message?.("Slow down before stepping out.");
        return;
      }
      const right = new V(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      this.walkPos.copy(this.position).addScaledVector(right, -1.7);
      if (this.blocked(this.walkPos, 0.4, true, true)) this.walkPos.copy(this.position).addScaledVector(right, 1.7);
      if (this.blocked(this.walkPos, 0.4, true, true)) {
        this.callbacks.message?.("The doors are blocked. Move to an open spot before stepping out.");
        return;
      }
      this.walkYaw = this.yaw + Math.PI / 2;
      this.walkSpeed = 0;
      this.walkTurnRate = 0;
      this.walkBody.rotation.set(0, 0, 0);
      this.walkVelocity = { x: 0, z: 0 };
      this.mode = "walk";
      this.walker.visible = true;
      this.velocity.set(0, 0, 0);
      this.camHeading = this.yaw;
    } else {
      const d = this.walkPos.distanceTo(this.position);
      if (d > 4.5) {
        // Have the car delivered beside the visitor, pointing the way the camera looks.
        const heading = this.camHeading + this.orbit;
        const right = new V(Math.cos(heading), 0, -Math.sin(heading));
        const spot = this.walkPos.clone().addScaledVector(right, 2.6);
        if (this.blocked(spot, 1.2)) spot.copy(this.walkPos).addScaledVector(right, -2.6);
        if (this.blocked(spot, 1.2)) {
          this.callbacks.message?.("No room to park here. Walk to the road, then press F.");
          return;
        }
        this.position.copy(spot);
        this.yaw = heading;
        this.callbacks.message?.("Your ride pulled up beside you.");
      }
      this.mode = "drive";
      this.walker.visible = false;
      this.camHeading = this.yaw;
    }
  }
  travel(id: Destination) {
    const d = destinations.find((d) => d.id === id)!;
    this.mode = "drive";
    this.walker.visible = false;
    const lane = d.x > 0 ? LANES.inner : -LANES.inner;
    this.position.set(lane, 0, d.z + (d.x > 0 ? 4 : -4));
    this.yaw = d.x > 0 ? 0 : Math.PI;
    this.velocity.set(0, 0, 0);
    this.camHeading = this.yaw;
    this.orbit = 0;
    this.race = "idle";
    this.gate.visible = false;
    if (this.waypoint === id) this.waypoint = null;
    this.enter();
    this.transition = 1;
  }
  startRace() {
    this.reset();
    this.position.set(start.x, 0, start.z - 4);
    this.race = "countdown";
    this.countdown = 3;
    this.checkpoint = 0;
    this.raceTime = 0;
    this.enter();
    this.gate.visible = true;
    this.placeGate();
  }
  placeGate() {
    const p = raceRoute[this.checkpoint];
    if (!p) return;
    const next = raceRoute[this.checkpoint + 1] || p;
    this.gate.position.set(p[0], 0, p[1]);
    const dx = next[0] - p[0],
      dz = next[1] - p[1];
    this.gate.rotation.y = dx || dz ? Math.atan2(dx, dz) : 0;
  }
  setQuality(q: Quality, manual = false) {
    if (manual) this.adaptive = false;
    this.quality = q;
    this.atmosphere.setQuality(q);
    this.renderer.setPixelRatio(q === "low" ? Math.min(devicePixelRatio, 1) : Math.min(devicePixelRatio, q === "ultra" ? 1.75 : 1.4));
    this.renderer.shadowMap.enabled = true;
    this.resize();
  }
  resize() {
    const w = this.host.clientWidth || 1,
      h = this.host.clientHeight || 1;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.atmosphere.setSize(w, h);
  }

  // ---------------------------------------------------------------- simulation
  blocked(p: THREE.Vector3, r: number, dynamic = true, onFoot = false) {
    if (p.x < BOUNDS.minX || p.x > BOUNDS.maxX || p.z < BOUNDS.minZ || p.z > BOUNDS.maxZ) return true;
    for (const b of this.colliders) {
      if (onFoot && b.max.y < 0.7) continue; // kerbs and drains can be stepped over
      if (p.x > b.min.x - r && p.x < b.max.x + r && p.z > b.min.z - r && p.z < b.max.z + r) return true;
    }
    if (dynamic)
      for (const o of this.dynamicObstacles)
        if (Math.hypot(p.x - o.x, p.z - o.z) < o.r + r) return true;
    return false;
  }
  dynamicObstacles: { x: number; z: number; r: number }[] = [];

  /** Test the car's footprint as three circles along its length. */
  carBlocked(p: THREE.Vector3, yaw: number) {
    const fx = -Math.sin(yaw),
      fz = -Math.cos(yaw);
    for (const s of [-1.55, 0, 1.55])
      if (this.blocked(new V(p.x + fx * s, 0, p.z + fz * s), 0.95)) return true;
    return false;
  }

  /** The parked player car, as three circles along its length. */
  touchesCar(p: THREE.Vector3, r: number) {
    const fx = -Math.sin(this.yaw),
      fz = -Math.cos(this.yaw);
    for (const s of [-1.5, 0, 1.5])
      if (Math.hypot(p.x - (this.position.x + fx * s), p.z - (this.position.z + fz * s)) < 0.95 + r)
        return true;
    return false;
  }
  drive(dt: number) {
    const k = this.keys;
    const fwdKey = k.has("w") || k.has("arrowup"),
      backKey = k.has("s") || k.has("arrowdown"),
      left = k.has("a") || k.has("arrowleft"),
      right = k.has("d") || k.has("arrowright"),
      handbrake = k.has(" ");
    const f = new V(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const r = new V(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    let vF = this.velocity.dot(f),
      vR = this.velocity.dot(r);
    const max = 33;
    this.throttle = 0;
    this.braking = false;
    if (fwdKey) {
      if (vF < -0.5) {
        vF = Math.min(0, vF + 30 * dt);
        this.braking = true;
      } else {
        vF += 12.5 * (1 - Math.max(0, vF) / max) * dt;
        this.throttle = 1;
      }
    } else if (backKey) {
      if (vF > 0.5) {
        vF = Math.max(0, vF - 30 * dt);
        this.braking = true;
      } else vF = Math.max(-9, vF - 7 * dt);
    } else vF -= vF * 0.32 * dt + Math.sign(vF) * Math.min(Math.abs(vF), 0.8 * dt);
    if (handbrake) {
      vF -= vF * 1.1 * dt;
      this.braking = true;
    }
    const steerInput = (left ? 1 : 0) - (right ? 1 : 0);
    this.steer = damp(this.steer, steerInput, steerInput ? 6 : 9, dt);
    const speed = Math.abs(vF);
    const maxAngle = THREE.MathUtils.lerp(0.62, 0.17, Math.min(1, speed / 30));
    let yawRate = (vF * Math.tan(this.steer * maxAngle)) / 2.7;
    if (handbrake && speed > 6) yawRate *= 1.45;
    this.yaw += yawRate * dt;
    // Lateral grip: strong normally, loose under handbrake for controllable slides.
    const grip = handbrake ? 1.4 : speed > 22 && Math.abs(this.steer) > 0.8 ? 5.5 : 10;
    vR *= Math.exp(-grip * dt);
    this.velocity.copy(f).multiplyScalar(vF).addScaledVector(r, vR);
    // Integrate with axis-separated collision so the car slides along walls.
    const step = this.velocity.clone().multiplyScalar(dt);
    const next = this.position.clone().add(step);
    if (!this.carBlocked(next, this.yaw)) this.position.copy(next);
    else {
      const impact = this.velocity.length();
      const tryX = this.position.clone().add(new V(step.x, 0, 0));
      const tryZ = this.position.clone().add(new V(0, 0, step.z));
      if (!this.carBlocked(tryX, this.yaw)) {
        this.position.copy(tryX);
        this.velocity.z *= -0.15;
        this.velocity.x *= 0.85;
      } else if (!this.carBlocked(tryZ, this.yaw)) {
        this.position.copy(tryZ);
        this.velocity.x *= -0.15;
        this.velocity.z *= 0.85;
      } else this.velocity.multiplyScalar(-0.2);
      if (impact > 6) {
        this.shake = Math.min(1, impact / 25);
        this.sound?.blip(110);
      }
    }
    // Visuals: body roll / pitch / wheel spin / steering.
    const lateralG = vR * 0.02 + yawRate * speed * 0.004;
    this.car.position.copy(this.position);
    this.car.rotation.set(0, 0, 0);
    this.carYaw = this.yaw;
    this.car.rotation.y = this.yaw;
    const body = this.carBody;
    if (body && body.type === "Group") {
      body.rotation.z = damp(body.rotation.z, THREE.MathUtils.clamp(-lateralG, -0.06, 0.06), 6, dt);
      body.rotation.x = damp(body.rotation.x, this.braking ? -0.025 : this.throttle ? 0.018 : 0, 5, dt);
    }
    this.wheelSpin += (vF * dt) / 0.36;
    for (const w of this.wheels) w.update(this.wheelSpin, this.steer * maxAngle);
    // Tyre smoke and skid marks when sliding.
    const slip = Math.abs(vR);
    const sliding = (slip > 2.6 && speed > 5) || (handbrake && speed > 9) || (this.throttle && speed < 6 && k.has("shift"));
    for (const [i, s] of [-0.85, 0.85].entries()) {
      const p = this.position.clone().addScaledVector(r, s).addScaledVector(f, -1.45);
      this.skids.mark(i, sliding ? p : null, r);
      if (sliding && Math.random() < 0.7)
        this.puffs.emit(p.setY(0.3), new V((Math.random() - 0.5) * 1.5, 0.6 + Math.random(), (Math.random() - 0.5) * 1.5).addScaledVector(this.velocity, 0.15), 0.8);
    }
    for (const m of this.carLamps.brake) m.emissiveIntensity = this.braking ? 6 : 0.4 + this.atmosphere.night.value * 1.6;
  }

  walk(dt: number) {
    const k = this.keys;
    const ix = Number(k.has("d") || k.has("arrowright")) - Number(k.has("a") || k.has("arrowleft")),
      iz = Number(k.has("s") || k.has("arrowdown")) - Number(k.has("w") || k.has("arrowup"));
    walkingVelocity(this.walkVelocity, ix, iz, this.camHeading + this.orbit, k.has("shift"), dt);
    const previousSpeed = this.walkSpeed;
    const candidate = new V();
    this.walkSpeed = moveWalker(this.walkPos, this.walkVelocity, dt, (p) => {
      candidate.set(p.x, 0, p.z);
      return !this.blocked(candidate, 0.34, true, true) && !this.touchesCar(candidate, 0.34);
    });
    if (this.walkSpeed > 0.08) {
      const turn = walkingTurn(this.walkYaw, this.walkTurnRate, Math.atan2(-this.walkVelocity.x, -this.walkVelocity.z), dt);
      this.walkYaw = turn.yaw;
      this.walkTurnRate = turn.rate;
    } else this.walkTurnRate = damp(this.walkTurnRate, 0, 12, dt);
    // A little weight shift on acceleration and into corners keeps the torso loose.
    // The shadow and camera stay on the stable ground-level parent.
    const acceleration = dt > 0 ? (this.walkSpeed - previousSpeed) / dt : 0;
    const run = THREE.MathUtils.smoothstep(this.walkSpeed, 1.8, 4.1);
    const lean = THREE.MathUtils.clamp(-acceleration * 0.003 - run * 0.012, -0.035, 0.02);
    const bank = THREE.MathUtils.clamp(this.walkTurnRate * this.walkSpeed * 0.004, -0.04, 0.04);
    this.walkBody.rotation.x = damp(this.walkBody.rotation.x, lean, 8, dt);
    this.walkBody.rotation.z = damp(this.walkBody.rotation.z, bank, 8, dt);
    // Footpaths and kerbs sit slightly above the road.
    const groundY = this.district.groundHeight(this.walkPos.x, this.walkPos.z);
    this.walker.position.set(this.walkPos.x, damp(this.walker.position.y, groundY, 12, dt), this.walkPos.z);
    this.walker.rotation.y = this.walkYaw;
    this.velocity.set(0, 0, 0);
    this.car.position.copy(this.position);
    this.car.rotation.y = this.yaw;
  }

  updateCamera(dt: number) {
    const walk = this.mode === "walk";
    const speed = this.velocity.length();
    if (!walk) {
      // Follow the direction of travel, not just the nose, so slides feel cinematic.
      const travel = speed > 3 ? Math.atan2(-this.velocity.x, -this.velocity.z) : this.yaw;
      const reverse = this.velocity.dot(new V(-Math.sin(this.yaw), 0, -Math.cos(this.yaw))) < -1;
      this.camHeading = dampAngle(this.camHeading, reverse ? this.yaw : dampAngle(this.yaw, travel, 1, 0.5), 3.2, dt);
      if (this.time - this.lastLook > 1.6 && !this.dragging && speed > 2) {
        this.orbit = damp(this.orbit, 0, 2, dt);
        this.pitch = damp(this.pitch, 0.2, 2, dt);
      }
    }
    const heading = this.camHeading + this.orbit;
    const focus = walk ? this.walker.position : this.car.position;
    let dist: number, height: number, lookAhead: number;
    if (this.cameraMode === 1) {
      dist = walk ? 7 : 12 + speed * 0.08;
      height = 1.2;
      lookAhead = 3;
    } else if (this.cameraMode === 2) {
      dist = walk ? 2.2 : -0.6;
      height = walk ? 0.4 : 0.05;
      lookAhead = 10;
    } else {
      dist = walk ? 4.2 : 6.8 + speed * 0.05;
      height = walk ? 0.55 : 0.6;
      lookAhead = walk ? 0.3 : 2.5;
    }
    // Portrait screens need a wider, further camera to keep the street readable.
    if (this.camera.aspect < 1 && this.cameraMode !== 2) dist *= 1.45;
    const pitch = this.cameraMode === 2 ? 0.05 : this.pitch;
    const pivot = focus.clone().add(new V(0, walk ? 1.55 : 1.45, 0));
    const offset = new V(Math.sin(heading) * Math.cos(pitch), Math.sin(pitch), Math.cos(heading) * Math.cos(pitch)).multiplyScalar(dist);
    offset.y += height;
    let target = pivot.clone().add(offset);
    // Keep the camera out of walls.
    const dir = target.clone().sub(pivot),
      len = dir.length();
    if (len > 0.01) {
      const ray = new THREE.Ray(pivot, dir.normalize());
      let clear = len;
      const hit = new V();
      for (const b of this.colliders) {
        if (ray.intersectBox(b, hit)) clear = Math.min(clear, pivot.distanceTo(hit));
      }
      if (clear < len) target = ray.at(Math.max(0.6, clear - 0.35), new V());
    }
    target.y = Math.max(target.y, 0.6);
    this.safeCamera(target, false);
    const look = focus.clone().add(new V(-Math.sin(heading) * lookAhead, walk ? 1.45 : 1.25, -Math.cos(heading) * lookAhead));
    const k = this.cameraMode === 2 && !walk ? 30 : 9;
    if (this.transition < 1) {
      this.transition = Math.min(1, this.transition + dt / 2.2);
      const t = ease(this.transition);
      // Swoop from the establishing shot down to the chase camera.
      const arc = this.transitionFrom.clone().lerp(target, t);
      arc.y += Math.sin(t * Math.PI) * 6;
      this.camera.position.copy(arc);
      this.lookAt.copy(this.transitionLook).lerp(look, t);
    } else {
      this.camera.position.lerp(target, 1 - Math.exp(-dt * k));
      this.lookAt.lerp(look, 1 - Math.exp(-dt * 14));
    }
    if (this.shake > 0 && !this.reduced) {
      this.camera.position.add(new V((Math.random() - 0.5) * this.shake * 0.4, (Math.random() - 0.5) * this.shake * 0.3, 0));
      this.shake = Math.max(0, this.shake - dt * 2.5);
    }
    this.camera.lookAt(this.lookAt);
    const fov = (walk ? 52 : 54 + Math.min(18, speed * 0.55)) + (this.camera.aspect < 1 ? 12 : 0);
    this.camera.fov = damp(this.camera.fov, fov, 3, dt);
    this.camera.updateProjectionMatrix();
  }

  /** Establishing shots for the title screen, authored to stay in clear air over the roads. */
  static shots: { dur: number; p0: number[]; l0: number[]; p1: number[]; l1: number[]; orbit?: boolean }[] = [
    { dur: 11, p0: [3.4, 4.8, 126], l0: [0.5, 3.4, 60], p1: [3.4, 3.5, 102], l1: [0, 3, 40] },
    { dur: 11, p0: [-0.5, 6, 31], l0: [0, 4.5, -40], p1: [0.6, 19, 27], l1: [0, 6, -70] },
    { dur: 11, p0: [-4.3, 2.9, 15], l0: [22, 6.5, 9], p1: [-4.3, 3.4, -5], l1: [22, 6.5, -11] },
    { dur: 11, p0: [-2.6, 0, -0.6], l0: [0, 0, 0], p1: [-0.8, 0, 0], l1: [0, 0, 0], orbit: true },
  ];
  introCamera(dt: number) {
    const shots = World.shots;
    const total = shots.reduce((a, s) => a + s.dur, 0);
    let t = this.reduced ? 2 : this.time % total;
    let i = 0;
    while (t > shots[i].dur) t -= shots[i++].dur;
    const shot = shots[i];
    const u = t / shot.dur,
      e = ease(u);
    const p = new V(),
      l = new V();
    if (shot.orbit) {
      // Slow arc around the hero car parked at the start.
      const a = THREE.MathUtils.lerp(shot.p0[0], shot.p1[0], e);
      p.set(start.x + Math.sin(a) * 7, 1.7 + e * 0.5, start.z + Math.cos(a) * 7);
      l.set(start.x, 0.9, start.z);
    } else {
      p.fromArray(shot.p0).lerp(new V().fromArray(shot.p1), e);
      l.fromArray(shot.l0).lerp(new V().fromArray(shot.l1), e);
    }
    this.safeCamera(p);
    this.camera.position.copy(p);
    this.lookAt.copy(l);
    this.camera.lookAt(l);
    this.camera.fov = shot.orbit ? 42 : 50;
    this.camera.updateProjectionMatrix();
    // Dip to black around each cut.
    const edge = Math.min(t, shot.dur - t);
    this.atmosphere.fade = this.reduced ? 1 : THREE.MathUtils.smoothstep(edge, 0, 0.7) * 0.92 + 0.08;
    this.introFocus.copy(shot.orbit ? new V(start.x, 0, start.z) : l.clone().setY(0).lerp(p.clone().setY(0), 0.5));
    void dt;
  }
  introFocus = new V(0, 0, 60);
  /** Keep a camera position out of canopies and solid volumes. */
  safeCamera(p: THREE.Vector3, canopies = true) {
    if (canopies)
      for (const c of this.district.canopies) {
      const d = p.distanceTo(c.center);
      if (d < c.radius * 0.85) p.add(p.clone().sub(c.center).setLength(c.radius * 0.85 - d));
    }
    for (const b of this.colliders)
      if (b.max.y > 1.5 && b.max.x - b.min.x > 2 && b.max.z - b.min.z > 2 && p.x > b.min.x - 0.3 && p.x < b.max.x + 0.3 && p.z > b.min.z - 0.3 && p.z < b.max.z + 0.3 && p.y < b.max.y + 0.4)
        p.y = b.max.y + 0.4;
    return p;
  }

  nightLights() {
    const night = this.atmosphere.night.value;
    const on = night > 0.3;
    const f = this.focus;
    const lamps = on
      ? [...this.district.lamps].sort((a, b) => a.distanceToSquared(f) - b.distanceToSquared(f)).slice(0, this.streetLights.length)
      : [];
    this.streetLights.forEach((l, i) => {
      l.visible = on && !!lamps[i];
      if (lamps[i]) l.position.copy(lamps[i]).add(new V(0, -0.4, 0));
      l.intensity = 85 * THREE.MathUtils.smoothstep(night, 0.3, 0.9);
    });
    for (const s of this.headlights) {
      s.visible = night > 0.25 && this.mode === "drive";
      s.intensity = 140 * THREE.MathUtils.smoothstep(night, 0.25, 0.8);
    }
    for (const m of this.carLamps.head) m.emissiveIntensity = 0.4 + night * 2.2;
  }

  updateRoute() {
    if (!this.waypoint) {
      this.routePoints = [];
      return;
    }
    const d = destinations.find((x) => x.id === this.waypoint)!;
    this.routePoints = route([this.focus.x, this.focus.z], [d.x, d.z]);
    if (Math.hypot(this.focus.x - d.x, this.focus.z - d.z) < 9) {
      this.waypoint = null;
      this.routePoints = [];
    }
  }

  animate = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.animate);
    const real = this.clock.getDelta();
    if (document.hidden) return;
    this.adaptQuality(real);
    this.tick(real);
    this.atmosphere.render();
  };
  /** Advance the simulation without rendering (used by automated checks). */
  step(frames: number, dt = 1 / 60) {
    for (let i = 0; i < frames; i++) this.tick(dt);
  }
  tick(real: number) {
    const dt = document.hidden ? 0 : Math.min(real, 0.05);
    this.time += dt;
    if (this.driver) this.driver.visible = this.mode === "drive";
    const night = this.atmosphere.night.value;
    const ambient = !this.reduced;
    this.district.update(ambient ? this.time : 0, night);
    setVehicleNight(night);
    if (!this.paused) {
      if (ambient) this.traffic.update(dt, this.focus, this.mode === "walk" ? 0.4 : 1.2);
      this.crowd.update(dt, this.walkPos, this.mode === "walk" && this.active, this.reduced);
      this.dynamicObstacles = [...this.traffic.obstacles(), ...this.crowd.obstacles()];
    }
    this.puffs.update(dt, 0.35 + (1 - night) * 0.65);
    for (const [i, m] of this.markers.entries()) {
      m.icon.position.y = 4.2 + (this.reduced ? 0 : Math.sin(this.time * 1.8 + i) * 0.18);
      const s = 1 + (this.reduced ? 0 : Math.sin(this.time * 2.4 + i) * 0.04);
      m.ring.scale.setScalar(s);
      ((m.group.children[0] as THREE.Mesh).material as THREE.ShaderMaterial).uniforms.time.value = this.time;
      m.group.visible = this.race !== "running" && this.race !== "countdown";
    }
    if (this.active && !this.paused && !document.hidden) {
      const racing = this.race === "running";
      if (this.race === "countdown") {
        this.countdown = Math.max(0, this.countdown - dt);
        this.velocity.set(0, 0, 0);
        this.car.position.copy(this.position);
        this.car.rotation.set(0, this.yaw, 0);
        if (this.countdown === 0) { this.race = "running"; this.sound?.blip(1500); }
      } else if (this.mode === "drive") this.drive(dt);
      else this.walk(dt);
      this.near = null;
      const f = this.focus;
      for (const d of destinations) if (Math.hypot(f.x - d.x, f.z - d.z) < (this.mode === "walk" ? 4.5 : 12)) this.near = d.id;
      if (racing) {
        this.raceTime += dt;
        const p = raceRoute[this.checkpoint];
        if (Math.hypot(this.position.x - p[0], this.position.z - p[1]) < 8) {
          this.checkpoint++;
          this.sound?.blip(1200);
          if (this.checkpoint === raceRoute.length) {
            this.race = "finished";
            this.gate.visible = false;
          } else this.placeGate();
        }
      }
    }
    if (this.rig) {
      const moving = this.mode === "walk" && this.active && !this.paused ? this.walkSpeed : 0;
      this.rig.locomote(moving, this.paused ? 0 : dt, 1.05, 3.1);
    }
    if (this.active) this.updateCamera(dt);
    else this.introCamera(dt);
    this.routeAge += dt;
    if (Math.floor(this.time / 2) !== Math.floor((this.time - dt) / 2)) this.atmosphere.collectNoAO();
    if (this.routeAge > 0.4) {
      this.routeAge = 0;
      this.updateRoute();
      this.nightLights();
    }
    this.sound?.update(dt, this.velocity.length(), this.throttle, this.mode === "drive" && this.active && !this.paused, night);
    if (this.active) this.atmosphere.fade = 1;
    if (!this.reduced) this.motes.update(this.time, this.camera, this.atmosphere.sunDirection, this.atmosphere.sun.color, night);
    this.atmosphere.update(dt, this.time, this.active ? this.focus : this.introFocus);
    if (this.time - this.lastPublish > 0.1) {
      this.lastPublish = this.time;
      const f = this.focus;
      this.onUpdate({
        x: f.x,
        z: f.z,
        heading: this.mode === "walk" ? this.walkYaw : this.yaw,
        view: this.active ? this.camHeading + this.orbit : 0,
        speed: this.mode === "drive" ? this.velocity.length() * 3.6 : this.walkSpeed * 3.6,
        near: this.near,
        mode: this.mode,
        checkpoint: this.checkpoint,
        elapsed: this.raceTime,
        race: this.race,
        countdown: Math.ceil(this.countdown),
        route: this.routePoints,
        waypoint: this.waypoint,
        car: [this.position.x, this.position.z],
      });
    }
  }

  adaptQuality(real: number) {
    if (!this.active || this.paused || !this.adaptive) return;
    this.fps.frames++;
    this.fps.time += real;
    if (this.fps.time < 4) return;
    const fps = this.fps.frames / this.fps.time;
    this.fps.frames = 0;
    this.fps.time = 0;
    if ((this.quality === "ultra" && fps < 34) || (this.quality === "high" && fps < 24)) {
      if (++this.fps.low >= 2) {
        const next: Quality = this.quality === "ultra" ? "high" : "low";
        this.setQuality(next);
        this.callbacks.quality?.(next);
        this.fps.low = 0;
      }
    } else this.fps.low = 0;
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    this.cleanup.forEach((fn) => fn());
    this.district.dispose();
    this.traffic.dispose();
    this.crowd.dispose();
    this.skids.dispose();
    this.puffs.dispose();
    this.motes.dispose();
    this.sound?.dispose();
    const geometries = new Set<THREE.BufferGeometry>(),
      materials = new Set<THREE.Material>(),
      textures = new Set<THREE.Texture>();
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        geometries.add(obj.geometry);
        for (const m of Array.isArray(obj.material) ? obj.material : [obj.material]) {
          materials.add(m);
          for (const v of Object.values(m)) if (v instanceof THREE.Texture) textures.add(v);
        }
      }
    });
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    textures.forEach((t) => t.dispose());
    this.atmosphere.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
