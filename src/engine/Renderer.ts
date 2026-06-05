import * as THREE from "three";
import { Palette } from "../world/Palette";

/** Wraps the WebGL2 renderer + scene + fog. Owns resize handling. */
export class Renderer {
  readonly gl: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;

  constructor(container: HTMLElement) {
    const canvas = document.createElement("canvas");
    container.appendChild(canvas);

    this.gl = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance"
    });
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.gl.setSize(window.innerWidth, window.innerHeight);
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.gl.shadowMap.enabled = false;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(Palette.warmCream);
    this.scene.fog = new THREE.Fog(Palette.warmCream, 4, 80);

    this.addLights();
    // iOS Safari hides/shows its toolbar as you move, resizing the visual
    // viewport WITHOUT always firing window 'resize' — which left the WebGL
    // drawing buffer smaller than the canvas and flashed a black band. Listen to
    // every viewport signal and keep the buffer in sync.
    window.addEventListener("resize", this.onResize);
    window.addEventListener("orientationchange", this.onResize);
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", this.onResize);
      window.visualViewport.addEventListener("scroll", this.onResize);
    }
  }

  private addLights(): void {
    const hemi = new THREE.HemisphereLight(0xfff6ec, Palette.shadow, 1.05);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff3e2, 1.25);
    sun.position.set(6, 9, 4);
    this.scene.add(sun);

    const fill = new THREE.DirectionalLight(Palette.powderBlue, 0.35);
    fill.position.set(-5, 3, -6);
    this.scene.add(fill);
  }

  render(camera: THREE.Camera): void {
    this.gl.render(this.scene, camera);
  }

  private onResize = (): void => {
    const w = Math.ceil(window.visualViewport?.width ?? window.innerWidth);
    const h = Math.ceil(window.visualViewport?.height ?? window.innerHeight);
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.gl.setSize(w, h, false); // don't touch canvas CSS (it's 100%/100%)
    this.gl.domElement.style.width = "100%";
    this.gl.domElement.style.height = "100%";
    window.dispatchEvent(new CustomEvent("house:resize"));
  };
}
