import { useState, useEffect, useRef } from "react";
import {
  Box,
  Typography,
  useTheme,
  IconButton,
  Tooltip,
} from "@mui/material";
import { RestartAltRounded, CenterFocusStrongRounded } from "@mui/icons-material";
import { alpha } from "@mui/material/styles";
import * as THREE from "three";


// ─── Scale & Coordinate System ────────────────────────────────────────────────
const S = 0.028;
const OX = 480;
const OY = 410;

function to3D(svgX: number, svgY: number): THREE.Vector3 {
  return new THREE.Vector3((svgX - OX) * S, 0, (svgY - OY) * S);
}

// Terminal Boundary Constants
const TERM_W = 1000;
const TERM_D = 680;
const TERM_CX = 480;
const TERM_CY = 410;
const EDGE_N = TERM_CY - TERM_D / 2;
const EDGE_S = TERM_CY + TERM_D / 2;
const EDGE_E = TERM_CX + TERM_W / 2;
const EDGE_W = TERM_CX - TERM_W / 2;
const PARK_EDGE_W = -680;

// Trench Constants
const TRENCH_Y = -0.15;
const TRENCH_CY = 490;
const TRENCH_START_X = PARK_EDGE_W;
const TRENCH_END_X = 320;

// Block grid constants
const BLK_W = 160;
const BLK_H = 120;
const BLK_GAP_X = 40;
const BLK_GAP_Y = 40;
const BLK_START_X = 80;
const BLK_START_Y = 190;

// Ship dimensions
const SHIP_LEN = 280 * S;
const SHIP_WID = 60 * S;
const SHIP_DRAFT = 0.55;

// Berths
const BERTHS = [
  { id: "T1", x: 280, y: EDGE_N - 75, rot: 0, defaultShip: { name: "MSC OSCAR" } },
  { id: "T2", x: 680, y: EDGE_N - 75, rot: 0, defaultShip: { name: "EVER GIVEN" } },
  { id: "B1", x: 280, y: EDGE_S + 75, rot: 0, defaultShip: { name: "CMA CGM POLO" } },
  { id: "B2", x: 680, y: EDGE_S + 75, rot: 0, defaultShip: { name: "HAPAG-LLOYD" } },
  { id: "R1", x: EDGE_E + 75, y: 200, rot: 90, defaultShip: { name: "OOCL HK" } },
  { id: "R2", x: EDGE_E + 75, y: 620, rot: 90, defaultShip: { name: "MAERSK MCK" } },
];

// Realistic, Industrial Container Colors
const REALISTIC_CONTAINERS = [
  0x1e293b,
  0x0f172a,
  0xca8a04,
  0x991b1b,
  0x0369a1,
  0x064e3b,
  0xd97706,
  0xe2e8f0,
];

// Shared Materials
const MAT_WHEEL = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
const MAT_CAB = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.5, metalness: 0.2 });
const MAT_CHASSIS = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.7, metalness: 0.5 });
const MAT_LOCO = new THREE.MeshStandardMaterial({ color: 0x7f1d1d, roughness: 0.5, metalness: 0.3 });
const MAT_GLASS = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.1, metalness: 0.9, transparent: true, opacity: 0.6 });
const MAT_DARK_GLASS = new THREE.MeshStandardMaterial({ color: 0x020617, roughness: 0.1, metalness: 1.0 });
const MAT_TREE_TRUNK = new THREE.MeshStandardMaterial({ color: 0x362c26, roughness: 1.0 });
const MAT_TREE_LEAVES = new THREE.MeshStandardMaterial({ color: 0x1e3621, roughness: 0.9 });

// Wheel Geometries
const GEO_WHEEL_Z = new THREE.CylinderGeometry(0.04, 0.04, 0.04, 12).rotateX(Math.PI / 2);
const GEO_WHEEL_X = new THREE.CylinderGeometry(0.04, 0.04, 0.04, 12).rotateZ(Math.PI / 2);

// ─── Helpers ──────────────────────────────────────────────────────────────────
function makeLabel(text: string, fontSize: number, color: string): THREE.Mesh {
  const W = 512, H = 128;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = color;
  ctx.font = `bold ${fontSize}px 'Inter', sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, W / 2, H / 2);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const h = fontSize * 0.007;
  return new THREE.Mesh(new THREE.PlaneGeometry(h * (W / H), h), mat);
}

function makeHeatBlob(colorHex: string, rx: number, rz: number, peakOpacity: number, innerRatio = 1.0): THREE.Mesh {
  const RES = 512;
  const c = document.createElement("canvas");
  c.width = RES; c.height = RES;
  const ctx = c.getContext("2d")!;
  const cx = RES / 2, r = RES / 2;
  const g = ctx.createRadialGradient(cx, cx, 0, cx, cx, r * innerRatio);
  const deepColor = colorHex === "#dc2626" ? "#7f1d1d" : (colorHex === "#ea580c" ? "#7c2d12" : "#14532d");

  g.addColorStop(0.00, `${deepColor}ff`);
  g.addColorStop(0.15, `${colorHex}ee`); 
  g.addColorStop(0.35, `${colorHex}aa`);
  g.addColorStop(0.60, `${colorHex}44`);
  g.addColorStop(0.85, `${colorHex}00`);

  ctx.fillStyle = g;
  ctx.fillRect(0, 0, RES, RES);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, opacity: peakOpacity,
    depthWrite: false, blending: THREE.NormalBlending, side: THREE.DoubleSide,
  });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(rx * 2, rz * 2), mat);
  plane.rotation.x = -Math.PI / 2;
  return plane;
}

// ─── Realism Helpers ──────────────────────────────────────────────────────────
function makePavementTexture(size: number, lineColor: string, bgColor: string): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = size; c.height = size;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, size, size);
  // Subtle grid cracks / panel joints
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 1.5;
  const step = size / 4;
  for (let i = 0; i <= 4; i++) {
    ctx.beginPath(); ctx.moveTo(i * step, 0); ctx.lineTo(i * step, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * step); ctx.lineTo(size, i * step); ctx.stroke();
  }
  // Noise dots for worn texture
  ctx.fillStyle = lineColor;
  for (let i = 0; i < 300; i++) {
    const x = Math.random() * size, y = Math.random() * size;
    ctx.fillRect(x, y, 1, 1);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 8);
  return tex;
}

function makeFadedText(text: string, color: string, size: number): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 64;
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, 256, 64);
  ctx.fillStyle = color;
  ctx.font = `bold ${size}px monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.globalAlpha = 0.6;
  ctx.fillText(text, 128, 32);
  return new THREE.CanvasTexture(c);
}

// ─── Scene ────────────────────────────────────────────────────────────────────
class TerminalScene {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  animId = 0;

  hemiLight!: THREE.HemisphereLight;
  sunLight!: THREE.DirectionalLight;

  blockMeshes: Map<string, THREE.Group> = new Map();
  heatBlobs: { mesh: THREE.Mesh; baseOp: number }[] = [];
  shipMeshes: Map<string, THREE.Group> = new Map();
  waterMesh!: THREE.Mesh;
  particleSystems: THREE.Points[] = [];

  trucks: any[] = [];
  train!: THREE.Group;
  trainWheels: THREE.Mesh[] = [];
  truckWheels: THREE.Mesh[] = [];

  rmg = {
    craneX: to3D(260, TRENCH_CY).x,
    trolley: new THREE.Group(),
    spreader: new THREE.Group(),
    heldContainer: new THREE.Mesh()
  };

  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2(-9999, -9999);
  hoveredId: string | null = null;
  onHover?: (id: string | null) => void;

