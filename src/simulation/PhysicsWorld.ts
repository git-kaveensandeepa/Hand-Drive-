import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import { ObstacleData } from './ObstacleBuilder';

export interface DebrisObject {
  mesh: THREE.Mesh;
  body: CANNON.Body;
}

export class PhysicsWorld {
  public world: CANNON.World;
  public groundBody: CANNON.Body;
  public carBody: CANNON.Body;
  public obstacleBody: CANNON.Body;
  public guardrailBody: CANNON.Body;
  public hillBody: CANNON.Body;

  public carMaterial: CANNON.Material;
  public groundMaterial: CANNON.Material;
  public obstacleMaterial: CANNON.Material;
  public carGroundCM: CANNON.ContactMaterial;

  public debrisList: DebrisObject[] = [];
  private sceneRef: THREE.Scene;

  public hasCollided: boolean = false;
  public obstacleTriggered: boolean = false;
  public currentObstacleData?: ObstacleData;

  public onCollisionCallback?: (point: THREE.Vector3) => void;

  constructor(scene: THREE.Scene) {
    this.sceneRef = scene;
    this.world = new CANNON.World({
      gravity: new CANNON.Vec3(0, -11.5, 0),
    });

    // Solver configuration for realistic stiff contacts
    this.world.defaultContactMaterial.contactEquationStiffness = 1e7;
    this.world.defaultContactMaterial.contactEquationRelaxation = 3;

    // Materials
    this.groundMaterial = new CANNON.Material('ground');
    this.carMaterial = new CANNON.Material('car');
    this.obstacleMaterial = new CANNON.Material('obstacle');

    // Contact Materials
    this.carGroundCM = new CANNON.ContactMaterial(this.carMaterial, this.groundMaterial, {
      friction: 0.65,
      restitution: 0.08,
    });
    this.world.addContactMaterial(this.carGroundCM);

    const carObstacleCM = new CANNON.ContactMaterial(this.carMaterial, this.obstacleMaterial, {
      friction: 0.7,
      restitution: 0.45,
    });
    this.world.addContactMaterial(carObstacleCM);

    const obsGroundCM = new CANNON.ContactMaterial(this.obstacleMaterial, this.groundMaterial, {
      friction: 0.75,
      restitution: 0.35,
    });
    this.world.addContactMaterial(obsGroundCM);

    // 1. Ground Plane
    this.groundBody = new CANNON.Body({
      type: CANNON.Body.STATIC,
      shape: new CANNON.Plane(),
      material: this.groundMaterial,
    });
    this.groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(this.groundBody);

    // 2. Hillside Slope (Left side where obstacle drops from)
    this.hillBody = new CANNON.Body({
      type: CANNON.Body.STATIC,
      shape: new CANNON.Box(new CANNON.Vec3(15, 8, 120)),
      position: new CANNON.Vec3(-16, 4.5, -30),
      material: this.groundMaterial,
    });
    this.hillBody.quaternion.setFromEuler(0, 0, -0.22);
    this.world.addBody(this.hillBody);

    // 3. Ocean Guardrail Collider (Right side)
    this.guardrailBody = new CANNON.Body({
      type: CANNON.Body.STATIC,
      shape: new CANNON.Box(new CANNON.Vec3(0.2, 0.6, 180)),
      position: new CANNON.Vec3(6.6, 0.6, -50),
      material: this.groundMaterial,
    });
    this.world.addBody(this.guardrailBody);

    // 4. Car Rigid Body (Compound Shape for Stable Realistic Dynamics)
    this.carBody = new CANNON.Body({
      mass: 1450,
      material: this.carMaterial,
      angularDamping: 0.4,
      linearDamping: 0.08,
    });

    // Main lower chassis
    const chassisShape = new CANNON.Box(new CANNON.Vec3(0.95, 0.3, 2.1));
    this.carBody.addShape(chassisShape, new CANNON.Vec3(0, 0.45, 0));

    // Upper cabin shape
    const cabinShape = new CANNON.Box(new CANNON.Vec3(0.8, 0.32, 1.1));
    this.carBody.addShape(cabinShape, new CANNON.Vec3(0, 0.95, -0.2));

    // Front bumper wedge shape for crash impact dynamics
    const bumperShape = new CANNON.Box(new CANNON.Vec3(0.9, 0.2, 0.3));
    this.carBody.addShape(bumperShape, new CANNON.Vec3(0, 0.35, 2.0));

    this.carBody.position.set(2.2, 0.42, 100);
    this.world.addBody(this.carBody);

    // 5. Obstacle Body
    this.obstacleBody = new CANNON.Body({
      mass: 980,
      material: this.obstacleMaterial,
      linearDamping: 0.1,
      angularDamping: 0.2,
    });
    this.obstacleBody.addShape(new CANNON.Sphere(1.15));
    this.obstacleBody.position.set(-13, 8.5, -28);
    this.obstacleBody.type = CANNON.Body.KINEMATIC;
    this.world.addBody(this.obstacleBody);

    // Collision listener
    this.carBody.addEventListener('collide', (e: { body: CANNON.Body; contact: CANNON.ContactEquation }) => {
      if (e.body === this.obstacleBody && !this.hasCollided) {
        this.hasCollided = true;
        const pt = new THREE.Vector3(
          e.contact.bj.position.x,
          e.contact.bj.position.y,
          e.contact.bj.position.z
        );
        if (this.onCollisionCallback) {
          this.onCollisionCallback(pt);
        }
        this.spawnCrashDebris(pt);
      }
    });
  }

