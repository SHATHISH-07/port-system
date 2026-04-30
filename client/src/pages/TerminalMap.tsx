import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Box,
  Typography,
  Divider,
  Button,
  TextField,
  InputAdornment,
} from "@mui/material";
import { WarningAmberRounded, SearchRounded } from "@mui/icons-material";
import * as THREE from "three";

// Use your actual API wrapper
import { api } from "../api/api";

// ─── Scale & Coordinate System ────────────────────────────────────────────────
// SVG canvas: 0-960 x 120-700. Centre ≈ (480, 410).
const S = 0.028;
const OX = 480;
const OY = 410;

function to3D(svgX: number, svgY: number): THREE.Vector3 {
  return new THREE.Vector3((svgX - OX) * S, 0, (svgY - OY) * S);
}

// Block grid constants (SVG space)
const BLK_W = 160;
const BLK_H = 120;
const BLK_GAP_X = 40;
const BLK_GAP_Y = 40;
const BLK_START_X = 80;
const BLK_START_Y = 190;

// Ship dimensions (world units)
const SHIP_LEN = 280 * S;  // ≈ 7.84
const SHIP_WID = 60 * S;   // ≈ 1.68
const SHIP_DRAFT = 0.55;

// ─── Berth definitions ────────────────────────────────────────────────────────
// Adjusted coordinates for balanced, realistic gaps between all ships
const BERTHS = [
  { id: "T1", x: 300, y: 35, rot: 0, defaultShip: { name: "MSC OSCAR" } },
  { id: "T2", x: 660, y: 35, rot: 0, defaultShip: { name: "EVER GIVEN" } },
  { id: "B1", x: 300, y: 785, rot: 0, defaultShip: { name: "CMA CGM POLO" } },
  { id: "B2", x: 660, y: 785, rot: 0, defaultShip: { name: "HAPAG-LLOYD" } },
  { id: "R1", x: 1035, y: 260, rot: 90, defaultShip: { name: "OOCL HK" } },
  { id: "R2", x: 1035, y: 600, rot: 90, defaultShip: { name: "MAERSK MCK" } },
];

