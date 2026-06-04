import { useState, useEffect, useRef } from "react";
import { Box, Typography, useTheme, IconButton, Tooltip } from "@mui/material";
import { RestartAltRounded } from "@mui/icons-material";
import { alpha } from "@mui/material/styles";
import * as THREE from "three";

import type { VesselHeatmapViewData } from "../../../types/heatmap";
import {
  buildTerminalGeometry,
  n2world,
  berthHeadingRad,
  WORLD_SCALE,
  getSeaPoint,
  type RawTerminalLayout,
  type BlockInfo,
  type BerthInfo,
} from "../utils/terminalGeometry";

// ─── Shared materials (created once) ─────────────────────────────────────────

const MAT_WHEEL = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
const MAT_CAB = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.5, metalness: 0.2 });
const MAT_CHASSIS = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.7, metalness: 0.5 });
const MAT_GLASS = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.1, metalness: 0.9, transparent: true, opacity: 0.6 });
const MAT_TREE_TRUNK = new THREE.MeshStandardMaterial({ color: 0x362c26, roughness: 1.0 });
const MAT_TREE_LEAVES = new THREE.MeshStandardMaterial({ color: 0x1e3621, roughness: 0.9 });
const CONTAINER_COLORS = [0x991b1b, 0x1d4ed8, 0xea580c];
const GEO_WHEEL_X = new THREE.CylinderGeometry(0.04, 0.04, 0.04, 12).rotateZ(Math.PI / 2);

// ─── Texture factories ────────────────────────────────────────────────────────

function createContainerTexture(): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = 512; canvas.height = 512;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, 512, 512);
  ctx.lineWidth = 32; ctx.strokeStyle = "#333333"; ctx.strokeRect(16, 16, 480, 480);
  ctx.fillStyle = "#1a1a1a";
  for (let i = 48; i < 464; i += 32) ctx.fillRect(i, 24, 16, 464);
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 16;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}
const CONTAINER_TEX = createContainerTexture();

function createParticleTexture(): THREE.Texture {
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.3, "rgba(255,255,255,0.8)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
const PARTICLE_TEX = createParticleTexture();

// ─── Geometry helpers ─────────────────────────────────────────────────────────

function createContainerGeometry(w: number, h: number, d: number): THREE.BoxGeometry {
  const geom = new THREE.BoxGeometry(w, h, d);
  const uvs = geom.attributes.uv, normals = geom.attributes.normal;
  const isXLong = w > d;
  for (let i = 0; i < uvs.count; i++) {
    const nx = Math.abs(normals.getX(i)), nz = Math.abs(normals.getZ(i)), ny = Math.abs(normals.getY(i));
    if (isXLong) { if (ny > 0.5 || nz > 0.5) uvs.setX(i, uvs.getX(i) * 3); }
    else { if (ny > 0.5 || nx > 0.5) uvs.setX(i, uvs.getX(i) * 3); }
  }
  geom.attributes.uv.needsUpdate = true;
  return geom;
}

function makeBillboardLabel(text: string, fontSize: number, color: string): THREE.Sprite {
  const W = 512, H = 128;
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = color;
  ctx.font = `bold ${fontSize}px 'Inter',sans-serif`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(text, W / 2, H / 2);
  const mat = new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(c),
    transparent: true,
    depthWrite: false,
    sizeAttenuation: false, // Lock visual size to screen space!
  });
  const s = new THREE.Sprite(mat);
  // Scale defines fraction of screen height (e.g. 12% width, 3% height)
  s.scale.set(0.12, 0.03, 1);
  return s;
}

function makeLabel(text: string, fontSize: number, color: string): THREE.Mesh {
  const W = 512, H = 128;
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = color;
  ctx.font = `bold ${fontSize}px 'Inter',sans-serif`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(text, W / 2, H / 2);
  const mat = new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(c),
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const h = fontSize * 0.007;
  return new THREE.Mesh(new THREE.PlaneGeometry(h * (W / H), h), mat);
}

function makeHeatBlob(
  colorHex: string,
  rx: number,
  rz: number,
  peakOpacity: number,
  innerRatio = 1.0,
): THREE.Mesh {
  const RES = 512;
  const c = document.createElement("canvas"); c.width = c.height = RES;
  const ctx = c.getContext("2d")!, cx = RES / 2, r = RES / 2;
  const g = ctx.createRadialGradient(cx, cx, 0, cx, cx, r * innerRatio);
  const deep =
    colorHex === "#dc2626" ? "#7f1d1d" : colorHex === "#ea580c" ? "#7c2d12" : "#14532d";
  g.addColorStop(0.0, `${deep}ff`);
  g.addColorStop(0.15, `${colorHex}ee`);
  g.addColorStop(0.35, `${colorHex}aa`);
  g.addColorStop(0.6, `${colorHex}44`);
  g.addColorStop(0.85, `${colorHex}00`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, RES, RES);
  const mat = new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(c),
    transparent: true,
    opacity: peakOpacity,
    depthWrite: false,
    blending: THREE.NormalBlending,
    side: THREE.DoubleSide,
  });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(rx * 2, rz * 2), mat);
  plane.rotation.x = -Math.PI / 2;
  return plane;
}

// ─── Build yard outline from XML polygon ─────────────────────────────────────

function buildYardOutline(
  scene: THREE.Scene,
  yardPolygon: { x: number; y: number }[],
) {
  if (!yardPolygon.length) return;

  const worldPts = yardPolygon.map(p => {
    const w = n2world(p.x, p.y);
    return w;
  });

  const shape = new THREE.Shape();
  worldPts.forEach((p, i) =>
    i === 0 ? shape.moveTo(p.x, -p.z) : shape.lineTo(p.x, -p.z),
  );

  const extrudeSettings = { depth: 0.1, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 2 };
  const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  const mat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.95 }); // dark gray terminal
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -0.09;
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  scene.add(mesh);

  const pts3 = worldPts.map(p => new THREE.Vector3(p.x, 0.05, p.z));
  const lineGeo = new THREE.BufferGeometry().setFromPoints(pts3);
  scene.add(
    new THREE.Line(
      lineGeo,
      new THREE.LineBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.5 }),
    ),
  );
}

// ─── Main scene class ─────────────────────────────────────────────────────────

