import * as THREE from 'three';
import { UnderwaterBackground } from './water/Background';
import { CausticsTexture } from './water/CausticsTexture';

/**
 * Renderer, camera, lights and the underwater look. Caustics are rendered to
 * a texture each frame and projected onto the scene by a spot light from
 * above, so they land on the procedural fish and on any glTF model alike.
 */
export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private readonly caustics: CausticsTexture;
  private readonly background: UnderwaterBackground;
  private readonly bubbles: THREE.Points;
  private readonly bubbleSpeeds: Float32Array;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    // Capped at 1.5: the iPad sits inside a sealed helmet with no airflow.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    this.scene.background = new THREE.Color(0x03111f);
    this.scene.fog = new THREE.Fog(0x06253d, 7, 16);

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 50);
    this.camera.position.set(0, 0.15, 4.4);
    this.camera.lookAt(0, 0, 0);

    // Soft ambient from above / below, kept low so the caustics read.
    const hemi = new THREE.HemisphereLight(0x8fcbe8, 0x06182a, 0.55);
    this.scene.add(hemi);
    // Cool rim from behind so the silhouette separates from the background.
    const rim = new THREE.DirectionalLight(0x64b6ff, 1.4);
    rim.position.set(-3, 1.5, -2);
    this.scene.add(rim);
    // Warm low fill so the belly isn't pitch black.
    const fill = new THREE.PointLight(0xffc38a, 12, 14, 2);
    fill.position.set(-2, -2, 3);
    this.scene.add(fill);

    // Caustics: rendered to a texture, projected by a spot light from above.
    this.caustics = new CausticsTexture(512);
    const sun = new THREE.SpotLight(0xd8f4ff, 340, 0, 0.55, 0.7, 2);
    sun.position.set(0.8, 7.5, 2.5);
    sun.target.position.set(0, 0, 0);
    sun.map = this.caustics.texture;
    this.scene.add(sun);
    this.scene.add(sun.target);

    this.background = new UnderwaterBackground(this.caustics.texture);
    this.scene.add(this.background.mesh);

    // Rising bubbles.
    const count = 140;
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
        opacity: 0.45,
        sizeAttenuation: true,
        depthWrite: false,
      }),
    );
    this.scene.add(this.bubbles);

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  /** Frame the fish for the porthole: zoom in/out and shift vertically. */
  setFraming(zoom: number, offsetY: number): void {
    this.camera.zoom = zoom;
    this.camera.position.y = 0.15 - offsetY;
    this.camera.lookAt(0, -offsetY, 0);
    this.camera.updateProjectionMatrix();
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

  update(dt: number, time: number): void {
    this.background.update(time);
    const pos = this.bubbles.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    for (let i = 0; i < this.bubbleSpeeds.length; i++) {
      arr[i * 3 + 1] += this.bubbleSpeeds[i] * dt;
      arr[i * 3] += Math.sin(arr[i * 3 + 1] * 2 + i) * 0.002;
      if (arr[i * 3 + 1] > 4.5) arr[i * 3 + 1] = -4.5;
    }
    pos.needsUpdate = true;
  }

  render(time: number): void {
    this.caustics.render(this.renderer, time);
    this.renderer.render(this.scene, this.camera);
  }
}
