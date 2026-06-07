import * as THREE from "three";
import { Palette } from "./Palette";
import { pastel } from "./Materials";
import { softBox, inkOutline } from "./Geometry";

/** All props are low-poly primitive assemblies. Each returns a Group at local origin. */

function box(
  w: number,
  h: number,
  d: number,
  color: number,
  outline = false
): THREE.Mesh {
  const geo = softBox(w, h, d);
  const mesh = new THREE.Mesh(geo, pastel(color));
  if (outline) mesh.add(inkOutline(geo));
  return mesh;
}

export function makeSofa(): THREE.Group {
  const g = new THREE.Group();
  const seat = box(1.7, 0.32, 0.8, Palette.sageGreen, true);
  seat.position.y = 0.42;
  const back = box(1.7, 0.6, 0.22, Palette.sageGreen, true);
  back.position.set(0, 0.72, -0.32);
  g.add(seat, back);
  for (const x of [-0.86, 0.86]) {
    const arm = box(0.22, 0.5, 0.8, 0xa7b8a3, true);
    arm.position.set(x, 0.52, 0);
    g.add(arm);
  }
  // cushions
  for (const x of [-0.45, 0.45]) {
    const c = box(0.6, 0.18, 0.6, Palette.dustyRose);
    c.position.set(x, 0.62, 0.02);
    g.add(c);
  }
  for (const x of [-0.7, 0.7]) {
    const leg = box(0.1, 0.26, 0.1, Palette.sandstone);
    leg.position.set(x, 0.13, 0.3);
    g.add(leg);
    const leg2 = leg.clone();
    leg2.position.z = -0.3;
    g.add(leg2);
  }
  return g;
}

export function makeTable(w = 1.1, h = 0.42, d = 0.6): THREE.Group {
  const g = new THREE.Group();
  const top = box(w, 0.08, d, Palette.sandstone, true);
  top.position.y = h;
  g.add(top);
  const lx = w / 2 - 0.08;
  const lz = d / 2 - 0.08;
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const leg = box(0.07, h, 0.07, 0xc9b48f);
      leg.position.set(sx * lx, h / 2, sz * lz);
      g.add(leg);
    }
  // books on top (small accent)
  const b1 = box(0.3, 0.06, 0.22, Palette.dustyRose);
  b1.position.set(-0.2, h + 0.07, 0.05);
  const b2 = box(0.26, 0.05, 0.2, Palette.powderBlue);
  b2.position.set(-0.18, h + 0.13, 0.02);
  b2.rotation.y = 0.2;
  g.add(b1, b2);
  return g;
}

export function makeLamp(): THREE.Group {
  const g = new THREE.Group();
  const baseGeo = new THREE.CylinderGeometry(0.14, 0.16, 0.05, 12);
  const base = new THREE.Mesh(baseGeo, pastel(Palette.sandstone));
  base.position.y = 0.02;
  const stemGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.9, 8);
  const stem = new THREE.Mesh(stemGeo, pastel(0xcbb48f));
  stem.position.y = 0.47;
  const shadeGeo = new THREE.ConeGeometry(0.22, 0.28, 14, 1, true);
  const shade = new THREE.Mesh(shadeGeo, pastel(Palette.dustyRose, { opacity: 0.96 }));
  shade.position.y = 0.95;
  const bulbGeo = new THREE.SphereGeometry(0.06, 10, 8);
  const bulb = new THREE.Mesh(bulbGeo, new THREE.MeshBasicMaterial({ color: 0xfff2d8 }));
  bulb.position.y = 0.92;
  g.add(base, stem, shade, bulb);
  return g;
}

/** Pendant lamp hanging from ceiling (matches screenshot focal point). */
export function makePendantLamp(): THREE.Group {
  const g = new THREE.Group();
  const cordGeo = new THREE.CylinderGeometry(0.012, 0.012, 1.0, 6);
  const cord = new THREE.Mesh(cordGeo, pastel(Palette.ink));
  cord.position.y = -0.5;
  const shadeGeo = new THREE.ConeGeometry(0.26, 0.34, 16, 1, true);
  const shade = new THREE.Mesh(shadeGeo, pastel(Palette.dustyRose));
  shade.position.y = -1.15;
  shade.add(inkOutline(shadeGeo));
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xfff0d0 })
  );
  bulb.position.y = -1.2;
  g.add(cord, shade, bulb);
  return g;
}

export function makePlant(): THREE.Group {
  const g = new THREE.Group();
  const potGeo = new THREE.CylinderGeometry(0.13, 0.1, 0.22, 12);
  const pot = new THREE.Mesh(potGeo, pastel(Palette.dustyRose));
  pot.position.y = 0.11;
  pot.add(inkOutline(potGeo));
  g.add(pot);
  const leafMat = pastel(Palette.sageGreen);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const leafGeo = new THREE.ConeGeometry(0.06, 0.34 + (i % 3) * 0.06, 4);
    const leaf = new THREE.Mesh(leafGeo, leafMat);
    leaf.position.set(Math.cos(a) * 0.05, 0.34, Math.sin(a) * 0.05);
    leaf.rotation.set(Math.cos(a) * 0.5, a, Math.sin(a) * 0.5);
    g.add(leaf);
  }
  return g;
}

