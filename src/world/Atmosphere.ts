import * as THREE from "three";
import { snapShadowAnchor } from "./Shadows";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";

export type TimeOfDay = "day" | "golden" | "night";
export type Quality = "ultra" | "high" | "low";

// Art-directed lighting states. Colours are authored in sRGB and converted once.
type Preset = {
  sunElevation: number;
  sunAzimuth: number;
  sun: string;
  sunIntensity: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  zenith: string;
  horizon: string;
  ground: string;
  glow: string;
  fog: string;
  fogDensity: number;
  exposure: number;
  environment: number;
  stars: number;
  night: number;
  clouds: number;
  bloom: number;
  lift: [number, number, number];
  gain: [number, number, number];
  saturation: number;
  contrast: number;
};

export const presets: Record<TimeOfDay, Preset> = {
  day: {
    sunElevation: 52,
    sunAzimuth: 128,
    sun: "#fff3df",
    sunIntensity: 3.4,
    hemiSky: "#bcd6ef",
    hemiGround: "#8a6c51",
    hemiIntensity: 0.85,
    zenith: "#3f7fcf",
    horizon: "#cfe0ea",
    ground: "#b9a68e",
    glow: "#fff1d6",
    fog: "#cbdbe3",
    fogDensity: 0.0042,
    exposure: 0.95,
    environment: 0.85,
    stars: 0,
    night: 0,
    clouds: 0.55,
    bloom: 0.18,
    lift: [0.0, 0.006, 0.014],
    gain: [1.03, 1.0, 0.97],
    saturation: 1.14,
    contrast: 1.08,
  },
  golden: {
    sunElevation: 14,
    sunAzimuth: 68,
    sun: "#ffb26a",
    sunIntensity: 4.6,
    hemiSky: "#b4c3dc",
    hemiGround: "#8a5a3e",
    hemiIntensity: 1.05,
    zenith: "#4d76b4",
    horizon: "#f2bb8c",
    ground: "#a77c5a",
    glow: "#ffbf7a",
    fog: "#e2b48f",
    fogDensity: 0.0036,
    exposure: 1.05,
    environment: 0.95,
    stars: 0,
    night: 0.08,
    clouds: 0.62,
    bloom: 0.32,
    lift: [0.0, 0.012, 0.03],
    gain: [1.07, 1.0, 0.9],
    saturation: 1.18,
    contrast: 1.1,
  },
  night: {
    sunElevation: 38,
    sunAzimuth: 230,
    sun: "#a9bdff",
    sunIntensity: 0.75,
    hemiSky: "#3a4f80",
    hemiGround: "#2a1e16",
    hemiIntensity: 0.7,
    zenith: "#081028",
    horizon: "#2a3554",
    ground: "#0b0c10",
    glow: "#aac0ff",
    fog: "#1f2944",
    fogDensity: 0.0062,
    exposure: 1.3,
    environment: 0.42,
    stars: 1,
    night: 1,
    clouds: 0.35,
    bloom: 0.85,
    lift: [0.0, 0.01, 0.035],
    gain: [1.0, 0.98, 1.06],
    saturation: 1.12,
    contrast: 1.12,
  },
};

