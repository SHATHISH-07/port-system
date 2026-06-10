import * as THREE from "three";

export const CONTAINER_COLORS = [0x991b1b, 0x1d4ed8, 0xea580c];

let containerTextureCache: THREE.Texture | null = null;

export function getContainerTexture(): THREE.Texture {
  if (containerTextureCache) return containerTextureCache;
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
  containerTextureCache = tex;
  return tex;
}

export function createContainerGeometry(w: number, h: number, d: number): THREE.BoxGeometry {
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

export function createContainerMesh(w: number, h: number, d: number, color: number): THREE.Mesh {
  const geom = createContainerGeometry(w, h, d);
  const tex = getContainerTexture();
  const mat = new THREE.MeshStandardMaterial({
    color: color,
    map: tex,
    bumpMap: tex,
    bumpScale: 0.15,
    roughness: 0.65,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.castShadow = true;
  return mesh;
}