class TerminalScene {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  animId = 0;
  hemiLight!: THREE.HemisphereLight;
  sunLight!: THREE.DirectionalLight;
  blockMeshes: Map<string, THREE.Group> = new Map();
  envPads: Map<string, THREE.Mesh> = new Map();
  heatBlobs: { mesh: THREE.Mesh; baseOp: number }[] = [];
  shipMeshes: Map<string, THREE.Group> = new Map();
  particleSystems: THREE.Points[] = [];
  blockLabels: THREE.Sprite[] = [];
  trucks: { mesh: THREE.Group; path: THREE.Vector3[]; targetIdx: number; speed: number }[] = [];
  truckWheels: THREE.Mesh[] = [];
  waterMesh!: THREE.Mesh;
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
  private target = new THREE.Vector3(0, 0, 0);
  private timer = new THREE.Timer();

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.9;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x060c14, 0.005);

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 600);
    this.updateCamera();
    this.buildLights();
    this.buildWater();
    this.addEvents(canvas);
    this.animate();
  }

  // ── Theme ──────────────────────────────────────────────────────────────────
  setTheme() {
    const skyColor = 0x8ab4f8;
    this.renderer.setClearColor(skyColor, 1);
    if (this.scene.fog) (this.scene.fog as THREE.FogExp2).color.setHex(skyColor);
    if (this.hemiLight) {
      this.hemiLight.color.setHex(0xffffff);
      this.hemiLight.groundColor.setHex(0xa1b4c7);
      this.hemiLight.intensity = 1.1;
    }
    if (this.sunLight) { this.sunLight.intensity = 3.0; this.sunLight.color.setHex(0xffffff); }
    if (this.waterMesh) (this.waterMesh.material as THREE.MeshStandardMaterial).color.setHex(0x4facd1);
  }

  // ── Camera ─────────────────────────────────────────────────────────────────
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

  // ── Lights ─────────────────────────────────────────────────────────────────
  buildLights() {
    this.hemiLight = new THREE.HemisphereLight(0xd0e8f5, 0x8fa890, 0.7);
    this.scene.add(this.hemiLight);
    this.sunLight = new THREE.DirectionalLight(0xfff5e0, 1.5);
    this.sunLight.position.set(40, 70, -30);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(4096, 4096);
    const d = 60;
    this.sunLight.shadow.camera.left = -d; this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d; this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.camera.near = 0.5; this.sunLight.shadow.camera.far = 200;
    this.sunLight.shadow.bias = -0.0005;
    this.scene.add(this.sunLight);
    const fill = new THREE.DirectionalLight(0xadd8f0, 0.5);
    fill.position.set(-30, 20, 40);
    this.scene.add(fill);
  }

  // ── Water ──────────────────────────────────────────────────────────────────
  buildWater() {
    const geo = new THREE.PlaneGeometry(500, 500, 200, 200);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8, roughness: 0.1, metalness: 0.8,
      flatShading: true, transparent: true, opacity: 0.9,
    });
    this.waterMesh = new THREE.Mesh(geo, mat);
    this.waterMesh.rotation.x = -Math.PI / 2;
    this.waterMesh.position.y = -0.35;
    this.waterMesh.receiveShadow = true;
    this.scene.add(this.waterMesh);
  }

  // ── Static environment (derived from XML geometry) ─────────────────────────
  buildEnvironment(
    yardPolygon: { x: number; y: number }[],
    xmlBlocks: BlockInfo[],
  ) {
    // Yard ground
    buildYardOutline(this.scene, yardPolygon);

    // --- Land plane beneath terminal (covers left, right, bottom — not quay/sea side) ---
    const landGeo = new THREE.PlaneGeometry(WORLD_SCALE * 1.1, WORLD_SCALE * 0.9);
    const landMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8, // gray platform
      roughness: 0.95,
      metalness: 0.0,
    });
    const landMesh = new THREE.Mesh(landGeo, landMat);
    landMesh.rotation.x = -Math.PI / 2;
    landMesh.position.set(0, -0.01, WORLD_SCALE * 0.1);
    landMesh.receiveShadow = true;
    this.scene.add(landMesh);

    // Block pads — color-coded by type with raised edges for realism
    const blockColors: Record<string, number> = {
      TRANSTAINER: 0x64748b,  // lighter slate
      FORKLIFT: 0x94a3b8,     // lighter gray
      HEAP: 0xa1a1aa,         // gray
      UNKNOWN: 0xcbd5e1,      // very light gray
    };

    xmlBlocks.forEach(blk => {
      if (!blk.polygon.length) return;
      const worldPts = blk.polygon.map(p => n2world(p.x, p.y));

      // --- Block pad surface ---
      const shape = new THREE.Shape();
      worldPts.forEach((p, i) =>
        i === 0 ? shape.moveTo(p.x, -p.z) : shape.lineTo(p.x, -p.z),
      );

      const baseColor = blockColors[blk.type] ?? blockColors.UNKNOWN;
      const padMat = new THREE.MeshStandardMaterial({
        color: baseColor,
        roughness: 0.85,
        metalness: 0.1,
      });

      // Extruded block with slight height for 3D depth
      const extrudeSettings = { depth: 0.08, bevelEnabled: false };
      const extGeo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
      const extMesh = new THREE.Mesh(extGeo, padMat);
      extMesh.rotation.x = -Math.PI / 2;
      extMesh.position.y = 0.02;
      extMesh.castShadow = true;
      extMesh.receiveShadow = true;
      extMesh.userData = { type: 'block', id: blk.id };
      this.scene.add(extMesh);
      this.envPads.set(blk.id, extMesh);

      // --- Block border outline ---
      const pts3 = worldPts.map(p => new THREE.Vector3(p.x, 0.12, p.z));
      if (pts3.length > 0) pts3.push(pts3[0].clone()); // close loop
      const lineGeo = new THREE.BufferGeometry().setFromPoints(pts3);
      const lineMat = new THREE.LineBasicMaterial({
        color: 0xc8d6e5,
        transparent: true,
        opacity: 0.6,
      });
      this.scene.add(new THREE.Line(lineGeo, lineMat));

      // --- Block name billboard (always faces camera, dynamically scaled) ---
      const wp = n2world(blk.cx, blk.cy);
      const lbl = makeBillboardLabel(blk.id, 42, '#ffffff');
      lbl.position.set(wp.x, 1.2, wp.z); // Increased height to float higher above containers
      this.scene.add(lbl);
      this.blockLabels.push(lbl);

      // --- Lane markings on transtainer blocks ---
      if (blk.type === 'TRANSTAINER' && blk.w > 0.01) {
        const bw = blk.w * WORLD_SCALE;
        const bd = blk.h * WORLD_SCALE;
        const laneCount = Math.max(2, Math.round(bd / 0.8));
        const laneMat = new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.12,
        });
        for (let i = 1; i < laneCount; i++) {
          const frac = i / laneCount;
          const lx = -bw / 2;
          const lz = -bd / 2 + bd * frac;
          const lane = new THREE.Mesh(
            new THREE.PlaneGeometry(bw * 0.9, 0.02),
            laneMat,
          );
          lane.rotation.x = -Math.PI / 2;
          lane.position.set(wp.x + lx + bw * 0.45, 0.13, wp.z + lz);
          this.scene.add(lane);
        }
      }
    });

    // Quay apron removed per user request

  }

  buildTree(nx: number, ny: number, scale = 1) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04 * scale, 0.06 * scale, 0.4 * scale, 6),
      MAT_TREE_TRUNK,
    );
    trunk.position.set(0, 0.2 * scale, 0);
    g.add(trunk);
    const leaves = new THREE.Mesh(new THREE.DodecahedronGeometry(0.25 * scale), MAT_TREE_LEAVES);
    leaves.position.set(0, 0.5 * scale, 0);
    leaves.castShadow = true;
    g.add(leaves);
    const wp = n2world(nx, ny);
    g.position.set(wp.x, 0, wp.z);
    this.scene.add(g);
  }

  buildTrucks(xmlBlocks: BlockInfo[]) {
    // Build patrol path from block centroids (use first 4 blocks, sorted by position)
    const sorted = [...xmlBlocks]
      .filter(b => b.cx > 0 && b.cy > 0)
      .sort((a, b) => a.cx - b.cx || a.cy - b.cy)
      .slice(0, 4);

    if (sorted.length < 2) return;

    const path = sorted.map(blk => {
      const wp = n2world(blk.cx, blk.cy);
      return new THREE.Vector3(wp.x, 0.06, wp.z);
    });

    for (let i = 0; i < 6; i++) {
      const truck = new THREE.Group();
      const hood = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.10, 0.14), MAT_CAB);
      hood.position.set(0, 0.10, 0.18); truck.add(hood);
      const cab = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.18, 0.14), MAT_CAB);
      cab.position.set(0, 0.14, 0.06); truck.add(cab);
      const glass = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.08, 0.15), MAT_GLASS);
      glass.position.set(0, 0.15, 0.06); truck.add(glass);
      [
        [0.08, 0.04, 0.18], [-0.08, 0.04, 0.18],
        [0.08, 0.04, 0.0], [-0.08, 0.04, 0.0],
      ].forEach(([x, y, z]) => {
        const w = new THREE.Mesh(GEO_WHEEL_X, MAT_WHEEL);
        w.position.set(x, y, z);
        truck.add(w);
        this.truckWheels.push(w);
      });
      const bed = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.50), MAT_CHASSIS);
      bed.position.set(0, 0.08, -0.28); truck.add(bed);
      if (Math.random() > 0.25) {
        const cont = new THREE.Mesh(
          createContainerGeometry(0.16, 0.22, 0.48),
          new THREE.MeshStandardMaterial({ color: CONTAINER_COLORS[i % 3], map: CONTAINER_TEX, roughness: 0.7 }),
        );
        cont.position.set(0, 0.21, -0.28); truck.add(cont);
      }
      this.scene.add(truck);
      const startIdx = i % path.length;
      const nextIdx = (startIdx + 1) % path.length;
      truck.position.copy(path[startIdx]).lerp(path[nextIdx], Math.random());
      truck.lookAt(path[nextIdx]);
      this.trucks.push({ mesh: truck, path, targetIdx: nextIdx, speed: 0.012 + Math.random() * 0.006 });
    }
  }

  buildStsCrane(x: number, y: number, z: number, rotY: number): THREE.Group {
    const g = new THREE.Group();
    const matBlue = new THREE.MeshStandardMaterial({ color: 0x1d4ed8, metalness: 0.6, roughness: 0.4 });
    const matWhite = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, metalness: 0.3, roughness: 0.8 });
    const matDark = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8, roughness: 0.5 });
    const matCable = new THREE.LineBasicMaterial({ color: 0x333333 });

    const scale = 1.5; // Massive structure

    // 1. Gantry Base (Rails/Bogeys)
    for (const dx of [-0.6, 0.6]) {
      const bogey = new THREE.Mesh(new THREE.BoxGeometry(0.3 * scale, 0.2 * scale, 2.5 * scale), matDark);
      bogey.position.set(dx * scale, 0.1 * scale, 0);
      bogey.castShadow = true;
      g.add(bogey);
    }

    // 2. Main Portal Legs
    for (const dx of [-0.5, 0.5]) {
      for (const dz of [-0.8, 0.8]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.15 * scale, 3.5 * scale, 0.15 * scale), matBlue);
        leg.position.set(dx * scale, 1.85 * scale, dz * scale);
        leg.castShadow = true;
        g.add(leg);
      }
    }

    // 3. Diagonal Bracing
    for (const dx of [-0.5, 0.5]) {
      const braceGeo = new THREE.CylinderGeometry(0.05 * scale, 0.05 * scale, 2.2 * scale, 4);
      const brace1 = new THREE.Mesh(braceGeo, matBlue);
      brace1.position.set(dx * scale, 1.85 * scale, 0);
      brace1.rotation.x = Math.PI / 4;
      g.add(brace1);

      const brace2 = new THREE.Mesh(braceGeo, matBlue);
      brace2.position.set(dx * scale, 1.85 * scale, 0);
      brace2.rotation.x = -Math.PI / 4;
      g.add(brace2);
    }

    // 4. Main Girder / Boom (Extends over sea +Z and land -Z)
    const girder = new THREE.Mesh(new THREE.BoxGeometry(0.4 * scale, 0.3 * scale, 8.0 * scale), matWhite);
    girder.position.set(0, 3.7 * scale, 1.5 * scale);
    girder.castShadow = true;
    g.add(girder);

    // 5. Upper A-frame / Apex
    for (const dx of [-0.3, 0.3]) {
      const apexLeg1 = new THREE.Mesh(new THREE.CylinderGeometry(0.06 * scale, 0.08 * scale, 2.0 * scale, 4), matBlue);
      apexLeg1.position.set(dx * scale, 4.6 * scale, -0.6 * scale);
      apexLeg1.rotation.x = Math.PI / 8;
      g.add(apexLeg1);

      const apexLeg2 = new THREE.Mesh(new THREE.CylinderGeometry(0.06 * scale, 0.08 * scale, 2.0 * scale, 4), matBlue);
      apexLeg2.position.set(dx * scale, 4.6 * scale, 0.6 * scale);
      apexLeg2.rotation.x = -Math.PI / 8;
      g.add(apexLeg2);
    }
    const apexTop = new THREE.Mesh(new THREE.BoxGeometry(0.8 * scale, 0.2 * scale, 0.2 * scale), matBlue);
    apexTop.position.set(0, 5.5 * scale, 0);
    g.add(apexTop);

    // 6. Tension Cables
    for (const dx of [-0.35, 0.35]) {
      const cableFront = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(dx * scale, 5.5 * scale, 0),
        new THREE.Vector3(dx * scale, 3.85 * scale, 4.5 * scale)
      ]), matCable);
      g.add(cableFront);

      const cableBack = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(dx * scale, 5.5 * scale, 0),
        new THREE.Vector3(dx * scale, 3.85 * scale, -2.0 * scale)
      ]), matCable);
      g.add(cableBack);
    }

    // 7. Machinery House (Landside)
    const engineHouse = new THREE.Mesh(new THREE.BoxGeometry(0.8 * scale, 0.6 * scale, 1.2 * scale), matDark);
    engineHouse.position.set(0, 4.1 * scale, -2.0 * scale);
    engineHouse.castShadow = true;
    g.add(engineHouse);

    // 8. Trolley & Spreader (Waterside)
    const trolley = new THREE.Group();
    const trolleyBox = new THREE.Mesh(new THREE.BoxGeometry(0.5 * scale, 0.15 * scale, 0.6 * scale), matDark);
    trolleyBox.position.set(0, 3.5 * scale, 3.5 * scale);
    trolley.add(trolleyBox);

    const spreader = new THREE.Mesh(new THREE.BoxGeometry(0.6 * scale, 0.1 * scale, 0.2 * scale), matDark);
    spreader.position.set(0, 1.5 * scale, 3.5 * scale);
    trolley.add(spreader);

    for (const dx of [-0.2, 0.2]) {
      const hoist = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(dx * scale, 3.4 * scale, 3.5 * scale),
        new THREE.Vector3(dx * scale, 1.55 * scale, 3.5 * scale)
      ]), matCable);
      trolley.add(hoist);
    }

    // Operator Cabin
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.2 * scale, 0.25 * scale, 0.2 * scale), new THREE.MeshStandardMaterial({ color: 0xeab308 }));
    cabin.position.set(0, 3.3 * scale, 3.3 * scale);
    trolley.add(cabin);

    g.add(trolley);

    g.position.set(x, y, z);
    g.rotation.y = rotY;
    this.scene.add(g);
    return g;
  }

  // ── Ship at berth ──────────────────────────────────────────────────────────
  buildShip(
    id: string,
    berth: BerthInfo,
    name: string,
    isTarget: boolean,
  ) {
    const g = new THREE.Group();
    const seaPt = getSeaPoint(berth, 0.10);
    const wp = n2world(seaPt.x, seaPt.y);
    const cranePt = getSeaPoint(berth, -0.015);
    const landWp = n2world(cranePt.x, cranePt.y);

    // ─── SCALE & PRIMARY DIMENSIONS ────────────────────────────────────────────
    // Real Panamax-class container ship proportions: ~294 m LOA, 32 m beam, 12 m draft
    const scaleF = 2.5;
    const L = 8.0 * scaleF;   // Length overall
    const W = 1.2 * scaleF;   // Beam
    const DR = 0.6 * scaleF;   // Draft (total hull height)

    if (isTarget) {

      // ─── MATERIALS ─────────────────────────────────────────────────────────
      const hullMat = new THREE.MeshStandardMaterial({ color: 0x1a1f2e, roughness: 0.85, metalness: 0.35, side: THREE.DoubleSide });
      const bootTopMat = new THREE.MeshStandardMaterial({ color: 0x8b0000, roughness: 0.9, metalness: 0.1 }); // Anti-fouling red
      const deckMat = new THREE.MeshStandardMaterial({ color: 0x2d3748, roughness: 1.0, metalness: 0.0 });
      const supMat = new THREE.MeshStandardMaterial({ color: 0xe8e0d0, roughness: 0.5, metalness: 0.1 }); // Off-white
      const winMat = new THREE.MeshStandardMaterial({ color: 0x0a1628, roughness: 0.1, metalness: 0.3 });
      const metalMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.4, metalness: 0.8 });
      const darkMetalMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.6, metalness: 0.7 });
      const funnelMat = new THREE.MeshStandardMaterial({ color: 0x1e3a5f, roughness: 0.7, metalness: 0.2 }); // Deep navy funnel
      const yellowMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.6, metalness: 0.2 });
      const redLightMat = new THREE.MeshStandardMaterial({ color: 0xff2020, roughness: 0.3, metalness: 0.1, emissive: 0xff0000, emissiveIntensity: 0.6 });
      const greenLightMat = new THREE.MeshStandardMaterial({ color: 0x00ff40, roughness: 0.3, metalness: 0.1, emissive: 0x00ff40, emissiveIntensity: 0.6 });
      const whiteLightMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.1, emissive: 0xffffff, emissiveIntensity: 0.8 });
      const rustMat = new THREE.MeshStandardMaterial({ color: 0x7c3515, roughness: 1.0, metalness: 0.0 });

      // ─── HULL GEOMETRY (lofted cross-section mesh) ─────────────────────────
      // We define cross-sections along the ship's X axis (stern → bow) and loft
      // between them, producing a fully closed watertight hull body.
      //
      // Each cross-section is an oval ring: halfWidth (Z) × halfHeight (Y).
      // Keel is at Y = 0, deck rail is at Y = DR.

      const waterlineY = DR * 0.38;

      // Station table: [xFraction, halfW (z), topY, botY]
      // xFraction is -0.5 (stern) → +0.5 (bow), centred on midship
      const stations: Array<[number, number, number, number]> = [
        [-0.500, W * 0.000, DR * 0.85, DR * 0.00], // stern centreline (transom point)
        [-0.480, W * 0.220, DR * 0.90, DR * 0.00],
        [-0.460, W * 0.420, DR * 0.97, DR * 0.01],
        [-0.420, W * 0.480, DR * 1.00, DR * 0.00],
        [-0.300, W * 0.500, DR * 1.00, DR * 0.00], // full parallel body
        [0.000, W * 0.500, DR * 1.00, DR * 0.00],
        [0.300, W * 0.500, DR * 1.00, DR * 0.00],
        [0.380, W * 0.470, DR * 0.99, DR * 0.00],
        [0.420, W * 0.420, DR * 0.96, DR * 0.01],
        [0.450, W * 0.330, DR * 0.90, DR * 0.03],
        [0.470, W * 0.200, DR * 0.82, DR * 0.06],
        [0.490, W * 0.080, DR * 0.70, DR * 0.10],
        [0.500, W * 0.000, DR * 0.55, DR * 0.15], // bow stem point
      ];

      // Segments around each cross-section ring (must be even for port/stbd symmetry)
      const RING_SEGS = 16;

      // Build per-station ring vertices
      // Ring goes: bottom (keel) → starboard side → top (deck edge) → port side → back
      const buildRingVerts = (halfW: number, topY: number, botY: number): THREE.Vector3[] => {
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i <= RING_SEGS; i++) {
          const t = i / RING_SEGS;         // 0 → 1
          const angle = Math.PI * 2 * t;   // full circle
          // Ellipse: z from -halfW to +halfW, y from botY (bottom) to topY (top)
          const halfH = (topY - botY) / 2;
          const cy = botY + halfH;
          const z = halfW * Math.sin(angle);
          // Hull bottom is flatter than sides — squash the bottom arc
          const rawY = Math.cos(angle);
          // Flatten keel: compress downward half
          const yFlat = rawY < 0 ? rawY * 0.55 : rawY;
          const y = cy + halfH * yFlat;
          pts.push(new THREE.Vector3(0, y, z));
        }
        return pts;
      };

      // Collect all rings with their X positions
      const rings: { x: number; verts: THREE.Vector3[] }[] = stations.map(
        ([xFrac, hw, ty, by]) => ({
          x: xFrac * L,
          verts: buildRingVerts(hw, ty, by),
        })
      );

      // Loft: build quad strip between consecutive rings
      const positions: number[] = [];
      const normals: number[] = [];
      const indices: number[] = [];
      let vertCount = 0;

      const addQuad = (
        a: THREE.Vector3, b: THREE.Vector3,
        c: THREE.Vector3, d: THREE.Vector3
      ) => {
        // Two triangles: a-b-c and a-c-d
        // Normal via cross product
        const ab = new THREE.Vector3().subVectors(b, a);
        const ac = new THREE.Vector3().subVectors(c, a);
        const n = new THREE.Vector3().crossVectors(ab, ac).normalize();

        for (const v of [a, b, c, d]) {
          positions.push(v.x, v.y, v.z);
          normals.push(n.x, n.y, n.z);
        }
        const base = vertCount;
        // Fix winding order so normals face OUTWARD
        indices.push(base, base + 2, base + 1);
        indices.push(base, base + 3, base + 2);
        vertCount += 4;
      };

      for (let s = 0; s < rings.length - 1; s++) {
        const rA = rings[s];
        const rB = rings[s + 1];
        const N = RING_SEGS; // number of segments per ring

        for (let i = 0; i < N; i++) {
          const i1 = i + 1;
          const A = new THREE.Vector3(rA.x, rA.verts[i].y, rA.verts[i].z);
          const B = new THREE.Vector3(rA.x, rA.verts[i1].y, rA.verts[i1].z);
          const C = new THREE.Vector3(rB.x, rB.verts[i1].y, rB.verts[i1].z);
          const D = new THREE.Vector3(rB.x, rB.verts[i].y, rB.verts[i].z);
          addQuad(A, B, C, D);
        }
      }

      // Cap the stern transom (first ring — it's near-zero size so a fan suffices)
      // Cap the bow stem (last ring — same)
      const capRing = (ring: { x: number; verts: THREE.Vector3[] }) => {
        const cx = ring.x;
        const cy = ring.verts.reduce((s, v) => s + v.y, 0) / ring.verts.length;
        const cz = 0;
        const centre = new THREE.Vector3(cx, cy, cz);
        for (let i = 0; i < RING_SEGS; i++) {
          const v0 = new THREE.Vector3(cx, ring.verts[i].y, ring.verts[i].z);
          const v1 = new THREE.Vector3(cx, ring.verts[i + 1].y, ring.verts[i + 1].z);
          // Fan triangle
          const ab = new THREE.Vector3().subVectors(v1, v0);
          const ac = new THREE.Vector3().subVectors(centre, v0);
          const n = new THREE.Vector3().crossVectors(ab, ac).normalize();
          for (const v of [v0, v1, centre]) {
            positions.push(v.x, v.y, v.z);
            normals.push(n.x, n.y, n.z);
          }
          // Fix winding order for caps
          indices.push(vertCount, vertCount + 2, vertCount + 1);
          vertCount += 3;
        }
      };
      capRing(rings[0]);                    // stern
      capRing(rings[rings.length - 1]);     // bow

      const hullGeo = new THREE.BufferGeometry();
      hullGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      hullGeo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
      hullGeo.setIndex(indices);
      hullGeo.computeVertexNormals(); // smooth shading

      const hull = new THREE.Mesh(hullGeo, hullMat);
      hull.castShadow = true;
      hull.receiveShadow = true;
      g.add(hull);

      // ─── BOOT-TOP (ANTI-FOULING) BAND ──────────────────────────────────────
      // A flat red band at the waterline (bottom ~35% of freeboard)
      const bootH = DR * 0.12;

      const bootShape = new THREE.Shape();
      bootShape.moveTo(-L * 0.44, waterlineY - bootH);
      bootShape.lineTo(-L * 0.44, waterlineY);
      bootShape.lineTo(L * 0.47, waterlineY);
      bootShape.lineTo(L * 0.49, waterlineY - bootH * 0.5);
      bootShape.lineTo(L * 0.47, waterlineY - bootH);
      bootShape.lineTo(-L * 0.44, waterlineY - bootH);

      const bootGeo = new THREE.ExtrudeGeometry(bootShape, { depth: W * 1.001, bevelEnabled: false });
      // Do NOT rotateX here; keep shape in XY plane so it wraps the sides
      bootGeo.translate(0, 0, -W * 0.5005);
      const bootMesh = new THREE.Mesh(bootGeo, bootTopMat);
      bootMesh.position.y = 0.001; // tiny z-fight offset
      g.add(bootMesh);

      // ─── HULL STRIPE (COMPANY COLORS) ──────────────────────────────────────
      const stripeH = DR * 0.05;
      const stripeY = waterlineY + DR * 0.08;
      const stripeMat = new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.8 }); // Blue stripe

      const stripeShape = new THREE.Shape();
      stripeShape.moveTo(-L * 0.44, stripeY);
      stripeShape.lineTo(-L * 0.44, stripeY + stripeH);
      stripeShape.lineTo(L * 0.46, stripeY + stripeH);
      stripeShape.lineTo(L * 0.47, stripeY);
      stripeShape.lineTo(-L * 0.44, stripeY);

      const stripeGeo = new THREE.ExtrudeGeometry(stripeShape, { depth: W * 1.002, bevelEnabled: false });
      // Do NOT rotateX here; keep shape in XY plane
      stripeGeo.translate(0, 0, -W * 0.501);
      g.add(new THREE.Mesh(stripeGeo, stripeMat));

      // ─── BULBOUS BOW ───────────────────────────────────────────────────────
      const bulbGeo = new THREE.SphereGeometry(W * 0.18, 16, 12);
      bulbGeo.scale(2.2, 0.9, 1.0);
      const bulb = new THREE.Mesh(bulbGeo, bootTopMat);
      bulb.position.set(L * 0.50, waterlineY - DR * 0.08, 0);
      g.add(bulb);

      // ─── DECK SURFACE ──────────────────────────────────────────────────────
      const deckY = DR + 0.005 * scaleF;

      const deckShape = new THREE.Shape();
      deckShape.moveTo(-L * 0.45, -W * 0.48);
      deckShape.lineTo(-L * 0.45, W * 0.48);
      deckShape.lineTo(L * 0.34, W * 0.48);
      deckShape.lineTo(L * 0.48, 0);
      deckShape.lineTo(L * 0.34, -W * 0.48);
      deckShape.lineTo(-L * 0.45, -W * 0.48);

      const deckGeo = new THREE.ExtrudeGeometry(deckShape, { depth: 0.03 * scaleF, bevelEnabled: false });
      deckGeo.rotateX(Math.PI / 2);
      const deck = new THREE.Mesh(deckGeo, deckMat);
      deck.position.y = deckY;
      deck.castShadow = true;
      g.add(deck);

      // ─── HATCH COVERS (cargo hold lids) ────────────────────────────────────
      // Real container ships have bay hatch covers between cell guides
      const hatchMat = new THREE.MeshStandardMaterial({ color: 0x3d4f63, roughness: 0.9, metalness: 0.15 });
      const hatchW = W * 0.78;
      const hatchH = 0.04 * scaleF;
      const hatchCount = 7;
      const hatchSpacing = L * 0.78 / hatchCount;
      const hatchStartX = -L * 0.28;

      for (let h = 0; h < hatchCount; h++) {
        const hatchLen = hatchSpacing * 0.88;
        const hatchGeo = new THREE.BoxGeometry(hatchLen, hatchH, hatchW);
        const hatch = new THREE.Mesh(hatchGeo, hatchMat);
        hatch.position.set(hatchStartX + h * hatchSpacing, deckY + hatchH / 2, 0);
        hatch.castShadow = true;
        g.add(hatch);

        // Hatch coaming (raised rim around each hold opening)
        const coamH = 0.06 * scaleF;
        const coamMat = new THREE.MeshStandardMaterial({ color: 0x4a5568, roughness: 0.8, metalness: 0.3 });
        for (const [ox, oz, sx, sz] of [
          [0, hatchW / 2 + 0.01 * scaleF, hatchLen + 0.04 * scaleF, 0.03 * scaleF],
          [0, -hatchW / 2 - 0.01 * scaleF, hatchLen + 0.04 * scaleF, 0.03 * scaleF],
          [hatchLen / 2 + 0.01 * scaleF, 0, 0.03 * scaleF, hatchW],
          [-hatchLen / 2 - 0.01 * scaleF, 0, 0.03 * scaleF, hatchW],
        ] as [number, number, number, number][]) {
          const coam = new THREE.Mesh(new THREE.BoxGeometry(sx, coamH, sz), coamMat);
          coam.position.set(hatchStartX + h * hatchSpacing + ox, deckY + coamH / 2, oz);
          g.add(coam);
        }
      }

      // ─── CONTAINERS ────────────────────────────────────────────────────────
      const bays = 14;
      const rows = 6;
      const tiers = 5;
      const totalCont = bays * rows * tiers;

      const cw = 0.23 * scaleF;  // container length along ship axis
      const ch = 0.11 * scaleF;  // container height
      const cd = 0.115 * scaleF; // container width (across beam)

      const contGeo = createContainerGeometry(cw, ch, cd);
      const matCols = CONTAINER_COLORS.map(c =>
        new THREE.MeshStandardMaterial({ color: c, map: CONTAINER_TEX, roughness: 0.8 })
      );

      const instMeshes = matCols.map((_, i) => {
        const im = new THREE.InstancedMesh(contGeo, matCols[i], totalCont);
        im.castShadow = true; im.receiveShadow = true; im.count = 0;
        return im;
      });

      const holdStartX = -L * 0.28;
      const holdEndX = L * 0.28;
      const holdCenterX = (holdStartX + holdEndX) / 2;
      const contGroupLength = bays * (cw + 0.012 * scaleF);
      const contGroupWidth = rows * (cd + 0.012 * scaleF);
      const startX = holdCenterX - contGroupLength / 2 + cw / 2;
      const startZ = -contGroupWidth / 2 + cd / 2;
      const baseY = deckY + hatchH + ch / 2;

      const dummy = new THREE.Object3D();
      for (let b = 0; b < bays; b++) {
        for (let r = 0; r < rows; r++) {
          for (let t = 0; t < tiers; t++) {
            // Realistic load pattern — lower tiers fuller, top tier sparse
            const fillProb = t === 0 ? 0.90 : t === 1 ? 0.85 : t === 2 ? 0.70 : t === 3 ? 0.45 : 0.20;
            if (Math.random() > fillProb) continue;

            const colIdx = Math.floor(Math.random() * matCols.length);
            const im = instMeshes[colIdx];
            dummy.position.set(
              startX + b * (cw + 0.012 * scaleF),
              baseY + t * (ch + 0.005 * scaleF),
              startZ + r * (cd + 0.012 * scaleF)
            );
            dummy.rotation.y = Math.random() < 0.02 ? Math.PI / 2 : 0; // rare odd-angle
            dummy.updateMatrix();
            im.setMatrixAt(im.count, dummy.matrix);
            im.count++;
          }
        }
      }

      instMeshes.forEach((im, idx) => {
        im.material = matCols[idx];
        im.instanceMatrix.needsUpdate = true;
        g.add(im);
      });

      // ─── CELL GUIDES (vertical posts between container bays) ───────────────
      for (let b = 0; b <= bays; b++) {
        for (const side of [-1, 1]) {
          const guideGeo = new THREE.BoxGeometry(0.015 * scaleF, ch * tiers * 1.1, 0.015 * scaleF);
          const guide = new THREE.Mesh(guideGeo, metalMat);
          guide.position.set(
            startX + b * (cw + 0.012 * scaleF) - cw / 2,
            baseY + ch * tiers * 0.55,
            side * contGroupWidth * 0.52
          );
          g.add(guide);
        }
      }

      // ─── DECK RAILS / SAFETY RAILING ──────────────────────────────────────
      // Port and starboard railings running the ship length
      const railMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.6, metalness: 0.5 });
      const railH = 0.07 * scaleF;
      const postSpacing = L * 0.04;
      const postCount = Math.floor(L * 0.85 / postSpacing);

      for (const side of [-1, 1]) {
        const railZ = side * (W * 0.46);
        // Top rail (horizontal pipe)
        const railGeo = new THREE.CylinderGeometry(0.008 * scaleF, 0.008 * scaleF, L * 0.88, 6);
        railGeo.rotateZ(Math.PI / 2);
        const rail = new THREE.Mesh(railGeo, railMat);
        rail.position.set(-L * 0.00, deckY + railH, railZ);
        g.add(rail);

        // Mid rail
        const midRailGeo = new THREE.CylinderGeometry(0.006 * scaleF, 0.006 * scaleF, L * 0.88, 6);
        midRailGeo.rotateZ(Math.PI / 2);
        const midRail = new THREE.Mesh(midRailGeo, railMat);
        midRail.position.set(0, deckY + railH * 0.55, railZ);
        g.add(midRail);

        // Vertical posts
        for (let p = 0; p < postCount; p++) {
          const postGeo = new THREE.CylinderGeometry(0.007 * scaleF, 0.007 * scaleF, railH, 6);
          const post = new THREE.Mesh(postGeo, railMat);
          post.position.set(-L * 0.44 + p * postSpacing, deckY + railH / 2, railZ);
          g.add(post);
        }
      }

      // ─── MOORING BOLLARDS ─────────────────────────────────────────────────
      const bollardMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.7 });
      const bollardPositions: [number, number][] = [
        [-L * 0.42, -W * 0.44], [-L * 0.42, W * 0.44],
        [-L * 0.20, -W * 0.44], [-L * 0.20, W * 0.44],
        [L * 0.10, -W * 0.44], [L * 0.10, W * 0.44],
        [L * 0.30, -W * 0.44], [L * 0.30, W * 0.44],
      ];

      for (const [bx, bz] of bollardPositions) {
        const bBase = new THREE.Mesh(
          new THREE.CylinderGeometry(0.035 * scaleF, 0.04 * scaleF, 0.08 * scaleF, 8),
          bollardMat
        );
        bBase.position.set(bx, deckY + 0.04 * scaleF, bz);
        g.add(bBase);
        const bTop = new THREE.Mesh(
          new THREE.SphereGeometry(0.04 * scaleF, 8, 6),
          bollardMat
        );
        bTop.position.set(bx, deckY + 0.11 * scaleF, bz);
        g.add(bTop);
      }

      // ─── ANCHOR CHAIN HAWSE PIPES ─────────────────────────────────────────
      for (const side of [-1, 1]) {
        const hawseGeo = new THREE.TorusGeometry(0.04 * scaleF, 0.018 * scaleF, 8, 12);
        const hawse = new THREE.Mesh(hawseGeo, darkMetalMat);
        hawse.rotation.x = Math.PI / 4;
        hawse.position.set(L * 0.42, DR * 0.85, side * W * 0.28);
        g.add(hawse);
      }

      // Anchor (simplified fluke shape)
      for (const side of [-1, 1]) {
        const anchorBody = new THREE.Mesh(
          new THREE.CylinderGeometry(0.02 * scaleF, 0.015 * scaleF, 0.25 * scaleF, 6),
          darkMetalMat
        );
        anchorBody.rotation.z = Math.PI * 0.2;
        anchorBody.position.set(L * 0.44, DR * 0.65, side * W * 0.28);
        g.add(anchorBody);

        const fluke = new THREE.Mesh(
          new THREE.BoxGeometry(0.12 * scaleF, 0.04 * scaleF, 0.04 * scaleF),
          darkMetalMat
        );
        fluke.position.set(L * 0.44 + 0.05 * scaleF, DR * 0.55, side * W * 0.28);
        g.add(fluke);
      }

      // ─── STERN DETAIL ─────────────────────────────────────────────────────
      // Stern ramp / transom platform
      const sternPlatGeo = new THREE.BoxGeometry(0.4 * scaleF, 0.03 * scaleF, W * 0.7);
      const sternPlat = new THREE.Mesh(sternPlatGeo, deckMat);
      sternPlat.position.set(-L * 0.46, deckY, 0);
      g.add(sternPlat);

      // Rudder (just visible below waterline)
      const rudderGeo = new THREE.BoxGeometry(0.05 * scaleF, DR * 0.35, 0.35 * scaleF);
      const rudder = new THREE.Mesh(rudderGeo, darkMetalMat);
      rudder.position.set(-L * 0.46, waterlineY - DR * 0.1, 0);
      g.add(rudder);

      // Propeller (disc approximation)
      const propGeo = new THREE.CylinderGeometry(0.22 * scaleF, 0.22 * scaleF, 0.06 * scaleF, 5);
      const prop = new THREE.Mesh(propGeo, darkMetalMat);
      prop.rotation.x = Math.PI / 2;
      prop.position.set(-L * 0.46, waterlineY - DR * 0.15, 0);
      g.add(prop);

      // ─── SUPERSTRUCTURE ───────────────────────────────────────────────────
      // Real location: aft of amidships (about 75-80% back toward stern)
      const supX = -L * 0.34;
      const supBase = deckY + 0.03 * scaleF;
      const supW = W * 0.92;
      const supGroup = new THREE.Group();
      supGroup.position.set(supX, supBase, 0);

      // Deck house tiers (5 decks: engine casing, D-deck, C-deck, B-deck, bridge)
      const tiers_sup = [
        { w: 1.1 * scaleF, h: 0.28 * scaleF, d: supW, y: 0 },           // Main deck house
        { w: 0.95 * scaleF, h: 0.26 * scaleF, d: supW * 0.95, y: 0.28 * scaleF }, // D-deck
        { w: 0.82 * scaleF, h: 0.26 * scaleF, d: supW * 0.90, y: 0.54 * scaleF }, // C-deck
        { w: 0.70 * scaleF, h: 0.26 * scaleF, d: supW * 0.88, y: 0.80 * scaleF }, // B-deck
        { w: 0.62 * scaleF, h: 0.28 * scaleF, d: supW * 0.85, y: 1.06 * scaleF }, // Bridge deck
      ];

      for (const tier of tiers_sup) {
        const tierMesh = new THREE.Mesh(
          new THREE.BoxGeometry(tier.w, tier.h, tier.d),
          supMat
        );
        tierMesh.position.set(0, tier.y + tier.h / 2, 0);
        tierMesh.castShadow = true;
        supGroup.add(tierMesh);

        // Window strip on each tier (forward face)
        const winH = tier.h * 0.45;
        const winGeo = new THREE.BoxGeometry(tier.w * 0.72, winH, 0.01);
        const win = new THREE.Mesh(winGeo, winMat);
        win.position.set(tier.w * 0.25, tier.y + tier.h * 0.55, tier.d / 2 + 0.005);
        supGroup.add(win);

        // Porthole row on aft face
        for (let pw = 0; pw < 4; pw++) {
          const portGeo = new THREE.CylinderGeometry(0.025 * scaleF, 0.025 * scaleF, 0.01, 12);
          portGeo.rotateX(Math.PI / 2);
          const port = new THREE.Mesh(portGeo, winMat);
          port.position.set(tier.w * 0.1 - pw * 0.15 * scaleF, tier.y + tier.h * 0.5, -tier.d / 2 - 0.005);
          supGroup.add(port);
        }
      }

      // Bridge wings (port and starboard overhangs)
      const bridgeTier = tiers_sup[4];
      for (const side of [-1, 1]) {
        const wingW = 0.35 * scaleF;
        const wing = new THREE.Mesh(
          new THREE.BoxGeometry(bridgeTier.w * 0.55, bridgeTier.h, wingW),
          supMat
        );
        wing.position.set(0, bridgeTier.y + bridgeTier.h / 2, side * (supW / 2 + wingW / 2));
        wing.castShadow = true;
        supGroup.add(wing);

        // Bridge wing railing
        const wingRailGeo = new THREE.CylinderGeometry(0.006 * scaleF, 0.006 * scaleF, wingW, 4);
        wingRailGeo.rotateZ(Math.PI / 2);
        const wingRail = new THREE.Mesh(wingRailGeo, railMat);
        wingRail.position.set(0, bridgeTier.y + bridgeTier.h + 0.06 * scaleF, side * (supW / 2 + wingW / 2));
        supGroup.add(wingRail);

        // Navigation light (port = red, starboard = green)
        const navLight = new THREE.Mesh(
          new THREE.SphereGeometry(0.025 * scaleF, 8, 6),
          side < 0 ? greenLightMat : redLightMat
        );
        navLight.position.set(bridgeTier.w * 0.28, bridgeTier.y + bridgeTier.h * 0.7, side * (supW / 2 + wingW + 0.02 * scaleF));
        supGroup.add(navLight);
      }

      // ─── FUNNEL ───────────────────────────────────────────────────────────
      // Slightly aft of superstructure, classic tapered smokestack
      const funnelX = -0.2 * scaleF;
      const funnelBaseY = bridgeTier.y + bridgeTier.h;
      const funnelBase = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18 * scaleF, 0.22 * scaleF, 0.65 * scaleF, 12),
        funnelMat
      );
      funnelBase.position.set(funnelX, funnelBaseY + 0.325 * scaleF, 0);
      supGroup.add(funnelBase);

      // Funnel cap / exhaust collar
      const funnelCap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.20 * scaleF, 0.19 * scaleF, 0.08 * scaleF, 12),
        darkMetalMat
      );
      funnelCap.position.set(funnelX, funnelBaseY + 0.69 * scaleF, 0);
      supGroup.add(funnelCap);

      // Company logo band on funnel (yellow stripe)
      const funnelBand = new THREE.Mesh(
        new THREE.CylinderGeometry(0.185 * scaleF, 0.205 * scaleF, 0.12 * scaleF, 12),
        yellowMat
      );
      funnelBand.position.set(funnelX, funnelBaseY + 0.2 * scaleF, 0);
      supGroup.add(funnelBand);

      // ─── MAST & ANTENNA ARRAY ─────────────────────────────────────────────
      const mastBaseY = bridgeTier.y + bridgeTier.h;
      const mastX = 0.15 * scaleF;

      // Fore mast
      const mastGeo = new THREE.CylinderGeometry(0.015 * scaleF, 0.02 * scaleF, 1.2 * scaleF, 6);
      const mast = new THREE.Mesh(mastGeo, metalMat);
      mast.position.set(mastX, mastBaseY + 0.6 * scaleF, 0);
      supGroup.add(mast);

      // Radar scanner (dish)
      const radarArm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.008 * scaleF, 0.008 * scaleF, 0.5 * scaleF, 6),
        metalMat
      );
      radarArm.rotation.z = Math.PI / 2;
      radarArm.position.set(mastX, mastBaseY + 1.15 * scaleF, 0);
      supGroup.add(radarArm);

      const radarDish = new THREE.Mesh(
        new THREE.BoxGeometry(0.45 * scaleF, 0.06 * scaleF, 0.1 * scaleF),
        darkMetalMat
      );
      radarDish.position.set(mastX, mastBaseY + 1.15 * scaleF, 0);
      supGroup.add(radarDish);

      // Masthead light
      const mastheadLight = new THREE.Mesh(
        new THREE.SphereGeometry(0.022 * scaleF, 8, 6),
        whiteLightMat
      );
      mastheadLight.position.set(mastX, mastBaseY + 1.22 * scaleF, 0);
      supGroup.add(mastheadLight);

      // VHF antennas (thin vertical rods)
      for (let i = 0; i < 3; i++) {
        const ant = new THREE.Mesh(
          new THREE.CylinderGeometry(0.004 * scaleF, 0.004 * scaleF, 0.4 * scaleF, 4),
          metalMat
        );
        ant.position.set(mastX + (i - 1) * 0.1 * scaleF, mastBaseY + 1.3 * scaleF, (i - 1) * 0.05 * scaleF);
        supGroup.add(ant);
      }

      g.add(supGroup);

      // ─── FOREMAST ─────────────────────────────────────────────────────────
      // Separate foremast near the bow (for navigation lights)
      const foremastGeo = new THREE.CylinderGeometry(0.013 * scaleF, 0.018 * scaleF, 0.9 * scaleF, 6);
      const foremast = new THREE.Mesh(foremastGeo, metalMat);
      foremast.position.set(L * 0.36, deckY + 0.45 * scaleF, 0);
      g.add(foremast);

      // Foremast crosstree
      const crossTree = new THREE.Mesh(
        new THREE.CylinderGeometry(0.006 * scaleF, 0.006 * scaleF, 0.55 * scaleF, 4),
        metalMat
      );
      crossTree.rotation.z = Math.PI / 2;
      crossTree.position.set(L * 0.36, deckY + 0.78 * scaleF, 0);
      g.add(crossTree);

      // Foremast nav light
      const foreNav = new THREE.Mesh(
        new THREE.SphereGeometry(0.018 * scaleF, 8, 6),
        whiteLightMat
      );
      foreNav.position.set(L * 0.36, deckY + 0.92 * scaleF, 0);
      g.add(foreNav);

      // ─── DECK EQUIPMENT ───────────────────────────────────────────────────
      // Windlass (winch at bow for anchor chains)
      const windlassMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.7, metalness: 0.6 });
      const windlass = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05 * scaleF, 0.05 * scaleF, W * 0.35, 10),
        windlassMat
      );
      windlass.rotation.x = Math.PI / 2;
      windlass.position.set(L * 0.38, deckY + 0.06 * scaleF, 0);
      g.add(windlass);

      // Mooring winches (port & stbd, fore & aft)
      const winchPositions: [number, number][] = [
        [-L * 0.35, W * 0.40],
        [-L * 0.35, -W * 0.40],
        [L * 0.25, W * 0.40],
        [L * 0.25, -W * 0.40],
      ];
      for (const [wx, wz] of winchPositions) {
        const winch = new THREE.Mesh(
          new THREE.CylinderGeometry(0.04 * scaleF, 0.04 * scaleF, 0.12 * scaleF, 8),
          windlassMat
        );
        winch.rotation.x = Math.PI / 2;
        winch.position.set(wx, deckY + 0.06 * scaleF, wz);
        g.add(winch);
      }

      // Ventilator cowls (mushroom vents along deck)
      for (let v = 0; v < 6; v++) {
        for (const side of [-1, 1]) {
          const ventStem = new THREE.Mesh(
            new THREE.CylinderGeometry(0.025 * scaleF, 0.025 * scaleF, 0.12 * scaleF, 8),
            darkMetalMat
          );
          ventStem.position.set(
            holdStartX + v * (L * 0.78 / 6) + L * 0.02,
            deckY + 0.06 * scaleF,
            side * W * 0.42
          );
          g.add(ventStem);

          const ventCap = new THREE.Mesh(
            new THREE.SphereGeometry(0.04 * scaleF, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2),
            darkMetalMat
          );
          ventCap.position.set(
            holdStartX + v * (L * 0.78 / 6) + L * 0.02,
            deckY + 0.13 * scaleF,
            side * W * 0.42
          );
          g.add(ventCap);
        }
      }

      // ─── RUST STREAKS ─────────────────────────────────────────────────────
      // Subtle rust patches at hawse pipes and scuppers for realism
      for (let rs = 0; rs < 4; rs++) {
        const rsGeo = new THREE.BoxGeometry(0.04 * scaleF, 0.15 * scaleF, 0.015);
        const rsMesh = new THREE.Mesh(rsGeo, rustMat);
        rsMesh.position.set(
          -L * 0.2 + rs * L * 0.15,
          DR * 0.65,
          W * 0.5 + 0.002
        );
        g.add(rsMesh);
      }

      // ─── TARGET UI ────────────────────────────────────────────────────────
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(L * 0.56, L * 0.56 + 0.12 * scaleF, 64),
        new THREE.MeshBasicMaterial({
          color: 0x10b981, transparent: true, opacity: 0.45, side: THREE.DoubleSide,
        })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = -0.1 * scaleF;
      g.add(ring);

      const lbl = makeBillboardLabel(name.toUpperCase(), 32, "#ffffff");
      lbl.position.set(0, DR / 2 + 3.0 * scaleF, 0);
      g.add(lbl);

    } // end isTarget

    // ─── POSITION & REGISTER ────────────────────────────────────────────────
    g.position.set(wp.x, isTarget ? -DR * 0.38 : 0, wp.z); // sink ship to waterline
    g.rotation.y = berthHeadingRad(berth);
    g.userData = { type: "ship", id, bobOffset: Math.random() * Math.PI * 2 };
    this.scene.add(g);
    this.shipMeshes.set(id, g);

    // ─── STS CRANES ─────────────────────────────────────────────────────────
    const crane1 = this.buildStsCrane(0, 0, 0, 0);
    const crane2 = this.buildStsCrane(0, 0, 0, 0);

    this.scene.remove(crane1, crane2);
    g.add(crane1, crane2);

    const landLocal = g.worldToLocal(new THREE.Vector3(landWp.x, 0, landWp.z));
    const offsetAmt = L * 0.18;
    const craneYOffset = isTarget ? DR * 0.38 : 0; // counter-act ship sinking
    crane1.position.set(offsetAmt, craneYOffset, landLocal.z);
    crane2.position.set(-offsetAmt, craneYOffset, landLocal.z);

    const lookZ = landLocal.z > 0 ? Math.PI : 0;
    crane1.rotation.y = lookZ;
    crane2.rotation.y = lookZ;
  }

  // ── Apply container + layout data ─────────────────────────────────────────
  applyData(
    data: VesselHeatmapViewData,
    xmlBlocks: BlockInfo[],
    xmlBerths: BerthInfo[],
    computedMaxBlock: string | null,
    targetBerthId: string,
  ) {
    if (!data?.layout) return;

    // Clear previous block meshes and heat blobs
    this.blockMeshes.forEach(g => this.scene.remove(g));
    this.blockMeshes.clear();
    this.heatBlobs.forEach(({ mesh }) => this.scene.remove(mesh));
    this.heatBlobs = [];
    this.particleSystems.forEach(p => this.scene.remove(p));
    this.particleSystems = [];

    const heatGroups: {
      cx: number; cz: number; bw: number; bd: number; conc: string;
    }[] = [];

    Object.entries(data.layout).forEach(([id, pos]: any) => {
      // Prefer XML block geometry; fall back to normalised layout coords
      const xmlBlk = xmlBlocks.find(b => b.id === id);
      let wpx: number, wpz: number, bw: number, bd: number;

      if (xmlBlk && xmlBlk.cx > 0) {
        const w = n2world(xmlBlk.cx, xmlBlk.cy);
        wpx = w.x; wpz = w.z;
        bw = xmlBlk.w * WORLD_SCALE;
        bd = xmlBlk.h * WORLD_SCALE;
      } else if (pos.w !== undefined) {
        const w = n2world(pos.x, pos.y);
        wpx = w.x; wpz = w.z;
        bw = pos.w * WORLD_SCALE;
        bd = pos.h * WORLD_SCALE;
      } else {
        // Skip ghost / off-screen blocks
        return;
      }

      const blk = (data.blocks || {})[id];
      const isMax = id === computedMaxBlock;
      const hasData = !!blk && blk.count > 0;
      const conc = blk?.concentration ?? "none";

      const g = new THREE.Group();
      const padColor = isMax ? 0xfecaca : hasData ? 0xe2e8f0 : 0x94a3b8;

      // Update environment pad color if it exists, otherwise create a fallback box pad
      if (this.envPads.has(id)) {
        const envPad = this.envPads.get(id)!;
        (envPad.material as THREE.MeshStandardMaterial).color.setHex(padColor);
      } else {
        const pad = new THREE.Mesh(
          new THREE.BoxGeometry(bw, 0.12, bd),
          new THREE.MeshStandardMaterial({ color: padColor, roughness: 0.92 }),
        );
        pad.position.y = 0.06;
        pad.castShadow = true; pad.receiveShadow = true;
        g.add(pad);
      }

      if (hasData) {
        heatGroups.push({ cx: wpx, cz: wpz, bw, bd, conc });
        const count = Math.min(blk.count, 200);
        // Determine realistic container size
        const cW = 0.8, cD = 0.32, cH = 0.35;
        // Calculate how many fit
        const COLS = Math.max(1, Math.floor(bw / (cW * 1.1)));
        const ROWS = Math.max(1, Math.floor(bd / (cD * 1.1)));

        const dummy = new THREE.Object3D();
        const iMesh = new THREE.InstancedMesh(
          createContainerGeometry(cW, cH, cD),
          new THREE.MeshStandardMaterial({ map: CONTAINER_TEX, roughness: 0.7, metalness: 0.2 }),
          count,
        );
        iMesh.castShadow = true; iMesh.receiveShadow = true;
        for (let i = 0; i < count; i++) {
          const tier = Math.floor(i / (COLS * ROWS));
          const idx = i % (COLS * ROWS);
          const col = idx % COLS;
          const row = Math.floor(idx / COLS);

          dummy.position.set(
            -bw / 2 + (cW * 1.1) / 2 + col * (cW * 1.1),
            0.12 + tier * cH + cH / 2,
            -bd / 2 + (cD * 1.1) / 2 + row * (cD * 1.1),
          );
          dummy.updateMatrix();
          iMesh.setMatrixAt(i, dummy.matrix);
          iMesh.setColorAt(i, new THREE.Color(CONTAINER_COLORS[Math.floor(Math.random() * 3)]));
        }
        iMesh.instanceMatrix.needsUpdate = true;
        g.add(iMesh);
      }

      // ID badge
      const badge = makeLabel(id, 26, isMax ? "#b91c1c" : "#334155");
      badge.rotation.x = -Math.PI / 2;
      badge.position.set(-bw * 0.32, 0.2, -bd * 0.34);
      g.add(badge);

      if (hasData) {
        const cntLabel = makeLabel(`${blk.count}`, 24, "#0f172a");
        cntLabel.rotation.x = -Math.PI / 2;
        cntLabel.position.set(bw * 0.3, 0.2, -bd * 0.34);
        g.add(cntLabel);
      }

      g.position.set(wpx, 0, wpz);
      g.userData = { type: "block", id, count: blk?.count ?? 0, concentration: conc };
      this.scene.add(g);
      this.blockMeshes.set(id, g);
    });

    // Heat blobs sorted Low→High so high renders on top
    heatGroups.sort((a, b) => {
      const o = (c: string) => c === "High" ? 3 : c === "Medium" ? 2 : 1;
      return o(a.conc) - o(b.conc);
    });
    heatGroups.forEach(({ cx, cz, bw, bd, conc }) => {
      const isH = conc === "High", isM = conc === "Medium";
      const col = isH ? "#c30010" : isM ? "#fe6a03" : "#008000";
      const spreadX = isH ? 1.3 : isM ? 1.2 : 1.1; // Reduced horizontal spread
      const spreadZ = isH ? 2.6 : isM ? 2.2 : 1.6; // Original vertical spread
      const peakOp = isH ? 1.0 : isM ? 0.85 : 0.75;

      const addBlob = (rx: number, rz: number, op: number, yPos: number, inner = 1.0) => {
        const blob = makeHeatBlob(col, rx, rz, op, inner);
        blob.position.set(cx, yPos, cz);
        this.scene.add(blob);
        this.heatBlobs.push({ mesh: blob, baseOp: op });
      };
      addBlob(bw * spreadX, bd * spreadZ, peakOp * 0.55, 0.06);
      addBlob(bw * spreadX * 0.7, bd * spreadZ * 0.7, peakOp * 0.95, 0.22);
      addBlob(bw * spreadX * 0.4, bd * spreadZ * 0.4, peakOp * 1.0, 0.4, 0.7);

      if (isH || isM) {
        const pCount = isH ? 100 : 60, maxH = isH ? 4.0 : 2.5;
        const posArr = new Float32Array(pCount * 3);
        for (let i = 0; i < pCount; i++) {
          posArr[i * 3] = cx + (Math.random() - 0.5) * bw * 2;
          posArr[i * 3 + 1] = Math.random() * maxH;
          posArr[i * 3 + 2] = cz + (Math.random() - 0.5) * bd * 2;
        }
        const pts = new THREE.Points(
          (() => {
            const gg = new THREE.BufferGeometry();
            gg.setAttribute("position", new THREE.BufferAttribute(posArr, 3));
            return gg;
          })(),
          new THREE.PointsMaterial({
            color: new THREE.Color(col),
            size: 0.1,
            map: PARTICLE_TEX,
            transparent: true,
            opacity: 0.85,
            sizeAttenuation: true,
            depthWrite: false,
          }),
        );
        pts.userData = { maxH, cx, cz, bw, bd };
        this.scene.add(pts);
        this.particleSystems.push(pts);
      }
    });

    // Ships & Cranes — place dynamically at EVERY berth
    this.shipMeshes.forEach(g => this.scene.remove(g));
    this.shipMeshes.clear();

    xmlBerths.forEach(berth => {
      const isTarget = berth.id === targetBerthId;
      const shipName = isTarget ? (data.vessel || "VESSEL") : `CARGO-${berth.id.substring(0, 3)}`;
      this.buildShip(berth.id, berth, shipName, isTarget);
    });
  }

  // ── Hover detection ────────────────────────────────────────────────────────
  checkHover() {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const meshes: THREE.Object3D[] = [];
    this.blockMeshes.forEach(g =>
      meshes.push(
        ...g.children.filter(
          c => c instanceof THREE.Mesh || c instanceof THREE.InstancedMesh,
        ),
      ),
    );
    // Also include environment block pads for hover before data is loaded
    this.envPads.forEach(mesh => meshes.push(mesh));
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

  // ── Animation loop ─────────────────────────────────────────────────────────
  animate() {
    this.animId = requestAnimationFrame(() => this.animate());
    this.timer.update();
    const t = this.timer.getElapsed();

    // Labels now natively maintain constant screen size via sizeAttenuation=false

    // Animate water
    if (this.waterMesh) {
      const pos = this.waterMesh.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const u = pos.getX(i), v = pos.getY(i);
        pos.setZ(i, Math.sin(u * 1.2 + t * 1.8) * 0.06 + Math.cos(v * 1.4 + t * 1.1) * 0.04);
      }
      pos.needsUpdate = true;
      this.waterMesh.geometry.computeVertexNormals();
    }

    // Bob ships
    this.shipMeshes.forEach(g => {
      const off = g.userData.bobOffset || 0;
      g.position.y = Math.sin(t * 1.4 + off) * 0.065;
      g.rotation.x = Math.sin(t * 0.9 + off) * 0.008;
      g.rotation.z = Math.cos(t * 1.1 + off) * 0.007;
    });

    // Pulse heat blobs
    this.heatBlobs.forEach(({ mesh, baseOp }, i) => {
      (mesh.material as THREE.MeshBasicMaterial).opacity =
        baseOp * (0.85 + Math.sin(t * 1.5 + i * 0.42) * 0.15);
    });

    // Rise particles
    this.particleSystems.forEach(pts => {
      const pos = pts.geometry.attributes.position;
      const { maxH, cx, cz, bw, bd } = pts.userData;
      for (let i = 0; i < pos.count; i++) {
        let y = pos.getY(i) + 0.013 + Math.random() * 0.004;
        if (y > maxH) {
          y = 0;
          pos.setX(i, cx + (Math.random() - 0.5) * bw * 2);
          pos.setZ(i, cz + (Math.random() - 0.5) * bd * 2);
        }
        pos.setY(i, y);
      }
      pos.needsUpdate = true;
    });

    this.checkHover();
    this.renderer.render(this.scene, this.camera);
  }

  // ── Input events ───────────────────────────────────────────────────────────
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
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      if (!this.isDragging) return;
      const dx = e.clientX - this.lastMouse.x, dy = e.clientY - this.lastMouse.y;
      this.lastMouse = { x: e.clientX, y: e.clientY };
      if (this.isRightDrag) {
        const sp = this.radius * 0.0014;
        const right = new THREE.Vector3().crossVectors(
          this.camera.up, this.camera.position.clone().sub(this.target),
        ).normalize();
        this.target.addScaledVector(right, -dx * sp);
        const fwd = new THREE.Vector3(0, 0, 1).applyAxisAngle(
          new THREE.Vector3(0, 1, 0), this.theta,
        );
        this.target.addScaledVector(fwd, -dy * sp);
      } else {
        this.theta -= dx * 0.007;
        this.phi = Math.max(0.1, Math.min(Math.PI / 2 - 0.01, this.phi - dy * 0.005));
      }
      this.updateCamera();
    });

    let initPinch = 0;
    canvas.addEventListener("touchstart", e => {
      e.preventDefault();
      if (e.touches.length === 1) {
        this.isDragging = true; this.isRightDrag = false;
        this.lastMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      } else if (e.touches.length === 2) {
        this.isDragging = true; this.isRightDrag = true;
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        initPinch = Math.sqrt(dx * dx + dy * dy);
        this.lastMouse = {
          x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
          y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
        };
      }
    }, { passive: false });

    window.addEventListener("touchend", () => { this.isDragging = false; });

    canvas.addEventListener("touchmove", e => {
      e.preventDefault();
      if (!this.isDragging) return;
      const rect = canvas.getBoundingClientRect();
      let cx = e.touches[0].clientX, cy = e.touches[0].clientY;
      if (e.touches.length === 2) {
        cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        const tdx = e.touches[0].clientX - e.touches[1].clientX;
        const tdy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(tdx * tdx + tdy * tdy);
        const zd = initPinch - dist;
        if (Math.abs(zd) > 5) {
          this.radius = Math.max(10, Math.min(120, this.radius + zd * 0.15));
          initPinch = dist;
        }
      }
      this.mouse.set(
        ((cx - rect.left) / rect.width) * 2 - 1,
        -((cy - rect.top) / rect.height) * 2 + 1,
      );
      const dx = cx - this.lastMouse.x, dy = cy - this.lastMouse.y;
      this.lastMouse = { x: cx, y: cy };
      if (this.isRightDrag && e.touches.length === 2) {
        const sp = this.radius * 0.0014;
        const right = new THREE.Vector3().crossVectors(
          this.camera.up, this.camera.position.clone().sub(this.target),
        ).normalize();
        this.target.addScaledVector(right, -dx * sp);
        const fwd = new THREE.Vector3(0, 0, 1).applyAxisAngle(
          new THREE.Vector3(0, 1, 0), this.theta,
        );
        this.target.addScaledVector(fwd, -dy * sp);
      } else if (e.touches.length === 1) {
        this.theta -= dx * 0.007;
        this.phi = Math.max(0.1, Math.min(Math.PI / 2 - 0.01, this.phi - dy * 0.005));
      }
      this.updateCamera();
    }, { passive: false });

    canvas.addEventListener("wheel", e => {
      e.preventDefault();
      this.radius = Math.max(10, Math.min(120, this.radius + e.deltaY * 0.05));
      this.updateCamera();
    }, { passive: false });

    canvas.addEventListener("contextmenu", e => e.preventDefault());
  }

  resetView() {
    this.target.set(0, 0, 0);
    this.radius = 55; this.theta = -Math.PI / 4; this.phi = Math.PI / 4;
    this.updateCamera();
  }

  destroy() {
    cancelAnimationFrame(this.animId);
    this.renderer.dispose();
  }
}

