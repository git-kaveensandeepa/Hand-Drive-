import * as THREE from 'three';

interface Particle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  size: number;
  color: THREE.Color;
  type: 'spark' | 'smoke' | 'dust';
}

export class ParticleSystem {
  private particles: Particle[] = [];
  private sparksGeometry: THREE.BufferGeometry;
  private sparksMaterial: THREE.PointsMaterial;
  private sparksPoints: THREE.Points;

  private smokeGeometry: THREE.BufferGeometry;
  private smokeMaterial: THREE.PointsMaterial;
  private smokePoints: THREE.Points;

  private maxParticles = 600;

  constructor(scene: THREE.Scene) {
    // 1. Sparks System
    this.sparksGeometry = new THREE.BufferGeometry();
    const sparkPositions = new Float32Array(this.maxParticles * 3);
    const sparkColors = new Float32Array(this.maxParticles * 3);
    this.sparksGeometry.setAttribute('position', new THREE.BufferAttribute(sparkPositions, 3));
    this.sparksGeometry.setAttribute('color', new THREE.BufferAttribute(sparkColors, 3));

    this.sparksMaterial = new THREE.PointsMaterial({
      size: 0.18,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });
    this.sparksPoints = new THREE.Points(this.sparksGeometry, this.sparksMaterial);
    scene.add(this.sparksPoints);

    // 2. Smoke / Dust System
    this.smokeGeometry = new THREE.BufferGeometry();
    const smokePositions = new Float32Array(this.maxParticles * 3);
    const smokeColors = new Float32Array(this.maxParticles * 3);
    this.smokeGeometry.setAttribute('position', new THREE.BufferAttribute(smokePositions, 3));
    this.smokeGeometry.setAttribute('color', new THREE.BufferAttribute(smokeColors, 3));

    this.smokeMaterial = new THREE.PointsMaterial({
      size: 0.95,
      vertexColors: true,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    this.smokePoints = new THREE.Points(this.smokeGeometry, this.smokeMaterial);
    scene.add(this.smokePoints);
  }

  public emitSparks(pos: THREE.Vector3, count = 25, spreadVelocity = 8) {
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.maxParticles) break;
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * spreadVelocity,
        Math.random() * (spreadVelocity * 0.8) + 1.5,
        (Math.random() - 0.5) * spreadVelocity
      );
      this.particles.push({
        position: pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.4, Math.random() * 0.4, (Math.random() - 0.5) * 0.4)),
        velocity: vel,
        life: 0,
        maxLife: 0.4 + Math.random() * 0.6,
        size: 0.15,
        color: new THREE.Color(1.0, 0.6 + Math.random() * 0.4, 0.1),
        type: 'spark',
      });
    }
  }

  public emitSmoke(pos: THREE.Vector3, count = 6, color = 0xd1d5db) {
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.maxParticles) break;
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 1.5,
        Math.random() * 1.8 + 0.5,
        (Math.random() - 0.5) * 1.5
      );
      this.particles.push({
        position: pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.1, (Math.random() - 0.5) * 0.6)),
        velocity: vel,
        life: 0,
        maxLife: 1.2 + Math.random() * 1.0,
        size: 0.8,
        color: new THREE.Color(color),
        type: 'smoke',
      });
    }
  }

  public emitTireSkidSmoke(pos: THREE.Vector3) {
    this.emitSmoke(pos, 3, 0x9ca3af);
  }

  public update(delta: number) {
    let sparkIdx = 0;
    let smokeIdx = 0;

    const sparkPos = this.sparksGeometry.attributes.position.array as Float32Array;
    const sparkCol = this.sparksGeometry.attributes.color.array as Float32Array;
    const smokePos = this.smokeGeometry.attributes.position.array as Float32Array;
    const smokeCol = this.smokeGeometry.attributes.color.array as Float32Array;

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += delta;

      if (p.life >= p.maxLife) {
        this.particles.splice(i, 1);
        continue;
      }

      // Physics update
      if (p.type === 'spark') {
        p.velocity.y -= 14.0 * delta; // Gravity
        p.position.addScaledVector(p.velocity, delta);

        // Ground bounce
        if (p.position.y < 0.05) {
          p.position.y = 0.05;
          p.velocity.y = -p.velocity.y * 0.35;
          p.velocity.x *= 0.6;
          p.velocity.z *= 0.6;
        }

        const alpha = 1.0 - p.life / p.maxLife;
        sparkPos[sparkIdx * 3] = p.position.x;
        sparkPos[sparkIdx * 3 + 1] = p.position.y;
        sparkPos[sparkIdx * 3 + 2] = p.position.z;

        sparkCol[sparkIdx * 3] = p.color.r * alpha;
        sparkCol[sparkIdx * 3 + 1] = p.color.g * alpha;
        sparkCol[sparkIdx * 3 + 2] = p.color.b * alpha;
        sparkIdx++;
      } else {
        // Smoke rises and expands
        p.velocity.y += 0.8 * delta;
        p.velocity.x *= 0.96;
        p.velocity.z *= 0.96;
        p.position.addScaledVector(p.velocity, delta);

        const progress = p.life / p.maxLife;
        const alpha = Math.sin(progress * Math.PI) * 0.45;

        smokePos[smokeIdx * 3] = p.position.x;
        smokePos[smokeIdx * 3 + 1] = p.position.y;
        smokePos[smokeIdx * 3 + 2] = p.position.z;

        smokeCol[smokeIdx * 3] = p.color.r * alpha;
        smokeCol[smokeIdx * 3 + 1] = p.color.g * alpha;
        smokeCol[smokeIdx * 3 + 2] = p.color.b * alpha;
        smokeIdx++;
      }
    }

    // Clear unused slots
    for (let i = sparkIdx; i < this.maxParticles; i++) {
      sparkPos[i * 3] = 0;
      sparkPos[i * 3 + 1] = -100;
      sparkPos[i * 3 + 2] = 0;
    }
    for (let i = smokeIdx; i < this.maxParticles; i++) {
      smokePos[i * 3] = 0;
      smokePos[i * 3 + 1] = -100;
      smokePos[i * 3 + 2] = 0;
    }

    this.sparksGeometry.attributes.position.needsUpdate = true;
    this.sparksGeometry.attributes.color.needsUpdate = true;
    this.smokeGeometry.attributes.position.needsUpdate = true;
    this.smokeGeometry.attributes.color.needsUpdate = true;
  }

  public reset() {
    this.particles = [];
  }
}