const skyVertex = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
  vec4 p = projectionMatrix * viewMatrix * vec4((modelMatrix * vec4(position, 1.0)).xyz, 1.0);
  gl_Position = p.xyww;
}`;
const skyFragment = /* glsl */ `
uniform vec3 zenith; uniform vec3 horizon; uniform vec3 groundColor; uniform vec3 glow;
uniform vec3 sunDir; uniform vec3 sunColor; uniform float stars; uniform float time;
uniform float clouds; uniform float night;
varying vec3 vDir;
float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);
  float a = hash(vec3(i, 1.0)), b = hash(vec3(i + vec2(1.0, 0.0), 1.0)), c = hash(vec3(i + vec2(0.0, 1.0), 1.0)), d = hash(vec3(i + 1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y); }
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 11.7; a *= 0.5; } return v; }
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(horizon, zenith, pow(clamp(h, 0.0, 1.0), 0.42));
  col = mix(col, groundColor, 1.0 - smoothstep(-0.12, 0.0, h));
  float s = max(dot(d, normalize(sunDir)), 0.0);
  col += glow * (pow(s, 6.0) * 0.32 + pow(s, 48.0) * 0.55) * (1.0 - night * 0.7);
  // Horizon band: a little extra haze where the sky meets the city.
  col = mix(col, horizon * 1.06, exp(-abs(h) * 14.0) * 0.45);
  // Drifting cumulus layer projected on a virtual cloud plane.
  if (h > 0.0) {
    vec2 uv = d.xz / (h + 0.09) * 0.55 + vec2(time * 0.004, time * 0.0016);
    float c = fbm(uv * 1.2) * 0.65 + fbm(uv * 4.1) * 0.35;
    float cover = smoothstep(0.62 - clouds * 0.25, 0.95, c) * smoothstep(0.0, 0.18, h);
    vec3 lit = mix(horizon * 1.12, glow * 1.35, pow(s, 3.0) * 0.75);
    vec3 shade = mix(zenith, horizon, 0.55) * 0.85;
    vec3 cloudCol = mix(shade, lit, smoothstep(0.55, 0.95, c));
    col = mix(col, cloudCol, cover * 0.85);
  }
  // Sun / moon disc.
  float disc = smoothstep(0.99955 - night * 0.0002, 0.99975 - night * 0.0001, s);
  col += sunColor * disc * mix(24.0, 5.0, night);
  if (stars > 0.0) {
    vec3 cell = floor(d * 520.0);
    float st = step(0.9982, hash(cell)) * (0.6 + 0.4 * sin(time * 2.0 + hash(cell + 3.0) * 30.0));
    col += vec3(st) * stars * smoothstep(0.04, 0.35, h) * 1.6;
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    lift: { value: new THREE.Vector3() },
    gain: { value: new THREE.Vector3(1, 1, 1) },
    saturation: { value: 1.1 },
    contrast: { value: 1.08 },
    vignette: { value: 0.22 },
    aberration: { value: 0.0016 },
    sunUV: { value: new THREE.Vector2(0.5, 0.5) },
    sunVisible: { value: 0 },
    sunTint: { value: new THREE.Color(1, 0.8, 0.6) },
    aspect: { value: 1.7 },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
uniform sampler2D tDiffuse; uniform vec3 lift; uniform vec3 gain;
uniform float saturation; uniform float contrast; uniform float vignette; uniform float aberration;
uniform vec2 sunUV; uniform float sunVisible; uniform vec3 sunTint; uniform float aspect;
varying vec2 vUv;
float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
// NaN/Inf guard done on the bit pattern, so GPU fast-math cannot optimise it away.
bool nonFinite(vec3 c) { return any(equal(floatBitsToUint(c) & uvec3(0x7f800000u), uvec3(0x7f800000u))); }
vec3 fetch(vec2 uv) {
  vec3 c = texture2D(tDiffuse, uv).rgb;
  if (!nonFinite(c)) return c;
  // A bad sample (shader maths gone wrong somewhere upstream): borrow the neighbours instead of
  // letting it print as a black speck.
  vec2 px = 1.0 / vec2(textureSize(tDiffuse, 0));
  vec3 sum = vec3(0.0); float n = 0.0;
  for (int i = 0; i < 4; i++) {
    vec2 o = vec2(i == 0 ? 1.0 : i == 1 ? -1.0 : 0.0, i == 2 ? 1.0 : i == 3 ? -1.0 : 0.0) * px * 2.0;
    vec3 s = texture2D(tDiffuse, uv + o).rgb;
    if (!nonFinite(s)) { sum += s; n += 1.0; }
  }
  return n > 0.0 ? sum / n : vec3(0.0);
}
vec3 flare(vec2 uv) {
  if (sunVisible <= 0.0) return vec3(0.0);
  // Occlusion: is the sun itself visible in the frame, or behind a building or tree?
  float o = 0.0;
  for (int i = 0; i < 5; i++) {
    vec2 off = vec2(float(i - 2) * 0.006, float((i * 3) % 5 - 2) * 0.006);
    o += smoothstep(0.8, 0.97, lum(fetch(clamp(sunUV + off, 0.001, 0.999))));
  }
  o /= 5.0;
  float onScreen = smoothstep(-0.25, 0.05, min(min(sunUV.x, sunUV.y), min(1.0 - sunUV.x, 1.0 - sunUV.y)));
  float k = sunVisible * o * onScreen;
  if (k <= 0.001) return vec3(0.0);
  vec2 asp = vec2(aspect, 1.0);
  vec3 c = vec3(0.0);
  float d = length((uv - sunUV) * asp);
  c += sunTint * exp(-d * 6.5) * 0.32;
  c += sunTint * exp(-abs(uv.y - sunUV.y) * 140.0) * exp(-abs(uv.x - sunUV.x) * 2.6) * 0.18;
  vec2 axis = vec2(0.5) - sunUV;
  for (int i = 0; i < 5; i++) {
    float t = 0.45 + float(i) * 0.38;
    vec2 gp = sunUV + axis * t * 1.6;
    float size = 0.025 + 0.03 * fract(float(i) * 0.618);
    float g = 1.0 - smoothstep(size * 0.55, size, length((uv - gp) * asp));
    vec3 tint = mix(vec3(0.55, 0.75, 1.0), vec3(1.0, 0.7, 0.4), fract(float(i) * 0.37));
    c += tint * g * 0.045;
  }
  float halo = length((uv - (sunUV + axis * 1.0)) * asp);
  c += sunTint * (1.0 - smoothstep(0.0, 0.03, abs(halo - 0.32))) * 0.035;
  return c * k;
}
void main() {
  vec2 dir = vUv - 0.5; float r = dot(dir, dir);
  vec3 col;
  col.r = fetch(vUv - dir * aberration * r * 4.0).r;
  col.g = fetch(vUv).g;
  col.b = fetch(vUv + dir * aberration * r * 4.0).b;
  col = col * gain + lift * (1.0 - col);
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, saturation);
  col = (col - 0.5) * contrast + 0.5;
  col += flare(vUv);
  col *= 1.0 - vignette * smoothstep(0.08, 0.62, r * 1.6);
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`,
};

const color = (c: string) => new THREE.Color(c);

export class Atmosphere {
  sun = new THREE.DirectionalLight("#ffffff", 3);
  hemi = new THREE.HemisphereLight("#ffffff", "#000000", 0.6);
  sky: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  gtao: GTAOPass;
  grade: ShaderPass;
  sunDirection = new THREE.Vector3();
  /** 0 at noon/golden hour, 1 at full night. Read by lights, windows and vehicles. */
  night = { value: 0 };
  time: TimeOfDay = "golden";
  quality: Quality = "ultra";
  private state: Record<string, number | THREE.Color | number[]>;
  private target!: Preset;
  private envScene = new THREE.Scene();
  private envSky: THREE.Mesh;
  private pmrem: THREE.PMREMGenerator;
  private envTarget: THREE.WebGLRenderTarget | null = null;
  private envAge = 99;
  private settling = 1;
  private fog: THREE.FogExp2;
  /** Objects hidden from the AO normal/depth pass (sprites, glows, alpha-cut foliage). */
  noAO: THREE.Object3D[] = [];
  constructor(
    private renderer: THREE.WebGLRenderer,
    private scene: THREE.Scene,
    private camera: THREE.PerspectiveCamera,
  ) {
    const p = presets.golden;
    this.state = this.snapshot(p);
    this.target = p;
    this.fog = new THREE.FogExp2(p.fog, p.fogDensity);
    scene.fog = this.fog;
    scene.background = color(p.fog);
    const material = new THREE.ShaderMaterial({
      uniforms: {
        zenith: { value: color(p.zenith) },
        horizon: { value: color(p.horizon) },
        groundColor: { value: color(p.ground) },
        glow: { value: color(p.glow) },
        sunDir: { value: new THREE.Vector3(0, 1, 0) },
        sunColor: { value: color(p.sun) },
        stars: { value: 0 },
        time: { value: 0 },
        clouds: { value: p.clouds },
        night: { value: 0 },
      },
      vertexShader: skyVertex,
      fragmentShader: skyFragment,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), material);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    scene.add(this.sky);
    this.envSky = new THREE.Mesh(this.sky.geometry, material);
    this.envScene.add(this.envSky);
    this.pmrem = new THREE.PMREMGenerator(renderer);

    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(4096, 4096);
    Object.assign(this.sun.shadow.camera, {
      left: -48,
      right: 48,
      top: 48,
      bottom: -48,
      near: 1,
      far: 400,
    });
    this.sun.shadow.bias = -0.00018;
    this.sun.shadow.normalBias = 0.035;
    scene.add(this.sun, this.sun.target, this.hemi);

    const size = new THREE.Vector2(1, 1);
    const rt = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      samples: 4,
    });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.addPass(new RenderPass(scene, camera));
    this.gtao = new GTAOPass(scene, camera, 1, 1);
    this.gtao.blendIntensity = 0.9;
    this.gtao.updateGtaoMaterial({
      radius: 0.9,
      distanceExponent: 1.4,
      thickness: 1.2,
      scale: 1.1,
      samples: 12,
      distanceFallOff: 1,
    });
    this.gtao.updatePdMaterial({
      lumaPhi: 10,
      depthPhi: 2,
      normalPhi: 3,
      radius: 6,
      rings: 2,
      samples: 12,
    });
    this.composer.addPass(this.gtao);
    const pass = this.gtao as unknown as {
      _renderOverride: (...args: unknown[]) => void;
    };
    const original = pass._renderOverride.bind(this.gtao);
    pass._renderOverride = (...args: unknown[]) => {
      const hidden: THREE.Object3D[] = [];
      for (const o of this.noAO)
        if (o.visible) {
          o.visible = false;
          hidden.push(o);
        }
      original(...args);
      for (const o of hidden) o.visible = true;
    };
    this.bloom = new UnrealBloomPass(size, 0.3, 0.55, 0.88);
    // Bloom blurs its input across a large part of the screen, so a single NaN pixel from any
    // shader would grow into a black blob. Scrub non-finite values (and clamp extreme HDR
    // fireflies) right where bloom reads the scene.
    const hp = this.bloom.materialHighPassFilter;
    hp.fragmentShader = hp.fragmentShader.replace(
      "vec4 texel = texture2D( tDiffuse, vUv );",
      `vec4 texel = texture2D( tDiffuse, vUv );
      if ( any( equal( floatBitsToUint( texel ) & uvec4( 0x7f800000u ), uvec4( 0x7f800000u ) ) ) ) texel = vec4( 0.0 );
      texel = min( texel, vec4( 64.0 ) );`,
    );
    hp.needsUpdate = true;
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.apply(1);
  }
  private snapshot(p: Preset) {
    return {
      sunElevation: p.sunElevation,
      sunAzimuth: p.sunAzimuth,
      sun: color(p.sun),
      sunIntensity: p.sunIntensity,
      hemiSky: color(p.hemiSky),
      hemiGround: color(p.hemiGround),
      hemiIntensity: p.hemiIntensity,
      zenith: color(p.zenith),
      horizon: color(p.horizon),
      ground: color(p.ground),
      glow: color(p.glow),
      fog: color(p.fog),
      fogDensity: p.fogDensity,
      exposure: p.exposure,
      environment: p.environment,
      stars: p.stars,
      night: p.night,
      clouds: p.clouds,
      bloom: p.bloom,
      lift: [...p.lift],
      gain: [...p.gain],
      saturation: p.saturation,
      contrast: p.contrast,
    } as Record<string, number | THREE.Color | number[]>;
  }
  setTime(t: TimeOfDay, instant = false) {
    this.time = t;
    this.target = presets[t];
    this.settling = 0;
    if (instant) this.apply(1);
  }
  setQuality(q: Quality) {
    this.quality = q;
    this.gtao.enabled = q === "ultra";
    this.bloom.enabled = q !== "low";
    const map = q === "ultra" ? 4096 : q === "high" ? 2048 : 1024;
    // Wider shadow coverage on higher tiers keeps distant buildings grounded.
    const span = q === "ultra" ? 72 : q === "high" ? 56 : 44;
    Object.assign(this.sun.shadow.camera, { left: -span, right: span, top: span, bottom: -span });
    this.sun.shadow.camera.updateProjectionMatrix();
    if (this.sun.shadow.mapSize.x !== map) {
      this.sun.shadow.mapSize.set(map, map);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null as unknown as THREE.WebGLRenderTarget;
    }
  }
  setSize(w: number, h: number) {
    // Size the buffers in whole device pixels, matching the canvas exactly (retina sharpness).
    // Fractional sizes (e.g. 1024 × 1.4) leave render targets and the canvas a pixel apart.
    const pr = this.renderer.getPixelRatio();
    const pw = Math.max(1, Math.floor(w * pr)),
      ph = Math.max(1, Math.floor(h * pr));
    this.composer.setPixelRatio(1);
    this.composer.setSize(pw, ph);
    this.bloom.resolution.set(pw, ph);
  }
  /** Move toward the target preset. k = 1 snaps. */
  private apply(k: number) {
    const s = this.state,
      p = this.target;
    for (const key of Object.keys(s)) {
      const goal = (p as unknown as Record<string, unknown>)[key];
      const cur = s[key];
      if (cur instanceof THREE.Color) cur.lerp(color(goal as string), k);
      else if (Array.isArray(cur))
        cur.forEach(
          (v, i) => (cur[i] = THREE.MathUtils.lerp(v, (goal as number[])[i], k)),
        );
      else s[key] = THREE.MathUtils.lerp(cur, goal as number, k);
    }
    const n = (key: string) => s[key] as number,
      c = (key: string) => s[key] as THREE.Color;
    const el = THREE.MathUtils.degToRad(n("sunElevation")),
      az = THREE.MathUtils.degToRad(n("sunAzimuth"));
    this.sunDirection
      .set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az))
      .normalize();
    this.sun.color.copy(c("sun"));
    this.sun.intensity = n("sunIntensity");
    this.hemi.color.copy(c("hemiSky"));
    this.hemi.groundColor.copy(c("hemiGround"));
    this.hemi.intensity = n("hemiIntensity");
    const u = this.sky.material.uniforms;
    u.zenith.value.copy(c("zenith"));
    u.horizon.value.copy(c("horizon"));
    u.groundColor.value.copy(c("ground"));
    u.glow.value.copy(c("glow"));
    u.sunColor.value.copy(c("sun"));
    u.sunDir.value.copy(this.sunDirection);
    u.stars.value = n("stars");
    u.clouds.value = n("clouds");
    u.night.value = n("night");
    this.fog.color.copy(c("fog"));
    this.fog.density = n("fogDensity");
    (this.scene.background as THREE.Color).copy(c("fog"));
    this.exposure = n("exposure");
    this.scene.environmentIntensity = n("environment");
    this.night.value = n("night");
    this.bloom.strength = n("bloom");
    const g = this.grade.uniforms;
    g.lift.value.fromArray(s.lift as number[]);
    g.gain.value.fromArray(s.gain as number[]);
    g.saturation.value = n("saturation");
    g.contrast.value = n("contrast");
  }
  private bakeEnvironment() {
    // Reflections come from the same sky the visitor sees, so paint and glass match the time of day.
    this.sky.material.uniforms.stars.value = 0;
    const next = this.pmrem.fromScene(this.envScene, 0.02, 0.1, 1100);
    this.sky.material.uniforms.stars.value = this.state.stars as number;
    this.envTarget?.dispose();
    this.envTarget = next;
    this.scene.environment = next.texture;
  }
  collectNoAO() {
    const list: THREE.Object3D[] = [this.sky];
    this.scene.traverse((o) => {
      if (o instanceof THREE.Sprite || o instanceof THREE.Points) list.push(o);
      else if (o instanceof THREE.Mesh) {
        const m = o.material as THREE.Material;
        if (m.transparent || m.alphaTest > 0 || m instanceof THREE.ShaderMaterial)
          list.push(o);
      }
    });
    this.noAO = list;
  }
  private sunNdc = new THREE.Vector3();
  update(dt: number, elapsed: number, focus: THREE.Vector3) {
    // Lens flare: project the sun and fade it out at night or when it is behind the camera.
    const fwd = this.camera.getWorldDirection(new THREE.Vector3());
    this.sunNdc.copy(this.camera.position).addScaledVector(this.sunDirection, 1000).project(this.camera);
    const gu = this.grade.uniforms;
    gu.sunUV.value.set(this.sunNdc.x * 0.5 + 0.5, this.sunNdc.y * 0.5 + 0.5);
    gu.sunVisible.value = fwd.dot(this.sunDirection) > 0.1 && this.sunDirection.y > -0.02 ? Math.max(0, 1 - this.night.value * 2.2) : 0;
    gu.sunTint.value.copy(this.sun.color).multiplyScalar(0.9);
    gu.aspect.value = this.camera.aspect;
    if (this.settling < 1) {
      this.settling = Math.min(1, this.settling + dt / 2.6);
      this.apply(1 - Math.exp(-dt * 2.2));
      if (this.settling >= 1) this.apply(1);
    }
    this.envAge += dt;
    if (!this.envTarget || (this.settling < 1 && this.envAge > 0.4)) {
      this.envAge = 0;
      this.bakeEnvironment();
    } else if (this.settling >= 1 && this.envAge > 0.4 && this.envAge < 1) {
      this.envAge = 2;
      this.bakeEnvironment();
    }
    this.sky.material.uniforms.time.value = elapsed;
    this.sky.position.copy(this.camera.position);
    // Shadow frustum follows the visitor and snaps to texels to stop shimmering.
    const size = this.sun.shadow.camera.right * 2;
    const texel = size / this.sun.shadow.mapSize.x;
    snapShadowAnchor(this.sun.target.position, focus, this.sunDirection, texel);
    this.sun.position.copy(this.sun.target.position).addScaledVector(this.sunDirection, 160);
  }
  /** 0..1 multiplier for cinematic fades. */
  fade = 1;
  exposure = 1;
  render() {
    this.renderer.toneMappingExposure = this.exposure * this.fade;
    if (this.quality === "low") {
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.render(this.scene, this.camera);
    } else this.composer.render();
  }
  dispose() {
    this.envTarget?.dispose();
    this.pmrem.dispose();
    this.sky.geometry.dispose();
    this.sky.material.dispose();
    this.composer.dispose();
    this.gtao.dispose();
  }
}
