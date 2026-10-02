import * as THREE from 'three';
import { AudioEngine } from './AudioEngine';
import { CarBuilder, CarColor, CarComponents } from './CarBuilder';
import { EnvironmentBuilder, EnvironmentObjects, TimeOfDay } from './EnvironmentBuilder';
import { ObstacleBuilder, ObstacleData, ObstacleType } from './ObstacleBuilder';
import { ParticleSystem } from './ParticleEffects';
import { PhysicsWorld } from './PhysicsWorld';
import { RainSystem } from './RainSystem';

export type CameraAngle = 'behind' | 'side' | 'top';
export type SimulationStatus = 'cruising' | 'falling_rock' | 'impact' | 'wrecked';

export interface SimulationState {
  isPlaying: boolean;
  speedKmH: number;
  status: SimulationStatus;
  cameraAngle: CameraAngle;
  carColor: CarColor;
  obstacleType: ObstacleType;
  timeOfDay: TimeOfDay;
  isMuted: boolean;
}

export class SimulationController {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;

  public audio: AudioEngine;
  public physics: PhysicsWorld;
  public particles: ParticleSystem;
  public rain: RainSystem;
  public car: CarComponents;
  public env: EnvironmentObjects;

  // Lights for dynamic weather
  private ambientLight!: THREE.AmbientLight;
  private hemiLight!: THREE.HemisphereLight;
  private sunLight!: THREE.DirectionalLight;

  // Active Obstacle
  public currentObstacleType: ObstacleType = 'rock';
  public currentObstacleData!: ObstacleData;

  // Active Config
  public currentCarColor: CarColor = 'blue';
  public currentTimeOfDay: TimeOfDay = 'sunny';
  public currentCameraAngle: CameraAngle = 'behind';

  private isPlaying: boolean = true;
  private status: SimulationStatus = 'cruising';
  private simTime: number = 0;
  private speedKmH: number = 92;

  // Player Hand Controls
  public steerInput: number = 0; // -1 (left) to +1 (right)
  public throttleInput: number = 0.8; // 0 to 1
  public brakeInput: boolean = false;

  public setHandControls(steer: number, throttle: number, brake: boolean) {
    this.steerInput = steer;
    this.throttleInput = throttle;
    this.brakeInput = brake;

    if (this.car) {
      this.car.setSteeringAngle(-steer * 0.42);
      this.car.setBrakeLights(brake);
    }

    if (brake && this.speedKmH > 35) {
      this.audio.playLoudTireScreech();
      this.particles.emitTireSkidSmoke(this.car.carGroup.position);
    }
  }

  private clock: THREE.Clock;
  private container: HTMLElement;
  private animationFrameId: number | null = null;

  // Camera tracking helpers
  private cameraTarget: THREE.Vector3 = new THREE.Vector3();
  private shakeIntensity: number = 0;
  private slowMoFactor: number = 1.0;

  // Listeners for UI state updates
  public onStateChange?: (state: SimulationState) => void;

  constructor(container: HTMLElement) {
    this.container = container;
    this.clock = new THREE.Clock();

    // 1. Three.js Scene & Fog
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0xb2d9ea, 0.0055);

    // 2. Camera
    this.camera = new THREE.PerspectiveCamera(
      52,
      container.clientWidth / container.clientHeight,
      0.1,
      1200
    );

    // 3. WebGLRenderer with high-end shadows and tone mapping
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    container.appendChild(this.renderer.domElement);

    // 4. Lighting & Sun
    this.setupLighting();

    // 5. Build Subsystems
    this.audio = new AudioEngine();
    this.physics = new PhysicsWorld(this.scene);
    this.particles = new ParticleSystem(this.scene);
    this.rain = new RainSystem(this.scene);
    this.car = CarBuilder.buildCar();
    this.scene.add(this.car.carGroup);
    this.env = EnvironmentBuilder.buildEnvironment(this.scene);

    // Link collision callback
    this.physics.onCollisionCallback = (point: THREE.Vector3) => {
      this.handleCrashCollision(point);
    };

    // Resize handler
    window.addEventListener('resize', this.onResize);