  private isDragging = false;
  private isRightDrag = false;
  private lastMouse = { x: 0, y: 0 };
  private theta = 0.55;
  private phi = 1.05;
  private radius = 55;
  private target = new THREE.Vector3(-2, 0, 0);
  private clock = new THREE.Clock();

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.9;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x060c14, 0.004); // Default to dark sky

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 800);
    this.updateCamera();

    this.buildLights();
    this.buildWater();
    this.buildGroundSlabs();
    this.buildArchitecture();
    this.buildDocks();
    this.buildSTSCranes();
    this.buildDefaultShips();
    this.buildYardMarkings();
    this.buildFuelStation();
    this.buildGateComplex();
    this.addEvents(canvas);

    this.animate();
  }

  setTheme(mode: 'light' | 'dark') {
    const isDark = mode === 'dark';
    const skyColor = isDark ? 0x060c14 : 0x8ab4f8;

    this.renderer.setClearColor(skyColor, 1);
    if (this.scene.fog) {
      (this.scene.fog as THREE.FogExp2).color.setHex(skyColor);
    }

    if (this.hemiLight) {
      this.hemiLight.color.setHex(isDark ? 0xd0e8f5 : 0xffffff);
      this.hemiLight.groundColor.setHex(isDark ? 0x8fa890 : 0xa1b4c7);
      this.hemiLight.intensity = isDark ? 0.7 : 1.1;
    }

    if (this.sunLight) {
      this.sunLight.intensity = isDark ? 2.2 : 3.0;
      this.sunLight.color.setHex(isDark ? 0xfff5e0 : 0xffffff);
    }

    if (this.waterMesh && this.waterMesh.material) {
      // Brighter navy for dark mode, vibrant blue for light mode
      (this.waterMesh.material as THREE.MeshStandardMaterial).color.setHex(isDark ? 0x18385e : 0x2b6ca3);
    }
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
    this.hemiLight = new THREE.HemisphereLight(0xd0e8f5, 0x8fa890, 0.7);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfff5e0, 1.5);
    this.sunLight.position.set(40, 70, -30);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(4096, 4096);
    const d = 50;
    this.sunLight.shadow.camera.left = -d; this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d; this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.camera.near = 0.5; this.sunLight.shadow.camera.far = 180;
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.radius = 2;
    this.scene.add(this.sunLight);

    const fill = new THREE.DirectionalLight(0xadd8f0, 0.5);
    fill.position.set(-30, 20, 40);
    this.scene.add(fill);

    const bounce = new THREE.DirectionalLight(0xd4b896, 0.2);
    bounce.position.set(0, -10, 0);
    this.scene.add(bounce);

    [[150, EDGE_N], [550, EDGE_N], [350, EDGE_S]].forEach(([x, y]) => {
      const pt = new THREE.PointLight(0xfff0cc, 1.5, 12);
      pt.position.set(to3D(x, y).x, 3.5, to3D(x, y).z);
      this.scene.add(pt);
    });
  }

  buildWater() {
    const geo = new THREE.PlaneGeometry(500, 500, 200, 200);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x18385e, // Setup with new lighter dark-mode water color
      roughness: 0.05,
      metalness: 0.9,
      flatShading: true,
      transparent: true,
      opacity: 0.97,
    });
    this.waterMesh = new THREE.Mesh(geo, mat);
    this.waterMesh.rotation.x = -Math.PI / 2;
    this.waterMesh.position.y = -0.35;
    this.waterMesh.receiveShadow = true;
    this.scene.add(this.waterMesh);

    const foamMat = new THREE.MeshBasicMaterial({ color: 0xd0e8f5, transparent: true, opacity: 0.15 });
    [EDGE_N, EDGE_S].forEach(y => {
      const foam = new THREE.Mesh(new THREE.PlaneGeometry(TERM_W * S, 0.5), foamMat);
      foam.rotation.x = -Math.PI / 2;
      foam.position.set(to3D(TERM_CX, y).x, -0.32, to3D(TERM_CX, y).z);
      this.scene.add(foam);
    });
  }

  buildGroundSlabs() {
    const paveTex = makePavementTexture(512, "#3a424e", "#4a5568");
    const slabMat = new THREE.MeshStandardMaterial({ color: 0x495670, roughness: 0.95, map: paveTex });
    const surfMat = new THREE.MeshStandardMaterial({ color: 0x5a6580, roughness: 0.88 });
    const greenMat = new THREE.MeshStandardMaterial({ color: 0x3a4a38, roughness: 1.0 });
    const concreteMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.7 });

    const createSlab = (startX: number, endX: number, startY: number, endY: number, material: THREE.Material) => {
      const w = (endX - startX) * S;
      const d = (endY - startY) * S;
      const cx = to3D((startX + endX) / 2, 0).x;
      const cz = to3D(0, (startY + endY) / 2).z;

      const slab = new THREE.Mesh(new THREE.BoxGeometry(w, 2.2, d), material);
      slab.position.set(cx, -1.1, cz);
      slab.receiveShadow = true;
      this.scene.add(slab);

      if (material === slabMat) {
        const surf = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, d), surfMat);
        surf.position.set(cx, 0.02, cz);
        surf.receiveShadow = true;
        this.scene.add(surf);
      }
    };

    createSlab(TRENCH_END_X, EDGE_E, EDGE_N, EDGE_S, slabMat);
    createSlab(EDGE_W, TRENCH_END_X, EDGE_N, 470, slabMat);
    createSlab(EDGE_W, TRENCH_END_X, 510, EDGE_S, slabMat);
    createSlab(PARK_EDGE_W, EDGE_W, EDGE_N, 470, greenMat);
    createSlab(PARK_EDGE_W, EDGE_W, 510, EDGE_S, greenMat);

    const trenchW = (TRENCH_END_X - TRENCH_START_X) * S;
    const trenchCX = to3D((TRENCH_START_X + TRENCH_END_X) / 2, 0).x;
    const trenchMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1f, roughness: 1.0 });
    const trenchFloor = new THREE.Mesh(new THREE.BoxGeometry(trenchW, 0.1, 40 * S), trenchMat);
    trenchFloor.position.set(trenchCX, TRENCH_Y, to3D(0, TRENCH_CY).z);
    trenchFloor.receiveShadow = true;
    this.scene.add(trenchFloor);

    // Apron edge markings - yellow safety stripes
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0xf5b800, transparent: true, opacity: 0.7 });
    const northZ = to3D(TERM_CX, EDGE_N).z;
    const southZ = to3D(TERM_CX, EDGE_S).z;
    const eastX = to3D(EDGE_E, TERM_CY).x;
    const cx3 = to3D(TERM_CX, 0).x;

    [northZ, southZ].forEach(z => {
      for (let i = 0; i < 20; i++) {
        const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.8), stripeMat);
        stripe.rotation.x = -Math.PI / 2;
        stripe.position.set(cx3 - 12 + i * 1.3, 0.04, z + (z === northZ ? 0.5 : -0.5));
        this.scene.add(stripe);
      }
    });
    for (let i = 0; i < 15; i++) {
      const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.3), stripeMat);
      stripe.rotation.x = -Math.PI / 2;
      stripe.position.set(eastX - 0.5, 0.04, to3D(EDGE_E, EDGE_N + 20).z + i * 1.3);
      this.scene.add(stripe);
    }

    // Drain channels along apron edges
    const drainMat = new THREE.MeshStandardMaterial({ color: 0x1a1a2e, roughness: 1.0 });
    [northZ + 0.6, southZ - 0.6].forEach(z => {
      const drain = new THREE.Mesh(new THREE.BoxGeometry(TERM_W * S, 0.05, 0.12), drainMat);
      drain.position.set(cx3, 0.0, z);
      this.scene.add(drain);
    });

    // Rubber fender system on quay walls
    const fenderMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.95, metalness: 0.1 });
    const fenderSpacing = 1.8;
    const fenderCount = Math.floor(TERM_W * S / fenderSpacing);
    [northZ - 0.05, southZ + 0.05].forEach(z => {
      for (let i = 0; i < fenderCount; i++) {
        const fender = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.55, 8), fenderMat);
        fender.rotation.x = Math.PI / 2;
        fender.position.set(cx3 - (TERM_W * S) / 2 + i * fenderSpacing + 0.9, 0.0, z);
        fender.castShadow = true;
        this.scene.add(fender);
      }
    });

    // Bollards on quay
    const bollardMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.6, metalness: 0.6 });
    const bollardGeo = new THREE.CylinderGeometry(0.12, 0.14, 0.55, 8);
    const bollardCapGeo = new THREE.SphereGeometry(0.14, 8, 6);
    [[EDGE_N, northZ], [EDGE_S, southZ]].forEach(([, z]) => {
      for (let i = 0; i < 10; i++) {
        const bx = cx3 - TERM_W * S / 2 + i * (TERM_W * S / 9);
        const b = new THREE.Mesh(bollardGeo, bollardMat);
        b.position.set(bx, 0.27, z as number);
        b.castShadow = true;
        this.scene.add(b);
        const cap = new THREE.Mesh(bollardCapGeo, bollardMat);
        cap.position.set(bx, 0.58, z as number);
        this.scene.add(cap);
      }
    });

    void concreteMat;
  }

  buildYardMarkings() {
    // Bay numbers on pavement and slot lines between block rows
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18 });
    const yellowLineMat = new THREE.MeshBasicMaterial({ color: 0xf5b800, transparent: true, opacity: 0.55 });

    // Container slot lines within each yard block area
    for (let py = 0; py < 4; py++) {
      for (let px = 0; px < 5; px++) {
        const svgX = BLK_START_X + px * (BLK_W + BLK_GAP_X);
        const svgY = BLK_START_Y + py * (BLK_H + BLK_GAP_Y);
        const cx = to3D(svgX + BLK_W / 2, 0).x;
        const cz = to3D(0, svgY + BLK_H / 2).z;
        const bw = BLK_W * S;
        const bd = BLK_H * S;

        // Perimeter outline
        const outline = new THREE.LineLoop(
          new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(-bw / 2, 0, -bd / 2),
            new THREE.Vector3(bw / 2, 0, -bd / 2),
            new THREE.Vector3(bw / 2, 0, bd / 2),
            new THREE.Vector3(-bw / 2, 0, bd / 2),
          ]),
          new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12 })
        );
        outline.position.set(cx, 0.05, cz);
        this.scene.add(outline);

        // Slot dividers (7 columns)
        const slotW = bw / 7;
        for (let s = 1; s < 7; s++) {
          const sl = new THREE.Mesh(new THREE.PlaneGeometry(0.015, bd * 0.9), lineMat);
          sl.rotation.x = -Math.PI / 2;
          sl.position.set(cx - bw / 2 + s * slotW, 0.05, cz);
          this.scene.add(sl);
        }
      }
    }

    // Drive lane centre lines (dashed yellow)
    const hLanes = [150, 330, 650];
    hLanes.forEach(y => {
      const lz = to3D(0, y).z;
      for (let i = 0; i < 40; i++) {
        const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.06), yellowLineMat);
        dash.rotation.x = -Math.PI / 2;
        dash.position.set(to3D(TERM_CX - 400 + i * 26 * S * 38, 0).x, 0.05, lz);
        this.scene.add(dash);
      }
    });

    // APPLIED FADED TEXT: Ground Decals on the main driving lanes for realism
    const slowTex = makeFadedText("SLOW - 15 KPH", "#f5b800", 30);
    const slowMat = new THREE.MeshBasicMaterial({
      map: slowTex, transparent: true, opacity: 0.65, depthWrite: false
    });

    hLanes.forEach(y => {
      // Paint 3 staggered warning stencils across the length of the lane
      for (let i = 0; i < 3; i++) {
        const slowDecal = new THREE.Mesh(new THREE.PlaneGeometry(120 * S, 30 * S), slowMat);
        slowDecal.rotation.x = -Math.PI / 2;
        slowDecal.position.set(to3D(TERM_CX - 250 + (i * 250), 0).x, 0.055, to3D(0, y).z);
        this.scene.add(slowDecal);
      }
    });
  }

  buildFuelStation() {
    const pos3 = to3D(-220, 560);
    const g = new THREE.Group();

    // Canopy
    const canopyMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.6 });
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 1.2), canopyMat);
    canopy.position.y = 1.6; canopy.castShadow = true; g.add(canopy);

    // Canopy pillars
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.5, metalness: 0.4 });
    [[-0.7, -0.4], [0.7, -0.4], [-0.7, 0.4], [0.7, 0.4]].forEach(([px, pz]) => {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 6), pillarMat);
      p.position.set(px, 0.8, pz); p.castShadow = true; g.add(p);
    });

    // Pumps
    const pumpMat = new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.5 });
    [-0.3, 0.3].forEach(px => {
      const pump = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.65, 0.12), pumpMat);
      pump.position.set(px, 0.32, 0); pump.castShadow = true; g.add(pump);
      const screen = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.02), MAT_GLASS);
      screen.position.set(px, 0.5, 0.07); g.add(screen);
    });

    // Building
    const bldg = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.5),
      new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.8 }));
    bldg.position.set(0.9, 0.4, 0); bldg.castShadow = true; g.add(bldg);

    g.position.set(pos3.x, 0, pos3.z);
    this.scene.add(g);

    // Ground stain
    const stain = new THREE.Mesh(
      new THREE.PlaneGeometry(2.5, 1.8),
      new THREE.MeshBasicMaterial({ color: 0x111827, transparent: true, opacity: 0.25 })
    );
    stain.rotation.x = -Math.PI / 2;
    stain.position.set(pos3.x, 0.03, pos3.z);
    this.scene.add(stain);
  }

  buildGateComplex() {
    // Entry/exit gate at west side
    const pos3 = to3D(EDGE_W - 40, TERM_CY);
    const g = new THREE.Group();

    const boothMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.7 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.5 });
    const signMat = new THREE.MeshStandardMaterial({ color: 0x065f46, roughness: 0.6 });

    [-0.5, 0.5].forEach(dx => {
      const booth = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.9, 0.4), boothMat);
      booth.position.set(dx, 0.45, 0); booth.castShadow = true; g.add(booth);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.06, 0.44), roofMat);
      roof.position.set(dx, 0.92, 0); g.add(roof);

      const win = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.22, 0.04), MAT_GLASS);
      win.position.set(dx + (dx > 0 ? -0.2 : 0.2), 0.52, 0); g.add(win);
    });

    // Barrier arm
    const armMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.5 });
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.04, 0.04), armMat);
    arm.position.set(0.1, 0.7, 0); g.add(arm);

    // Sign
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.25, 0.04), signMat);
    sign.position.set(0, 1.3, 0); g.add(sign);

    // Overhead gantry
    const gantryMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.6, metalness: 0.5 });
    const gantry = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.06, 0.06), gantryMat);
    gantry.position.set(0, 1.4, 0); g.add(gantry);
    [-0.8, 0.8].forEach(dx => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.4, 6), gantryMat);
      post.position.set(dx, 0.7, 0); g.add(post);
    });

    // APPLIED FADED TEXT: Gate Checkpoint Signage
    const gateTex = makeFadedText("GATE ENTRY", "#ffffff", 34);
    const gateSignMat = new THREE.MeshBasicMaterial({ map: gateTex, transparent: true, opacity: 0.85, depthWrite: false });
    const gateSign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4), gateSignMat);
    gateSign.position.set(0, 1.4, 0.031); // Place flat against the front of the gantry
    g.add(gateSign);

    g.position.set(pos3.x, 0, pos3.z);
    this.scene.add(g);
  }

  buildTree(cx: number, cy: number, scale = 1) {
    const group = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.04 * scale, 0.06 * scale, 0.4 * scale, 6), MAT_TREE_TRUNK);
    trunk.position.set(0, 0.2 * scale, 0); trunk.castShadow = true; group.add(trunk);
    const l1 = new THREE.Mesh(new THREE.DodecahedronGeometry(0.25 * scale), MAT_TREE_LEAVES);
    l1.position.set(0, 0.5 * scale, 0); l1.castShadow = true; group.add(l1);

    group.position.set(to3D(cx, cy).x, 0, to3D(cx, cy).z);
    group.rotation.y = Math.random() * Math.PI;
    this.scene.add(group);
  }

  buildArchitecture() {
    const concreteMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.7 });

    // HQ Building - more detailed
    const hqGroup = new THREE.Group();
    const hqBody = new THREE.Mesh(new THREE.BoxGeometry(3, 3.5, 3), MAT_DARK_GLASS);
    hqBody.position.y = 1.75; hqBody.castShadow = true; hqGroup.add(hqBody);
    const hqConcrete = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.6 });
    const hqBase = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.4, 3.4), hqConcrete);
    hqBase.position.y = 0.2; hqGroup.add(hqBase);
    const hqRoof = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.15, 3.1), concreteMat);
    hqRoof.position.y = 3.57; hqGroup.add(hqRoof);
    // Horizontal dividers (floor lines)
    [1.1, 2.2, 3.3].forEach(hy => {
      const band = new THREE.Mesh(new THREE.BoxGeometry(3.05, 0.08, 3.05), concreteMat);
      band.position.y = hy; hqGroup.add(band);
    });
    const hqFlagpole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.5), concreteMat);
    hqFlagpole.position.set(0.5, 4.35, 0); hqGroup.add(hqFlagpole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.28),
      new THREE.MeshBasicMaterial({ color: 0x1d4ed8, side: THREE.DoubleSide }));
    flag.position.set(0.76, 4.9, 0); hqGroup.add(flag);
    hqGroup.position.set(to3D(-300, 200).x, 0, to3D(-300, 200).z);
    this.scene.add(hqGroup);

    // Control Tower - enhanced
    const towerGroup = new THREE.Group();
    const towerBase = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 5, 12), concreteMat);
    towerBase.position.y = 2.5; towerGroup.add(towerBase);
    // Elevator shaft
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.18, 5, 0.18), concreteMat);
    shaft.position.set(0.38, 2.5, 0); towerGroup.add(shaft);
    const obsDeck = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.4, 0.9, 8), MAT_GLASS);
    obsDeck.position.y = 5.45; towerGroup.add(obsDeck);
    const towerRoof = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.75, 0.12, 8), concreteMat);
    towerRoof.position.y = 5.95; towerGroup.add(towerRoof);
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.8), MAT_WHEEL);
    antenna.position.y = 6.8; towerGroup.add(antenna);
    // Radar dish
    const dish = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 4, 0, Math.PI),
      new THREE.MeshStandardMaterial({ color: 0xb0bec5, roughness: 0.4, metalness: 0.6 }));
    dish.position.set(0.25, 6.5, 0); dish.rotation.x = -Math.PI / 4; towerGroup.add(dish);
    towerGroup.position.set(to3D(-150, 300).x, 0, to3D(-150, 300).z);
    this.scene.add(towerGroup);

    // Warehouses - enhanced with loading docks
    const whMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.85 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.75 });
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.7 });

    [320, 580].forEach((y, i) => {
      const wh = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(5.5, 1.8, 3.0), whMat);
      body.position.y = 0.9; body.castShadow = true; body.receiveShadow = true; wh.add(body);

      // Pitched roof
      const roofGeo = new THREE.CylinderGeometry(0, 3.2, 0.9, 2, 1).rotateY(Math.PI / 2);
      const roof = new THREE.Mesh(roofGeo, roofMat);
      roof.scale.set(1.0, 1.0, 0.6); roof.position.y = 2.25; wh.add(roof);

      // Loading dock doors
      [-1.5, -0.4, 0.7].forEach(dx => {
        const door = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.05), doorMat);
        door.position.set(dx, 0.55, 1.53); wh.add(door);
        // Dock leveller
        const dock = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.04, 0.4),
          new THREE.MeshStandardMaterial({ color: 0x374151, roughness: 0.9 }));
        dock.position.set(dx, 0.12, 1.72); wh.add(dock);
      });

      // Signage stripe
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.2, 0.02),
        new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.5 }));
      stripe.position.set(0, 1.5, 1.52); wh.add(stripe);

      // APPLIED FADED TEXT: Warehouse painted wall signage
      const whSignTex = makeFadedText(`WAREHOUSE ${i + 1}`, "#334155", 38);
      const whSignMat = new THREE.MeshBasicMaterial({ map: whSignTex, transparent: true, opacity: 0.65, depthWrite: false });
      const whSign = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.9), whSignMat);
      whSign.position.set(0, 1.25, 1.501); // Just above the blue stripe, slightly off wall to prevent z-fighting
      wh.add(whSign);

      wh.position.set(to3D(-350, y).x, 0, to3D(-350, y).z);
      this.scene.add(wh);

      // Parked RTG near warehouse
      this.buildParkedRTG(to3D(-280, y).x, to3D(-280, y).z);
    });

    // Trees
    for (let i = 0; i < 45; i++) {
      const rx = -100 - Math.random() * 500;
      const ry = 100 + Math.random() * 600;
      if (ry > 460 && ry < 520) continue;
      this.buildTree(rx, ry, 1.5 + Math.random() * 1.5);
    }

    // Roads
    const roadMat = new THREE.MeshStandardMaterial({ color: 0x1e2332, roughness: 0.85 });
    const vRoads = [60, 260, 460, 660, 860];
    const hRoads = [150, 330, 650];

    hRoads.forEach(y => {
      const r = new THREE.Mesh(new THREE.BoxGeometry((TERM_W - 40) * S, 0.02, 40 * S), roadMat);
      r.position.set(to3D(TERM_CX, y).x, 0.045, to3D(TERM_CX, y).z);
      r.receiveShadow = true; this.scene.add(r);
    });

    vRoads.forEach(x => {
      if (x <= TRENCH_END_X) {
        const rN = new THREE.Mesh(new THREE.BoxGeometry(40 * S, 0.02, 400 * S), roadMat);
        rN.position.set(to3D(x, 270).x, 0.045, to3D(x, 270).z); this.scene.add(rN);
        const rS = new THREE.Mesh(new THREE.BoxGeometry(40 * S, 0.02, 240 * S), roadMat);
        rS.position.set(to3D(x, 630).x, 0.045, to3D(x, 630).z); this.scene.add(rS);

        const bridge = new THREE.Mesh(new THREE.BoxGeometry(40 * S, 0.12, 40 * S), roadMat);
        bridge.position.set(to3D(x, TRENCH_CY).x, 0.0, to3D(x, TRENCH_CY).z);
        bridge.castShadow = true; bridge.receiveShadow = true; this.scene.add(bridge);

        const pillarH = Math.abs(TRENCH_Y);
        [-0.4, 0.4].forEach(dz => {
          const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, pillarH, 8), concreteMat);
          pillar.position.set(to3D(x, TRENCH_CY).x, TRENCH_Y + pillarH / 2, to3D(x, TRENCH_CY).z + dz);
          this.scene.add(pillar);
        });
      } else {
        const r = new THREE.Mesh(new THREE.BoxGeometry(40 * S, 0.02, 680 * S), roadMat);
        r.position.set(to3D(x, TERM_CY).x, 0.045, to3D(x, TERM_CY).z);
        this.scene.add(r);
      }
    });

    const railZ = to3D(0, TRENCH_CY).z;
    const trenchWStr = (TRENCH_END_X - TRENCH_START_X) * S;
    const trenchCXStr = to3D((TRENCH_START_X + TRENCH_END_X) / 2, 0).x;

    const ballast = new THREE.Mesh(
      new THREE.BoxGeometry(trenchWStr, 0.08, 20 * S),
      new THREE.MeshStandardMaterial({ color: 0x3f3f46, roughness: 0.9 })
    );
    ballast.position.set(trenchCXStr, TRENCH_Y + 0.04, railZ);
    this.scene.add(ballast);

    const matSleeper = new THREE.MeshStandardMaterial({ color: 0x292524 });
    const startSleeperX = to3D(TRENCH_START_X, 0).x;
    const endSleeperX = to3D(TRENCH_END_X, 0).x;
    const sleeperCount = Math.floor((endSleeperX - startSleeperX) / 0.2);

    for (let i = 0; i < sleeperCount; i++) {
      const sleeper = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 0.6), matSleeper);
      sleeper.position.set(startSleeperX + i * 0.2, TRENCH_Y + 0.09, railZ);
      this.scene.add(sleeper);
    }

    const railMat = new THREE.MeshStandardMaterial({ color: 0x9ca3af, metalness: 0.8, roughness: 0.3 });
    const r1 = new THREE.Mesh(new THREE.BoxGeometry(trenchWStr, 0.04, 2 * S), railMat);
    r1.position.set(trenchCXStr, TRENCH_Y + 0.12, railZ - 0.15); this.scene.add(r1);
    const r2 = r1.clone();
    r2.position.set(trenchCXStr, TRENCH_Y + 0.12, railZ + 0.15); this.scene.add(r2);

    this.buildTrain(railZ);
    this.buildRMGCrane(this.rmg.craneX);
    this.buildTrucks();
  }

  // Parked RTG crane (static, for atmosphere)
  buildParkedRTG(x: number, z: number) {
    const g = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial({ color: 0xb0bec5, roughness: 0.5, metalness: 0.5 });
    const accent = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.4 });

    [-0.4, 0.4].forEach(dz => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.2, 0.08), steel);
      leg.position.set(0, 0.6, dz); leg.castShadow = true; g.add(leg);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 0.18), accent);
      foot.position.set(0, 0.03, dz); g.add(foot);
    });
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 1.0), steel);
    bridge.position.y = 1.2; g.add(bridge);
    const trolley = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.08, 0.3), accent);
    trolley.position.set(0, 1.3, 0); g.add(trolley);

    g.position.set(x, 0, z);
    this.scene.add(g);
  }

  // FIX: Removed unused `rad` parameter
  createWheel(x: number, y: number, z: number, group: THREE.Group, type: "train" | "truck") {
    const geo = type === "train" ? GEO_WHEEL_Z : GEO_WHEEL_X;
    const wheel = new THREE.Mesh(geo, MAT_WHEEL);
    wheel.position.set(x, y, z);
    group.add(wheel);
    if (type === "train") this.trainWheels.push(wheel);
    else this.truckWheels.push(wheel);
  }

  buildTrain(zPos: number) {
    const train = new THREE.Group();
    const trainY = TRENCH_Y + 0.22;

    const locoGroup = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.25, 0.26), MAT_LOCO);
    body.position.set(0, 0.18, 0); locoGroup.add(body);
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.15, 0.26), MAT_LOCO);
    nose.position.set(0.5, 0.13, 0); locoGroup.add(nose);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.28), MAT_LOCO);
    cab.position.set(0.25, 0.35, 0); locoGroup.add(cab);
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.12, 0.30), MAT_DARK_GLASS);
    win.position.set(0.25, 0.38, 0); locoGroup.add(win);
    const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.2), MAT_WHEEL);
    exhaust.position.set(-0.2, 0.35, 0); locoGroup.add(exhaust);

    [-0.3, 0.3].forEach(wx => {
      this.createWheel(wx + 0.1, 0.05, 0.15, locoGroup, "train");
      this.createWheel(wx - 0.1, 0.05, 0.15, locoGroup, "train");
      this.createWheel(wx + 0.1, 0.05, -0.15, locoGroup, "train");
      this.createWheel(wx - 0.1, 0.05, -0.15, locoGroup, "train");
    });

    locoGroup.position.set(0.8, 0, 0);
    train.add(locoGroup);

    for (let i = 0; i < 8; i++) {
      const carGroup = new THREE.Group();
      const bed = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.04, 0.25), MAT_CHASSIS);
      bed.position.set(0, 0.1, 0); carGroup.add(bed);

      [-0.22, 0.22].forEach(wx => {
        this.createWheel(wx + 0.08, 0.05, 0.15, carGroup, "train");
        this.createWheel(wx - 0.08, 0.05, 0.15, carGroup, "train");
        this.createWheel(wx + 0.08, 0.05, -0.15, carGroup, "train");
        this.createWheel(wx - 0.08, 0.05, -0.15, carGroup, "train");
      });

      if (i !== 1 && Math.random() > 0.2) {
        const contColor = REALISTIC_CONTAINERS[i % REALISTIC_CONTAINERS.length];
        const cont = new THREE.Mesh(
          new THREE.BoxGeometry(0.60, 0.22, 0.23),
          new THREE.MeshStandardMaterial({ color: contColor, roughness: 0.7 })
        );
        cont.position.set(0, 0.23, 0);
        carGroup.add(cont);
      }
      carGroup.position.set(0 - i * 0.7, 0, 0);
      train.add(carGroup);
    }

    const startX = to3D(TRENCH_START_X + 100, 0).x;
    const craneAlignTargetX = this.rmg.craneX + 0.7;

    train.position.set(startX, trainY, zPos);
    train.userData = {
      state: 'INBOUND',
      speed: 0.05,
      targetX: craneAlignTargetX,
      startX: startX,
      stopTime: 0
    };
    this.scene.add(train);
    this.train = train;
  }

  buildRMGCrane(xPos: number) {
    const craneGroup = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.5, metalness: 0.6 });
    const darkSteel = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.7, metalness: 0.4 });

    const z1 = to3D(0, 450).z;
    const z2 = to3D(0, 530).z;

    [-0.3, 0.3].forEach(dx => {
      const l1 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.8, 0.1), steel);
      l1.position.set(dx, 0.9, z1); craneGroup.add(l1);
      const l2 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.8, 0.1), steel);
      l2.position.set(dx, 0.9, z2); craneGroup.add(l2);
    });

    const bridgeZCenter = (z1 + z2) / 2;
    const bridgeLength = Math.abs(z1 - z2) + 0.4;
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.2, bridgeLength), steel);
    bridge.position.set(0, 1.8, bridgeZCenter);
    craneGroup.add(bridge);

    this.rmg.trolley = new THREE.Group();
    const tBox = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.15, 0.4), darkSteel);
    this.rmg.trolley.add(tBox);

    this.rmg.spreader = new THREE.Group();
    const sBox = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.05, 0.22), darkSteel);
    this.rmg.spreader.add(sBox);

    this.rmg.heldContainer = new THREE.Mesh(
      new THREE.BoxGeometry(0.60, 0.22, 0.23),
      new THREE.MeshStandardMaterial({ color: REALISTIC_CONTAINERS[0] })
    );
    this.rmg.heldContainer.position.set(0, -0.15, 0);
    this.rmg.heldContainer.visible = false;
    this.rmg.spreader.add(this.rmg.heldContainer);

    this.rmg.trolley.position.set(0, 1.6, z2);
    this.rmg.spreader.position.set(0, -0.2, 0);
    this.rmg.trolley.add(this.rmg.spreader);
    craneGroup.add(this.rmg.trolley);

    craneGroup.position.set(xPos, 0, 0);
    this.scene.add(craneGroup);
  }

  buildTrucks() {
    const getP = (sx: number, sy: number) => new THREE.Vector3(to3D(sx, sy).x, 0.06, to3D(sx, sy).z);

    const pathOuter = [getP(60, 150), getP(860, 150), getP(860, 650), getP(60, 650)];
    const pathInnerW = [getP(260, 150), getP(460, 150), getP(460, 330), getP(260, 330)];
    const pathInnerE = [getP(660, 330), getP(860, 330), getP(860, 650), getP(660, 650)];
    const allPaths = [pathOuter, pathInnerW, pathInnerE];

    for (let i = 0; i < 15; i++) {
      const truck = new THREE.Group();

      const tractor = new THREE.Group();
      const hood = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.14), MAT_CAB);
      hood.position.set(0, 0.1, 0.18); tractor.add(hood);
      const cab = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.18, 0.14), MAT_CAB);
      cab.position.set(0, 0.14, 0.06); tractor.add(cab);
      const glass = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.08, 0.15), MAT_GLASS);
      glass.position.set(0, 0.15, 0.06); tractor.add(glass);

      [0.18, 0.0].forEach(wz => {
        this.createWheel(0.08, 0.04, wz, tractor, "truck");
        this.createWheel(-0.08, 0.04, wz, tractor, "truck");
      });
      truck.add(tractor);

      const trailer = new THREE.Group();
      const bed = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.50), MAT_CHASSIS);
      bed.position.set(0, 0.08, -0.28); trailer.add(bed);

      [-0.4, -0.48].forEach(wz => {
        this.createWheel(0.08, 0.04, wz, trailer, "truck");
        this.createWheel(-0.08, 0.04, wz, trailer, "truck");
      });

      if (Math.random() > 0.2) {
        const contColor = REALISTIC_CONTAINERS[i % REALISTIC_CONTAINERS.length];
        const cont = new THREE.Mesh(
          new THREE.BoxGeometry(0.16, 0.22, 0.48),
          new THREE.MeshStandardMaterial({ color: contColor, roughness: 0.6 })
        );
        cont.position.set(0, 0.21, -0.28);
        trailer.add(cont);
      }
      truck.add(trailer);

      this.scene.add(truck);
      const path = allPaths[i % 3];
      const startIdx = i % path.length;
      const nextIdx = (startIdx + 1) % path.length;

      truck.position.copy(path[startIdx]).lerp(path[nextIdx], Math.random());
      truck.lookAt(path[nextIdx]);

      this.trucks.push({
        mesh: truck, path, targetIdx: nextIdx, speed: 0.015 + Math.random() * 0.008,
      });
    }
  }

  buildDocks() {
    const qMat = new THREE.MeshStandardMaterial({ color: 0x7a8799, roughness: 0.85, metalness: 0.15 });
    const c = to3D(TERM_CX, TERM_CY);

    const nw = new THREE.Mesh(new THREE.BoxGeometry(TERM_W * S + 1.2, 0.55, 1.0), qMat);
    nw.position.set(c.x, 0.17, to3D(TERM_CX, EDGE_N).z - 0.5);
    nw.castShadow = true; nw.receiveShadow = true;
    this.scene.add(nw);

    const sw = nw.clone();
    sw.position.set(c.x, 0.17, to3D(TERM_CX, EDGE_S).z + 0.5);
    this.scene.add(sw);

    const ew = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.55, TERM_D * S + 1.2), qMat);
    ew.position.set(to3D(EDGE_E, TERM_CY).x + 0.5, 0.17, c.z);
    ew.castShadow = true; ew.receiveShadow = true;
    this.scene.add(ew);

    // Mooring cleats
    const bGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.5, 8);
    const bMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6, metalness: 0.6 });
    const northZ = to3D(TERM_CX, EDGE_N).z - 0.9;
    const southZ = to3D(TERM_CX, EDGE_S).z + 0.9;
    const eastX = to3D(EDGE_E, TERM_CY).x + 0.9;

    [-12, -8, -5, -2, 1, 4, 7].forEach(x => {
      [northZ, southZ].forEach(z => {
        const b = new THREE.Mesh(bGeo, bMat);
        b.position.set(x, 0.4, z); b.castShadow = true; this.scene.add(b);
      });
    });
    [-8, -5, -2, 1, 4, 7].forEach(z => {
      const b = new THREE.Mesh(bGeo, bMat);
      b.position.set(eastX, 0.4, z); b.castShadow = true; this.scene.add(b);
    });

    // Navigation lights on dock corners
    const navLightMat = new THREE.MeshBasicMaterial({ color: 0xff4400 });
    [[c.x - TERM_W * S / 2, northZ], [c.x + TERM_W * S / 2, northZ],
    [c.x - TERM_W * S / 2, southZ], [c.x + TERM_W * S / 2, southZ]].forEach(([lx, lz]) => {
      const navLight = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), navLightMat);
      navLight.position.set(lx as number, 0.8, lz as number);
      this.scene.add(navLight);
      const glow = new THREE.PointLight(0xff4400, 1.5, 3);
      glow.position.set(lx as number, 0.8, lz as number);
      this.scene.add(glow);
    });

    // Ladders on quay face
    const ladderMat = new THREE.MeshStandardMaterial({ color: 0x374151, roughness: 0.7, metalness: 0.4 });
    [-10, -5, 0, 5].forEach(lx => {
      for (let r = 0; r < 4; r++) {
        const rung = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.02, 0.02), ladderMat);
        rung.position.set(lx, 0.35 - r * 0.12, northZ - 0.02);
        this.scene.add(rung);
      }
    });
  }

  buildSTSCrane(svgX: number, svgY: number, rotDeg: number) {
    const pos = to3D(svgX, svgY);
    const g = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.5, metalness: 0.55 });
    const boomMt = new THREE.MeshStandardMaterial({ color: 0x1a56c4, roughness: 0.35, metalness: 0.4 });
    const cabMt = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.3, metalness: 0.2 });
    const accentMt = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.4 });

    // Rail bogies
    [-0.55, 0.55].forEach(dz => {
      const bogie = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.1, 0.18), steel);
      bogie.position.set(0, 0.05, dz); bogie.castShadow = true; g.add(bogie);
      const wheel1 = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.06, 8).rotateX(Math.PI / 2), MAT_WHEEL);
      wheel1.position.set(-0.2, 0.05, dz); g.add(wheel1);
      const wheel2 = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.06, 8).rotateX(Math.PI / 2), MAT_WHEEL);
      wheel2.position.set(0.2, 0.05, dz); g.add(wheel2);
    });

    // Legs - A-frame style
    [-0.38, 0.24].forEach(dx => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.4, 0.16), steel);
      leg.position.set(dx, 1.3, 0); leg.castShadow = true; g.add(leg);
    });

    // Cross bracing
    const brace1 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.65), steel);
    brace1.position.set(-0.07, 1.0, 0); g.add(brace1);
    const brace2 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.65), steel);
    brace2.position.set(-0.07, 1.8, 0); g.add(brace2);

    // Spreader beam (A-frame top)
    const xb = new THREE.Mesh(new THREE.BoxGeometry(0.80, 0.14, 0.14), steel);
    xb.position.set(-0.07, 0.65, 0); g.add(xb);

    // Mast
    const mast = new THREE.Mesh(new THREE.BoxGeometry(0.14, 4.2, 0.14), boomMt);
    mast.position.set(-0.07, 3.3, 0); mast.castShadow = true; g.add(mast);

    // Boom - larger
    const jibL = 6.8;
    const jib = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, jibL), boomMt);
    jib.position.set(-0.07, 4.5, -jibL / 2 + 0.6); jib.castShadow = true; g.add(jib);

    // Back mast
    const bs = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 2.5), boomMt);
    bs.position.set(-0.07, 4.5, 2.0); g.add(bs);

    // Stay cables (simplified as thin boxes)
    [[-0.07, 4.5, -jibL + 0.6], [-0.07, 4.5, 2.4]].forEach(([, , bz]) => {
      const cable = new THREE.Mesh(new THREE.BoxGeometry(0.015, 2.0, 0.015),
        new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.5, metalness: 0.8 }));
      cable.position.set(-0.07, 5.5, bz); cable.rotation.x = bz < 0 ? 0.4 : -0.4; g.add(cable);
    });

    // Operator cab
    const cab = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.38, 0.5), cabMt);
    cab.position.set(-0.07, 4.2, -0.7); g.add(cab);
    const cabWin = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.02), MAT_GLASS);
    cabWin.position.set(-0.07, 4.22, -0.96); g.add(cabWin);

    // Machinery house (top)
    const mhouse = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.4, 0.45), steel);
    mhouse.position.set(-0.07, 5.4, 0.8); g.add(mhouse);

    // Warning stripe on boom
    const stripes = [0xf59e0b, 0x1a56c4, 0xf59e0b];
    stripes.forEach((col, si) => {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.105, 0.4),
        new THREE.MeshStandardMaterial({ color: col, roughness: 0.4 }));
      s.position.set(-0.07, 4.5, -1.5 - si * 0.42); g.add(s);
    });

    // Floodlights on boom tip
    const floodMat = new THREE.MeshBasicMaterial({ color: 0xfffde7 });
    const flood = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.08), floodMat);
    flood.position.set(-0.07, 4.4, -jibL + 0.8); g.add(flood);

    // Accent color on lower frame
    const accentBar = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.06, 0.06), accentMt);
    accentBar.position.set(-0.07, 0.15, 0); g.add(accentBar);

    g.position.set(pos.x, 0, pos.z);
    g.rotation.y = THREE.MathUtils.degToRad(-rotDeg);
    this.scene.add(g);
  }

  buildSTSCranes() {
    [150, 350, 550, 750].forEach(cx => this.buildSTSCrane(cx, EDGE_N, 0));
    [150, 350, 550, 750].forEach(cx => this.buildSTSCrane(cx, EDGE_S, 180));
    [200, 400, 600].forEach(cy => this.buildSTSCrane(EDGE_E, cy, -90));
  }

  // FIX: Removed unused `containerData` parameter
  buildShip(
    id: string, svgX: number, svgY: number, rotDeg: number,
    name: string, isTarget: boolean
  ) {
    const g = new THREE.Group();
    const pos = to3D(svgX, svgY);
    const L = SHIP_LEN, W = SHIP_WID, DR = SHIP_DRAFT;

    const hullColor = isTarget ? 0x1e3a8a : 0x451a03;
    const hullMat = new THREE.MeshStandardMaterial({
      color: hullColor, roughness: 0.55, metalness: 0.45,
    });
    const upperHullMat = new THREE.MeshStandardMaterial({
      color: isTarget ? 0x1e40af : 0x5a1a04, roughness: 0.5, metalness: 0.3,
    });

    // Waterline stripe (anti-fouling red/copper)
    const wlColor = isTarget ? 0xb91c1c : 0x7f1d1d;
    const wl = new THREE.Mesh(new THREE.BoxGeometry(L + 0.05, DR * 0.3, W + 0.05),
      new THREE.MeshStandardMaterial({ color: wlColor, roughness: 0.7 }));
    wl.position.y = -DR * 0.22; g.add(wl);

    const hull = new THREE.Mesh(new THREE.BoxGeometry(L, DR, W), hullMat);
    hull.position.y = 0; hull.castShadow = true; g.add(hull);

    // Visible hull plating lines
    for (let i = 0; i < 5; i++) {
      const plate = new THREE.Mesh(new THREE.BoxGeometry(L + 0.01, 0.015, W + 0.01),
        new THREE.MeshStandardMaterial({ color: hullColor === 0x1e3a8a ? 0x1e3580 : 0x3d1503, roughness: 0.8 }));
      plate.position.y = -DR / 2 + (i + 1) * (DR / 6);
      g.add(plate);
    }

    // Bow - improved shape
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

    // Deck
    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(L * 0.94, 0.06, W * 0.88),
      new THREE.MeshStandardMaterial({ color: 0x1a2232, roughness: 0.92, metalness: 0.1 })
    );
    deck.position.y = DR / 2 + 0.03; g.add(deck);

    // Hatch covers
    const hatchMat = new THREE.MeshStandardMaterial({ color: 0x374151, roughness: 0.8 });
    for (let h = 0; h < 5; h++) {
      const hatch = new THREE.Mesh(new THREE.BoxGeometry(L * 0.13, 0.04, W * 0.75),
        hatchMat);
      hatch.position.set(-L * 0.38 + h * L * 0.19, DR / 2 + 0.06, 0);
      g.add(hatch);
    }

    // Container stacks
    const COLS = 13, ROWS = 3;
    const cW = (L * 0.72) / COLS;
    const cD = (W * 0.80) / ROWS;

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const stackH = 0.14 + (Math.sin((c / COLS) * Math.PI) * 0.20) + Math.random() * 0.08;
        const contColor = REALISTIC_CONTAINERS[(r * COLS + c) % REALISTIC_CONTAINERS.length];
        const cm = new THREE.Mesh(
          new THREE.BoxGeometry(cW * 0.88, stackH, cD * 0.88),
          new THREE.MeshStandardMaterial({ color: contColor, roughness: 0.65 })
        );
        cm.position.set(-L * 0.34 + c * cW + cW / 2, DR / 2 + stackH / 2 + 0.07, -W * 0.38 + r * cD + cD / 2);
        cm.castShadow = true; g.add(cm);
      }
    }

    // Superstructure (bridge/accommodation)
    const superMat = new THREE.MeshStandardMaterial({ color: 0xf0f4f8, roughness: 0.5, metalness: 0.1 });
    const super1 = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.1, W * 0.78), superMat);
    super1.position.set(-L * 0.39, DR / 2 + 0.55, 0);
    super1.castShadow = true; g.add(super1);
    // Bridge wings
    [-W * 0.44, W * 0.44].forEach(wz => {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.12, 0.3), superMat);
      wing.position.set(-L * 0.39, DR / 2 + 0.95, wz); g.add(wing);
    });
    // Windows on superstructure
    const winMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.1, metalness: 0.9, transparent: true, opacity: 0.7 });
    for (let fl = 0; fl < 3; fl++) {
      for (let w2 = 0; w2 < 4; w2++) {
        const win = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.07, 0.1), winMat);
        win.position.set(-L * 0.39 - 0.43, DR / 2 + 0.25 + fl * 0.3, -W * 0.28 + w2 * 0.2);
        g.add(win);
      }
    }

    // Funnel / chimney
    const funnelColor = isTarget ? 0x1d4ed8 : 0x7f1d1d;
    const funnel = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.5, 8),
      new THREE.MeshStandardMaterial({ color: funnelColor, roughness: 0.5 }));
    funnel.position.set(-L * 0.42, DR / 2 + 1.35, 0);
    funnel.castShadow = true; g.add(funnel);

    // Masts with radar
    const mastMat = new THREE.MeshStandardMaterial({ color: 0xd1d5db, roughness: 0.4, metalness: 0.6 });
    [L * 0.3, -L * 0.15].forEach(mx => {
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.7, 6), mastMat);
      mast.position.set(mx, DR / 2 + 0.7, 0);
      g.add(mast);
    });

    // Mooring ropes (simplified)
    void upperHullMat;

    if (isTarget) {
      const ringR = Math.max(L, W) * 0.62;
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(ringR, ringR + 0.12, 72),
        new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.4, side: THREE.DoubleSide })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = -0.18;
      g.add(ring);
    }

    const labelColor = isTarget ? "#38bdf8" : "#94a3b8";
    const label = makeLabel(name.toUpperCase(), 30, labelColor);
    label.position.set(0, DR / 2 + 2.4, 0);
    label.rotation.x = -Math.PI / 7;
    g.add(label);

    g.position.set(pos.x, 0, pos.z);
    g.rotation.y = THREE.MathUtils.degToRad(-rotDeg);
    g.userData = { type: "ship", id, bobOffset: Math.random() * Math.PI * 2 };

    // Vessel name on hull
    const hullLabel = makeLabel(name, 18, "#aab8c8");
    hullLabel.position.set(L * 0.1, 0, W / 2 + 0.01);
    hullLabel.rotation.y = -Math.PI / 2;
    g.add(hullLabel);

    this.scene.add(g);
    this.shipMeshes.set(id, g);
  }

  buildDefaultShips() {
    BERTHS.forEach(b => this.buildShip(b.id, b.x, b.y, b.rot, b.defaultShip.name, false));
  }

  applyData(
    data: any,
    computedMaxBlock: string | null,
    targetBerthId: string,
    maxBlockData?: { count: number; concentration: string }
  ) {
    if (!data || !data.layout) return;

    this.blockMeshes.forEach(g => this.scene.remove(g)); this.blockMeshes.clear();
    this.heatBlobs.forEach(({ mesh }) => this.scene.remove(mesh)); this.heatBlobs = [];
    this.particleSystems.forEach(p => this.scene.remove(p)); this.particleSystems = [];

    const recRaw = data.recommended_berth || "";
    const heatGroups: { id: string; cx: number; cz: number; bw: number; bd: number; conc: string; isMax: boolean }[] = [];

    Object.entries(data.layout).forEach(([id, pos]: [string, any]) => {
      const px = Math.max(0, pos.x);
      const py = Math.max(0, pos.y);

      const svgX = BLK_START_X + px * (BLK_W + BLK_GAP_X);
      const svgY = BLK_START_Y + py * (BLK_H + BLK_GAP_Y);
      const wp = to3D(svgX + BLK_W / 2, svgY + BLK_H / 2);

      const blk = (data.blocks || {})[id];
      const isMax = id === computedMaxBlock;
      const isRec = typeof recRaw === 'string' ? recRaw.includes(id) : Array.isArray(recRaw) ? recRaw.includes(id) : false;

      const hasData = !!blk && blk.count > 0;
      const conc = blk?.concentration ?? "none";

      const bw = BLK_W * S;
      const bd = BLK_H * S;
      const g = new THREE.Group();

      const padColor = isMax ? 0xfecaca : isRec ? 0xe0f2fe : hasData ? 0xe2e8f0 : 0x94a3b8;
      const pad = new THREE.Mesh(
        new THREE.BoxGeometry(bw, 0.12, bd),
        new THREE.MeshStandardMaterial({ color: padColor, roughness: 0.92 })
      );
      pad.position.y = 0.06; pad.castShadow = true; pad.receiveShadow = true;
      g.add(pad);

      if (hasData) {
        heatGroups.push({ id, cx: wp.x, cz: wp.z, bw, bd, conc, isMax });
        const count = Math.min(blk.count, 60);
        const COLS = 7;

        const cubeSize = bw * 0.11;
        const dummy = new THREE.Object3D();
        const iMesh = new THREE.InstancedMesh(
          new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize),
          new THREE.MeshStandardMaterial({ roughness: 0.7 }), count
        );
        iMesh.castShadow = true;

        for (let i = 0; i < count; i++) {
          const tier = Math.floor(i / (COLS * 5));
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
          iMesh.setColorAt(i, new THREE.Color(REALISTIC_CONTAINERS[Math.floor(Math.random() * REALISTIC_CONTAINERS.length)]));
        }
        iMesh.instanceMatrix.needsUpdate = true;
        g.add(iMesh);
      }

      const badge = makeLabel(id, 26, isMax ? "#b91c1c" : isRec ? "#0369a1" : "#334155");
      badge.rotation.x = -Math.PI / 2;
      badge.position.set(-bw * 0.32, 0.20, -bd * 0.34);
      g.add(badge);

      if (hasData) {
        const cntLabel = makeLabel(`${blk.count}`, 24, "#0f172a");
        cntLabel.rotation.x = -Math.PI / 2;
        cntLabel.position.set(bw * 0.30, 0.20, -bd * 0.34);
        g.add(cntLabel);
      }

      g.position.set(wp.x, 0, wp.z);
      g.userData = { type: "block", id, count: blk?.count ?? 0, concentration: conc };
      this.scene.add(g);
      this.blockMeshes.set(id, g);
    });

    const allBlocks = Object.entries(data.blocks || {})
      .filter(([, b]: [any, any]) => b.count > 0)
      .sort((a: any, b: any) => b[1].count - a[1].count);

    const maxCount = allBlocks.length > 0 ? (allBlocks[0][1] as any).count : 0;
    const highCountIds = allBlocks.filter(([, b]: [any, any]) => b.count === maxCount).map(([id]) => id);
    const mediumCandidates = allBlocks.filter(([id]) => !highCountIds.includes(id));
    const mediumIds = mediumCandidates.slice(0, 3).map(([id]) => id);

    heatGroups.sort((a, b) => {
      const order = (id: string) => highCountIds.includes(id) ? 3 : mediumIds.includes(id) ? 2 : 1;
      return order(a.id) - order(b.id);
    });

    heatGroups.forEach(({ id, cx, cz, bw, bd }) => {
      const isHigh = highCountIds.includes(id);
      const isMed = mediumIds.includes(id);

      const col = isHigh ? "#dc2626" : (isMed ? "#ea580c" : "#16a34a");
      const spread = isHigh ? 2.6 : (isMed ? 2.2 : 1.6);
      const peakOp = isHigh ? 1.0 : (isMed ? 0.85 : 0.75);

      const addBlob = (rx: number, rz: number, op: number, yPos: number, inner = 1.0) => {
        const blob = makeHeatBlob(col, rx, rz, op, inner);
        blob.position.set(cx, yPos, cz);
        blob.userData.baseOpacity = op;
        this.scene.add(blob);
        this.heatBlobs.push({ mesh: blob, baseOp: op });
      };

      addBlob(bw * spread, bd * spread, peakOp * 0.55, 0.06);
      addBlob(bw * spread * 0.70, bd * spread * 0.70, peakOp * 0.95, 0.22);
      addBlob(bw * spread * 0.40, bd * spread * 0.40, peakOp * 1.00, 0.40, 0.7);

      if (isHigh || isMed) {
        const pCount = isHigh ? 100 : 60;
        const maxH = isHigh ? 4.0 : 2.5;
        const posArr = new Float32Array(pCount * 3);
        for (let i = 0; i < pCount; i++) {
          posArr[i * 3] = cx + (Math.random() - 0.5) * bw * 2.0;
          posArr[i * 3 + 1] = Math.random() * maxH;
          posArr[i * 3 + 2] = cz + (Math.random() - 0.5) * bd * 2.0;
        }
        const pts = new THREE.Points(
          (() => { const gg = new THREE.BufferGeometry(); gg.setAttribute("position", new THREE.BufferAttribute(posArr, 3)); return gg; })(),
          new THREE.PointsMaterial({
            color: new THREE.Color(col), size: 0.14, transparent: true, opacity: 0.85,
            sizeAttenuation: true, depthWrite: false, blending: THREE.NormalBlending,
          })
        );
        pts.userData = { maxH, cx, cz, bw, bd };
        this.scene.add(pts);
        this.particleSystems.push(pts);
      }
    });

    BERTHS.forEach(b => {
      const gg = this.shipMeshes.get(b.id);
      if (gg) { this.scene.remove(gg); this.shipMeshes.delete(b.id); }
    });
    BERTHS.forEach(b => {
      const isTarget = b.id === targetBerthId;
      this.buildShip(b.id, b.x, b.y, b.rot, isTarget ? data.vessel : b.defaultShip.name, isTarget);
    });

    void maxBlockData;
  }

  checkHover() {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const meshes: THREE.Object3D[] = [];
    this.blockMeshes.forEach(g => meshes.push(...g.children.filter(c => c instanceof THREE.Mesh || c instanceof THREE.InstancedMesh)));
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
        pos.setZ(i, Math.sin(u * 1.2 + t * 1.8) * 0.06 + Math.cos(v * 1.4 + t * 1.1) * 0.04);
      }
      pos.needsUpdate = true;
      this.waterMesh.geometry.computeVertexNormals();
    }

    this.shipMeshes.forEach(g => {
      const off = g.userData.bobOffset || 0;
      g.position.y = Math.sin(t * 1.4 + off) * 0.065;
      g.rotation.x = Math.sin(t * 0.9 + off) * 0.008;
      g.rotation.z = Math.cos(t * 1.1 + off) * 0.007;
    });

    this.heatBlobs.forEach(({ mesh, baseOp }, i) => {
      (mesh.material as THREE.MeshBasicMaterial).opacity = baseOp * (0.85 + Math.sin(t * 1.5 + i * 0.42) * 0.15);
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
    });

    this.trucks.forEach(truck => {
      const target = truck.path[truck.targetIdx];
      const dist = truck.mesh.position.distanceTo(target);
      if (dist < truck.speed * 1.5) {
        truck.targetIdx = (truck.targetIdx + 1) % truck.path.length;
      }
      const dir = target.clone().sub(truck.mesh.position).normalize();
      truck.mesh.position.addScaledVector(dir, truck.speed);
      const lookPos = truck.mesh.position.clone().add(dir);
      truck.mesh.lookAt(lookPos);
    });

    if (this.train.userData.state === 'INBOUND') {
      this.train.position.x += this.train.userData.speed;
      this.trainWheels.forEach(w => w.rotation.z -= this.train.userData.speed * 5);

      if (this.train.position.x >= this.train.userData.targetX) {
        this.train.position.x = this.train.userData.targetX;
        this.train.userData.state = 'STOPPED';
        this.train.userData.stopTime = t;
      }
    } else if (this.train.userData.state === 'STOPPED') {
      const elapsed = t - this.train.userData.stopTime;
      if (elapsed > 60) {
        this.train.userData.state = 'OUTBOUND';
        this.rmg.heldContainer.visible = false;
      } else {
        const cycleLength = 10;
        const localT = elapsed % cycleLength;
        const progress = localT / cycleLength;

        const trainZ = to3D(0, TRENCH_CY).z;
        const roadZ = to3D(0, 450).z;
        const upY = -0.1;
        const downY = -1.2;

        if (progress < 0.2) {
          this.rmg.trolley.position.z = THREE.MathUtils.lerp(roadZ, trainZ, progress / 0.2);
          this.rmg.spreader.position.y = upY;
          this.rmg.heldContainer.visible = false;
        } else if (progress < 0.3) {
          this.rmg.spreader.position.y = THREE.MathUtils.lerp(upY, downY, (progress - 0.2) / 0.1);
        } else if (progress < 0.4) {
          this.rmg.spreader.position.y = THREE.MathUtils.lerp(downY, upY, (progress - 0.3) / 0.1);
          this.rmg.heldContainer.visible = true;
        } else if (progress < 0.6) {
          this.rmg.trolley.position.z = THREE.MathUtils.lerp(trainZ, roadZ, (progress - 0.4) / 0.2);
        } else if (progress < 0.7) {
          this.rmg.spreader.position.y = THREE.MathUtils.lerp(upY, downY, (progress - 0.6) / 0.1);
        } else if (progress < 0.8) {
          this.rmg.spreader.position.y = THREE.MathUtils.lerp(downY, upY, (progress - 0.7) / 0.1);
          this.rmg.heldContainer.visible = false;
        }
      }
    } else if (this.train.userData.state === 'OUTBOUND') {
      this.train.position.x -= this.train.userData.speed;
      this.trainWheels.forEach(w => w.rotation.z += this.train.userData.speed * 5);

      if (this.train.position.x <= this.train.userData.startX) {
        this.train.userData.state = 'INBOUND';
      }
    }

    this.truckWheels.forEach(w => w.rotation.x += 0.2);

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
      this.mouse.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      if (!this.isDragging) return;
      const dx = e.clientX - this.lastMouse.x;
      const dy = e.clientY - this.lastMouse.y;
      this.lastMouse = { x: e.clientX, y: e.clientY };
      if (this.isRightDrag) {
        const sp = this.radius * 0.0014;
        const right = new THREE.Vector3().crossVectors(this.camera.up, this.camera.position.clone().sub(this.target)).normalize();
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
      this.radius = Math.max(10, Math.min(120, this.radius + e.deltaY * 0.05));
      this.updateCamera();
    }, { passive: false });
    canvas.addEventListener("contextmenu", e => e.preventDefault());
  }

  resetView() {
    this.target.set(0, 0, 0);
    this.radius = 45;
    this.theta = -Math.PI / 4;
    this.phi = Math.PI / 4;
    this.updateCamera();
  }

  destroy() { cancelAnimationFrame(this.animId); this.renderer.dispose(); }
}

