import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";

/**
 * Post stack: bloom (so the spectral glow + anomaly read as light), plus a
 * "corruption" grade — RGB split, grain, intermittent glitch bursts, and a
 * state-driven vignette — scaled by how corrupted the world is (strong in
 * chaotic Reality, near-zero once restored), with a bright reveal pulse on a
 * successful elimination.
 */
const CorruptionShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uCorruption: { value: 0 },
    uReveal: { value: 0 },
    uVignette: { value: 0.3 },
    uTime: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) }
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uCorruption; uniform float uReveal; uniform float uVignette; uniform float uTime; uniform vec2 uRes;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
    void main(){
      vec2 uv = vUv;
      vec2 dir = uv - 0.5;
      // intermittent glitch burst: brief jumps gated by a slow stepped noise
      float burst = step(0.93, hash(vec2(floor(uTime*6.0), 3.0)));
      float amt = uCorruption * (0.012 + 0.02 * burst) * (1.0 + 0.5*sin(uTime*8.0 + uv.y*40.0));
      // occasional horizontal slice displacement
      float slice = step(0.85, hash(vec2(floor(uv.y*40.0), floor(uTime*5.0)))) * burst * uCorruption;
      uv.x += (hash(vec2(floor(uTime*9.0), floor(uv.y*30.0))) - 0.5) * 0.04 * slice;
      vec4 c;
      c.r = texture2D(tDiffuse, uv + dir*amt).r;
      c.g = texture2D(tDiffuse, uv).g;
      c.b = texture2D(tDiffuse, uv - dir*amt).b;
      c.a = 1.0;
      float g = (hash(uv*uRes + uTime) - 0.5) * 0.13 * uCorruption;
      c.rgb += g;
      c.rgb += uReveal * 0.5;
      // ACES filmic tone-map so bright surfaces never blow out to white
      c.rgb = clamp((c.rgb*(2.51*c.rgb+0.03))/(c.rgb*(2.43*c.rgb+0.59)+0.14), 0.0, 1.0);
      float vig = smoothstep(1.15, 0.25, length(dir) * 1.35);
      c.rgb *= mix(1.0, vig, uVignette);
      gl_FragColor = c;
    }`
};

export class PostFX {
  private composer: EffectComposer;
  private corruption: ShaderPass;
  private bloom: UnrealBloomPass;
  private corrTarget = 0;
  private corrCur = 0;
  private vigTarget = 0.3;
  private vigCur = 0.3;
  private reveal = 0;

  constructor(gl: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    const w = Math.ceil(window.visualViewport?.width ?? window.innerWidth);
    const h = Math.ceil(window.visualViewport?.height ?? window.innerHeight);
    this.composer = new EffectComposer(gl);
    this.composer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // before passes

    const render = new RenderPass(scene, camera);
    render.renderToScreen = false;
    this.composer.addPass(render);

    // high threshold so only true highlights (the emissive anomaly) bloom — not
    // the bright pastel surfaces, which previously white-washed the frame
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.32, 0.8, 0.9);
    this.bloom.renderToScreen = false;
    this.composer.addPass(this.bloom);

    this.corruption = new ShaderPass(CorruptionShader);
    this.corruption.renderToScreen = true; // final pass writes to screen
    this.corruption.uniforms.uRes.value.set(w, h);
    this.composer.addPass(this.corruption);

    this.setSize(w, h);
    window.addEventListener("house:resize", this.onResize);
  }

  private onResize = (): void =>
    this.setSize(
      Math.ceil(window.visualViewport?.width ?? window.innerWidth),
      Math.ceil(window.visualViewport?.height ?? window.innerHeight)
    );

  setSize(w: number, h: number): void {
    this.composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.composer.setSize(w, h);
    this.bloom.setSize(w, h);
    this.corruption.uniforms.uRes.value.set(w, h);
  }

  setCorruption(v: number): void {
    this.corrTarget = v;
  }
  setVignette(v: number): void {
    this.vigTarget = v;
  }
  pulseReveal(): void {
    this.reveal = 1;
  }

  render(dt: number, time: number): void {
    const k = 1 - Math.exp(-4 * dt);
    this.corrCur += (this.corrTarget - this.corrCur) * k;
    this.vigCur += (this.vigTarget - this.vigCur) * k;
    this.reveal = Math.max(0, this.reveal - dt * 1.5);
    this.corruption.uniforms.uCorruption.value = this.corrCur;
    this.corruption.uniforms.uVignette.value = this.vigCur;
    this.corruption.uniforms.uReveal.value = this.reveal;
    this.corruption.uniforms.uTime.value = time;
    this.bloom.strength = 0.32 + this.reveal * 0.9;
    this.composer.render();
  }
}