    // Initial random configuration on page load
    this.randomizeAndReset();
    this.animate();
  }

  private setupLighting() {
    this.ambientLight = new THREE.AmbientLight(0xdbeafe, 0.65);
    this.scene.add(this.ambientLight);

    this.hemiLight = new THREE.HemisphereLight(0xbfdbfe, 0x3b82f6, 0.45);
    this.hemiLight.position.set(0, 50, 0);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfffaed, 2.4);
    this.sunLight.position.set(-60, 85, 45);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 0.5;
    this.sunLight.shadow.camera.far = 300;
    this.sunLight.shadow.camera.left = -35;
    this.sunLight.shadow.camera.right = 35;
    this.sunLight.shadow.camera.top = 35;
    this.sunLight.shadow.camera.bottom = -35;
    this.sunLight.shadow.bias = -0.0003;
    this.sunLight.shadow.normalBias = 0.02;
    this.scene.add(this.sunLight);

    this.sunLight.target.position.set(0, 0, 0);
    this.scene.add(this.sunLight.target);
  }

  public randomizeAndReset() {
    // 1. Random car color: red, blue, white, black
    const colors: CarColor[] = ['red', 'blue', 'white', 'black'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    this.setCarColor(randomColor);

    // 2. Random obstacle: fallen tree, big rock, barrel, traffic cone
    const obstacles: ObstacleType[] = ['tree', 'rock', 'barrel', 'cone'];
    const randomObstacle = obstacles[Math.floor(Math.random() * obstacles.length)];
    this.setObstacleType(randomObstacle);

    // 3. Random time of day: sunny, cloudy, raining
    const weathers: TimeOfDay[] = ['sunny', 'cloudy', 'rainy'];
    const randomWeather = weathers[Math.floor(Math.random() * weathers.length)];
    this.setTimeOfDay(randomWeather);

    // 4. Random camera angle: behind the car, side view, top view
    const cameraAngles: CameraAngle[] = ['behind', 'side', 'top'];
    const randomCamera = cameraAngles[Math.floor(Math.random() * cameraAngles.length)];
    this.setCameraAngle(randomCamera);

    // Reset physics and state
    this.resetSimulation();
  }

  public setCarColor(color: CarColor) {
    this.currentCarColor = color;
    this.car.setPaintColor(color);
    this.notifyState();
  }

  public setObstacleType(type: ObstacleType) {
    this.currentObstacleType = type;

    // Remove old obstacle mesh if present
    if (this.currentObstacleData) {
      this.scene.remove(this.currentObstacleData.mesh);
    }

    // Build new obstacle
    this.currentObstacleData = ObstacleBuilder.createObstacle(type);
    this.scene.add(this.currentObstacleData.mesh);
    this.physics.setObstacle(this.currentObstacleData);

    this.notifyState();
  }

  public setTimeOfDay(weather: TimeOfDay) {
    this.currentTimeOfDay = weather;
    this.env.setWeather(weather);

    if (weather === 'rainy') {
      // Dark moody stormy lighting
      this.scene.background = new THREE.Color(0x334155);
      if (this.scene.fog) {
        this.scene.fog.color.setHex(0x334155);
        (this.scene.fog as THREE.FogExp2).density = 0.012;
      }
      this.sunLight.color.setHex(0x94a3b8);
      this.sunLight.intensity = 0.95;
      this.ambientLight.color.setHex(0x475569);
      this.ambientLight.intensity = 0.85;

      this.rain.setEnabled(true);
      this.audio.setRain(true);
      this.physics.setSlipperyRoad(true);
    } else if (weather === 'cloudy') {
      // Diffused overcast silver sky
      this.scene.background = new THREE.Color(0x94a3b8);
      if (this.scene.fog) {
        this.scene.fog.color.setHex(0x94a3b8);
        (this.scene.fog as THREE.FogExp2).density = 0.007;
      }
      this.sunLight.color.setHex(0xe2e8f0);
      this.sunLight.intensity = 1.35;
      this.ambientLight.color.setHex(0x94a3b8);
      this.ambientLight.intensity = 0.75;

      this.rain.setEnabled(false);
      this.audio.setRain(false);
      this.physics.setSlipperyRoad(false);
    } else {
      // Sunny crisp blue coastal day
      this.scene.background = new THREE.Color(0xb2d9ea);
      if (this.scene.fog) {
        this.scene.fog.color.setHex(0xb2d9ea);
        (this.scene.fog as THREE.FogExp2).density = 0.0055;
      }
      this.sunLight.color.setHex(0xfffaed);
      this.sunLight.intensity = 2.4;
      this.ambientLight.color.setHex(0xdbeafe);
      this.ambientLight.intensity = 0.65;

      this.rain.setEnabled(false);
      this.audio.setRain(false);
      this.physics.setSlipperyRoad(false);
    }

    this.notifyState();
  }

  public setCameraAngle(angle: CameraAngle) {
    this.currentCameraAngle = angle;
    this.notifyState();
  }

  private onResize = () => {
    if (!this.container) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  private handleCrashCollision(point: THREE.Vector3) {
    this.status = 'impact';
    this.shakeIntensity = 1.7;
    this.slowMoFactor = 0.45;

    // Sound Effects:
    // 3. Heavy metal crash sound when the car hits the obstacle (triggers exactly on physics collision)
    this.audio.playHeavyMetalCrash();

    // 2. Loud tire screech sound when the car loses control and spins
    this.audio.playLoudTireScreech();

    // 4. Glass breaking sound after the crash
    setTimeout(() => {
      this.audio.playGlassBreaking();
    }, 85);

    // Particle FX
    this.particles.emitSparks(point, 50, 14);
    this.particles.emitSmoke(point, 18, 0x64748b);

    // Apply asymmetric spin-out torque to car body
    this.physics.carBody.angularVelocity.set(
      (Math.random() - 0.5) * 6,
      Math.random() * 8 + 4,
      Math.random() * 9 + 4
    );

    // Crumple / tilt hood
    this.car.hoodMesh.rotation.x = 0.45;
    this.car.frontBumperMesh.position.z = 1.85;

    setTimeout(() => {
      this.slowMoFactor = 1.0;
      if (this.status === 'impact') {
        this.status = 'wrecked';
        this.notifyState();
      }
    }, 1800);

    this.notifyState();
  }

  public togglePlayPause(): boolean {
    this.audio.init();
    this.isPlaying = !this.isPlaying;
    if (this.isPlaying) {
      this.audio.resume();
    } else {
      this.audio.pause();
    }
    this.notifyState();
    return this.isPlaying;
  }

  public toggleMute(): boolean {
    this.audio.init();
    const muted = this.audio.toggleMute();
    this.notifyState();
    return muted;
  }

  public resetSimulation() {
    this.status = 'cruising';
    this.simTime = 0;
    this.slowMoFactor = 1.0;
    this.shakeIntensity = 0;
    this.speedKmH = 92;

    this.physics.reset();
    this.particles.reset();
    this.audio.resetAudio();

    // Reset car visual components
    this.car.hoodMesh.rotation.x = 0.05;
    this.car.frontBumperMesh.position.set(0, 0.42, 2.12);

    // Sync initial mesh transforms
    this.car.carGroup.position.copy(this.physics.carBody.position as unknown as THREE.Vector3);
    this.car.carGroup.quaternion.copy(this.physics.carBody.quaternion as unknown as THREE.Quaternion);

    if (this.currentObstacleData) {
      this.currentObstacleData.mesh.position.copy(this.physics.obstacleBody.position as unknown as THREE.Vector3);
      this.currentObstacleData.mesh.quaternion.copy(this.physics.obstacleBody.quaternion as unknown as THREE.Quaternion);
    }

    this.cameraTarget.copy(this.car.carGroup.position);

    // Reapply weather physics
    this.setTimeOfDay(this.currentTimeOfDay);

    this.notifyState();
  }

  private notifyState() {
    if (this.onStateChange) {
      this.onStateChange({
        isPlaying: this.isPlaying,
        speedKmH: Math.round(this.speedKmH),
        status: this.status,
        cameraAngle: this.currentCameraAngle,
        carColor: this.currentCarColor,
        obstacleType: this.currentObstacleType,
        timeOfDay: this.currentTimeOfDay,
        isMuted: this.audio.getMuted(),
      });
    }
  }

  private updateCamera(delta: number) {
    const carPos = this.car.carGroup.position;
    const carRot = this.car.carGroup.quaternion;

    this.cameraTarget.lerp(carPos, delta * 7);

    // Camera shake decay
    let shakeOffset = new THREE.Vector3();
    if (this.shakeIntensity > 0) {
      shakeOffset.set(
        (Math.random() - 0.5) * this.shakeIntensity,
        (Math.random() - 0.5) * this.shakeIntensity,
        (Math.random() - 0.5) * this.shakeIntensity
      );
      this.shakeIntensity = Math.max(0, this.shakeIntensity - delta * 2.2);
    }

    if (this.currentCameraAngle === 'behind') {
      // 1. Behind the car: dynamic third-person chase camera
      const offset = new THREE.Vector3(0, 2.3, 6.8).applyQuaternion(carRot);
      const desiredPos = carPos.clone().add(offset);
      this.camera.position.lerp(desiredPos, delta * 6.5);
      this.camera.lookAt(carPos.x, carPos.y + 1.1, carPos.z - 5);
    } else if (this.currentCameraAngle === 'side') {
      // 2. Side view: dynamic ocean-side tracking perspective
      const sideOffset = new THREE.Vector3(5.8, 1.8, 2.5);
      const desiredPos = carPos.clone().add(sideOffset);
      this.camera.position.lerp(desiredPos, delta * 5.0);
      this.camera.lookAt(carPos.x, carPos.y + 0.8, carPos.z - 2.5);
    } else if (this.currentCameraAngle === 'top') {
      // 3. Top view: high-angle bird's-eye helicopter tracking
      const topOffset = new THREE.Vector3(0.5, 17.5, 6.5);
      const desiredPos = carPos.clone().add(topOffset);
      this.camera.position.lerp(desiredPos, delta * 4.5);
      this.camera.lookAt(carPos.x, carPos.y + 0.3, carPos.z - 5);
    }

    if (this.shakeIntensity > 0) {
      this.camera.position.add(shakeOffset);
    }
  }

  private animate = () => {
    this.animationFrameId = requestAnimationFrame(this.animate);

    const rawDelta = this.clock.getDelta();
    if (!this.isPlaying) {
      this.renderer.render(this.scene, this.camera);
      return;
    }

    const delta = Math.min(rawDelta, 0.05) * this.slowMoFactor;
    this.simTime += delta;

    // 1. Update Ocean Waves
    this.env.updateOcean(this.simTime);

    // Apply Real-time Hand / Keyboard Drive Controls
    this.physics.applyDriveControls(this.steerInput, this.throttleInput, this.brakeInput, delta);

    // 2. Physics Step
    this.physics.step(delta);

    // 3. Synchronize Three.js Meshes with Physics Bodies
    const carPos = this.physics.carBody.position;
    const carQuat = this.physics.carBody.quaternion;

    this.car.carGroup.position.set(carPos.x, carPos.y, carPos.z);
    this.car.carGroup.quaternion.set(carQuat.x, carQuat.y, carQuat.z, carQuat.w);

    if (this.currentObstacleData) {
      const obsPos = this.physics.obstacleBody.position;
      const obsQuat = this.physics.obstacleBody.quaternion;
      this.currentObstacleData.mesh.position.set(obsPos.x, obsPos.y, obsPos.z);
      this.currentObstacleData.mesh.quaternion.set(obsQuat.x, obsQuat.y, obsQuat.z, obsQuat.w);
    }

    // Calculate speed (magnitude of forward velocity in km/h)
    const vel = this.physics.carBody.velocity;
    const speedMs = Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z);
    this.speedKmH = speedMs * 3.6;

    // Update sound engine pitch
    this.audio.updateEnginePitch(Math.min(1.0, this.speedKmH / 100));

    // 4. Wheels rotation and steering
    if (this.status === 'cruising' || this.status === 'falling_rock') {
      const wheelRotation = (-vel.z * delta) / 0.38;
      for (const wheel of this.car.wheels) {
        wheel.children[0].rotation.x += wheelRotation;
        if (wheel.children[1]) wheel.children[1].rotation.x += wheelRotation;
      }
    }

    // 5. Scenario Logic
    if (this.status === 'cruising') {
      if (carPos.z < 35) {
        this.status = 'falling_rock';
        this.physics.triggerObstacleFall();
        this.audio.playRockTumble();
        const obsPos = this.physics.obstacleBody.position;
        this.particles.emitSmoke(new THREE.Vector3(obsPos.x, obsPos.y, obsPos.z), 15, 0x78716c);
        this.notifyState();
      }
    }

    // Emit dust/smoke during tumble
    if (this.status === 'falling_rock') {
      const obsPos = this.physics.obstacleBody.position;
      if (obsPos.y > 0.5 && obsPos.y < 3.0 && Math.random() < 0.3) {
        this.particles.emitSmoke(new THREE.Vector3(obsPos.x, obsPos.y, obsPos.z), 4, 0x78716c);
      }

      // Hard braking / losing control sound right before impact
      if (carPos.z < 8 && !this.physics.hasCollided) {
        this.audio.playLoudTireScreech();
        this.particles.emitTireSkidSmoke(this.car.carGroup.position);
      }
    }

    // Emit tire smoke if car is skidding or spinning
    if (this.status === 'impact' || this.status === 'wrecked') {
      if (this.speedKmH > 15) {
        this.particles.emitTireSkidSmoke(this.car.carGroup.position);
        if (Math.random() < 0.4) {
          this.particles.emitSparks(this.car.carGroup.position, 6, 6);
        }
      }
    }

    // 6. Update Rain Particles
    this.rain.update(delta, carPos.z);

    // 7. Update Particle System
    this.particles.update(delta);

    // 8. Update Camera Choreography
    this.updateCamera(delta);

    // 9. Render Scene
    this.renderer.render(this.scene, this.camera);
  }

  public dispose() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
    window.removeEventListener('resize', this.onResize);
    this.renderer.dispose();
  }
}
