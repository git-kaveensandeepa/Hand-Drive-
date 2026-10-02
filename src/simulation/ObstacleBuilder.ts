import * as CANNON from 'cannon-es';
import * as THREE from 'three';

export type ObstacleType = 'rock' | 'tree' | 'barrel' | 'cone';

export interface ObstacleData {
  mesh: THREE.Group;
  shape: CANNON.Shape;
  mass: number;
  initialVelocity: CANNON.Vec3;
  initialAngularVelocity: CANNON.Vec3;
  debrisColor: number;
}

export class ObstacleBuilder {
  /**
   * Builds the 3D mesh and physics shape for each obstacle type
   */
  public static createObstacle(type: ObstacleType): ObstacleData {
    const group = new THREE.Group();
    group.name = `Obstacle_${type}`;

    switch (type) {
      case 'tree': {
        // A heavy fallen pine/timber log with rough bark, cut ends, and broken branch stubs
        const logMat = new THREE.MeshStandardMaterial({
          color: 0x45230c, // Rich dark bark
          roughness: 0.95,
          metalness: 0.05,
        });

        const logEndMat = new THREE.MeshStandardMaterial({
          color: 0xd4a373, // Exposed wood grain at cuts
          roughness: 0.85,
        });

        // Main trunk (length 4.8m, radius 0.45m)
        const trunkGeo = new THREE.CylinderGeometry(0.42, 0.48, 4.8, 14);
        const trunkMesh = new THREE.Mesh(trunkGeo, logMat);
        trunkMesh.rotation.z = Math.PI / 2;
        trunkMesh.castShadow = true;
        trunkMesh.receiveShadow = true;
        group.add(trunkMesh);

        // Cut ends
        const endGeo = new THREE.CircleGeometry(0.42, 14);
        const endL = new THREE.Mesh(endGeo, logEndMat);
        endL.position.x = -2.405;
        endL.rotation.y = -Math.PI / 2;
        group.add(endL);

        const endR = new THREE.Mesh(endGeo, logEndMat);
        endR.position.x = 2.405;
        endR.rotation.y = Math.PI / 2;
        group.add(endR);

        // Broken branch stubs
        const branchGeo = new THREE.CylinderGeometry(0.12, 0.18, 1.2, 8);
        const b1 = new THREE.Mesh(branchGeo, logMat);
        b1.position.set(-0.8, 0.45, 0.2);
        b1.rotation.set(0.4, 0, 0.6);
        b1.castShadow = true;
        group.add(b1);

        const b2 = new THREE.Mesh(branchGeo, logMat);
        b2.position.set(0.9, -0.2, 0.45);
        b2.rotation.set(-0.5, 0, -0.4);
        b2.castShadow = true;
        group.add(b2);

        // Cannon-es shape: Box approximation for stable rolling log
        const shape = new CANNON.Box(new CANNON.Vec3(2.4, 0.46, 0.46));
        return {
          mesh: group,
          shape,
          mass: 850,
          initialVelocity: new CANNON.Vec3(6.2, -1.2, -0.2),
          initialAngularVelocity: new CANNON.Vec3(0, 0, -3.8),
          debrisColor: 0x45230c,
        };
      }

      case 'barrel': {
        // Heavy industrial metal drum (oil / hazardous barrel)
        const barrelMat = new THREE.MeshStandardMaterial({
          color: 0xca8a04, // Industrial Hazard Yellow
          roughness: 0.4,
          metalness: 0.6,
        });

        const blackBandMat = new THREE.MeshStandardMaterial({
          color: 0x18181b,
          roughness: 0.8,
        });

        // Main cylindrical barrel
        const barrelGeo = new THREE.CylinderGeometry(0.55, 0.55, 1.45, 20);
        const barrelMesh = new THREE.Mesh(barrelGeo, barrelMat);
        barrelMesh.castShadow = true;
        barrelMesh.receiveShadow = true;
        group.add(barrelMesh);

        // Ribbed reinforcement rings
        for (const ringY of [-0.35, 0.35]) {
          const ringGeo = new THREE.TorusGeometry(0.56, 0.04, 8, 24);
          const ring = new THREE.Mesh(ringGeo, blackBandMat);
          ring.rotation.x = Math.PI / 2;
          ring.position.y = ringY;
          group.add(ring);
        }

        // Hazard symbol decal plate
        const decalGeo = new THREE.PlaneGeometry(0.5, 0.5);
        const decalMat = new THREE.MeshBasicMaterial({ color: 0x18181b });
        const decal = new THREE.Mesh(decalGeo, decalMat);
        decal.position.set(0, 0, 0.56);
        group.add(decal);

        const shape = new CANNON.Cylinder(0.55, 0.55, 1.45, 12);
        return {
          mesh: group,
          shape,
          mass: 620,
          initialVelocity: new CANNON.Vec3(7.2, -1.5, -0.4),
          initialAngularVelocity: new CANNON.Vec3(4.5, 2.0, -5.0),
          debrisColor: 0xca8a04,
        };
      }

      case 'cone': {
        // Giant highway construction safety barrier cone
        const coneMat = new THREE.MeshStandardMaterial({
          color: 0xea580c, // Safety Orange
          roughness: 0.3,
          metalness: 0.1,
        });

        const stripeMat = new THREE.MeshStandardMaterial({
          color: 0xf8fafc, // High-visibility retro-reflective white
          roughness: 0.2,
          metalness: 0.3,
        });

        const baseMat = new THREE.MeshStandardMaterial({
          color: 0x18181b, // Weighted black rubber square base
          roughness: 0.9,
        });

        // Weighted square base
        const baseGeo = new THREE.BoxGeometry(1.6, 0.15, 1.6);
        const baseMesh = new THREE.Mesh(baseGeo, baseMat);
        baseMesh.position.y = 0.075;
        baseMesh.castShadow = true;
        group.add(baseMesh);

        // Main cone
        const coneGeo = new THREE.ConeGeometry(0.72, 1.8, 18);
        const coneMesh = new THREE.Mesh(coneGeo, coneMat);
        coneMesh.position.y = 1.05;
        coneMesh.castShadow = true;
        group.add(coneMesh);

        // White reflective band
        const stripeGeo = new THREE.CylinderGeometry(0.48, 0.6, 0.38, 18, 1, true);
        const stripeMesh = new THREE.Mesh(stripeGeo, stripeMat);
        stripeMesh.position.y = 0.85;
        group.add(stripeMesh);

        const shape = new CANNON.Box(new CANNON.Vec3(0.8, 0.9, 0.8));
        return {
          mesh: group,
          shape,
          mass: 450,
          initialVelocity: new CANNON.Vec3(6.5, -1.2, -0.3),
          initialAngularVelocity: new CANNON.Vec3(3.2, 1.5, -4.5),
          debrisColor: 0xea580c,
        };
      }

      case 'rock':
      default: {
        // Craggy granite boulder
        const boulderGeo = new THREE.DodecahedronGeometry(1.15, 2);
        const pos = boulderGeo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const vx = pos.getX(i);
          const vy = pos.getY(i);
          const vz = pos.getZ(i);
          const disp = 1.0 + Math.sin(vx * 3.2) * Math.cos(vy * 3.2) * Math.sin(vz * 3.2) * 0.28;
          pos.setXYZ(i, vx * disp, vy * disp, vz * disp);
        }
        boulderGeo.computeVertexNormals();

        const rockMat = new THREE.MeshStandardMaterial({
          color: 0x52525b,
          roughness: 0.95,
          metalness: 0.05,
          flatShading: true,
        });

        const rockMesh = new THREE.Mesh(boulderGeo, rockMat);
        rockMesh.castShadow = true;
        rockMesh.receiveShadow = true;
        group.add(rockMesh);

        const shape = new CANNON.Sphere(1.15);
        return {
          mesh: group,
          shape,
          mass: 1050,
          initialVelocity: new CANNON.Vec3(6.8, -1.5, -0.5),
          initialAngularVelocity: new CANNON.Vec3(3.5, 1.2, -4.2),
          debrisColor: 0x52525b,
        };
      }
    }
  }
}