  public setSlipperyRoad(isSlippery: boolean) {
    if (isSlippery) {
      this.carGroundCM.friction = 0.22;
      this.carGroundCM.restitution = 0.04;
      this.carBody.linearDamping = 0.03;
      this.carBody.angularDamping = 0.25;
    } else {
      this.carGroundCM.friction = 0.65;
      this.carGroundCM.restitution = 0.08;
      this.carBody.linearDamping = 0.08;
      this.carBody.angularDamping = 0.4;
    }
  }

  public setObstacle(data: ObstacleData) {
    this.currentObstacleData = data;

    // Remove old shapes
    while (this.obstacleBody.shapes.length > 0) {
      this.obstacleBody.removeShape(this.obstacleBody.shapes[0]);
    }

    // Add new shape and update mass/inertia
    this.obstacleBody.addShape(data.shape);
    this.obstacleBody.mass = data.mass;
    this.obstacleBody.updateMassProperties();
  }

  public triggerObstacleFall() {
    if (this.obstacleTriggered) return;
    this.obstacleTriggered = true;
    this.obstacleBody.type = CANNON.Body.DYNAMIC;

    const vel = this.currentObstacleData?.initialVelocity || new CANNON.Vec3(6.8, -1.5, -0.5);
    const angVel = this.currentObstacleData?.initialAngularVelocity || new CANNON.Vec3(3.5, 1.2, -4.2);

    this.obstacleBody.velocity.copy(vel);
    this.obstacleBody.angularVelocity.copy(angVel);
  }

