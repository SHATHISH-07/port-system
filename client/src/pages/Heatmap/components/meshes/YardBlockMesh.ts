import * as THREE from "three";
import { n2world } from "../../utils/terminalGeometry";

export function buildRibbonGeometry(pts: THREE.Vector3[], width: number): THREE.BufferGeometry {
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

export function buildYardOutline(yardPolygon: { x: number; y: number }[]): THREE.Group {
  const group = new THREE.Group();
  if (!yardPolygon.length) return group;

  const worldPts = yardPolygon.map(p => n2world(p.x, p.y));

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
  group.add(mesh);

  const pts3 = worldPts.map(p => new THREE.Vector3(p.x, 0.05, p.z));
  const lineGeo = new THREE.BufferGeometry().setFromPoints(pts3);
  group.add(
    new THREE.Line(
      lineGeo,
      new THREE.LineBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.5 }),
    ),
  );
  
  return group;
}