export function makeBookshelf(): THREE.Group {
  const g = new THREE.Group();
  const w = 1.0;
  const h = 1.4;
  const d = 0.32;
  // frame
  const frame = box(w, h, d, Palette.sandstone, true);
  frame.position.y = h / 2;
  g.add(frame);
  // shelves cut visually by darker insets + books
  const colors = [Palette.dustyRose, Palette.powderBlue, Palette.sageGreen, Palette.lavenderGray];
  for (let s = 0; s < 3; s++) {
    const y = 0.3 + s * 0.42;
    let x = -w / 2 + 0.12;
    while (x < w / 2 - 0.12) {
      const bw = 0.05 + Math.abs(Math.sin(x * 12 + s)) * 0.04;
      const bh = 0.24 + Math.abs(Math.cos(x * 7 + s)) * 0.08;
      const bookGeo = softBox(bw, bh, 0.2);
      // safe positive modulo — x can be negative, so a bare % would index out of bounds
      const ci = (((Math.floor(x * 10) + s) % colors.length) + colors.length) % colors.length;
      const book = new THREE.Mesh(bookGeo, pastel(colors[ci]));
      book.position.set(x, y + bh / 2, 0.02);
      g.add(book);
      x += bw + 0.012;
    }
  }
  return g;
}

export function makeSideboard(): THREE.Group {
  const g = new THREE.Group();
  const body = box(1.6, 0.7, 0.45, Palette.sandstone, true);
  body.position.y = 0.35;
  g.add(body);
  for (const x of [-0.4, 0.4]) {
    const door = box(0.6, 0.5, 0.02, 0xcdb892);
    door.position.set(x, 0.36, 0.235);
    g.add(door);
    const knob = new THREE.Mesh(
      new THREE.SphereGeometry(0.025, 8, 6),
      pastel(Palette.ink)
    );
    knob.position.set(x + 0.22, 0.36, 0.25);
    g.add(knob);
  }
  return g;
}

export function makePictureFrame(w = 0.4, h = 0.5, image: number = Palette.powderBlue): THREE.Group {
  const g = new THREE.Group();
  const frame = box(w, h, 0.03, Palette.sandstone, true);
  g.add(frame);
  const art = new THREE.Mesh(
    new THREE.PlaneGeometry(w - 0.06, h - 0.06),
    pastel(image)
  );
  art.position.z = 0.018;
  g.add(art);
  // a simple landscape suggestion
  const hill = new THREE.Mesh(
    new THREE.PlaneGeometry(w - 0.06, (h - 0.06) * 0.4),
    pastel(Palette.sageGreen)
  );
  hill.position.set(0, -(h - 0.06) * 0.28, 0.02);
  g.add(hill);
  return g;
}

export function makeChair(): THREE.Group {
  const g = new THREE.Group();
  const seat = box(0.42, 0.06, 0.42, Palette.powderBlue, true);
  seat.position.y = 0.46;
  const back = box(0.42, 0.5, 0.05, Palette.powderBlue, true);
  back.position.set(0, 0.72, -0.18);
  g.add(seat, back);
  const lx = 0.16;
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const leg = box(0.05, 0.46, 0.05, 0xa7bcd0);
      leg.position.set(sx * lx, 0.23, sz * lx);
      g.add(leg);
    }
  return g;
}

export function makeRug(w = 2.4, d = 1.6, color: number = Palette.dustyRose): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(w, d);
  // opaque + lifted slightly (placement sets final y) so it never z-fights the floor
  const mesh = new THREE.Mesh(geo, pastel(color));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.02;
  return mesh;
}

/** Double bed: low frame, mattress, duvet block and two pillows. Headboard at -z. */
export function makeBed(): THREE.Group {
  const g = new THREE.Group();
  const w = 1.6;
  const d = 2.1;
  // frame / base
  const frame = box(w, 0.3, d, Palette.sandstone, true);
  frame.position.y = 0.15;
  g.add(frame);
  // mattress
  const mattress = box(w - 0.08, 0.22, d - 0.08, Palette.warmCream);
  mattress.position.y = 0.41;
  g.add(mattress);
  // duvet covering the lower two-thirds
  const duvet = box(w - 0.04, 0.14, d * 0.62, Palette.powderBlue, true);
  duvet.position.set(0, 0.55, d * 0.16);
  g.add(duvet);
  // headboard at -z
  const headboard = box(w, 0.7, 0.12, Palette.sandstone, true);
  headboard.position.set(0, 0.5, -d / 2 + 0.06);
  g.add(headboard);
  // pillows near headboard
  for (const x of [-0.38, 0.38]) {
    const pillow = box(0.62, 0.14, 0.4, Palette.dustyRose);
    pillow.position.set(x, 0.56, -d / 2 + 0.36);
    g.add(pillow);
  }
  // legs
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const leg = box(0.08, 0.16, 0.08, Palette.ink);
      leg.position.set(sx * (w / 2 - 0.08), 0.08, sz * (d / 2 - 0.08));
      g.add(leg);
    }
  return g;
}

