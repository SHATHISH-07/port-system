import { useState, useEffect, useRef, useMemo } from "react";
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
  type TerminalGeometry,
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

function makeBillboardLabel(text: string, fontSize: number, borderColor: string): THREE.Sprite {
  const W = 512, H = 128;
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const ctx = c.getContext("2d")!;

  // Set font first to measure text
  ctx.font = `bold ${fontSize}px 'Inter',sans-serif`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";

  const metrics = ctx.measureText(text);
  const textW = metrics.width;
  const textH = fontSize; // Approximate height

  const padX = 24; // Tight padding
  const padY = 16;

  const boxW = textW + padX * 2;
  const boxH = textH + padY * 2;
  const cx = W / 2;
  const cy = H / 2;

  // Draw tight border around text
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 6;
  ctx.strokeRect(cx - boxW / 2, cy - boxH / 2, boxW, boxH);

  // Text stroke (outline) for readability
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#000000";
  ctx.strokeText(text, cx, cy);

  // Text fill (always white as requested)
  ctx.fillStyle = "#FFFFFF";
  ctx.fillText(text, cx, cy);

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

function buildRibbonGeometry(pts: THREE.Vector3[], width: number): THREE.BufferGeometry {
  const vertices: number[] = [];
  const indices: number[] = [];
  const uvs: number[] = [];
  const up = new THREE.Vector3(0, 1, 0);

  let distance = 0;
  for (let i = 0; i < pts.length; i++) {
    const dir = new THREE.Vector3();
    if (i === 0) {
      dir.subVectors(pts[1], pts[0]).normalize();
    } else if (i === pts.length - 1) {
      dir.subVectors(pts[i], pts[i - 1]).normalize();
    } else {
      const d1 = new THREE.Vector3().subVectors(pts[i], pts[i - 1]).normalize();
      const d2 = new THREE.Vector3().subVectors(pts[i + 1], pts[i]).normalize();
      dir.addVectors(d1, d2).normalize();
    }

    // Fallback if points are coincident
    if (dir.lengthSq() < 0.0001) dir.set(1, 0, 0);

    const right = new THREE.Vector3().crossVectors(dir, up).normalize().multiplyScalar(width / 2);

    vertices.push(
      pts[i].x - right.x, pts[i].y, pts[i].z - right.z,
      pts[i].x + right.x, pts[i].y, pts[i].z + right.z
    );

    if (i > 0) distance += pts[i].distanceTo(pts[i - 1]);
    uvs.push(0, distance, 1, distance);
  }

  for (let i = 0; i < pts.length - 1; i++) {
    const v1 = i * 2;
    const v2 = i * 2 + 1;
    const v3 = (i + 1) * 2;
    const v4 = (i + 1) * 2 + 1;
    indices.push(v1, v2, v4);
    indices.push(v1, v4, v3);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
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
  dynamicLabels: THREE.Sprite[] = [];
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
  buildEnvironment(geo: TerminalGeometry) {
    const { yardPolygon, blocks: xmlBlocks, railTracks = [], roads = [] } = geo;

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

    // --- Grid Mesh Lines for Blueprint/Tech Look ---
    // Increased divisions from 20 to 35 to make the grid boxes a little smaller
    const gridHelper = new THREE.GridHelper(WORLD_SCALE * 1.1, 35, 0x000000, 0x000000);
    gridHelper.position.set(0, 0.001, WORLD_SCALE * 0.1); // Slightly above the land plane to prevent z-fighting
    (gridHelper.material as THREE.Material).opacity = 0.25; // Slightly increased opacity since black on grey can be subtle
    (gridHelper.material as THREE.Material).transparent = true;
    this.scene.add(gridHelper);

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
      const lbl = makeBillboardLabel(blk.id, 42, '#FFFFFF');
      lbl.position.set(wp.x, 1.2, wp.z); // Increased height to float higher above containers
      lbl.userData = { id: blk.id };
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

    // --- Rail Tracks ---
    railTracks.forEach(rt => {
      if (!rt.center_line || rt.center_line.length < 2) return;
      const pts = rt.center_line.map(p => {
        const w = n2world(p.x, p.y);
        return new THREE.Vector3(w.x, 0.07, w.z); // Lifted above block pads (0.06)
      });

      // Track bed (Lighter Gravel to contrast with yard ground)
      const bedGeo = buildRibbonGeometry(pts, 0.5);
      const bedMat = new THREE.MeshStandardMaterial({
        color: 0x475569, // slate-600 (lighter than yard 0x334155)
        roughness: 1.0,
        side: THREE.DoubleSide
      });
      const bedMesh = new THREE.Mesh(bedGeo, bedMat);
      bedMesh.receiveShadow = true;
      this.scene.add(bedMesh);

      // Wooden Cross-ties (Boxes)
      const tieGeo = new THREE.BoxGeometry(0.6, 0.02, 0.1);
      const tieMat = new THREE.MeshStandardMaterial({ color: 0x292524, roughness: 1.0 }); // Dark wood
      const up = new THREE.Vector3(0, 1, 0);

      // We will create a single InstancedMesh for all ties in this track
      let totalTies = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        totalTies += Math.floor(pts[i].distanceTo(pts[i + 1]) / 0.4);
      }

      if (totalTies > 0) {
        const tieInstanced = new THREE.InstancedMesh(tieGeo, tieMat, totalTies);
        let tieIdx = 0;
        const dummy = new THREE.Object3D();

        for (let i = 0; i < pts.length - 1; i++) {
          const p1 = pts[i];
          const p2 = pts[i + 1];
          const dist = p1.distanceTo(p2);
          const dir = new THREE.Vector3().subVectors(p2, p1).normalize();
          const numTies = Math.floor(dist / 0.4);

          for (let j = 0; j < numTies; j++) {
            const pos = p1.clone().add(dir.clone().multiplyScalar(j * 0.4));
            dummy.position.copy(pos);
            dummy.position.y = 0.075; // Just above gravel
            // align to path
            dummy.lookAt(pos.clone().add(dir));
            dummy.updateMatrix();
            tieInstanced.setMatrixAt(tieIdx++, dummy.matrix);
          }
        }
        tieInstanced.castShadow = true;
        this.scene.add(tieInstanced);
      }

      // Left and Right Steel Rails
      const railMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.3, metalness: 0.9 });
      const leftPts = [];
      const rightPts = [];
      for (let i = 0; i < pts.length; i++) {
        let dir = new THREE.Vector3();
        if (i === 0) dir.subVectors(pts[1], pts[0]).normalize();
        else if (i === pts.length - 1) dir.subVectors(pts[i], pts[i - 1]).normalize();
        else {
          const d1 = new THREE.Vector3().subVectors(pts[i], pts[i - 1]).normalize();
          const d2 = new THREE.Vector3().subVectors(pts[i + 1], pts[i]).normalize();
          dir.addVectors(d1, d2).normalize();
        }
        if (dir.lengthSq() < 0.0001) dir.set(1, 0, 0);

        const right = new THREE.Vector3().crossVectors(dir, up).normalize().multiplyScalar(0.18);
        leftPts.push(pts[i].clone().sub(right).setY(0.08)); // On top of ties
        rightPts.push(pts[i].clone().add(right).setY(0.08));
      }

      const lGeo = buildRibbonGeometry(leftPts, 0.04);
      const rGeo = buildRibbonGeometry(rightPts, 0.04);
      const lMesh = new THREE.Mesh(lGeo, railMat);
      const rMesh = new THREE.Mesh(rGeo, railMat);
      lMesh.castShadow = true; rMesh.castShadow = true;
      this.scene.add(lMesh, rMesh);
    });

    // --- Roads ---
    roads.forEach((rd, idx) => {
      if (!rd.points || rd.points.length < 2) return;
      const pts = rd.points.map(p => {
        const w = n2world(p.x, p.y);
        return new THREE.Vector3(w.x, 0.065 + (idx * 0.0001), w.z);
      });

      // Center dashed line (Yellow lane markings / outlines)
      const lineGeo = new THREE.BufferGeometry().setFromPoints(pts.map(p => p.clone().setY(0.075 + (idx * 0.0001))));
      const lineMat = new THREE.LineDashedMaterial({
        color: 0xeab308, // yellow-500
        opacity: 0.8,
        transparent: true,
        dashSize: 0.5,
        gapSize: 0.5,
        depthWrite: false
      });
      const line = new THREE.Line(lineGeo, lineMat);
      line.computeLineDistances();
      this.scene.add(line);
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

  buildShip(
    id: string,
    berth: BerthInfo,
    name: string,
    isTarget: boolean,
  ) {
    const seaPt = getSeaPoint(berth, 0.10);
    const pos = n2world(seaPt.x, seaPt.y);
    const cranePt = getSeaPoint(berth, -0.015);
    const landWp = n2world(cranePt.x, cranePt.y);
    const rotDeg = THREE.MathUtils.radToDeg(-berthHeadingRad(berth));

    const scaleF = 2.5;
    const SHIP_LEN = 8.0 * scaleF;
    const SHIP_WID = 1.2 * scaleF;
    const SHIP_DRAFT = 0.6 * scaleF;
    const REALISTIC_CONTAINERS = CONTAINER_COLORS;

    const g = new THREE.Group();
    const L = SHIP_LEN,
      W = SHIP_WID,
      DR = SHIP_DRAFT;
    const hullColor = isTarget ? 0x1e3a8a : 0x451a03;
    const hullMat = new THREE.MeshStandardMaterial({
      color: hullColor,
      roughness: 0.55,
      metalness: 0.45,
    });
    const wlColor = isTarget ? 0xb91c1c : 0x7f1d1d;
    const wl = new THREE.Mesh(
      new THREE.BoxGeometry(L + 0.05, DR * 0.3, W + 0.05),
      new THREE.MeshStandardMaterial({ color: wlColor, roughness: 0.7 }),
    );
    wl.position.y = -DR * 0.22;
    g.add(wl);

    const hull = new THREE.Mesh(new THREE.BoxGeometry(L, DR, W), hullMat);
    hull.position.y = 0;
    hull.castShadow = true;
    g.add(hull);

    for (let i = 0; i < 5; i++) {
      const plate = new THREE.Mesh(
        new THREE.BoxGeometry(L + 0.01, 0.015, W + 0.01),
        new THREE.MeshStandardMaterial({
          color: hullColor === 0x1e3a8a ? 0x1e3580 : 0x3d1503,
          roughness: 0.8,
        }),
      );
      plate.position.y = -DR / 2 + (i + 1) * (DR / 6);
      g.add(plate);
    }

    const bV = new Float32Array([
      L / 2,
      DR / 2,
      -W / 2,
      L / 2,
      DR / 2,
      W / 2,
      L / 2 + 0.9,
      DR / 2,
      0,
      L / 2,
      -DR / 2,
      -W / 2,
      L / 2,
      -DR / 2,
      W / 2,
      L / 2 + 0.9,
      -DR / 2,
      0,
    ]);
    const bGeo = new THREE.BufferGeometry();
    bGeo.setAttribute("position", new THREE.BufferAttribute(bV, 3));
    bGeo.setIndex([
      0, 1, 2, 3, 4, 5, 0, 3, 4, 0, 4, 1, 1, 4, 5, 1, 5, 2, 0, 2, 5, 0, 5, 3,
    ]);
    bGeo.computeVertexNormals();
    const bow = new THREE.Mesh(bGeo, hullMat);
    bow.castShadow = true;
    g.add(bow);

    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(L * 0.94, 0.06, W * 0.88),
      new THREE.MeshStandardMaterial({
        color: 0x1a2232,
        roughness: 0.92,
        metalness: 0.1,
      }),
    );
    deck.position.y = DR / 2 + 0.03;
    g.add(deck);

    const hatchMat = new THREE.MeshStandardMaterial({
      color: 0x374151,
      roughness: 0.8,
    });
    for (let h = 0; h < 5; h++) {
      const hatch = new THREE.Mesh(
        new THREE.BoxGeometry(L * 0.13, 0.04, W * 0.75),
        hatchMat,
      );
      hatch.position.set(-L * 0.38 + h * L * 0.19, DR / 2 + 0.06, 0);
      g.add(hatch);
    }

    const COLS = 20,
      ROWS = 6,
      TIERS = 3;
    const cW = (L * 0.72) / COLS;
    const cD = (W * 0.8) / ROWS;
    const cH = 0.14; // Height of a single container

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        // Vary the number of tiers realistically
        const stackCount = Math.max(1, Math.floor(TIERS * (0.4 + Math.sin((c / COLS) * Math.PI) * 0.6 + Math.random() * 0.4)));

        for (let t = 0; t < stackCount; t++) {
          const contColor =
            REALISTIC_CONTAINERS[(r * COLS + c + t) % REALISTIC_CONTAINERS.length];
          const cm = new THREE.Mesh(
            createContainerGeometry(cW * 0.88, cH, cD * 0.88),
            new THREE.MeshStandardMaterial({
              color: contColor,
              map: CONTAINER_TEX,
              bumpMap: CONTAINER_TEX,
              bumpScale: 0.15,
              roughness: 0.65,
            }),
          );
          cm.position.set(
            -L * 0.34 + c * cW + cW / 2,
            DR / 2 + t * (cH + 0.01) + cH / 2 + 0.07,
            -W * 0.38 + r * cD + cD / 2,
          );
          cm.castShadow = true;
          g.add(cm);
        }
      }
    }

    const superMat = new THREE.MeshStandardMaterial({
      color: 0xf0f4f8,
      roughness: 0.5,
      metalness: 0.1,
    });
    const super1 = new THREE.Mesh(
      new THREE.BoxGeometry(0.85, 1.1, W * 0.78),
      superMat,
    );
    super1.position.set(-L * 0.39, DR / 2 + 0.55, 0);
    super1.castShadow = true;
    g.add(super1);
    [-W * 0.44, W * 0.44].forEach((wz) => {
      const wing = new THREE.Mesh(
        new THREE.BoxGeometry(0.55, 0.12, 0.3),
        superMat,
      );
      wing.position.set(-L * 0.39, DR / 2 + 0.95, wz);
      g.add(wing);
    });

    const winMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      roughness: 0.1,
      metalness: 0.9,
      transparent: true,
      opacity: 0.7,
    });
    for (let fl = 0; fl < 3; fl++) {
      for (let w2 = 0; w2 < 4; w2++) {
        const win = new THREE.Mesh(
          new THREE.BoxGeometry(0.02, 0.07, 0.1),
          winMat,
        );
        win.position.set(
          -L * 0.39 - 0.43,
          DR / 2 + 0.25 + fl * 0.3,
          -W * 0.28 + w2 * 0.2,
        );
        g.add(win);
      }
    }

    const funnelColor = isTarget ? 0x1d4ed8 : 0x7f1d1d;
    const funnel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.13, 0.5, 8),
      new THREE.MeshStandardMaterial({ color: funnelColor, roughness: 0.5 }),
    );
    funnel.position.set(-L * 0.42, DR / 2 + 1.35, 0);
    funnel.castShadow = true;
    g.add(funnel);

    const mastMat = new THREE.MeshStandardMaterial({
      color: 0xd1d5db,
      roughness: 0.4,
      metalness: 0.6,
    });
    [L * 0.3, -L * 0.15].forEach((mx) => {
      const mast = new THREE.Mesh(
        new THREE.CylinderGeometry(0.015, 0.02, 0.7, 6),
        mastMat,
      );
      mast.position.set(mx, DR / 2 + 0.7, 0);
      g.add(mast);
    });

    if (isTarget) {
      const ringR = Math.max(L, W) * 0.62;
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(ringR, ringR + 0.12, 72),
        new THREE.MeshBasicMaterial({
          color: 0x10b981,
          transparent: true,
          opacity: 0.5,
          side: THREE.DoubleSide,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = -0.18;
      g.add(ring);
    }

    const labelColor = "#ffffff";
    const label = makeBillboardLabel(name.toUpperCase(), 36, labelColor);
    label.position.set(0, DR / 2 + 2.4, 0);
    g.add(label);

    g.position.set(pos.x, -0.15, pos.z);

    g.rotation.y = THREE.MathUtils.degToRad(-rotDeg);
    g.userData = { type: "ship", id, bobOffset: Math.random() * Math.PI * 2 };

    const hullLabel = makeLabel(name, 18, "#aab8c8");
    hullLabel.position.set(L * 0.1, 0, W / 2 + 0.01);
    hullLabel.rotation.y = -Math.PI / 2;
    g.add(hullLabel);

    this.scene.add(g);
    this.shipMeshes.set(id, g);

    const crane1 = this.buildStsCrane(0, 0, 0, 0);
    const crane2 = this.buildStsCrane(0, 0, 0, 0);

    this.scene.remove(crane1, crane2);
    g.add(crane1, crane2);

    const landLocal = g.worldToLocal(new THREE.Vector3(landWp.x, -0.15, landWp.z));
    const offsetAmt = L * 0.18;
    const craneYOffset = isTarget ? 0.15 : 0;
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
    this.dynamicLabels.forEach(lbl => this.scene.remove(lbl));
    this.dynamicLabels = [];

    // Reset visibility of static labels
    this.blockLabels.forEach(lbl => { lbl.visible = true; });

    const heatGroups: {
      cx: number; cz: number; bw: number; bd: number; conc: string;
    }[] = [];

    Object.entries(data.layout).forEach(([id, pos]: [string, { x?: number; y?: number; cx?: number; cy?: number; w?: number; h?: number }]) => {
      // Prefer XML block geometry; fall back to normalised layout coords
      const xmlBlk = xmlBlocks.find(b => b.id === id);
      let wpx: number, wpz: number, bw: number, bd: number;
      let maxTier = 0;

      if (xmlBlk && xmlBlk.cx > 0) {
        const w = n2world(xmlBlk.cx, xmlBlk.cy);
        wpx = w.x; wpz = w.z;
        bw = xmlBlk.w * WORLD_SCALE;
        bd = xmlBlk.h * WORLD_SCALE;
      } else if (pos.w !== undefined && pos.x !== undefined && pos.y !== undefined && pos.h !== undefined) {
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
        const cW = 0.8, cD = 0.32, cH = 0.35;
        const validContainers = (blk.containers || []).filter(c => c.bay && c.row && c.tier && c.bay !== "-" && c.row !== "-" && c.tier !== "-");

        const parsed = validContainers.map((c, idx) => {
          let b = parseInt(c.bay!, 10);
          let r = parseInt(c.row!, 10);
          if (isNaN(r) && c.row!.length > 0) r = c.row!.toUpperCase().charCodeAt(0) - 64; // Handle letters like 'A', 'B'
          let t = parseInt(c.tier!, 10);
          return { b, r, t, origIdx: idx };
        }).filter(c => !isNaN(c.b) && !isNaN(c.r) && !isNaN(c.t));

        if (parsed.length > 0) {
          const minBay = Math.min(...parsed.map(c => c.b));
          const maxBay = Math.max(...parsed.map(c => c.b));
          const minRow = Math.min(...parsed.map(c => c.r));
          const maxRow = Math.max(...parsed.map(c => c.r));
          const baySpan = Math.max(1, maxBay - minBay + 1);
          const rowSpan = Math.max(1, maxRow - minRow + 1);

          maxTier = Math.max(0, Math.max(...parsed.map(c => c.t)) - 1);

          const colSpacing = bw / baySpan;
          const rowSpacing = bd / rowSpan;
          const actCW = Math.min(cW * 1.1, colSpacing * 0.95);
          const actCD = Math.min(cD * 1.1, rowSpacing * 0.95);

          const dummy = new THREE.Object3D();
          const iMesh = new THREE.InstancedMesh(
            createContainerGeometry(actCW, cH, actCD),
            new THREE.MeshStandardMaterial({ map: CONTAINER_TEX, roughness: 0.7, metalness: 0.2 }),
            parsed.length,
          );
          iMesh.castShadow = true; iMesh.receiveShadow = true;
          for (let i = 0; i < parsed.length; i++) {
            const p = parsed[i];
            const col = p.b - minBay;
            const row = p.r - minRow;
            const tier = Math.max(0, p.t - 1);

            dummy.position.set(
              -bw / 2 + colSpacing / 2 + col * colSpacing,
              0.12 + tier * cH + cH / 2,
              -bd / 2 + rowSpacing / 2 + row * rowSpacing,
            );
            dummy.updateMatrix();
            iMesh.setMatrixAt(i, dummy.matrix);
            const origContainer = validContainers[p.origIdx];
            const colorIdx = origContainer.hazardous ? 0 : origContainer.reefer ? 1 : 2;
            iMesh.setColorAt(i, new THREE.Color(CONTAINER_COLORS[colorIdx]));
          }
          iMesh.instanceMatrix.needsUpdate = true;
          g.add(iMesh);
        } else {
          // Fallback random distribution if no position details
          const count = Math.min(blk.count, 200);
          const COLS = Math.max(1, Math.floor(bw / (cW * 1.1)));
          const ROWS = Math.max(1, Math.floor(bd / (cD * 1.1)));

          maxTier = Math.floor(count / (COLS * ROWS));

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
      }

      // Handle Block Labels using Billboards
      const staticLbl = this.blockLabels.find(l => l.userData.id === id);

      if (hasData) {
        if (staticLbl) staticLbl.visible = false;

        // Float label directly above the highest container
        const cH = 0.35;
        const highestY = 0.12 + maxTier * cH + cH / 2;
        const floatY = highestY + 1.2;

        const dynLbl = makeBillboardLabel(id, 42, isMax ? "#ef4444" : "#38bdf8");
        dynLbl.position.set(0, floatY, 0); // Local to the block group
        g.add(dynLbl);
        this.dynamicLabels.push(dynLbl);
      } else {
        if (staticLbl) staticLbl.visible = true;
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
  terminalLayout?: RawTerminalLayout;
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
  const effectiveLayout = terminalLayoutProp ?? (data as { terminalLayout?: RawTerminalLayout })?.terminalLayout;
  const geo = useMemo(() => buildTerminalGeometry(
    effectiveLayout as RawTerminalLayout | null,
  ), [effectiveLayout]);

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
      ts.buildEnvironment(geo);

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
  }, [data, computedMaxBlock, targetBerthId, sceneReady, geo.blocks, geo.berths]);

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