  public spawnCrashDebris(impactPoint: THREE.Vector3) {
    const obstacleColor = this.currentObstacleData?.debrisColor || 0x52525b;

    const debrisMats = [
      new THREE.MeshPhysicalMaterial({ color: 0x1d4ed8, metalness: 0.8, roughness: 0.2 }),
      new THREE.MeshStandardMaterial({ color: obstacleColor, roughness: 0.8 }),
      new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.7 }),
      new THREE.MeshPhysicalMaterial({ color: 0x93c5fd, transparent: true, opacity: 0.7, roughness: 0.1 }),
      new THREE.MeshStandardMaterial({ color: obstacleColor, roughness: 0.6, metalness: 0.2 }),
    ];

    for (let i = 0; i < 7; i++) {
      const sizeX = 0.18 + Math.random() * 0.35;
      const sizeY = 0.1 + Math.random() * 0.18;
      const sizeZ = 0.18 + Math.random() * 0.35;

      const geo = new THREE.BoxGeometry(sizeX, sizeY, sizeZ);
      const mesh = new THREE.Mesh(geo, debrisMats[i % debrisMats.length]);
      mesh.castShadow = true;
      this.sceneRef.add(mesh);

      const shape = new CANNON.Box(new CANNON.Vec3(sizeX / 2, sizeY / 2, sizeZ / 2));
      const body = new CANNON.Body({
        mass: 10 + Math.random() * 20,
        shape: shape,
        material: this.groundMaterial,
      });

      body.position.set(
        impactPoint.x + (Math.random() - 0.5) * 1.5,
        impactPoint.y + 0.5 + Math.random() * 0.8,
        impactPoint.z + (Math.random() - 0.5) * 1.5
      );

      body.velocity.set(
        (Math.random() - 0.5) * 18,
        Math.random() * 12 + 4,
        (Math.random() - 0.5) * 16 - 12
      );

      body.angularVelocity.set(
        (Math.random() - 0.5) * 22,
        (Math.random() - 0.5) * 22,
        (Math.random() - 0.5) * 22
      );

      this.world.addBody(body);
      this.debrisList.push({ mesh, body });
    }
  }

  public applyDriveControls(steer: number, throttle: number, brake: boolean, delta: number) {
    if (this.hasCollided) return;

    if (brake) {
      // Hard brake deceleration
      const brakeDecel = 28.0 * delta;
      if (this.carBody.velocity.z < 0) {
        this.carBody.velocity.z = Math.min(0, this.carBody.velocity.z + brakeDecel);
      }
    } else if (throttle > 0) {
      // Acceleration forward (forward is -Z)
      const maxSpeedZ = -34.0 * throttle; // up to ~122 km/h
      if (this.carBody.velocity.z > maxSpeedZ) {
        const accelForce = 18.0 * delta * throttle;
        this.carBody.velocity.z = Math.max(maxSpeedZ, this.carBody.velocity.z - accelForce);
      }
    } else {
      // Coasting aerodynamic and rolling friction
      this.carBody.velocity.z *= 1 - 0.18 * delta;
    }

    // Lateral steering response
    const speedRatio = Math.min(1.0, Math.abs(this.carBody.velocity.z) / 25.0);
    const targetVx = steer * (speedRatio * 8.5 + 1.5);
    this.carBody.velocity.x += (targetVx - this.carBody.velocity.x) * Math.min(1.0, delta * 9.0);

    // Keep car clamped safely within roadway boundaries while driving
    if (this.carBody.position.x < -4.8) {
      this.carBody.position.x = -4.8;
      this.carBody.velocity.x = Math.max(0, this.carBody.velocity.x);
    } else if (this.carBody.position.x > 5.2) {
      this.carBody.position.x = 5.2;
      this.carBody.velocity.x = Math.min(0, this.carBody.velocity.x);
    }

    // Heading yaw matches steering
    const targetYaw = -steer * 0.18;
    this.carBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), targetYaw);
    this.carBody.angularVelocity.set(0, 0, 0);
  }

  public step(delta: number) {
    this.world.step(Math.min(delta, 0.05), delta, 4);

    // Update debris meshes
    for (const d of this.debrisList) {
      d.mesh.position.copy(d.body.position as unknown as THREE.Vector3);
      d.mesh.quaternion.copy(d.body.quaternion as unknown as THREE.Quaternion);
    }
  }

  public reset() {
    this.hasCollided = false;
    this.obstacleTriggered = false;

    // Reset car position and velocity
    this.carBody.position.set(2.2, 0.42, 100);
    this.carBody.quaternion.set(0, 0, 0, 1);
    this.carBody.velocity.set(0, 0, -25.5); // ~92 km/h
    this.carBody.angularVelocity.set(0, 0, 0);

    // Reset obstacle
    this.obstacleBody.type = CANNON.Body.KINEMATIC;
    this.obstacleBody.position.set(-13, 8.5, -28);
    this.obstacleBody.quaternion.set(0, 0, 0, 1);
    this.obstacleBody.velocity.set(0, 0, 0);
    this.obstacleBody.angularVelocity.set(0, 0, 0);

    // Clean up debris
    for (const d of this.debrisList) {
      this.world.removeBody(d.body);
      this.sceneRef.remove(d.mesh);
      d.mesh.geometry.dispose();
    }
    this.debrisList = [];
  }
}
