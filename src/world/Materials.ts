import * as THREE from "three";

/** Cached 3-step toon gradient → soft, banded pastel shading. */
let gradientMap: THREE.DataTexture | null = null;
function toonGradient(): THREE.DataTexture {
  if (gradientMap) return gradientMap;
  const steps = new Uint8Array([150, 205, 245, 255]);
  gradientMap = new THREE.DataTexture(steps, steps.length, 1, THREE.RedFormat);
  gradientMap.needsUpdate = true;
  gradientMap.magFilter = THREE.NearestFilter;
  gradientMap.minFilter = THREE.NearestFilter;
  return gradientMap;
}

/** Standard pastel surface material (soft toon banding). */
export function pastel(color: number, opts: { opacity?: number } = {}): THREE.Material {
  const m = new THREE.MeshToonMaterial({
    color,
    gradientMap: toonGradient()
  });
  if (opts.opacity !== undefined && opts.opacity < 1) {
    m.transparent = true;
    m.opacity = opts.opacity;
  }
  return m;
}

/**
 * Spectral ribbon material — translucent, flowing, with gentle vertex sway.
 * Uniforms: uTime (flow), uVisibility (0..1 fade by world state), uColor.
 */
export function spectralRibbon(color: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
    uniforms: {
      uTime: { value: 0 },
      uVisibility: { value: 0 },
      uColor: { value: new THREE.Color(color) }
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;
      varying float vFlow;
      void main() {
        vUv = uv;
        vec3 p = position;
        // gentle lateral sway travelling along the ribbon length (uv.y)
        float w = sin(uv.y * 8.0 + uTime * 1.4) * 0.04;
        p += normal * w;
        vFlow = fract(uv.y * 2.0 - uTime * 0.25);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uVisibility;
      varying vec2 vUv;
      varying float vFlow;
      void main() {
        // soft edges across the ribbon width (uv.x)
        float edge = smoothstep(0.0, 0.35, vUv.x) * smoothstep(1.0, 0.65, vUv.x);
        // travelling brightness bands
        float band = 0.55 + 0.45 * sin(vFlow * 6.2831);
        float a = edge * uVisibility * (0.35 + 0.35 * band);
        if (a < 0.01) discard;
        gl_FragColor = vec4(uColor * (0.85 + 0.25 * band), a);
      }
    `
  });
}

/** Translucent pastel material for spectral nodes / ghosted geometry. */
export function spectralGhost(color: number, opacity = 0.5): THREE.Material {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.NormalBlending
  });
}

/** Wireframe overlay material for low-poly spectral crystals. */
export function spectralWire(color: number, opacity = 0.6): THREE.Material {
  return new THREE.MeshBasicMaterial({
    color,
    wireframe: true,
    transparent: true,
    opacity,
    depthWrite: false
  });
}
