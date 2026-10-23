import * as THREE from "three";

// Shared material library with two shader layers that do most of the "lived-in" work:
//  - weathering: macro colour variation, rain streaks and laterite splash-back near the ground,
//    computed from world position so nothing tiles visibly;
//  - foliage: wind sway, alpha-to-coverage edges, and a dithered fade near the camera so
//    leaves never fill the screen.

export const wind = { value: 0 };
const glsl = /* glsl */ `
varying vec3 vWPos;
float wHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float wNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(wHash(i), wHash(i + vec2(1, 0)), f.x), mix(wHash(i + vec2(0, 1)), wHash(i + 1.0), f.x), f.y); }
float wFbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * wNoise(p); p *= 2.07; a *= 0.5; } return v; }
`;

export type Weather = { macro?: number; streak?: number; splash?: number; splashHeight?: number; dust?: number };

export function weathered(params: THREE.MeshStandardMaterialParameters & { tile?: number; weather?: Weather; name?: string }) {
  const { tile = 1, weather = {}, name, ...rest } = params;
  const m = new THREE.MeshStandardMaterial(rest);
  if (name) m.name = name;
  m.userData.tile = tile;
  const w = { macro: 0.16, streak: 0, splash: 0, splashHeight: 0.9, dust: 0, ...weather };
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uMacro = { value: w.macro };
    shader.uniforms.uStreak = { value: w.streak };
    shader.uniforms.uSplash = { value: w.splash };
    shader.uniforms.uSplashH = { value: w.splashHeight };
    shader.uniforms.uDust = { value: w.dust };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWPos;")
      .replace(
        "#include <project_vertex>",
        "#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\n#ifdef USE_INSTANCING\nvWPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;\n#endif",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${glsl}\nuniform float uMacro; uniform float uStreak; uniform float uSplash; uniform float uSplashH; uniform float uDust;`)
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        float wM = wFbm(vWPos.xz * 0.045 + vWPos.y * 0.02);
        diffuseColor.rgb *= 1.0 + (wM - 0.5) * 2.0 * uMacro;
        float wH = wNoise(vec2((vWPos.x + vWPos.z) * 2.2, vWPos.y * 0.16));
        float wS = smoothstep(0.58, 0.92, wH) * (0.55 + 0.45 * wNoise(vWPos.xz * 1.7 + vWPos.y * 0.9));
        diffuseColor.rgb *= 1.0 - wS * uStreak;
        float wG = 1.0 - smoothstep(0.0, uSplashH, vWPos.y);
        wG *= 0.55 + 0.45 * wNoise(vec2((vWPos.x + vWPos.z) * 3.1, vWPos.y * 6.0));
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.66, 0.5, 0.38), wG * uSplash);
        float wD = wFbm(vWPos.xz * 0.35);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.55, 0.42, 0.32), smoothstep(0.45, 0.85, wD) * uDust);`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        "#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor + wS * uStreak * 0.15, 0.04, 1.0);",
      )
      .replace(
        "#include <clipping_planes_fragment>",
        `#include <clipping_planes_fragment>
        // Dissolve surfaces the camera brushes against instead of letting them fill the screen.
        float wCam = length(vViewPosition);
        if (wCam < 0.9 && wCam < mix(0.25, 0.9, fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453))) discard;`,
      );
  };
  m.customProgramCacheKey = () => `weathered-${w.macro}-${w.streak}-${w.splash}-${w.splashHeight}-${w.dust}`;
  return m;
}

/** Alpha-cut foliage with wind, alpha-to-coverage and near-camera fade. */
export function foliage(map: THREE.Texture, opts: { color?: THREE.ColorRepresentation; sway?: number; tipAxis?: "u" | "v" | "height"; flutter?: number } = {}) {
  const m = new THREE.MeshStandardMaterial({
    map,
    color: opts.color ?? "#ffffff",
    alphaTest: 0.45,
    side: THREE.DoubleSide,
    roughness: 0.82,
    metalness: 0,
  });
  m.alphaToCoverage = true;
  m.userData.foliage = true;
  const sway = opts.sway ?? 0.12,
    flutter = opts.flutter ?? 0.03,
    axis = opts.tipAxis ?? "height";
  m.onBeforeCompile = (shader) => {
    shader.uniforms.windTime = wind;
    const weight = axis === "u" ? "uv.x * uv.x" : axis === "v" ? "uv.y * uv.y" : "clamp((worldBase.y - 1.0) / 8.0, 0.0, 1.0)";
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float windTime;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 worldBase = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz;
          vec3 windOrigin = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        #else
          vec3 worldBase = (modelMatrix * vec4(position, 1.0)).xyz;
          vec3 windOrigin = worldBase;
        #endif
        float wPhase = windOrigin.x * 0.21 + windOrigin.z * 0.13;
        float wSway = sin(windTime * 1.3 + wPhase) + 0.5 * sin(windTime * 2.9 + wPhase * 1.7);
        float wFl = sin(windTime * 9.0 + worldBase.x * 3.1 + worldBase.y * 2.3 + worldBase.z * 2.7);
        float wW = ${weight};
        transformed.x += (wSway * ${sway.toFixed(3)} + wFl * ${flutter.toFixed(3)}) * wW;
        transformed.z += (wSway * ${(sway * 0.6).toFixed(3)} - wFl * ${flutter.toFixed(3)}) * wW;
        transformed.y += wFl * ${(flutter * 0.5).toFixed(3)} * wW;`,
      );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <alphatest_fragment>",
      `#include <alphatest_fragment>
      // Dithered fade when the camera pushes into a canopy, so foliage never blankets the view.
      float camDist = length(vViewPosition);
      float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
      if (camDist < mix(0.6, 3.2, dither)) discard;`,
    );
  };
  m.customProgramCacheKey = () => `foliage-${sway}-${flutter}-${axis}`;
  return m;
}

/** Emissive materials that light up after dark. */
export class NightLights {
  list: { m: THREE.MeshStandardMaterial; peak: number; base: number }[] = [];
  add<T extends THREE.MeshStandardMaterial>(m: T, peak: number, base = 0) {
    m.emissiveIntensity = base;
    this.list.push({ m, peak, base });
    return m;
  }
  update(night: number) {
    const k = THREE.MathUtils.smoothstep(night, 0.15, 0.85);
    for (const { m, peak, base } of this.list) m.emissiveIntensity = THREE.MathUtils.lerp(base, peak, k);
  }
}