interface TerminalMap3DProps {
  data: any;
  targetBerthId: string;
  computedMaxBlock: string | null;
  maxBlockData?: { count: number; concentration: string };
  loading?: boolean;
}

export default function TerminalMap3D({
  data,
  targetBerthId,
  computedMaxBlock,
  maxBlockData,
  loading,
}: TerminalMap3DProps) {
  const [hoveredBlock, setHoveredBlock] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<TerminalScene | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const theme = useTheme();
  const mode = theme.palette.mode;

  useEffect(() => {
    if (!canvasRef.current) return;
    let ts: TerminalScene | null = null;
    let ro: ResizeObserver | null = null;

    const timer = setTimeout(() => {
      if (!canvasRef.current) return;
      ts = new TerminalScene(canvasRef.current);
      ts.onHover = (id) => setHoveredBlock(id);
      sceneRef.current = ts;
      ts.setTheme(mode);

      ro = new ResizeObserver(() => {
        if (containerRef.current && sceneRef.current)
          sceneRef.current.resize(containerRef.current.clientWidth, containerRef.current.clientHeight);
      });

      if (containerRef.current) {
        ro.observe(containerRef.current);
        ts.resize(containerRef.current.clientWidth, containerRef.current.clientHeight);
      }
    }, 10);

    return () => {
      clearTimeout(timer);
      if (ro) ro.disconnect();
      if (ts) ts.destroy();
    };
  }, []);

  useEffect(() => {
    if (sceneRef.current) {
      sceneRef.current.setTheme(mode);
    }
  }, [mode]);

  useEffect(() => {
    if (!sceneRef.current || !data) return;
    sceneRef.current.applyData(data, computedMaxBlock, targetBerthId, maxBlockData);
  }, [data, computedMaxBlock, targetBerthId, maxBlockData]);

  const hoveredData = data?.blocks?.[hoveredBlock ?? ""];

  return (
    <Box
      ref={containerRef}
      sx={{
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden",
        bgcolor: "background.default",
      }}
    >
      <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%" }} />

      {loading && (
        <Box sx={{
          position: "absolute", top: 0, left: 0, right: 0, height: 160,
          background: `linear-gradient(transparent, ${alpha(theme.palette.primary.main, 0.12)}, transparent)`,
          animation: "scan 1.8s linear infinite", pointerEvents: "none", zIndex: 99,
          "@keyframes scan": { "0%": { transform: "translateY(-160px)" }, "100%": { transform: "translateY(100vh)" } },
        }} />
      )}

      {/* Legend */}
      <Box sx={{
        position: "absolute", top: 14, right: 16, zIndex: 10,
        display: "flex", flexDirection: "column", gap: 0.8, px: 1.8, py: 1.2,
        bgcolor: theme.palette.mode === "dark" ? "rgba(42,42,42,0.94)" : "rgba(233,238,246,0.96)",
        border: "1px solid", borderColor: "divider", borderRadius: 1,
      }}>
        <Typography sx={{
          fontSize: "0.52rem", color: "text.secondary", fontWeight: 800,
          letterSpacing: "1.5px", fontFamily: "'Roboto Mono', monospace", mb: 0.1,
        }}>
          HEAT INDEX
        </Typography>
        {[
          { c: "#dc2626", l: "Highest Density" },
          { c: "#ea580c", l: "Next 3 Blocks" },
          { c: "#16a34a", l: "Remaining Yard" }
        ].map(({ c, l }) => (
          <Box key={l} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Box sx={{
              width: 22, height: 8, borderRadius: "3px",
              background: `radial-gradient(ellipse at 30% 50%, ${c}cc 0%, ${c}55 50%, transparent 100%)`,
            }} />
            <Typography sx={{ fontSize: "0.60rem", color: "text.primary", fontWeight: 500 }}>{l}</Typography>
          </Box>
        ))}
      </Box>

      {/* Hover tooltip */}
      {hoveredBlock && (
        <Box sx={{
          position: "absolute", top: 14, left: 14, zIndex: 10, px: 2, py: 1.4,
          bgcolor: theme.palette.mode === "dark" ? "rgba(42,42,42,0.97)" : "rgba(233,238,246,0.97)",
          border: "1px solid", borderColor: "primary.main",
          borderRadius: 1, boxShadow: `0 0 16px ${alpha(theme.palette.primary.main, 0.22)}`,
        }}>
          <Typography sx={{
            fontSize: "0.72rem", color: "primary.main", fontWeight: 800,
            fontFamily: "'Roboto Mono', monospace", letterSpacing: "1px",
          }}>
            BLOCK {hoveredBlock}
          </Typography>
          {hoveredData && (
            <>
              <Typography sx={{ fontSize: "0.66rem", color: "text.primary", mt: 0.4 }}>
                Volume: <span style={{ color: theme.palette.info.main }}>{hoveredData.count} Units</span>
              </Typography>
              <Typography sx={{ fontSize: "0.66rem", color: "text.primary" }}>
                Density: <span style={{ color: theme.palette.info.main }}>{hoveredData.concentration}</span>
              </Typography>
            </>
          )}
        </Box>
      )}

      {/* Navigation Controls */}
      <Box sx={{ position: "absolute", bottom: 24, right: 24, zIndex: 100, display: "flex", gap: 1 }}>
        <Tooltip title="Reset View">
          <IconButton 
            onClick={() => sceneRef.current?.resetView()} 
            sx={{ bgcolor: theme.palette.mode === "dark" ? "rgba(42,42,42,0.9)" : "rgba(255,255,255,0.9)", border: "1px solid", borderColor: "divider", boxShadow: 3, "&:hover": { bgcolor: "action.hover" } }}
          >
            <RestartAltRounded />
          </IconButton>
        </Tooltip>
        <Tooltip title="Center View">
          <IconButton 
            onClick={() => sceneRef.current?.resetView()} 
            sx={{ bgcolor: theme.palette.mode === "dark" ? "rgba(42,42,42,0.9)" : "rgba(255,255,255,0.9)", border: "1px solid", borderColor: "divider", boxShadow: 3, "&:hover": { bgcolor: "action.hover" } }}
          >
            <CenterFocusStrongRounded />
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );
}