// ─── React component ──────────────────────────────────────────────────────────

interface TerminalMap3DProps {
  data: VesselHeatmapViewData | null;
  terminalLayout?: any;
  targetBerthId: string;
  computedMaxBlock: string | null;
  loading?: boolean;
}

export default function TerminalMap3D({
  data,
  terminalLayout: terminalLayoutProp,
  targetBerthId,
  computedMaxBlock,
  loading,
}: TerminalMap3DProps) {
  const [hoveredBlock, setHoveredBlock] = useState<string | null>(null);
  const [sceneReady, setSceneReady] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<TerminalScene | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  // ── Build geometry from XML ─────────────────────────────────────────────
  const effectiveLayout = terminalLayoutProp ?? (data as any)?.terminalLayout;
  const geo = buildTerminalGeometry(
    effectiveLayout as RawTerminalLayout | null,
  );

  // ── Init Three.js scene ─────────────────────────────────────────────────
  useEffect(() => {
    if (!canvasRef.current) return;
    let ts: TerminalScene | null = null;
    let ro: ResizeObserver | null = null;

    const timer = setTimeout(() => {
      if (!canvasRef.current) return;
      ts = new TerminalScene(canvasRef.current);
      ts.onHover = id => setHoveredBlock(id);
      sceneRef.current = ts;
      ts.setTheme();

      // Build static environment from XML
      ts.buildEnvironment(geo.yardPolygon, geo.blocks);

      setSceneReady(true);

      ro = new ResizeObserver(() => {
        if (containerRef.current && sceneRef.current)
          sceneRef.current.resize(
            containerRef.current.clientWidth,
            containerRef.current.clientHeight,
          );
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveLayout]);

  // ── Apply container data when it changes ────────────────────────────────
  useEffect(() => {
    if (sceneReady && sceneRef.current && data) {
      sceneRef.current.applyData(
        data,
        geo.blocks,
        geo.berths,
        computedMaxBlock,
        targetBerthId,
      );
    }
  }, [data, computedMaxBlock, targetBerthId, sceneReady]);

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
      <canvas
        ref={canvasRef}
        style={{ display: "block", width: "100%", height: "100%" }}
      />

      {/* Scan line while loading */}
      {loading && (
        <Box
          sx={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 160,
            background: `linear-gradient(transparent,${alpha(theme.palette.primary.main, 0.12)},transparent)`,
            animation: "scan 1.8s linear infinite",
            pointerEvents: "none",
            zIndex: 99,
            "@keyframes scan": {
              "0%": { transform: "translateY(-160px)" },
              "100%": { transform: "translateY(100vh)" },
            },
          }}
        />
      )}

      {/* Concentration legend */}
      <Box
        sx={{
          position: "absolute",
          top: { xs: 88, lg: "auto" },
          bottom: { xs: "auto", lg: 24 },
          right: { xs: 16, lg: "auto" },
          left: { xs: "auto", lg: 24 },
          zIndex: 10,
          display: "flex",
          alignItems: { xs: "flex-start", lg: "center" },
          flexDirection: { xs: "column", lg: "row" },
          gap: { xs: 1.5, lg: 1.2 },
          px: { xs: 1.5, lg: 1.2 },
          py: { xs: 1, lg: 0.4 },
          bgcolor: isDark ? "rgba(18,22,31,0.9)" : "rgba(255,255,255,0.9)",
          backdropFilter: "blur(4px)",
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 1,
        }}
      >
        <Typography
          sx={{
            display: { xs: "none", lg: "block" },
            fontSize: "0.45rem",
            color: "text.secondary",
            fontWeight: 800,
            letterSpacing: "0.5px",
            textTransform: "uppercase",
            mr: 0.2,
          }}
        >
          Concentration
        </Typography>
        {[
          { c: "#ff0000", l: "High" },
          { c: "#ffaa00", l: "Medium" },
          { c: "#00ff00", l: "Low" },
        ].map(({ c, l }) => (
          <Box key={l} sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <Box
              sx={{
                width: { xs: 7, lg: 6 },
                height: { xs: 7, lg: 6 },
                bgcolor: c,
                borderRadius: "1px",
              }}
            />
            <Typography
              sx={{
                fontSize: { xs: "0.6rem", lg: "0.55rem" },
                color: "text.secondary",
                fontWeight: 500,
              }}
            >
              {l}
            </Typography>
          </Box>
        ))}
      </Box>

      {/* Block hover tooltip */}
      {hoveredBlock && (
        <Box
          sx={{
            position: "absolute",
            top: { xs: "auto", md: "50%" },
            bottom: { xs: 48, md: "auto" },
            left: { xs: 16, md: 24 },
            transform: { xs: "none", md: "translateY(-50%)" },
            zIndex: 10,
            px: { xs: 1.25, md: 2 },
            py: { xs: 0.75, md: 1.4 },
            bgcolor: isDark ? "rgba(42,42,42,0.97)" : "rgba(233,238,246,0.97)",
            border: "1px solid",
            borderColor: "primary.main",
            borderRadius: 1,
            boxShadow: `0 0 16px ${alpha(theme.palette.primary.main, 0.22)}`,
            minWidth: { xs: 110, md: 140 },
          }}
        >
          <Typography
            sx={{
              fontSize: { xs: "0.65rem", md: "0.72rem" },
              color: "primary.main",
              fontWeight: 800,
              fontFamily: "'Roboto Mono',monospace",
              letterSpacing: "1px",
            }}
          >
            BLOCK {hoveredBlock}
          </Typography>
          {hoveredData && (
            <>
              <Typography sx={{ fontSize: { xs: "0.6rem", md: "0.66rem" }, color: "text.primary", mt: 0.4 }}>
                Volume:{" "}
                <span style={{ color: theme.palette.info.main }}>
                  {hoveredData.count} Units
                </span>
              </Typography>
              <Typography sx={{ fontSize: { xs: "0.6rem", md: "0.66rem" }, color: "text.primary" }}>
                Density:{" "}
                <span style={{ color: theme.palette.info.main }}>
                  {hoveredData.concentration}
                </span>
              </Typography>
            </>
          )}
        </Box>
      )}

      {/* Reset view button */}
      <Box
        sx={{
          position: "absolute",
          top: { xs: 52, lg: "auto" },
          bottom: { xs: "auto", lg: 16 },
          right: 16,
          zIndex: 100,
        }}
      >
        <Tooltip title="Reset View">
          <IconButton
            onClick={() => sceneRef.current?.resetView()}
            sx={{
              bgcolor: isDark ? "rgba(42,42,42,0.9)" : "rgba(255,255,255,0.9)",
              border: "1px solid",
              borderColor: "divider",
              boxShadow: 3,
              "&:hover": { bgcolor: "action.hover" },
              p: 0.6,
              width: 28,
              height: 28,
            }}
            size="small"
          >
            <RestartAltRounded fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );
}