/** Small bedside nightstand with a drawer and a tiny knob. */
export function makeNightstand(): THREE.Group {
  const g = new THREE.Group();
  const w = 0.5;
  const h = 0.55;
  const d = 0.45;
  const body = box(w, h, d, Palette.sandstone, true);
  body.position.y = h / 2;
  g.add(body);
  // drawer face
  const drawer = box(w - 0.08, 0.18, 0.02, 0xcdb892);
  drawer.position.set(0, h - 0.16, d / 2 + 0.005);
  g.add(drawer);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), pastel(Palette.ink));
  knob.position.set(0, h - 0.16, d / 2 + 0.03);
  g.add(knob);
  // legs
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const leg = box(0.05, 0.16, 0.05, Palette.ink);
      leg.position.set(sx * (w / 2 - 0.05), 0.08, sz * (d / 2 - 0.05));
      g.add(leg);
    }
  return g;
}

/** Kitchen counter run: cabinet base, countertop, splashback, sink basin and faucet. */
export function makeKitchenCounter(w = 2.0): THREE.Group {
  const g = new THREE.Group();
  const h = 0.9;
  const d = 0.6;
  // cabinet base
  const base = box(w, h - 0.06, d, Palette.warmCream, true);
  base.position.y = (h - 0.06) / 2;
  g.add(base);
  // countertop
  const top = box(w + 0.06, 0.08, d + 0.04, Palette.lavenderGray, true);
  top.position.y = h;
  g.add(top);
  // splashback at -z
  const splash = box(w + 0.06, 0.4, 0.04, Palette.powderBlue);
  splash.position.set(0, h + 0.24, -d / 2 - 0.02);
  g.add(splash);
  // cabinet doors split across the run
  const doorCount = Math.max(2, Math.round(w / 0.6));
  const dw = (w - 0.1) / doorCount;
  for (let i = 0; i < doorCount; i++) {
    const x = -w / 2 + 0.05 + dw / 2 + i * dw;
    const door = box(dw - 0.04, h - 0.2, 0.02, 0xe2d4ba);
    door.position.set(x, (h - 0.06) / 2, d / 2 + 0.005);
    g.add(door);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), pastel(Palette.ink));
    knob.position.set(x + dw / 2 - 0.06, (h - 0.06) / 2 + 0.18, d / 2 + 0.03);
    g.add(knob);
  }
  // sunken sink basin
  const sink = box(0.5, 0.1, 0.4, Palette.shadow);
  sink.position.set(w / 2 - 0.4, h - 0.02, 0.02);
  g.add(sink);
  // faucet
  const spout = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.018, 0.26, 8),
    pastel(Palette.ink)
  );
  spout.position.set(w / 2 - 0.4, h + 0.13, -0.14);
  g.add(spout);
  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.018, 0.14, 8),
    pastel(Palette.ink)
  );
  neck.rotation.z = Math.PI / 2;
  neck.position.set(w / 2 - 0.4, h + 0.25, -0.08);
  g.add(neck);
  return g;
}

/** Low TV unit / media console with a screen panel and two shelf compartments. */
export function makeTvUnit(): THREE.Group {
  const g = new THREE.Group();
  const w = 1.6;
  const h = 0.5;
  const d = 0.4;
  // body
  const body = box(w, h, d, Palette.sandstone, true);
  body.position.y = h / 2;
  g.add(body);
  // two open shelf compartments (darker insets)
  for (const x of [-0.4, 0.4]) {
    const inset = box(0.6, 0.28, 0.02, Palette.shadow);
    inset.position.set(x, h / 2, d / 2 + 0.005);
    g.add(inset);
  }
  // screen standing on top
  const screen = box(1.1, 0.66, 0.06, Palette.ink, true);
  screen.position.set(0, h + 0.4, -0.04);
  g.add(screen);
  // glowing display face
  const display = new THREE.Mesh(
    new THREE.PlaneGeometry(1.0, 0.56),
    new THREE.MeshBasicMaterial({ color: 0xbfe0f0 })
  );
  display.position.set(0, h + 0.4, -0.005);
  g.add(display);
  // stand foot
  const foot = box(0.3, 0.06, 0.16, Palette.ink);
  foot.position.set(0, h + 0.04, -0.04);
  g.add(foot);
  return g;
}
