import * as THREE from "three";

/** Tyre marks laid on the asphalt while the car slides. */
export class SkidMarks {
  max = 900;
  mesh: THREE.Mesh;
  private positions: Float32Array;
  private cursor = 0;
  private last: (THREE.Vector3 | null)[] = [null, null];
  constructor(scene: THREE.Scene) {
    this.positions = new Float32Array(this.max * 6 * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    g.setDrawRange(0, 0);
    this.mesh = new THREE.Mesh(
      g,
      new THREE.MeshBasicMaterial({
        color: "#0b0b0b",
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -4,
      }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
  }
  /** Add a segment for tyre `i` at point p, or break the trail when not sliding. */
  mark(i: number, p: THREE.Vector3 | null, side: THREE.Vector3) {
    if (!p) {
      this.last[i] = null;
      return;
    }
    const prev = this.last[i];
    if (prev && prev.distanceToSquared(p) > 0.04) {
      const w = side.clone().multiplyScalar(0.13);
      const quad = [
        prev.clone().add(w),
        prev.clone().sub(w),
        p.clone().add(w),
        prev.clone().sub(w),
        p.clone().sub(w),
        p.clone().add(w),
      ];
      const base = (this.cursor % this.max) * 18;
      quad.forEach((v, k) => {
        this.positions[base + k * 3] = v.x;
        this.positions[base + k * 3 + 1] = 0.035;
        this.positions[base + k * 3 + 2] = v.z;
      });
      this.cursor++;
      const g = this.mesh.geometry;
      g.setDrawRange(0, Math.min(this.cursor, this.max) * 6);
      (g.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
      this.last[i] = p.clone();
    } else if (!prev) this.last[i] = p.clone();
  }
  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.removeFromParent();
  }
}

/** Soft billboard particles for tyre smoke and kicked-up dust. */
export class Puffs {
  count = 220;
  points: THREE.Points;
  private pos: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private size: Float32Array;
  private cursor = 0;
  material: THREE.ShaderMaterial;
  constructor(scene: THREE.Scene) {
    this.pos = new Float32Array(this.count * 3);
    this.vel = new Float32Array(this.count * 3);
    this.life = new Float32Array(this.count);
    this.size = new Float32Array(this.count);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute("life", new THREE.BufferAttribute(this.life, 1));
    g.setAttribute("size", new THREE.BufferAttribute(this.size, 1));
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tint: { value: new THREE.Color("#d9d2c4") },
        scale: { value: 600 },
      },
      vertexShader: `attribute float life; attribute float size; varying float vLife; uniform float scale;
        void main(){ vLife = life; vec4 mv = modelViewMatrix * vec4(position,1.0);
        gl_PointSize = size * (1.0 + (1.0 - life) * 2.2) * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform vec3 tint; varying float vLife;
        void main(){ vec2 d = gl_PointCoord - 0.5; float r = dot(d,d) * 4.0; if (vLife <= 0.0 || r > 1.0) discard;
        gl_FragColor = vec4(tint, (1.0 - r) * (1.0 - r) * vLife * 0.28);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }
  emit(p: THREE.Vector3, v: THREE.Vector3, size = 1) {
    const i = this.cursor++ % this.count;
    this.pos.set([p.x, p.y, p.z], i * 3);
    this.vel.set([v.x, v.y, v.z], i * 3);
    this.life[i] = 1;
    this.size[i] = size;
  }
  update(dt: number, brightness: number) {
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt * 0.55;
      for (let k = 0; k < 3; k++) this.pos[i * 3 + k] += this.vel[i * 3 + k] * dt;
      this.vel[i * 3 + 1] += dt * 0.25;
      this.vel[i * 3] *= 0.97;
      this.vel[i * 3 + 2] *= 0.97;
    }
    this.material.uniforms.tint.value.setRGB(0.85, 0.82, 0.76).multiplyScalar(brightness);
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.life.needsUpdate = true;
    g.attributes.size.needsUpdate = true;
  }
  dispose() {
    this.points.geometry.dispose();
    this.material.dispose();
    this.points.removeFromParent();
  }
}

/** Sunlit dust drifting around the camera; strongest when looking toward a low sun. */
export class Motes {
  points: THREE.Points;
  count = 380;
  private base: Float32Array;
  material: THREE.ShaderMaterial;
  constructor(scene: THREE.Scene) {
    this.base = new Float32Array(this.count * 3);
    for (let i = 0; i < this.count; i++) this.base.set([(Math.random() - 0.5) * 30, Math.random() * 9, (Math.random() - 0.5) * 30], i * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.base.slice(), 3));
    this.material = new THREE.ShaderMaterial({
      uniforms: { tint: { value: new THREE.Color("#ffd9a8") }, strength: { value: 0 }, scale: { value: 500 } },
      vertexShader: `uniform float scale; varying float vFade; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0);
        vFade = smoothstep(1.0, 3.0, -mv.z) * (1.0 - smoothstep(10.0, 16.0, -mv.z));
        gl_PointSize = scale * 0.035 / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform vec3 tint; uniform float strength; varying float vFade;
        void main(){ vec2 d = gl_PointCoord - 0.5; float r = dot(d,d) * 4.0; if (r > 1.0) discard;
        gl_FragColor = vec4(tint * strength * vFade * (1.0 - r), 1.0);
        #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }
  update(time: number, camera: THREE.Camera, sun: THREE.Vector3, sunColor: THREE.Color, night: number) {
    const p = this.points.geometry.getAttribute("position") as THREE.BufferAttribute;
    const c = camera.position;
    for (let i = 0; i < this.count; i++) {
      const bx = this.base[i * 3], by = this.base[i * 3 + 1], bz = this.base[i * 3 + 2];
      // Wrap a box of dust around the camera so it never runs out.
      const x = ((((bx + Math.sin(time * 0.21 + i) * 0.6 + time * 0.12 - c.x) % 30) + 45) % 30) - 15 + c.x;
      const z = ((((bz + Math.cos(time * 0.17 + i * 1.3) * 0.6 - c.z) % 30) + 45) % 30) - 15 + c.z;
      const y = 0.3 + ((by + Math.sin(time * 0.3 + i * 0.7) * 0.35 + 9) % 9);
      p.setXYZ(i, x, y, z);
    }
    p.needsUpdate = true;
    const look = camera.getWorldDirection(new THREE.Vector3());
    const facing = Math.max(0, look.dot(sun));
    this.material.uniforms.strength.value = (0.06 + facing * facing * 0.55) * Math.max(0, 1 - night * 1.6);
    this.material.uniforms.tint.value.copy(sunColor);
  }
  dispose() {
    this.points.geometry.dispose();
    this.material.dispose();
    this.points.removeFromParent();
  }
}
