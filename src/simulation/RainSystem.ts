import * as THREE from 'three';

export class RainSystem {
  private count = 2500;
  private rainGeometry: THREE.BufferGeometry;
  private rainMaterial: THREE.PointsMaterial;
  private rainPoints: THREE.Points;
  private enabled: boolean = false;

  constructor(scene: THREE.Scene) {
    this.rainGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(this.count * 3);

    for (let i = 0; i < this.count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 80;
      positions[i * 3 + 1] = Math.random() * 45;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 160;
    }

    this.rainGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    this.rainMaterial = new THREE.PointsMaterial({
      color: 0x93c5fd,
      size: 0.16,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.rainPoints = new THREE.Points(this.rainGeometry, this.rainMaterial);
    this.rainPoints.visible = false;
    scene.add(this.rainPoints);
  }

  public setEnabled(enabled: boolean) {
    this.enabled = enabled;
    this.rainPoints.visible = enabled;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public update(delta: number, carZ: number) {
    if (!this.enabled) return;

    const positions = this.rainGeometry.attributes.position.array as Float32Array;
    const fallSpeed = 55; // Fast rainfall speed

    for (let i = 0; i < this.count; i++) {
      positions[i * 3 + 1] -= fallSpeed * delta;

      // When hitting ground, reset to high above near the car's current position
      if (positions[i * 3 + 1] < 0) {
        positions[i * 3 + 1] = 35 + Math.random() * 15;
        positions[i * 3] = (Math.random() - 0.5) * 60;
        positions[i * 3 + 2] = carZ + (Math.random() - 0.5) * 90;
      }
    }

    this.rainGeometry.attributes.position.needsUpdate = true;
  }
}
