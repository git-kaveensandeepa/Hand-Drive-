import * as THREE from 'three';

export type TimeOfDay = 'sunny' | 'cloudy' | 'rainy';

export interface EnvironmentObjects {
  environmentGroup: THREE.Group;
  oceanMesh: THREE.Mesh;
  updateOcean: (time: number) => void;
  trees: THREE.Group[];
  roadLength: number;
  roadMesh: THREE.Mesh;
  setWeather: (weather: TimeOfDay) => void;
  currentWeather: TimeOfDay;
}

export class EnvironmentBuilder {
  public static createProceduralRoadTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 2048;
    const ctx = canvas.getContext('2d')!;

    // 1. Asphalt Base
    ctx.fillStyle = '#27292d';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 2. Asphalt Aggregate Noise / Grit
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const noise = (Math.random() - 0.5) * 22;
      data[i] = Math.min(255, Math.max(0, data[i] + noise));
      data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise));
      data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise));
    }
    ctx.putImageData(imgData, 0, 0);

    // 3. Road Markings
    const centerX = canvas.width / 2;
    const laneWidth = canvas.width * 0.38;

    // Solid white shoulder lines
    ctx.strokeStyle = '#f1f5f9';
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.moveTo(centerX - laneWidth, 0);
    ctx.lineTo(centerX - laneWidth, canvas.height);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(centerX + laneWidth, 0);
    ctx.lineTo(centerX + laneWidth, canvas.height);
    ctx.stroke();

    // Double dashed yellow center lines
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 9;
    ctx.setLineDash([90, 60]);

    ctx.beginPath();
    ctx.moveTo(centerX - 12, 0);
    ctx.lineTo(centerX - 12, canvas.height);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(centerX + 12, 0);
    ctx.lineTo(centerX + 12, canvas.height);
    ctx.stroke();

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 24); // Tile along the 380m road
    return texture;
  }

  public static buildEnvironment(scene: THREE.Scene): EnvironmentObjects {
    const environmentGroup = new THREE.Group();
    environmentGroup.name = 'Environment';
    scene.add(environmentGroup);

    const roadLength = 360;
    const roadWidth = 11;

    // 1. Road Mesh
    const roadTexture = this.createProceduralRoadTexture();
    const roadGeo = new THREE.PlaneGeometry(roadWidth, roadLength, 1, 60);
    const roadMat = new THREE.MeshPhysicalMaterial({
      map: roadTexture,
      roughness: 0.88,
      metalness: 0.12,
      clearcoat: 0.0,
      clearcoatRoughness: 0.2,
    });
    const roadMesh = new THREE.Mesh(roadGeo, roadMat);
    roadMesh.rotation.x = -Math.PI / 2;
    roadMesh.position.set(0, 0.02, -50);
    roadMesh.receiveShadow = true;
    environmentGroup.add(roadMesh);

    // Concrete Shoulders & Curbs
    const curbGeo = new THREE.BoxGeometry(0.8, 0.25, roadLength);
    const curbMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      roughness: 0.9,
    });

    const curbLeft = new THREE.Mesh(curbGeo, curbMat);
    curbLeft.position.set(-roadWidth / 2 - 0.4, 0.1, -50);
    curbLeft.receiveShadow = true;
    environmentGroup.add(curbLeft);

    const curbRight = new THREE.Mesh(curbGeo, curbMat);
    curbRight.position.set(roadWidth / 2 + 0.4, 0.1, -50);
    curbRight.receiveShadow = true;
    environmentGroup.add(curbRight);

    // 2. Steel Guardrail on Ocean Side (Right / Positive X)
    const guardrailGroup = new THREE.Group();
    const guardrailRailGeo = new THREE.BoxGeometry(0.12, 0.35, roadLength);
    const guardrailMat = new THREE.MeshStandardMaterial({
      color: 0xd1d5db,
      metalness: 0.85,
      roughness: 0.3,
    });
    const guardrailRail = new THREE.Mesh(guardrailRailGeo, guardrailMat);
    guardrailRail.position.set(roadWidth / 2 + 1.1, 0.75, -50);
    guardrailRail.castShadow = true;
    guardrailRail.receiveShadow = true;
    guardrailGroup.add(guardrailRail);

    // Guardrail posts every 4 meters
    const postGeo = new THREE.BoxGeometry(0.12, 0.85, 0.12);
    for (let z = 120; z >= -230; z -= 4) {
      const post = new THREE.Mesh(postGeo, guardrailMat);
      post.position.set(roadWidth / 2 + 1.1, 0.42, z);
      post.castShadow = true;
      guardrailGroup.add(post);

      // Small reflector on post
      if (Math.abs(z % 8) < 1) {
        const refGeo = new THREE.BoxGeometry(0.04, 0.1, 0.08);
        const refMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
        const ref = new THREE.Mesh(refGeo, refMat);
        ref.position.set(roadWidth / 2 + 1.02, 0.75, z);
        guardrailGroup.add(ref);
      }
    }
    environmentGroup.add(guardrailGroup);

    // 3. Ocean & Coastline (Right Side)
    // Coastal cliff dropping down to ocean
    const cliffGeo = new THREE.BoxGeometry(16, 5.5, roadLength);
    const cliffMat = new THREE.MeshStandardMaterial({
      color: 0x57534e,
      roughness: 0.95,
      metalness: 0.05,
    });
    const cliffMesh = new THREE.Mesh(cliffGeo, cliffMat);
    cliffMesh.position.set(roadWidth / 2 + 8.5, -2.6, -50);
    cliffMesh.receiveShadow = true;
    environmentGroup.add(cliffMesh);

    // Sandy Shore Edge
    const sandGeo = new THREE.PlaneGeometry(24, roadLength);
    const sandMat = new THREE.MeshStandardMaterial({
      color: 0xd6c49a,
      roughness: 0.95,
    });
    const sandMesh = new THREE.Mesh(sandGeo, sandMat);
    sandMesh.rotation.x = -Math.PI / 2;
    sandMesh.position.set(roadWidth / 2 + 24, -4.8, -50);
    sandMesh.receiveShadow = true;
    environmentGroup.add(sandMesh);

    // Vast Animated Ocean Plane
    const oceanWidth = 700;
    const oceanLength = 800;
    const oceanSegments = 120;
    const oceanGeo = new THREE.PlaneGeometry(oceanWidth, oceanLength, oceanSegments, oceanSegments);
    const oceanMat = new THREE.MeshStandardMaterial({
      color: 0x0369a1,
      roughness: 0.12,
      metalness: 0.75,
      flatShading: true,
    });
    const oceanMesh = new THREE.Mesh(oceanGeo, oceanMat);
    oceanMesh.rotation.x = -Math.PI / 2;
    oceanMesh.position.set(oceanWidth / 2 + roadWidth / 2 + 15, -4.6, -50);
    oceanMesh.receiveShadow = true;
    environmentGroup.add(oceanMesh);

    // Cache original vertex positions for wave displacement
    const posAttribute = oceanGeo.attributes.position;
    const originalPositions = new Float32Array(posAttribute.array);

    const updateOcean = (time: number) => {
      const positions = posAttribute.array as Float32Array;
      for (let i = 0; i < positions.length; i += 3) {
        const u = originalPositions[i];
        const v = originalPositions[i + 1];
        // Combine multi-frequency gentle coastal ocean waves
        const wave1 = Math.sin(u * 0.04 + time * 1.6) * 0.45;
        const wave2 = Math.cos(v * 0.03 + time * 1.2) * 0.35;
        const wave3 = Math.sin((u + v) * 0.02 + time * 0.8) * 0.25;
        positions[i + 2] = wave1 + wave2 + wave3;
      }
      posAttribute.needsUpdate = true;
      oceanGeo.computeVertexNormals();
    };

    // 4. Landward Hillside & Trees (Left / Negative X)
    const hillGeo = new THREE.BoxGeometry(60, 22, roadLength);
    const hillMat = new THREE.MeshStandardMaterial({
      color: 0x3f6212, // Rich coastal hillside green
      roughness: 0.95,
      metalness: 0.05,
    });
    const hillMesh = new THREE.Mesh(hillGeo, hillMat);
    hillMesh.position.set(-roadWidth / 2 - 30, 4.5, -50);
    hillMesh.rotation.z = -0.22; // Slopes down toward road
    hillMesh.receiveShadow = true;
    environmentGroup.add(hillMesh);

    // Rocky outcrops along hillside
    const rockMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.9,
    });
    for (let i = 0; i < 28; i++) {
      const rSize = 2 + Math.random() * 3.5;
      const rockGeo = new THREE.DodecahedronGeometry(rSize, 1);
      const rock = new THREE.Mesh(rockGeo, rockMat);
      const rZ = 100 - (i / 28) * 340 + (Math.random() - 0.5) * 15;
      const rX = -roadWidth / 2 - 6 - Math.random() * 18;
      const rY = 1.5 + (Math.abs(rX) - roadWidth / 2) * 0.25;
      rock.position.set(rX, rY, rZ);
      rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      rock.castShadow = true;
      rock.receiveShadow = true;
      environmentGroup.add(rock);
    }

    // 5. Trees along the road and hillside
    const trees: THREE.Group[] = [];

    // Realistic Tree generator
    const createPineTree = (heightScale = 1.0): THREE.Group => {
      const tree = new THREE.Group();

      // Trunk
      const trunkMat = new THREE.MeshStandardMaterial({
        color: 0x3d2817,
        roughness: 0.9,
      });
      const trunkGeo = new THREE.CylinderGeometry(0.22 * heightScale, 0.35 * heightScale, 4.5 * heightScale, 8);
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.y = (4.5 * heightScale) / 2;
      trunk.castShadow = true;
      trunk.receiveShadow = true;
      tree.add(trunk);

      // Multi-layer Conical Foliage
      const foliageMat = new THREE.MeshStandardMaterial({
        color: 0x14532d, // Deep forest green
        roughness: 0.85,
        flatShading: true,
      });

      const tiers = 3;
      for (let t = 0; t < tiers; t++) {
        const coneRadius = (2.2 - t * 0.45) * heightScale;
        const coneHeight = (2.6 - t * 0.3) * heightScale;
        const coneGeo = new THREE.ConeGeometry(coneRadius, coneHeight, 8);
        const cone = new THREE.Mesh(coneGeo, foliageMat);
        cone.position.y = (2.8 + t * 1.5) * heightScale;
        cone.castShadow = true;
        cone.receiveShadow = true;
        tree.add(cone);
      }

      return tree;
    };

    // Cypress/Coastal Tree generator
    const createCypressTree = (heightScale = 1.0): THREE.Group => {
      const tree = new THREE.Group();
      const trunkMat = new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.9 });
      const trunkGeo = new THREE.CylinderGeometry(0.18 * heightScale, 0.26 * heightScale, 3 * heightScale, 7);
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.y = 1.5 * heightScale;
      trunk.castShadow = true;
      tree.add(trunk);

      const leafMat = new THREE.MeshStandardMaterial({ color: 0x166534, roughness: 0.8, flatShading: true });
      const foliageGeo = new THREE.CylinderGeometry(0.4 * heightScale, 1.3 * heightScale, 6 * heightScale, 8);
      const foliage = new THREE.Mesh(foliageGeo, leafMat);
      foliage.position.y = 4.2 * heightScale;
      foliage.castShadow = true;
      tree.add(foliage);

      return tree;
    };

    // Populate trees along landward side
    for (let z = 115; z >= -240; z -= 6.5) {
      // Near verge trees
      const scale = 0.85 + Math.random() * 0.4;
      const tree = (z % 2 === 0) ? createPineTree(scale) : createCypressTree(scale);
      const xOffset = -roadWidth / 2 - 3.2 - Math.random() * 3.5;
      tree.position.set(xOffset, 0, z + (Math.random() - 0.5) * 3);
      tree.rotation.y = Math.random() * Math.PI * 2;
      environmentGroup.add(tree);
      trees.push(tree);

      // Higher hillside forest trees
      const hillTree = createPineTree(scale * 1.3);
      const hillX = -roadWidth / 2 - 12 - Math.random() * 16;
      const hillY = 2.5 + (Math.abs(hillX) - roadWidth / 2) * 0.28;
      hillTree.position.set(hillX, hillY, z + (Math.random() - 0.5) * 4);
      hillTree.rotation.y = Math.random() * Math.PI * 2;
      environmentGroup.add(hillTree);
      trees.push(hillTree);
    }

    // Occasional palm trees along ocean verge
    const createPalmTree = (): THREE.Group => {
      const palm = new THREE.Group();
      const trunkMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.85 });
      const trunkGeo = new THREE.CylinderGeometry(0.18, 0.28, 5.5, 8);
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.set(0, 2.7, 0);
      trunk.rotation.z = -0.15; // slight tilt toward ocean
      trunk.castShadow = true;
      palm.add(trunk);

      const frondMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.7, side: THREE.DoubleSide });
      for (let f = 0; f < 7; f++) {
        const frondGeo = new THREE.PlaneGeometry(0.6, 2.4);
        const frond = new THREE.Mesh(frondGeo, frondMat);
        const angle = (f * Math.PI * 2) / 7;
        frond.position.set(Math.cos(angle) * 0.8 - 0.4, 5.4, Math.sin(angle) * 0.8);
        frond.rotation.set(0.6, angle, 0);
        frond.castShadow = true;
        palm.add(frond);
      }
      return palm;
    };

    for (let z = 100; z >= -220; z -= 24) {
      const palm = createPalmTree();
      palm.position.set(roadWidth / 2 + 2.8, 0, z);
      environmentGroup.add(palm);
    }

    // 6. Modern Overhead Highway Street Lamps
    const lampMat = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.8, roughness: 0.3 });
    const lampGlowMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
    for (let z = 110; z >= -230; z -= 38) {
      const lampGroup = new THREE.Group();
      // Pole
      const poleGeo = new THREE.CylinderGeometry(0.08, 0.12, 7.5, 12);
      const pole = new THREE.Mesh(poleGeo, lampMat);
      pole.position.y = 3.75;
      pole.castShadow = true;
      lampGroup.add(pole);

      // Overhang Arm
      const armGeo = new THREE.BoxGeometry(2.5, 0.08, 0.08);
      const arm = new THREE.Mesh(armGeo, lampMat);
      arm.position.set(1.1, 7.3, 0);
      arm.rotation.z = -0.1;
      lampGroup.add(arm);

      // Light Fixture
      const fixtureGeo = new THREE.BoxGeometry(0.55, 0.1, 0.22);
      const fixture = new THREE.Mesh(fixtureGeo, lampGlowMat);
      fixture.position.set(2.2, 7.05, 0);
      lampGroup.add(fixture);

      lampGroup.position.set(-roadWidth / 2 - 1.2, 0, z);
      environmentGroup.add(lampGroup);
    }

    // Weather state handler
    let currentWeather: TimeOfDay = 'sunny';
    const setWeather = (weather: TimeOfDay) => {
      currentWeather = weather;
      if (weather === 'rainy') {
        // Wet, reflective asphalt road
        roadMat.roughness = 0.14;
        roadMat.metalness = 0.45;
        roadMat.clearcoat = 1.0;
        roadMat.clearcoatRoughness = 0.06;
        oceanMat.color.setHex(0x0f2942);
        oceanMat.roughness = 0.25;
      } else if (weather === 'cloudy') {
        roadMat.roughness = 0.82;
        roadMat.metalness = 0.1;
        roadMat.clearcoat = 0.0;
        oceanMat.color.setHex(0x1e3a5f);
        oceanMat.roughness = 0.2;
      } else {
        // Sunny
        roadMat.roughness = 0.88;
        roadMat.metalness = 0.12;
        roadMat.clearcoat = 0.0;
        oceanMat.color.setHex(0x0369a1);
        oceanMat.roughness = 0.12;
      }
      roadMat.needsUpdate = true;
      oceanMat.needsUpdate = true;
    };

    return {
      environmentGroup,
      oceanMesh,
      updateOcean,
      trees,
      roadLength,
      roadMesh,
      setWeather,
      get currentWeather() {
        return currentWeather;
      },
    };
  }
}
