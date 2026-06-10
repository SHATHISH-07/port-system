import * as THREE from "three";

export function createStsCraneMesh(x: number, y: number, z: number, rotY: number): THREE.Group {
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
  
  return g;
}