// Container colour palettes (Brightened for high visibility)
const CONTAINER_PALETTES = {
  target: [0x0ea5e9, 0x0284c7, 0x38bdf8, 0x0369a1, 0x7dd3fc],
  default: [0x1e3a5f, 0x243b55, 0x162032, 0x1a2f4a, 0x0f1f30],
  high: [0x991b1b, 0xb91c1c, 0xdc2626, 0x7f1d1d, 0xf87171],
  medium: [0x92400e, 0xb45309, 0xd97706, 0x78350f, 0xf59e0b],
  low: [0x065f46, 0x047857, 0x059669, 0x064e3b, 0x10b981],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function makeLabel(text: string, fontSize: number, color: string): THREE.Mesh {
  const W = 512, H = 128;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = color;
  ctx.font = `bold ${fontSize}px 'Roboto Mono', monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, W / 2, H / 2);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const h = fontSize * 0.007;
  return new THREE.Mesh(new THREE.PlaneGeometry(h * (W / H), h), mat);
}

// Emulates highly intense weather-radar glowing blobs
function makeHeatBlob(
  colorHex: string,
  rx: number,
  rz: number,
  peakOpacity: number,
  innerRatio = 1.0
): THREE.Mesh {
  const RES = 256;
  const c = document.createElement("canvas");
  c.width = RES; c.height = RES;
  const ctx = c.getContext("2d")!;
  const cx = RES / 2, r = RES / 2;

  const g = ctx.createRadialGradient(cx, cx, 0, cx, cx, r * innerRatio);
  g.addColorStop(0.00, `${colorHex}ff`);
  g.addColorStop(0.25, `${colorHex}ff`);
  g.addColorStop(0.50, `${colorHex}cc`);
  g.addColorStop(0.70, `${colorHex}77`);
  g.addColorStop(0.85, `${colorHex}22`);
  g.addColorStop(1.00, `${colorHex}00`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, RES, RES);

  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    opacity: peakOpacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(rx * 2, rz * 2), mat);
  plane.rotation.x = -Math.PI / 2;
  return plane;
}

// ─── Scene ────────────────────────────────────────────────────────────────────
class TerminalScene {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  animId = 0;

  blockMeshes: Map<string, THREE.Group> = new Map();
  heatBlobs: { mesh: THREE.Mesh; baseOp: number }[] = [];
  shipMeshes: Map<string, THREE.Group> = new Map();
  waterMesh!: THREE.Mesh;
  particleSystems: THREE.Points[] = [];

  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2(-9999, -9999);
  hoveredId: string | null = null;
  onHover?: (id: string | null) => void;

  private isDragging = false;
  private isRightDrag = false;
  private lastMouse = { x: 0, y: 0 };
  private theta = 0.55;
  private phi = 1.02;
  private radius = 36;
  private target = new THREE.Vector3(2, 0, 0);
  private clock = new THREE.Clock();

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x060c14, 1);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x060c14, 0.010);

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
    this.updateCamera();

    this.buildLights();
    this.buildWater();
    this.buildTerminal();
    this.buildDocks();
    this.buildSTSCranes();
    this.buildDefaultShips();
    this.addEvents(canvas);
    this.animate();
  }

  updateCamera() {
    const x = this.radius * Math.sin(this.phi) * Math.sin(this.theta);
    const y = this.radius * Math.cos(this.phi);
    const z = this.radius * Math.sin(this.phi) * Math.cos(this.theta);
    this.camera.position.set(this.target.x + x, this.target.y + y, this.target.z + z);
    this.camera.lookAt(this.target);
  }

  resize(w: number, h: number) {
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  buildLights() {
    this.scene.add(new THREE.HemisphereLight(0xaaccff, 0x060c14, 0.6));

    const sun = new THREE.DirectionalLight(0xfff0e0, 2.0);
    sun.position.set(18, 38, -18);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    const d = 26;
    sun.shadow.camera.left = -d; sun.shadow.camera.right = d;
    sun.shadow.camera.top = d; sun.shadow.camera.bottom = -d;
    sun.shadow.camera.near = 0.5; sun.shadow.camera.far = 120;
    sun.shadow.bias = -0.0004;
    this.scene.add(sun);

    const fill = new THREE.DirectionalLight(0x6699cc, 0.45);
    fill.position.set(-14, 10, 20);
    this.scene.add(fill);

    [[-8, 1, -6], [0, 1, -6], [8, 1, -6],
    [-8, 1, 6], [0, 1, 6], [8, 1, 6]].forEach(([x, y, z]) => {
      const pt = new THREE.PointLight(0x336699, 0.3, 12);
      pt.position.set(x, y, z);
      this.scene.add(pt);
    });
  }

  buildWater() {
    const geo = new THREE.PlaneGeometry(250, 250, 160, 160);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x05101e, roughness: 0.05, metalness: 0.9,
      flatShading: true, transparent: true, opacity: 0.92,
    });
    this.waterMesh = new THREE.Mesh(geo, mat);
    this.waterMesh.rotation.x = -Math.PI / 2;
    this.waterMesh.position.y = -0.35;
    this.waterMesh.receiveShadow = true;
    this.scene.add(this.waterMesh);
  }

  buildTerminal() {
    const w = 960 * S;  // ≈ 26.9
    const d = 580 * S;  // ≈ 16.2
    const c = to3D(480, 410);

    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(w, 2.2, d),
      new THREE.MeshStandardMaterial({ color: 0x141820, roughness: 0.95 })
    );
    slab.position.set(c.x, -1.1, c.z);
    slab.receiveShadow = true;
    this.scene.add(slab);

    const surf = new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.04, d),
      new THREE.MeshStandardMaterial({ color: 0x0d1018, roughness: 0.88 })
    );
    surf.position.set(c.x, 0.02, c.z);
    surf.receiveShadow = true;
    this.scene.add(surf);

    const yMat = new THREE.MeshBasicMaterial({ color: 0xd4a200 });

    const addHLine = (svgY: number) => {
      const p = to3D(480, svgY);
      const m = new THREE.Mesh(new THREE.BoxGeometry(w - 0.2, 0.015, 0.06), yMat);
      m.position.set(c.x, 0.045, p.z);
      this.scene.add(m);
    };
    addHLine(125); addHLine(695);

    const addVLine = (svgX: number) => {
      const p = to3D(svgX, 410);
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.015, d - 0.2), yMat);
      m.position.set(p.x, 0.045, c.z);
      this.scene.add(m);
    };
    addVLine(955);

    const dashMat = new THREE.MeshBasicMaterial({ color: 0x2a3a4a });
    [290, 490, 690].forEach(svgY => {
      const p = to3D(480, svgY);
      for (let x = 80; x < 940; x += 35) {
        const seg = to3D(x, svgY);
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.55 * S * 50, 0.012, 0.04), dashMat);
        m.position.set(seg.x + 0.4, 0.044, p.z);
        this.scene.add(m);
      }
    });

    const grid = new THREE.GridHelper(w, 28, 0x161c26, 0x161c26);
    grid.position.set(c.x, 0.04, c.z);
    this.scene.add(grid);
  }

  buildDocks() {
    const qMat = new THREE.MeshStandardMaterial({ color: 0x1a2230, roughness: 0.8 });
    const w = 960 * S; const d = 580 * S; const c = to3D(480, 410);

    const nw = new THREE.Mesh(new THREE.BoxGeometry(w + 1.2, 0.5, 1.0), qMat);
    nw.position.set(c.x, 0.15, to3D(480, 120).z - 0.5);
    nw.castShadow = true; nw.receiveShadow = true;
    this.scene.add(nw);

    const sw = nw.clone();
    sw.position.set(c.x, 0.15, to3D(480, 700).z + 0.5);
    this.scene.add(sw);

    const ew = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.5, d + 1.2), qMat);
    ew.position.set(to3D(960, 410).x + 0.5, 0.15, c.z);
    ew.castShadow = true; ew.receiveShadow = true;
    this.scene.add(ew);

    const bGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.5, 8);
    const bMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.4, metalness: 0.6 });
    const northZ = to3D(480, 120).z - 0.9;
    const southZ = to3D(480, 700).z + 0.9;
    const eastX = to3D(960, 410).x + 0.9;

    [-8, -5, -2, 1, 4, 7].forEach(x => {
      [northZ, southZ].forEach(z => {
        const b = new THREE.Mesh(bGeo, bMat);
        b.position.set(x, 0.4, z); b.castShadow = true;
        this.scene.add(b);
      });
    });
    [-5, -2, 1, 4].forEach(z => {
      const b = new THREE.Mesh(bGeo, bMat);
      b.position.set(eastX, 0.4, z); b.castShadow = true;
      this.scene.add(b);
    });
  }

  buildSTSCrane(svgX: number, svgY: number, rotDeg: number) {
    const pos = to3D(svgX, svgY);
    const g = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial({ color: 0x3a4a5a, roughness: 0.7 });
    const boomMt = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.3, metalness: 0.5 });
    const cabMt = new THREE.MeshStandardMaterial({ color: 0xf0f0f5, roughness: 0.5 });

    [-0.38, 0.24].forEach(dx => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.2, 0.18), steel);
      leg.position.set(dx, 1.1, 0); leg.castShadow = true; g.add(leg);
    });
    const xb = new THREE.Mesh(new THREE.BoxGeometry(0.80, 0.12, 0.18), steel);
    xb.position.set(-0.07, 0.6, 0); g.add(xb);

    const mast = new THREE.Mesh(new THREE.BoxGeometry(0.12, 4.0, 0.12), boomMt);
    mast.position.set(-0.07, 3.1, 0); mast.castShadow = true; g.add(mast);

    const jibL = 6.2;
    const jib = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, jibL), boomMt);
    jib.position.set(-0.07, 4.4, -jibL / 2 + 0.5); jib.castShadow = true; g.add(jib);

    const bs = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 2.2), boomMt);
    bs.position.set(-0.07, 4.4, 1.8); g.add(bs);

    const cab = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.32, 0.45), cabMt);
    cab.position.set(-0.07, 4.1, -0.65); g.add(cab);

    const win = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 0.14, 0.06),
      new THREE.MeshStandardMaterial({ color: 0x0ea5e9, roughness: 0.05, metalness: 0.9 })
    );
    win.position.set(-0.07, 4.12, -0.89); g.add(win);

    g.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-0.07, 4.3, -0.65),
        new THREE.Vector3(-0.07, 1.8, -2.4),
      ]),
      new THREE.LineBasicMaterial({ color: 0x778899 })
    ));

    const sp = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.06, 0.14), steel);
    sp.position.set(-0.07, 1.8, -2.4); g.add(sp);

    g.position.set(pos.x, 0, pos.z);
    g.rotation.y = THREE.MathUtils.degToRad(-rotDeg);
    this.scene.add(g);
  }

  buildSTSCranes() {
    // Aligned precisely with the new realistic gaps for T1/T2 and B1/B2
    [240, 360, 600, 720].forEach(cx => this.buildSTSCrane(cx, 120, 0));
    [240, 360, 600, 720].forEach(cx => this.buildSTSCrane(cx, 700, 180));

    // Aligned with the R1/R2 gap
    [200, 320, 540, 660].forEach(cy => this.buildSTSCrane(960, cy, -90));
  }

  buildShip(
    id: string, svgX: number, svgY: number, rotDeg: number,
    name: string, isTarget: boolean,
    containerData?: { count: number; concentration: string }
  ) {
    const g = new THREE.Group();
    const pos = to3D(svgX, svgY);
    const L = SHIP_LEN, W = SHIP_WID, DR = SHIP_DRAFT;

    const hullColor = isTarget ? 0x0f2a45 : 0x0d1520;
    const hullMat = new THREE.MeshStandardMaterial({
      color: hullColor, roughness: 0.65, metalness: 0.35,
      emissive: isTarget ? 0x0284c7 : 0x000000,
      emissiveIntensity: isTarget ? 0.18 : 0,
    });

    const hull = new THREE.Mesh(new THREE.BoxGeometry(L, DR, W), hullMat);
    hull.position.y = 0; hull.castShadow = true; g.add(hull);

    const bV = new Float32Array([
      L / 2, DR / 2, -W / 2, L / 2, DR / 2, W / 2, L / 2 + 0.9, DR / 2, 0,
      L / 2, -DR / 2, -W / 2, L / 2, -DR / 2, W / 2, L / 2 + 0.9, -DR / 2, 0,
    ]);
    const bGeo = new THREE.BufferGeometry();
    bGeo.setAttribute("position", new THREE.BufferAttribute(bV, 3));
    bGeo.setIndex([0, 1, 2, 3, 4, 5, 0, 3, 4, 0, 4, 1, 1, 4, 5, 1, 5, 2, 0, 2, 5, 0, 5, 3]);
    bGeo.computeVertexNormals();
    const bow = new THREE.Mesh(bGeo, hullMat);
    bow.castShadow = true; g.add(bow);

    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(L + 0.9, 0.06, W + 0.02),
      new THREE.MeshStandardMaterial({ color: isTarget ? 0x1c4f80 : 0x1a2840, roughness: 0.9 })
    );
    stripe.position.y = DR / 2 - 0.05; g.add(stripe);

    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(L * 0.94, 0.05, W * 0.88),
      new THREE.MeshStandardMaterial({ color: isTarget ? 0x1a3d5c : 0x0e1824, roughness: 0.9 })
    );
    deck.position.y = DR / 2 + 0.025; g.add(deck);

    let palette: number[];
    if (isTarget && containerData) {
      const conc = containerData.concentration;
      palette = conc === "High" ? CONTAINER_PALETTES.high
        : conc === "Medium" ? CONTAINER_PALETTES.medium
          : conc === "Low" ? CONTAINER_PALETTES.low
            : CONTAINER_PALETTES.target;
    } else if (isTarget) {
      palette = CONTAINER_PALETTES.target;
    } else {
      palette = CONTAINER_PALETTES.default;
    }

    const COLS = 13, ROWS = 3;
    const cW = (L * 0.72) / COLS;
    const cD = (W * 0.80) / ROWS;

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const stackH = 0.14 + (Math.sin((c / COLS) * Math.PI) * 0.20) + Math.random() * 0.08;
        const cm = new THREE.Mesh(
          new THREE.BoxGeometry(cW * 0.88, stackH, cD * 0.88),
          new THREE.MeshStandardMaterial({
            color: palette[(r * COLS + c) % palette.length],
            roughness: 0.80,
          })
        );
        cm.position.set(
          -L * 0.34 + c * cW + cW / 2,
          DR / 2 + stackH / 2 + 0.02,
          -W * 0.38 + r * cD + cD / 2
        );
        cm.castShadow = true; g.add(cm);
      }
    }

    const bridgeMat = new THREE.MeshStandardMaterial({ color: 0xf0f4f8, roughness: 0.55 });
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.9, W * 0.78), bridgeMat);
    bridge.position.set(-L * 0.38, DR / 2 + 0.45, 0);
    bridge.castShadow = true; g.add(bridge);

    [-1, 1].forEach(side => {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.35), bridgeMat);
      wing.position.set(-L * 0.38, DR / 2 + 0.82, side * (W * 0.39 + 0.18));
      g.add(wing);
    });

    const navWin = new THREE.Mesh(
      new THREE.BoxGeometry(0.77, 0.18, W * 0.72),
      new THREE.MeshStandardMaterial({
        color: isTarget ? 0x38bdf8 : 0x0ea5e9,
        roughness: 0.05, metalness: 0.85,
        emissive: isTarget ? 0x0ea5e9 : 0x0369a1,
        emissiveIntensity: 0.4,
      })
    );
    navWin.position.set(-L * 0.38, DR / 2 + 0.68, 0);
    g.add(navWin);

    const topDeck = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.08, W * 0.65),
      new THREE.MeshStandardMaterial({ color: 0xdde4ec, roughness: 0.6 })
    );
    topDeck.position.set(-L * 0.38, DR / 2 + 0.94, 0);
    g.add(topDeck);

    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 1.1, 6),
      new THREE.MeshStandardMaterial({ color: 0x99aabb, roughness: 0.5, metalness: 0.6 })
    );
    mast.position.set(-L * 0.38, DR / 2 + 1.55, 0);
    mast.castShadow = true; g.add(mast);

    const radar = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 6, 4),
      new THREE.MeshStandardMaterial({ color: 0xccddee, roughness: 0.3, metalness: 0.7 })
    );
    radar.position.set(-L * 0.38, DR / 2 + 2.15, 0);
    g.add(radar);

    const funnel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.16, 0.55, 8),
      new THREE.MeshStandardMaterial({
        color: isTarget ? 0xc0392b : 0x8b1a1a,
        roughness: 0.6,
      })
    );
    funnel.position.set(-L * 0.36, DR / 2 + 1.2, 0);
    funnel.castShadow = true; g.add(funnel);

    const lineMat = new THREE.LineBasicMaterial({ color: 0x4a6a8a, transparent: true, opacity: 0.6 });
    [-L * 0.3, 0, L * 0.3].forEach(lx => {
      const side = rotDeg === 90 ? -1 : 1;
      const pts = [new THREE.Vector3(lx, DR / 2, W / 2 * side), new THREE.Vector3(lx, -0.2, W / 2 * side + 1.6 * side)];
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat));
    });

    if (isTarget) {
      const ringR = Math.max(L, W) * 0.62;
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(ringR, ringR + 0.12, 72),
        new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.7, side: THREE.DoubleSide })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = -0.18;
      g.add(ring);

      const ring2 = new THREE.Mesh(
        new THREE.RingGeometry(ringR * 0.55, ringR * 0.55 + 0.07, 64),
        new THREE.MeshBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
      );
      ring2.rotation.x = -Math.PI / 2;
      ring2.position.y = -0.18;
      g.add(ring2);
    }

    const label = makeLabel(name.toUpperCase(), 30, isTarget ? "#38bdf8" : "#4a6a8a");
    label.position.set(0, DR / 2 + 2.4, 0);
    label.rotation.x = -Math.PI / 7;
    g.add(label);

    g.position.set(pos.x, 0, pos.z);
    g.rotation.y = THREE.MathUtils.degToRad(-rotDeg);
    g.userData = { type: "ship", id, bobOffset: Math.random() * Math.PI * 2 };

    this.scene.add(g);
    this.shipMeshes.set(id, g);
  }

  buildDefaultShips() {
    BERTHS.forEach(b => this.buildShip(b.id, b.x, b.y, b.rot, b.defaultShip.name, false));
  }

  // ENCAPSULATED DATA PROCESSING TO PREVENT REACT RENDER BUGS
  applyData(
    data: any,
    computedMaxBlock: string | null,
    targetBerthId: string,
    maxBlockData?: { count: number; concentration: string }
  ) {
    if (!data || !data.layout) return;

    // 1. Build Blocks & Heatmaps
    this.blockMeshes.forEach(g => this.scene.remove(g)); this.blockMeshes.clear();
    this.heatBlobs.forEach(({ mesh }) => this.scene.remove(mesh)); this.heatBlobs = [];
    this.particleSystems.forEach(p => this.scene.remove(p)); this.particleSystems = [];

    const recRaw = data.recommended_berth || "";

    const heatGroups: { cx: number; cz: number; bw: number; bd: number; conc: string; isMax: boolean }[] = [];

    // ── CONTAINER MAPPING (Physical Blocks) ──
    Object.entries(data.layout).forEach(([id, pos]: [string, any]) => {
      const svgX = BLK_START_X + pos.x * (BLK_W + BLK_GAP_X);
      const svgY = BLK_START_Y + pos.y * (BLK_H + BLK_GAP_Y);
      const wp = to3D(svgX + BLK_W / 2, svgY + BLK_H / 2);

      const blk = (data.blocks || {})[id];
      const isMax = id === computedMaxBlock;
      // Handle recommended berth string properly (e.g., "PEB-G2" includes "G2")
      const isRec = typeof recRaw === 'string' ? recRaw.includes(id) : Array.isArray(recRaw) ? recRaw.includes(id) : false;

      const hasData = !!blk && blk.count > 0;
      const conc = blk?.concentration ?? "none";

      const bw = BLK_W * S;
      const bd = BLK_H * S;
      const g = new THREE.Group();

      const padColor = isMax ? 0x3d0a0a : isRec ? 0x062840 : hasData ? 0x111825 : 0x0c1018;
      const pad = new THREE.Mesh(
        new THREE.BoxGeometry(bw, 0.12, bd),
        new THREE.MeshStandardMaterial({ color: padColor, roughness: 0.92 })
      );
      pad.position.y = 0.06; pad.castShadow = true; pad.receiveShadow = true;
      g.add(pad);

      const topSurf = new THREE.Mesh(
        new THREE.BoxGeometry(bw * 0.97, 0.02, bd * 0.97),
        new THREE.MeshStandardMaterial({ color: isMax ? 0x4a1010 : 0x141e2a, roughness: 0.88 })
      );
      topSurf.position.y = 0.13; g.add(topSurf);

      const edgeOp = isMax ? 1.0 : conc === "High" ? 0.9 : conc === "Medium" ? 0.65 : conc === "Low" ? 0.40 : 0.18;
      const edgeCol = isMax ? 0xef4444 : isRec ? 0x38bdf8 : conc === "High" ? 0xff5500 : conc === "Medium" ? 0xffaa00 : conc === "Low" ? 0x00cc55 : 0x2a3a4a;
      const edgeLn = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(bw, 0.12, bd)),
        new THREE.LineBasicMaterial({ color: edgeCol, transparent: true, opacity: edgeOp })
      );
      edgeLn.position.y = 0.06; g.add(edgeLn);

      // Generating the 3D containers mapping
      if (hasData) {
        heatGroups.push({ cx: wp.x, cz: wp.z, bw, bd, conc, isMax });

        const count = Math.min(blk.count, 60); // Max rendered cubes to prevent lag
        const COLS = 7;
        const palette = isMax ? CONTAINER_PALETTES.high
          : conc === "High" ? CONTAINER_PALETTES.medium
            : conc === "Medium" ? CONTAINER_PALETTES.low
              : CONTAINER_PALETTES.default;

        const cubeSize = bw * 0.11;
        const dummy = new THREE.Object3D();
        const iMesh = new THREE.InstancedMesh(
          new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize),
          new THREE.MeshStandardMaterial({ roughness: 0.8 }),
          count
        );
        iMesh.castShadow = true;

        for (let i = 0; i < count; i++) {
          const tier = Math.floor(i / (COLS * 5)); // Basic tier stacking
          const indexInTier = i % (COLS * 5);
          const row = Math.floor(indexInTier / COLS);
          const col = indexInTier % COLS;

          dummy.position.set(
            -bw * 0.36 + col * cubeSize * 1.15,
            0.14 + (tier * cubeSize) + cubeSize / 2,
            -bd * 0.30 + row * cubeSize * 1.15
          );
          dummy.updateMatrix();
          iMesh.setMatrixAt(i, dummy.matrix);
          iMesh.setColorAt(i, new THREE.Color(palette[i % palette.length]));
        }
        iMesh.instanceMatrix.needsUpdate = true;
        g.add(iMesh);
      }

      const badge = makeLabel(id, 26, isMax ? "#ff8888" : isRec ? "#7dd3fc" : "#334c66");
      badge.rotation.x = -Math.PI / 2;
      badge.position.set(-bw * 0.32, 0.20, -bd * 0.34);
      g.add(badge);

      if (hasData) {
        const cntLabel = makeLabel(`${blk.count}`, 24, "#ffffff");
        cntLabel.rotation.x = -Math.PI / 2;
        cntLabel.position.set(bw * 0.30, 0.20, -bd * 0.34);
        g.add(cntLabel);
      }

      g.position.set(wp.x, 0, wp.z);
      g.userData = { type: "block", id, count: blk?.count ?? 0, concentration: conc };
      this.scene.add(g);
      this.blockMeshes.set(id, g);
    });

    // ── GLOWING HEATMAP (Rendered over the blocks) ──
    const order = (c: string, isMax: boolean) => isMax ? 4 : c === "High" ? 3 : c === "Medium" ? 2 : 1;
    heatGroups.sort((a, b) => order(a.conc, a.isMax) - order(b.conc, b.isMax));

    heatGroups.forEach(({ cx, cz, bw, bd, conc, isMax }) => {
      const col = isMax ? "#ff0000" : conc === "High" ? "#ff4400" : conc === "Medium" ? "#ffaa00" : "#00dd66";
      const spread = isMax ? 2.8 : conc === "High" ? 2.2 : conc === "Medium" ? 1.7 : 1.30;
      const peakOp = isMax ? 1.0 : conc === "High" ? 0.8 : conc === "Medium" ? 0.6 : 0.4;

      const addBlob = (rx: number, rz: number, op: number, yPos: number, inner = 1.0) => {
        const blob = makeHeatBlob(col, rx, rz, op, inner);
        blob.position.set(cx, yPos, cz);
        blob.userData.baseOpacity = op;
        this.scene.add(blob);
        this.heatBlobs.push({ mesh: blob, baseOp: op });
      };

      addBlob(bw * spread, bd * spread, peakOp * 0.50, 0.06);
      addBlob(bw * spread * 0.70, bd * spread * 0.70, peakOp * 0.85, 0.22);
      addBlob(bw * spread * 0.40, bd * spread * 0.40, peakOp * 1.00, 0.40, 0.7);

      if (isMax) {
        addBlob(bw * spread * 0.2, bd * spread * 0.2, 1.0, 0.45, 1.0);
      }

      const pillarH = isMax ? 3.2 : conc === "High" ? 2.2 : conc === "Medium" ? 1.4 : 0.6;
      for (let a = 0; a < Math.PI; a += Math.PI / 3) {
        const plume = makeHeatBlob(col, bw * 0.90, pillarH, peakOp * 0.35);
        plume.rotation.x = 0;
        plume.rotation.y = a;
        plume.position.set(cx, pillarH / 2, cz);
        plume.userData.baseOpacity = peakOp * 0.35;
        this.scene.add(plume);
        this.heatBlobs.push({ mesh: plume, baseOp: peakOp * 0.35 });
      }

      addBlob(bw * spread * 0.50, bd * spread * 0.50, peakOp * 0.40, pillarH + 0.22);

      if (isMax || conc === "High" || conc === "Medium") {
        const pCount = isMax ? 120 : conc === "High" ? 70 : 35;
        const maxH = isMax ? 4.2 : conc === "High" ? 2.8 : 1.6;
        const posArr = new Float32Array(pCount * 3);
        for (let i = 0; i < pCount; i++) {
          posArr[i * 3] = cx + (Math.random() - 0.5) * bw * 2.0;
          posArr[i * 3 + 1] = Math.random() * maxH;
          posArr[i * 3 + 2] = cz + (Math.random() - 0.5) * bd * 2.0;
        }
        const pts = new THREE.Points(
          (() => { const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(posArr, 3)); return g; })(),
          new THREE.PointsMaterial({
            color: new THREE.Color(col), size: 0.1, transparent: true, opacity: 1.0,
            sizeAttenuation: true, depthWrite: false, blending: THREE.AdditiveBlending,
          })
        );
        pts.userData = { maxH, cx, cz, bw, bd };
        this.scene.add(pts);
        this.particleSystems.push(pts);
      }
    });

    // 2. Build Ships
    BERTHS.forEach(b => {
      const g = this.shipMeshes.get(b.id);
      if (g) { this.scene.remove(g); this.shipMeshes.delete(b.id); }
    });
    BERTHS.forEach(b => {
      const isTarget = b.id === targetBerthId;
      this.buildShip(
        b.id, b.x, b.y, b.rot,
        isTarget ? data.vessel : b.defaultShip.name,
        isTarget,
        isTarget ? maxBlockData : undefined
      );
    });
  }

  checkHover() {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const meshes: THREE.Object3D[] = [];
    this.blockMeshes.forEach(g =>
      meshes.push(...g.children.filter(c => c instanceof THREE.Mesh || c instanceof THREE.InstancedMesh))
    );
    const hits = this.raycaster.intersectObjects(meshes, false);
    let newId: string | null = null;
    if (hits.length > 0) {
      let cur: THREE.Object3D | null = hits[0].object;
      while (cur) {
        if (cur.userData?.type === "block") { newId = cur.userData.id; break; }
        cur = cur.parent;
      }
    }
    if (newId !== this.hoveredId) { this.hoveredId = newId; this.onHover?.(newId); }
  }

  animate() {
    this.animId = requestAnimationFrame(() => this.animate());
    const t = this.clock.getElapsedTime();

    if (this.waterMesh) {
      const pos = this.waterMesh.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const u = pos.getX(i), v = pos.getY(i);
        pos.setZ(i,
          Math.sin(u * 1.2 + t * 1.8) * 0.06 +
          Math.cos(v * 1.4 + t * 1.1) * 0.04
        );
      }
      pos.needsUpdate = true;
      this.waterMesh.geometry.computeVertexNormals();
    }

    this.shipMeshes.forEach(g => {
      const off = g.userData.bobOffset || 0;
      g.position.y = Math.sin(t * 1.4 + off) * 0.065;
      g.rotation.x = Math.sin(t * 0.9 + off) * 0.008;
      g.rotation.z = Math.cos(t * 1.1 + off) * 0.007;
      g.children.forEach(c => {
        if (c instanceof THREE.Mesh && c.geometry instanceof THREE.RingGeometry) {
          (c.material as THREE.MeshBasicMaterial).opacity = 0.45 + Math.sin(t * 3.5) * 0.40;
        }
      });
    });

    this.heatBlobs.forEach(({ mesh, baseOp }, i) => {
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = baseOp * (0.78 + Math.sin(t * 1.5 + i * 0.42) * 0.22);
    });

    this.particleSystems.forEach(pts => {
      const pos = pts.geometry.attributes.position;
      const { maxH, cx, cz, bw, bd } = pts.userData;
      for (let i = 0; i < pos.count; i++) {
        let y = pos.getY(i) + 0.013 + Math.random() * 0.004;
        if (y > maxH) {
          y = 0;
          pos.setX(i, cx + (Math.random() - 0.5) * bw * 2.0);
          pos.setZ(i, cz + (Math.random() - 0.5) * bd * 2.0);
        }
        pos.setY(i, y);
      }
      pos.needsUpdate = true;
      (pts.material as THREE.PointsMaterial).opacity =
        0.45 + Math.sin(t * 2.2 + Math.random() * 0.1) * 0.28;
    });

    this.checkHover();
    this.renderer.render(this.scene, this.camera);
  }

  addEvents(canvas: HTMLCanvasElement) {
    canvas.addEventListener("mousedown", e => {
      this.isDragging = true; this.isRightDrag = e.button === 2;
      this.lastMouse = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener("mouseup", () => { this.isDragging = false; });
    window.addEventListener("mousemove", e => {
      const rect = canvas.getBoundingClientRect();
      this.mouse.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      if (!this.isDragging) return;
      const dx = e.clientX - this.lastMouse.x;
      const dy = e.clientY - this.lastMouse.y;
      this.lastMouse = { x: e.clientX, y: e.clientY };
      if (this.isRightDrag) {
        const sp = this.radius * 0.0014;
        const right = new THREE.Vector3().crossVectors(
          this.camera.up,
          this.camera.position.clone().sub(this.target)
        ).normalize();
        this.target.addScaledVector(right, -dx * sp);
        const fwd = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.theta);
        this.target.addScaledVector(fwd, -dy * sp);
      } else {
        this.theta -= dx * 0.007;
        this.phi = Math.max(0.10, Math.min(Math.PI / 2 - 0.01, this.phi - dy * 0.005));
      }
      this.updateCamera();
    });
    canvas.addEventListener("wheel", e => {
      e.preventDefault();
      this.radius = Math.max(8, Math.min(90, this.radius + e.deltaY * 0.03));
      this.updateCamera();
    }, { passive: false });
    canvas.addEventListener("contextmenu", e => e.preventDefault());
  }

  destroy() { cancelAnimationFrame(this.animId); this.renderer.dispose(); }
}

// ─── KPI ─────────────────────────────────────────────────────────────────────
const KPI = ({ label, value, valueColor = "#f8fafc", isMono = false }: {
  label: string; value: string | number; valueColor?: string; isMono?: boolean;
}) => (
  <Box sx={{ display: "flex", flexDirection: "column", gap: 0.2 }}>
    <Typography sx={{
      fontSize: "0.60rem", color: "#334155", fontWeight: 700,
      letterSpacing: "0.6px", textTransform: "uppercase",
      fontFamily: "'Roboto Mono', monospace",
    }}>{label}</Typography>
    <Typography sx={{
      fontSize: "0.92rem", fontWeight: 600, color: valueColor,
      fontFamily: isMono ? "'Roboto Mono', monospace" : "'Inter', sans-serif",
    }}>{value}</Typography>
  </Box>
);

const StyledTextField = TextField as any;

export default function TerminalMap() {
  const [searchParams] = useSearchParams();
  const [vesselInput, setVesselInput] = useState(searchParams.get("vessel") || "AA7");

  // Starting purely blank to wait for the real API to populate it
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [hoveredBlock, setHoveredBlock] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<TerminalScene | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Deriving states before passing to the 3D scene
  let targetBerthId = "R1";
  let totalMoves = 0;
  let computedMaxBlock: string | null = null;
  let maxBlockData: { count: number; concentration: string } | undefined;

  if (data) {
    let maxCount = -1;
    Object.entries(data.blocks || {}).forEach(([id, b]: [string, any]) => {
      totalMoves += b.count;
      if (b.count > maxCount) {
        maxCount = b.count;
        computedMaxBlock = id;
        maxBlockData = b;
      }
    });

    // Find nearest berth based on highest block id
    const highestId = computedMaxBlock || data.max_block;
    if (highestId && data.layout?.[highestId]) {
      const pos = data.layout[highestId];
      const mX = BLK_START_X + pos.x * (BLK_W + BLK_GAP_X) + BLK_W / 2;
      const mY = BLK_START_Y + pos.y * (BLK_H + BLK_GAP_Y) + BLK_H / 2;
      let minD = Infinity;
      BERTHS.forEach(b => {
        const d = Math.hypot(b.x - mX, b.y - mY);
        if (d < minD) { minD = d; targetBerthId = b.id; }
      });
    }
  }

  const load = async () => {
    if (!vesselInput.trim()) return;
    setLoading(true);
    try {
      const form = new FormData();
      form.append("vessel_id", vesselInput.trim());
      const res = await api.post("/vessel/heatmap", form);
      setData(res.data);
    } catch (err: any) {
      const detail = err?.response?.data?.detail || "";
      alert(detail.includes("No dataset")
        ? "No current data found. Upload via POST /upload/current."
        : err?.response?.data?.error || "Error loading heatmap.");
    } finally { setLoading(false); }
  };

  useEffect(() => {
    if (!canvasRef.current) return;
    const ts = new TerminalScene(canvasRef.current);
    ts.onHover = id => setHoveredBlock(id);
    sceneRef.current = ts;
    const ro = new ResizeObserver(() => {
      if (containerRef.current && sceneRef.current)
        sceneRef.current.resize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    });
    if (containerRef.current) {
      ro.observe(containerRef.current);
      ts.resize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    }
    return () => { ro.disconnect(); ts.destroy(); };
  }, []);

  // Update scene when data arrives from the API
  useEffect(() => {
    if (!sceneRef.current || !data) return;
    sceneRef.current.applyData(data, computedMaxBlock, targetBerthId, maxBlockData);
  }, [data]); // eslint-disable-line

  const hoveredData = data?.blocks?.[hoveredBlock ?? ""];

  return (
    <Box sx={{
      width: "100%", height: "100vh", bgcolor: "#060c14",
      color: "#e2e8f0", display: "flex", flexDirection: "column",
      fontFamily: "'Inter', sans-serif", overflow: "hidden",
    }}>
      {/* HUD */}
      <Box sx={{
        bgcolor: "#0b1220", borderBottom: "1px solid #111e30",
        display: "flex", alignItems: "center",
        px: 3, py: 1.4, gap: 2.5,
        flexShrink: 0, flexWrap: "wrap", zIndex: 10,
      }}>
        {/* Brand */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mr: 0.5 }}>
          <Box sx={{
            width: 7, height: 7, borderRadius: "50%", bgcolor: "#38bdf8",
            boxShadow: "0 0 8px #38bdf8aa",
            animation: "blinkDot 2.2s ease-in-out infinite",
            "@keyframes blinkDot": { "0%,100%": { opacity: 1 }, "50%": { opacity: 0.2 } },
          }} />
          <Typography sx={{
            fontSize: "0.66rem", fontWeight: 800, color: "#1e5a7a",
            letterSpacing: "2.5px", textTransform: "uppercase",
            fontFamily: "'Roboto Mono', monospace",
          }}>
            TERMINAL 3D
          </Typography>
        </Box>

        <Divider orientation="vertical" flexItem sx={{ borderColor: "#111e30", my: 0.5 }} />

        {/* Search */}
        <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
          <StyledTextField
            variant="outlined" placeholder="Vessel ID" value={vesselInput}
            onChange={(e: any) => setVesselInput(e.target.value)}
            onKeyDown={(e: any) => e.key === "Enter" && load()}
            size="small"
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchRounded sx={{ fontSize: 14, color: "#1e4060" }} /></InputAdornment> }}
            sx={{
              "& .MuiOutlinedInput-root": {
                bgcolor: "#040a12", color: "#6aa4c0",
                fontSize: "0.8rem", fontFamily: "'Roboto Mono', monospace",
                "& fieldset": { borderColor: "#0f2030" },
                "&:hover fieldset": { borderColor: "#1e4a6a" },
                "&.Mui-focused fieldset": { borderColor: "#38bdf8" },
              },
            }}
          />
          <Button onClick={load} disabled={loading || !vesselInput.trim()} disableElevation sx={{
            bgcolor: loading ? "#0a1624" : "#38bdf8",
            color: loading ? "#1e3a5f" : "#020e1a",
            fontSize: "0.70rem", fontWeight: 800,
            px: 2.5, py: "7px", textTransform: "none", borderRadius: "3px",
            "&:hover": { bgcolor: "#7dd3fc" },
            "&:disabled": { bgcolor: "#080f1a", color: "#1a3050" },
          }}>
            {loading ? "Loading…" : "Load Heatmap"}
          </Button>
        </Box>

        <Divider orientation="vertical" flexItem sx={{ borderColor: "#111e30", my: 0.5 }} />

        {data && (
          <Box sx={{ display: "flex", gap: 4, alignItems: "center", flex: 1, overflowX: "auto" }}>
            <KPI label="Vessel" value={data.vessel} />
            <KPI label="Visit ID" value={data.visit_id || "—"} isMono />
            <KPI label="Volume" value={`${totalMoves} CTN`} isMono valueColor="#38bdf8" />
            <KPI label="Optimal Berth" value={targetBerthId} isMono valueColor="#34d399" />
            <KPI label="Primary Block" value={computedMaxBlock || data.max_block || "—"} isMono valueColor="#ef4444" />
            <Box sx={{ flex: 1 }} />
            {(data.summary?.hazardous > 0 || data.summary?.reefer > 0) && (
              <Box sx={{
                px: 1.8, py: 0.7,
                bgcolor: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.15)",
                borderRadius: 1, display: "flex", gap: 1, alignItems: "center",
              }}>
                <WarningAmberRounded sx={{ fontSize: 15, color: "#ef4444" }} />
                <Typography sx={{ fontSize: "0.68rem", color: "#8a2020", fontWeight: 700 }}>
                  HAZ / REEFER
                </Typography>
              </Box>
            )}
          </Box>
        )}
      </Box>

      {/* 3-D canvas */}
      <Box ref={containerRef} sx={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {loading && (
          <Box sx={{
            position: "absolute", top: 0, left: 0, right: 0, height: 160,
            background: "linear-gradient(transparent, rgba(56,189,248,0.12), transparent)",
            animation: "scan 1.8s linear infinite", pointerEvents: "none", zIndex: 99,
            "@keyframes scan": { "0%": { transform: "translateY(-160px)" }, "100%": { transform: "translateY(100vh)" } },
          }} />
        )}

        {/* Legend */}
        <Box sx={{
          position: "absolute", top: 14, right: 16, zIndex: 10,
          display: "flex", flexDirection: "column", gap: 0.9,
          px: 2, py: 1.4,
          bgcolor: "rgba(4,8,18,0.94)", border: "1px solid #0f1e30", borderRadius: 1,
        }}>
          <Typography sx={{
            fontSize: "0.55rem", color: "#1e3a5f", fontWeight: 800,
            letterSpacing: "1.5px", fontFamily: "'Roboto Mono', monospace", mb: 0.2,
          }}>
            HEAT INDEX
          </Typography>
          {[
            { c: "#ff2200", l: "Critical" },
            { c: "#ff5500", l: "High" },
            { c: "#ffaa00", l: "Medium" },
            { c: "#00dd66", l: "Low" },
          ].map(({ c, l }) => (
            <Box key={l} sx={{ display: "flex", alignItems: "center", gap: 1.2 }}>
              <Box sx={{
                width: 26, height: 9, borderRadius: "4px",
                background: `radial-gradient(ellipse at 30% 50%, ${c}cc 0%, ${c}55 50%, transparent 100%)`,
              }} />
              <Typography sx={{ fontSize: "0.62rem", color: "#1e3a5f", fontWeight: 500 }}>{l}</Typography>
            </Box>
          ))}
        </Box>

        {/* Hover card */}
        {hoveredBlock && (
          <Box sx={{
            position: "absolute", top: 14, left: 14, zIndex: 10,
            px: 2.2, py: 1.6,
            bgcolor: "rgba(4,8,18,0.97)", border: "1px solid #38bdf8",
            borderRadius: 1, boxShadow: "0 0 16px #38bdf822",
          }}>
            <Typography sx={{
              fontSize: "0.74rem", color: "#38bdf8", fontWeight: 800,
              fontFamily: "'Roboto Mono', monospace", letterSpacing: "1px",
            }}>
              BLOCK {hoveredBlock}
            </Typography>
            {hoveredData && (
              <>
                <Typography sx={{ fontSize: "0.68rem", color: "#1e3a5f", mt: 0.5 }}>
                  Volume: <span style={{ color: "#aaccee" }}>{hoveredData.count} CTN</span>
                </Typography>
                <Typography sx={{ fontSize: "0.68rem", color: "#1e3a5f" }}>
                  Density: <span style={{ color: "#aaccee" }}>{hoveredData.concentration}</span>
                </Typography>
              </>
            )}
          </Box>
        )}

        {/* Camera hint */}
        <Box sx={{
          position: "absolute", bottom: 14, left: "50%", transform: "translateX(-50%)",
          zIndex: 10, px: 2.5, py: 0.7,
          bgcolor: "rgba(4,8,18,0.85)", border: "1px solid #111e30", borderRadius: 1,
        }}>
          <Typography sx={{ fontSize: "0.62rem", color: "#1e3a5f", fontFamily: "'Roboto Mono', monospace" }}>
            drag to orbit · scroll to zoom · right-drag to pan
          </Typography>
        </Box>

        <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%" }} />
      </Box>
    </Box>
  );
}