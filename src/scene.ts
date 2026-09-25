import * as THREE from 'three';

/**
 * Renderer, camera, lights and a bit of underwater ambiance. Kept separate
 * from the fish so the avatar can be swapped without touching the setup.
 */
export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private readonly bubbles: THREE.Points;
  private readonly bubbleSpeeds: Float32Array;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    this.scene.background = new THREE.Color(0x0b2a44);
    this.scene.fog = new THREE.Fog(0x0b2a44, 6, 14);

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 50);
    this.camera.position.set(0, 0.15, 4.4);
    this.camera.lookAt(0, 0, 0);

    const hemi = new THREE.HemisphereLight(0x9fd6ff, 0x0a1a2a, 1.1);
    this.scene.add(hemi);
    const key = new THREE.DirectionalLight(0xfff2dc, 2.2);
    key.position.set(2.5, 4, 3);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x64b6ff, 1.2);
    rim.position.set(-3, 1, -2);
    this.scene.add(rim);
    const fill = new THREE.PointLight(0xffc38a, 0.8, 12);
    fill.position.set(-2, -1.5, 3);
    this.scene.add(fill);

    // Light rays: a big soft gradient plane far behind the fish.
    const back = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 30),
      new THREE.MeshBasicMaterial({ color: 0x0f3a5c, fog: true }),
    );
    back.position.z = -12;
    this.scene.add(back);

    // Rising bubbles.
    const count = 120;
    const positions = new Float32Array(count * 3);
    this.bubbleSpeeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 10;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 8;
      positions[i * 3 + 2] = -1 - Math.random() * 6;
      this.bubbleSpeeds[i] = 0.15 + Math.random() * 0.35;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.bubbles = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: 0xbfe6ff,
        size: 0.06,
        transparent: true,
        opacity: 0.5,
        sizeAttenuation: true,
        depthWrite: false,
      }),
    );
    this.scene.add(this.bubbles);

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Keep the fish framed on both portrait and landscape iPads.
    this.camera.fov = w < h ? 52 : 38;
    this.camera.updateProjectionMatrix();
  }

  update(dt: number): void {
    const pos = this.bubbles.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    for (let i = 0; i < this.bubbleSpeeds.length; i++) {
      arr[i * 3 + 1] += this.bubbleSpeeds[i] * dt;
      arr[i * 3] += Math.sin(arr[i * 3 + 1] * 2 + i) * 0.002;
      if (arr[i * 3 + 1] > 4.5) arr[i * 3 + 1] = -4.5;
    }
    pos.needsUpdate = true;
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }
}
