import * as THREE from 'three';

export type CarColor = 'red' | 'blue' | 'white' | 'black';

export const CAR_COLOR_MAP: Record<CarColor, { color: number; metalness: number; roughness: number }> = {
  red: { color: 0xbe123c, metalness: 0.8, roughness: 0.16 }, // Crimson Red
  blue: { color: 0x1d4ed8, metalness: 0.82, roughness: 0.15 }, // Metallic Cobalt
  white: { color: 0xf1f5f9, metalness: 0.35, roughness: 0.12 }, // Pearl White
  black: { color: 0x111827, metalness: 0.88, roughness: 0.22 }, // Midnight Obsidian
};

export interface CarComponents {
  carGroup: THREE.Group;
  wheels: THREE.Group[];
  frontLeftWheel: THREE.Group;
  frontRightWheel: THREE.Group;
  rearLeftWheel: THREE.Group;
  rearRightWheel: THREE.Group;
  headlights: THREE.SpotLight[];
  hoodMesh: THREE.Mesh;
  frontBumperMesh: THREE.Mesh;
  setPaintColor: (color: CarColor) => void;
  currentColor: CarColor;
  setSteeringAngle: (angleRad: number) => void;
  setBrakeLights: (active: boolean) => void;
}

export class CarBuilder {
  /**
   * Builds a realistic modern sports coupe / GT car
   */
  public static buildCar(): CarComponents {
    const carGroup = new THREE.Group();
    carGroup.name = 'Car';

    // Premium Materials
    const bodyPaintMat = new THREE.MeshPhysicalMaterial({
      color: 0x1d4ed8, // Metallic Royal Blue
      metalness: 0.75,
      roughness: 0.18,
      clearcoat: 1.0,
      clearcoatRoughness: 0.06,
      reflectivity: 0.85,
    });

    const bodyPaintAccentMat = new THREE.MeshPhysicalMaterial({
      color: 0x0f172a, // Obsidian Dark Carbon
      metalness: 0.9,
      roughness: 0.25,
      clearcoat: 0.5,
    });

    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x091422,
      metalness: 0.9,
      roughness: 0.08,
      transparent: true,
      opacity: 0.75,
      transmission: 0.4,
    });

    const chromeMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.95,
      roughness: 0.1,
    });

    const blackTrimMat = new THREE.MeshStandardMaterial({
      color: 0x18181b,
      roughness: 0.6,
      metalness: 0.2,
    });

    const tireRubberMat = new THREE.MeshStandardMaterial({
      color: 0x1c1917,
      roughness: 0.85,
      metalness: 0.05,
    });

    const rimAlloyMat = new THREE.MeshStandardMaterial({
      color: 0xd4d4d8,
      metalness: 0.85,
      roughness: 0.2,
    });

    const brakeCaliperMat = new THREE.MeshStandardMaterial({
      color: 0xdc2626, // Red Calipers
      roughness: 0.3,
      metalness: 0.5,
    });

    const headlightLensMat = new THREE.MeshStandardMaterial({
      color: 0xe0f2fe,
      emissive: 0xbfdbfe,
      emissiveIntensity: 2.2,
      roughness: 0.1,
    });

    const taillightLensMat = new THREE.MeshStandardMaterial({
      color: 0x991b1b,
      emissive: 0xef4444,
      emissiveIntensity: 2.0,
      roughness: 0.1,
    });

    // 1. Lower Chassis / Floorpan
    const floorGeo = new THREE.BoxGeometry(1.85, 0.25, 4.3);
    const floorMesh = new THREE.Mesh(floorGeo, blackTrimMat);
    floorMesh.position.y = 0.25;
    floorMesh.castShadow = true;
    floorMesh.receiveShadow = true;
    carGroup.add(floorMesh);

    // 2. Main Lower Body Tub (Fenders & Lower Doors)
    const lowerBodyGeo = new THREE.BoxGeometry(1.9, 0.45, 4.2);
    const lowerBodyMesh = new THREE.Mesh(lowerBodyGeo, bodyPaintMat);
    lowerBodyMesh.position.y = 0.5;
    lowerBodyMesh.castShadow = true;
    lowerBodyMesh.receiveShadow = true;
    carGroup.add(lowerBodyMesh);

    // 3. Sculpted Hood
    const hoodGeo = new THREE.BoxGeometry(1.78, 0.18, 1.45);
    const hoodMesh = new THREE.Mesh(hoodGeo, bodyPaintMat);
    hoodMesh.position.set(0, 0.72, 1.25);
    hoodMesh.rotation.x = 0.05; // slight forward aerodynamic slant
    hoodMesh.castShadow = true;
    hoodMesh.receiveShadow = true;
    carGroup.add(hoodMesh);

    // Hood scoop / air vent
    const ventGeo = new THREE.BoxGeometry(0.65, 0.06, 0.45);
    const ventMesh = new THREE.Mesh(ventGeo, bodyPaintAccentMat);
    ventMesh.position.set(0, 0.81, 1.15);
    carGroup.add(ventMesh);

    // 4. Cabin & Roof (Greenhouse)
    const cabinShape = new THREE.Shape();
    cabinShape.moveTo(-0.85, 0);
    cabinShape.lineTo(-0.75, 0.62);
    cabinShape.lineTo(0.75, 0.62);
    cabinShape.lineTo(0.85, 0);
    cabinShape.closePath();

    const cabinGeo = new THREE.BoxGeometry(1.65, 0.62, 2.1);
    const cabinMesh = new THREE.Mesh(cabinGeo, glassMat);
    cabinMesh.position.set(0, 0.98, -0.2);
    cabinMesh.castShadow = true;
    carGroup.add(cabinMesh);

    // Solid Roof Panel
    const roofGeo = new THREE.BoxGeometry(1.52, 0.08, 1.6);
    const roofMesh = new THREE.Mesh(roofGeo, bodyPaintAccentMat);
    roofMesh.position.set(0, 1.29, -0.2);
    roofMesh.castShadow = true;
    carGroup.add(roofMesh);

    // Pillars (A-Pillars, B-Pillars, C-Pillars)
    const aPillarGeo = new THREE.BoxGeometry(0.08, 0.6, 0.08);
    const aPillarL = new THREE.Mesh(aPillarGeo, bodyPaintMat);
    aPillarL.position.set(-0.75, 0.98, 0.75);
    aPillarL.rotation.x = -0.4;
    carGroup.add(aPillarL);

    const aPillarR = aPillarL.clone();
    aPillarR.position.x = 0.75;
    carGroup.add(aPillarR);

    // 5. Rear Trunk & Lip Spoiler
    const trunkGeo = new THREE.BoxGeometry(1.78, 0.22, 0.95);
    const trunkMesh = new THREE.Mesh(trunkGeo, bodyPaintMat);
    trunkMesh.position.set(0, 0.74, -1.6);
    trunkMesh.castShadow = true;
    trunkMesh.receiveShadow = true;
    carGroup.add(trunkMesh);

    // Carbon Ducktail Spoiler
    const spoilerGeo = new THREE.BoxGeometry(1.68, 0.08, 0.16);
    const spoilerMesh = new THREE.Mesh(spoilerGeo, bodyPaintAccentMat);
    spoilerMesh.position.set(0, 0.88, -2.05);
    spoilerMesh.rotation.x = -0.2;
    spoilerMesh.castShadow = true;
    carGroup.add(spoilerMesh);

    // 6. Front Grille & Bumper
    const frontBumperGeo = new THREE.BoxGeometry(1.88, 0.38, 0.35);
    const frontBumperMesh = new THREE.Mesh(frontBumperGeo, bodyPaintMat);
    frontBumperMesh.position.set(0, 0.42, 2.12);
    frontBumperMesh.castShadow = true;
    carGroup.add(frontBumperMesh);

    // Dark Mesh Grille
    const grilleGeo = new THREE.BoxGeometry(1.2, 0.22, 0.08);
    const grilleMesh = new THREE.Mesh(grilleGeo, blackTrimMat);
    grilleMesh.position.set(0, 0.38, 2.3);
    carGroup.add(grilleMesh);

    // Lower Front Splitter
    const splitterGeo = new THREE.BoxGeometry(1.9, 0.06, 0.45);
    const splitterMesh = new THREE.Mesh(splitterGeo, bodyPaintAccentMat);
    splitterMesh.position.set(0, 0.18, 2.15);
    carGroup.add(splitterMesh);

    // 7. Headlights & Projection Spotlights
    const headlights: THREE.SpotLight[] = [];
    const hlGeo = new THREE.BoxGeometry(0.38, 0.12, 0.08);

    // Left Headlight
    const hlLeft = new THREE.Mesh(hlGeo, headlightLensMat);
    hlLeft.position.set(-0.65, 0.62, 2.15);
    hlLeft.rotation.y = 0.15;
    carGroup.add(hlLeft);

    const spotLeft = new THREE.SpotLight(0xffffff, 4.5, 45, Math.PI / 6, 0.4, 1.2);
    spotLeft.position.set(-0.65, 0.62, 2.2);
    spotLeft.target.position.set(-0.65, 0.1, 15);
    carGroup.add(spotLeft);
    carGroup.add(spotLeft.target);
    headlights.push(spotLeft);

    // Right Headlight
    const hlRight = new THREE.Mesh(hlGeo, headlightLensMat);
    hlRight.position.set(0.65, 0.62, 2.15);
    hlRight.rotation.y = -0.15;
    carGroup.add(hlRight);

    const spotRight = new THREE.SpotLight(0xffffff, 4.5, 45, Math.PI / 6, 0.4, 1.2);
    spotRight.position.set(0.65, 0.62, 2.2);
    spotRight.target.position.set(0.65, 0.1, 15);
    carGroup.add(spotRight);
    carGroup.add(spotRight.target);
    headlights.push(spotRight);

    // 8. Rear Taillight Bar & Exhausts
    const tlBarGeo = new THREE.BoxGeometry(1.65, 0.1, 0.08);
    const tlBar = new THREE.Mesh(tlBarGeo, taillightLensMat);
    tlBar.position.set(0, 0.72, -2.12);
    carGroup.add(tlBar);

    // Dual Chrome Exhaust Pipes
    const exhaustGeo = new THREE.CylinderGeometry(0.065, 0.065, 0.25, 16);
    const exhaustL = new THREE.Mesh(exhaustGeo, chromeMat);
    exhaustL.rotation.x = Math.PI / 2;
    exhaustL.position.set(-0.55, 0.22, -2.16);
    carGroup.add(exhaustL);

    const exhaustR = exhaustL.clone();
    exhaustR.position.x = 0.55;
    carGroup.add(exhaustR);

    // 9. Side Mirrors
    const mirrorGeo = new THREE.BoxGeometry(0.2, 0.1, 0.12);
    const mirrorL = new THREE.Mesh(mirrorGeo, bodyPaintAccentMat);
    mirrorL.position.set(-1.0, 0.85, 0.7);
    carGroup.add(mirrorL);

    const mirrorR = mirrorL.clone();
    mirrorR.position.x = 1.0;
    carGroup.add(mirrorR);

    // Interior basic seat silhouettes
    const seatGeo = new THREE.BoxGeometry(0.48, 0.55, 0.45);
    const seatMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.9 });
    const seatL = new THREE.Mesh(seatGeo, seatMat);
    seatL.position.set(-0.38, 0.65, -0.1);
    carGroup.add(seatL);

    const seatR = seatL.clone();
    seatR.position.x = 0.38;
    carGroup.add(seatR);

    // 10. Wheels creation helper
    const createWheel = (): THREE.Group => {
      const wheelGroup = new THREE.Group();

      // Tire outer rubber
      const tireGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.28, 28);
      const tireMesh = new THREE.Mesh(tireGeo, tireRubberMat);
      tireMesh.rotation.z = Math.PI / 2;
      tireMesh.castShadow = true;
      wheelGroup.add(tireMesh);

      // Alloy Rim Barrel
      const rimGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.29, 24);
      const rimMesh = new THREE.Mesh(rimGeo, rimAlloyMat);
      rimMesh.rotation.z = Math.PI / 2;
      wheelGroup.add(rimMesh);

      // 5-Spoke Star Design
      for (let s = 0; s < 5; s++) {
        const spokeGeo = new THREE.BoxGeometry(0.04, 0.23, 0.04);
        const spoke = new THREE.Mesh(spokeGeo, chromeMat);
        const angle = (s * Math.PI * 2) / 5;
        spoke.position.set(0.145, Math.sin(angle) * 0.12, Math.cos(angle) * 0.12);
        spoke.rotation.x = angle;
        wheelGroup.add(spoke);
      }

      // Center Hub Cap
      const hubGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.31, 16);
      const hubMesh = new THREE.Mesh(hubGeo, bodyPaintAccentMat);
      hubMesh.rotation.z = Math.PI / 2;
      wheelGroup.add(hubMesh);

      // Brake Rotor Disc & Caliper
      const discGeo = new THREE.CylinderGeometry(0.21, 0.21, 0.03, 20);
      const discMesh = new THREE.Mesh(discGeo, chromeMat);
      discMesh.rotation.z = Math.PI / 2;
      discMesh.position.x = -0.04;
      wheelGroup.add(discMesh);

      const caliperGeo = new THREE.BoxGeometry(0.08, 0.12, 0.08);
      const caliperMesh = new THREE.Mesh(caliperGeo, brakeCaliperMat);
      caliperMesh.position.set(-0.04, 0.12, 0);
      wheelGroup.add(caliperMesh);

      return wheelGroup;
    };

    // Wheel positions
    const wheelTrack = 0.98; // Half-width
    const wheelBaseFront = 1.35;
    const wheelBaseRear = -1.35;
    const wheelRadiusY = 0.38;

    const frontLeftWheel = createWheel();
    frontLeftWheel.position.set(-wheelTrack, wheelRadiusY, wheelBaseFront);
    carGroup.add(frontLeftWheel);

    const frontRightWheel = createWheel();
    frontRightWheel.position.set(wheelTrack, wheelRadiusY, wheelBaseFront);
    frontRightWheel.rotation.y = Math.PI; // Flip for right side
    carGroup.add(frontRightWheel);

    const rearLeftWheel = createWheel();
    rearLeftWheel.position.set(-wheelTrack, wheelRadiusY, wheelBaseRear);
    carGroup.add(rearLeftWheel);

    const rearRightWheel = createWheel();
    rearRightWheel.position.set(wheelTrack, wheelRadiusY, wheelBaseRear);
    rearRightWheel.rotation.y = Math.PI;
    carGroup.add(rearRightWheel);

    const wheels = [frontLeftWheel, frontRightWheel, rearLeftWheel, rearRightWheel];

    let currentColor: CarColor = 'blue';
    const setPaintColor = (color: CarColor) => {
      currentColor = color;
      const config = CAR_COLOR_MAP[color];
      bodyPaintMat.color.setHex(config.color);
      bodyPaintMat.metalness = config.metalness;
      bodyPaintMat.roughness = config.roughness;
      bodyPaintMat.needsUpdate = true;
    };

    const setSteeringAngle = (angleRad: number) => {
      // Rotate the front wheel assemblies
      frontLeftWheel.rotation.y = angleRad;
      frontRightWheel.rotation.y = Math.PI + angleRad;
    };

    const setBrakeLights = (active: boolean) => {
      taillightLensMat.emissiveIntensity = active ? 4.5 : 1.8;
      taillightLensMat.color.setHex(active ? 0xff1e1e : 0x991b1b);
      taillightLensMat.needsUpdate = true;
    };

    return {
      carGroup,
      wheels,
      frontLeftWheel,
      frontRightWheel,
      rearLeftWheel,
      rearRightWheel,
      headlights,
      hoodMesh,
      frontBumperMesh,
      setPaintColor,
      get currentColor() {
        return currentColor;
      },
      setSteeringAngle,
      setBrakeLights,
    };
  }
}
