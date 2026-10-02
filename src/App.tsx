/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Volume2, VolumeX, RotateCcw, Camera, CameraOff } from 'lucide-react';

declare global {
  interface Window {
    Hands: any;
    Camera: any;
    drawConnectors: any;
    drawLandmarks: any;
    HAND_CONNECTIONS: any;
  }
}

export default function App() {
  const threeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const webcamCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Status & Telemetry
  const [statusText, setStatusText] = useState<string>('DRIVING');
  const [statusColor, setStatusColor] = useState<string>('text-emerald-400');
  const [speedKmh, setSpeedKmh] = useState<number>(50);
  const [distanceM, setDistanceM] = useState<number>(0);

  const formatDistance = (meters: number) => {
    if (meters >= 1000) {
      return `${(meters / 1000).toFixed(2)} KM`;
    }
    return `${meters} M`;
  };

  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Simulation references
  const soundRef = useRef<{
    ctx: AudioContext | null;
    isMuted: boolean;
    engineOsc: OscillatorNode | null;
    engineGain: GainNode | null;
    engineFilter: BiquadFilterNode | null;
    isScreeching: boolean;
    init: () => void;
    updateEnginePitch: (ratio: number) => void;
    playTireScreech: () => void;
    playHeavyCrash: () => void;
    toggleMute: () => boolean;
  }>({
    ctx: null,
    isMuted: false,
    engineOsc: null,
    engineGain: null,
    engineFilter: null,
    isScreeching: false,
    init: () => {},
    updateEnginePitch: () => {},
    playTireScreech: () => {},
    playHeavyCrash: () => {},
    toggleMute: () => false,
  });

  const controlsRef = useRef<{
    handDetected: boolean;
    gestureMode: 'stop' | 'normal' | 'high_speed';
    steerInputValue: number;
    smoothedHandX: number;
    hasCrashed: boolean;
  }>({
    handDetected: false,
    gestureMode: 'stop',
    steerInputValue: 0,
    smoothedHandX: 0.5,
    hasCrashed: false,
  });

  const resetGameRef = useRef<() => void>(() => {});
  const cameraUtilRef = useRef<any>(null);

  useEffect(() => {
    /* ==========================================================================
       1. WEB AUDIO API SOUND SYSTEM
       ========================================================================== */
    const sound = soundRef.current;
    sound.init = () => {
      if (sound.ctx && sound.ctx.state === 'running') return;
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      sound.ctx = new AudioCtxClass();

      sound.engineOsc = sound.ctx.createOscillator();
      sound.engineOsc.type = 'sawtooth';
      sound.engineOsc.frequency.setValueAtTime(45, sound.ctx.currentTime);

      sound.engineFilter = sound.ctx.createBiquadFilter();
      sound.engineFilter.type = 'lowpass';
      sound.engineFilter.frequency.setValueAtTime(280, sound.ctx.currentTime);
      sound.engineFilter.Q.setValueAtTime(2.0, sound.ctx.currentTime);

      sound.engineGain = sound.ctx.createGain();
      sound.engineGain.gain.setValueAtTime(sound.isMuted ? 0 : 0.15, sound.ctx.currentTime);

      sound.engineOsc.connect(sound.engineFilter);
      sound.engineFilter.connect(sound.engineGain);
      sound.engineGain.connect(sound.ctx.destination);

      sound.engineOsc.start();
    };

    sound.updateEnginePitch = (speedRatio: number) => {
      if (!sound.ctx || !sound.engineOsc || sound.isMuted) return;
      const now = sound.ctx.currentTime;
      const targetFreq = 45 + Math.min(1.2, speedRatio) * 125;
      sound.engineOsc.frequency.setTargetAtTime(targetFreq, now, 0.05);

      if (sound.engineFilter) {
        const cutoff = 280 + Math.min(1.2, speedRatio) * 650;
        sound.engineFilter.frequency.setTargetAtTime(cutoff, now, 0.07);
      }
    };

    sound.playTireScreech = () => {
      if (!sound.ctx || sound.isMuted || sound.isScreeching) return;
      sound.isScreeching = true;
      const now = sound.ctx.currentTime;
      const duration = 0.7;

      const osc = sound.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(1100, now);
      osc.frequency.exponentialRampToValueAtTime(650, now + duration);

      const filter = sound.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1200, now);
      filter.Q.setValueAtTime(6.0, now);

      const gain = sound.ctx.createGain();
      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.4, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(sound.ctx.destination);

      osc.start(now);
      osc.stop(now + duration);

      setTimeout(() => {
        sound.isScreeching = false;
      }, 500);
    };

    sound.playHeavyCrash = () => {
      if (!sound.ctx || sound.isMuted) return;
      const now = sound.ctx.currentTime;

      // Sub-bass thump
      const subOsc = sound.ctx.createOscillator();
      subOsc.type = 'sine';
      subOsc.frequency.setValueAtTime(160, now);
      subOsc.frequency.exponentialRampToValueAtTime(25, now + 0.55);

      const subGain = sound.ctx.createGain();
      subGain.gain.setValueAtTime(0.9, now);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

      subOsc.connect(subGain);
      subGain.connect(sound.ctx.destination);
      subOsc.start(now);
      subOsc.stop(now + 0.6);

      // Metal crunch
      const bufferSize = Math.floor(sound.ctx.sampleRate * 0.7);
      const buffer = sound.ctx.createBuffer(1, bufferSize, sound.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sound.ctx.sampleRate * 0.15));
      }
      const noise = sound.ctx.createBufferSource();
      noise.buffer = buffer;

      const noiseFilter = sound.ctx.createBiquadFilter();
      noiseFilter.type = 'lowpass';
      noiseFilter.frequency.setValueAtTime(1800, now);
      noiseFilter.frequency.linearRampToValueAtTime(320, now + 0.6);

      const noiseGain = sound.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.85, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

      noise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(sound.ctx.destination);
      noise.start(now);
    };

    sound.toggleMute = () => {
      sound.isMuted = !sound.isMuted;
      if (sound.ctx && sound.engineGain) {
        sound.engineGain.gain.setValueAtTime(sound.isMuted ? 0 : 0.15, sound.ctx.currentTime);
      }
      setIsMuted(sound.isMuted);
      return !sound.isMuted;
    };

    /* ==========================================================================
       2. THREE.JS & CANNON-ES 3D SCENE: SRI LANKAN TROPICAL RURAL HIGHWAY
       ========================================================================== */
    const canvasElement = threeCanvasRef.current;
    if (!canvasElement) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x38bdf8); // Bright sunny tropical sky blue
    scene.fog = new THREE.FogExp2(0x7dd3fc, 0.0028); // Golden/blue misty tropical haze

    const camera = new THREE.PerspectiveCamera(54, window.innerWidth / window.innerHeight, 0.1, 900);
    const renderer = new THREE.WebGLRenderer({
      canvas: canvasElement,
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const world = new CANNON.World({
      gravity: new CANNON.Vec3(0, -9.82, 0),
      allowSleep: false,
    });

    const groundMaterial = new CANNON.Material('ground');
    const carMaterial = new CANNON.Material('car');
    const obsMaterial = new CANNON.Material('obstacle');

    const carGroundContact = new CANNON.ContactMaterial(carMaterial, groundMaterial, {
      friction: 0.02,
      restitution: 0.05,
    });
    const carObsContact = new CANNON.ContactMaterial(carMaterial, obsMaterial, {
      friction: 0.5,
      restitution: 0.6,
    });
    world.addContactMaterial(carGroundContact);
    world.addContactMaterial(carObsContact);

    const groundBody = new CANNON.Body({
      type: CANNON.Body.STATIC,
      shape: new CANNON.Plane(),
      material: groundMaterial,
    });
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    world.addBody(groundBody);

    const roadWidth = 9.2; // Narrower Sri Lankan rural asphalt road
    const railBody = new CANNON.Body({
      type: CANNON.Body.STATIC,
      shape: new CANNON.Box(new CANNON.Vec3(0.15, 0.4, 300)),
      position: new CANNON.Vec3(roadWidth / 2 + 0.2, 0.4, 0),
      material: groundMaterial,
    });
    world.addBody(railBody);

    // 6. Lighting: Bright, sunny tropical afternoon with golden hour haze
    const ambientLight = new THREE.AmbientLight(0xfef08a, 0.95);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffedd5, 2.2);
    dirLight.position.set(-60, 80, 40);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 1;
    dirLight.shadow.camera.far = 300;
    scene.add(dirLight);
    scene.add(dirLight.target);

    // Common Sri Lankan Procedural Asset Builders
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.9 });
    const palmFrondMat = new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.6, flatShading: true });
    const coconutMat = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.5 }); // King Coconut (Thambili)
    const bananaLeafMat = new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.5, flatShading: true });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.9 });
    const tileRoofMat = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.7 });
    const redChairMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.3 });
    const blueChairMat = new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.3 });
    const fenceMat = new THREE.MeshStandardMaterial({ color: 0x92400e, metalness: 0.7, roughness: 0.6 });

    // 2. Coconut Tree Generator
    function createCoconutTree(): THREE.Group {
      const tree = new THREE.Group();

      // Slender curved trunk
      const trunkGeo = new THREE.CylinderGeometry(0.18, 0.32, 6.5, 7);
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.y = 3.25;
      trunk.rotation.z = (Math.random() - 0.5) * 0.15;
      trunk.castShadow = true;
      tree.add(trunk);

      // King Coconuts at top
      for (let c = 0; c < 5; c++) {
        const nut = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 6), coconutMat);
        const angle = (c / 5) * Math.PI * 2;
        nut.position.set(Math.cos(angle) * 0.25, 6.2, Math.sin(angle) * 0.25);
        nut.castShadow = true;
        tree.add(nut);
      }

      // Arching Palm Fronds
      for (let f = 0; f < 8; f++) {
        const frondGeo = new THREE.ConeGeometry(0.8, 3.8, 5);
        const frond = new THREE.Mesh(frondGeo, palmFrondMat);
        const angle = (f / 8) * Math.PI * 2;
        frond.position.set(Math.cos(angle) * 1.2, 6.5, Math.sin(angle) * 1.2);
        frond.rotation.set(Math.PI / 2.6, angle, Math.sin(angle) * 0.5);
        frond.castShadow = true;
        tree.add(frond);
      }

      return tree;
    }

    // 2. Banana Plant Generator
    function createBananaPlant(): THREE.Group {
      const plant = new THREE.Group();
      const stemMat = new THREE.MeshStandardMaterial({ color: 0x84cc16, roughness: 0.8 });
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 2.2, 6), stemMat);
      stem.position.y = 1.1;
      stem.castShadow = true;
      plant.add(stem);

      for (let b = 0; b < 5; b++) {
        const leafGeo = new THREE.BoxGeometry(0.7, 0.05, 1.8);
        const leaf = new THREE.Mesh(leafGeo, bananaLeafMat);
        const angle = (b / 5) * Math.PI * 2;
        leaf.position.set(Math.cos(angle) * 0.7, 2.0, Math.sin(angle) * 0.7);
        leaf.rotation.set(0.3, angle, 0.2);
        leaf.castShadow = true;
        plant.add(leaf);
      }

      return plant;
    }

    // 4. Roadside Kade (Rustic Boutique Shop)
    function createRoadsideKade(): THREE.Group {
      const kade = new THREE.Group();

      // Wooden structure
      const baseGeo = new THREE.BoxGeometry(3.2, 2.2, 2.4);
      const wallMat = new THREE.MeshStandardMaterial({ color: 0x854d0e, roughness: 0.9 });
      const walls = new THREE.Mesh(baseGeo, wallMat);
      walls.position.y = 1.1;
      walls.castShadow = true;
      kade.add(walls);

      // Red Clay Tile Roof
      const roofGeo = new THREE.ConeGeometry(2.8, 1.2, 4);
      const roof = new THREE.Mesh(roofGeo, tileRoofMat);
      roof.position.y = 2.8;
      roof.rotation.y = Math.PI / 4;
      roof.castShadow = true;
      kade.add(roof);

      // Wooden Counter
      const counterGeo = new THREE.BoxGeometry(2.8, 0.8, 0.6);
      const counter = new THREE.Mesh(counterGeo, woodMat);
      counter.position.set(0, 0.4, 1.3);
      counter.castShadow = true;
      kade.add(counter);

      // Hanging Fruit Stand (Thambili King Coconuts & Bananas)
      for (let i = -1; i <= 1; i += 0.8) {
        const fruitCluster = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 6), coconutMat);
        fruitCluster.position.set(i, 1.2, 1.3);
        kade.add(fruitCluster);
      }

      // 4. Iconic Red & Blue Plastic Chairs
      const redChair = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.5, 0.45), redChairMat);
      redChair.position.set(-1.6, 0.25, 2.0);
      redChair.castShadow = true;
      kade.add(redChair);

      const blueChair = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.5, 0.45), blueChairMat);
      blueChair.position.set(-0.9, 0.25, 2.3);
      blueChair.rotation.y = 0.3;
      blueChair.castShadow = true;
      kade.add(blueChair);

      return kade;
    }

    // 4. Old Rusted Fence Builder
    function createRustedFenceChunk(length: number): THREE.Group {
      const fence = new THREE.Group();
      for (let x = -length / 2; x <= length / 2; x += 6) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.1, 6), fenceMat);
        post.position.set(0, 0.55, x);
        post.castShadow = true;
        fence.add(post);
      }

      const railGeo = new THREE.BoxGeometry(0.06, 0.08, length);
      const rail1 = new THREE.Mesh(railGeo, fenceMat);
      rail1.position.set(0, 0.4, 0);
      fence.add(rail1);

      const rail2 = new THREE.Mesh(railGeo, fenceMat);
      rail2.position.set(0, 0.85, 0);
      fence.add(rail2);

      return fence;
    }

    // 3. Background Misty Blue Mountains & Stupa / Dagoba
    const mountainGroup = new THREE.Group();

    // Rolling misty hills in far horizon
    const hillMat1 = new THREE.MeshStandardMaterial({ color: 0x3b82f6, roughness: 0.95 });
    const hillMat2 = new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.95 });

    for (let h = -3; h <= 3; h++) {
      const hillGeo = new THREE.ConeGeometry(90 + Math.random() * 40, 45 + Math.random() * 20, 7);
      const hill = new THREE.Mesh(hillGeo, h % 2 === 0 ? hillMat1 : hillMat2);
      hill.position.set(h * 110, 5, -450 + (Math.random() - 0.5) * 80);
      mountainGroup.add(hill);
    }

    // 3. Iconic Sri Lankan Buddhist Temple (Stupa / Dagoba) far away on a hill
    const stupaGroup = new THREE.Group();
    stupaGroup.position.set(85, 18, -380);

    // Stupa White Bell Dome
    const domeMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3 });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(14, 18, 18, 0, Math.PI * 2, 0, Math.PI * 0.62), domeMat);
    dome.position.y = 8;
    stupaGroup.add(dome);

    // Devatha Kotuwa (Square Pinnacle Base)
    const squareMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.4 });
    const devathaKotuwa = new THREE.Mesh(new THREE.BoxGeometry(5.5, 4.0, 5.5), squareMat);
    devathaKotuwa.position.y = 18;
    stupaGroup.add(devathaKotuwa);

    // Golden Spire (Koth Kerapiya)
    const spireMat = new THREE.MeshStandardMaterial({ color: 0xeab308, metalness: 0.8, roughness: 0.2 });
    const spire = new THREE.Mesh(new THREE.ConeGeometry(2.2, 9, 12), spireMat);
    spire.position.y = 24.5;
    stupaGroup.add(spire);

    mountainGroup.add(stupaGroup);
    scene.add(mountainGroup);

    // Modular Endless Road Chunks System
    const CHUNK_LENGTH = 240;
    const NUM_CHUNKS = 4;
    const roadChunks: THREE.Group[] = [];

    // 1. The Road: Narrower asphalt road with faded lines and potholes
    const roadGeo = new THREE.PlaneGeometry(roadWidth, CHUNK_LENGTH);
    const roadMat = new THREE.MeshStandardMaterial({ color: 0x27292e, roughness: 0.88 });

    // 2. Surroundings: Paddy Fields
    const paddyFieldGeo = new THREE.PlaneGeometry(200, CHUNK_LENGTH);
    const paddyGroundMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.8 }); // Emerald paddy
    const waterCanalMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.1, metalness: 0.7 });

    const yellowLineMat = new THREE.MeshBasicMaterial({ color: 0xfacc15, opacity: 0.8, transparent: true });
    const whiteLineMat = new THREE.MeshBasicMaterial({ color: 0xf1f5f9, opacity: 0.7, transparent: true });
    const potholeMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.95 }); // Dark road patch

    function createRoadChunk(zPos: number): THREE.Group {
      const chunk = new THREE.Group();
      chunk.position.z = zPos;

      // Road Asphalt Base
      const road = new THREE.Mesh(roadGeo, roadMat);
      road.rotation.x = -Math.PI / 2;
      road.receiveShadow = true;
      chunk.add(road);

      // Faded Yellow Center Line Dashes
      for (let z = CHUNK_LENGTH / 2 - 4; z >= -CHUNK_LENGTH / 2 + 4; z -= 8) {
        const line = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 4), yellowLineMat);
        line.rotation.x = -Math.PI / 2;
        line.position.set(0, 0.02, z);
        chunk.add(line);
      }

      // Faded White Side Border Lines
      const leftWhiteLine = new THREE.Mesh(new THREE.PlaneGeometry(0.15, CHUNK_LENGTH), whiteLineMat);
      leftWhiteLine.rotation.x = -Math.PI / 2;
      leftWhiteLine.position.set(-roadWidth / 2 + 0.2, 0.02, 0);
      chunk.add(leftWhiteLine);

      const rightWhiteLine = new THREE.Mesh(new THREE.PlaneGeometry(0.15, CHUNK_LENGTH), whiteLineMat);
      rightWhiteLine.rotation.x = -Math.PI / 2;
      rightWhiteLine.position.set(roadWidth / 2 - 0.2, 0.02, 0);
      chunk.add(rightWhiteLine);

      // 1. Realistic Road Repair Patches / Small Potholes
      for (let p = 0; p < 4; p++) {
        const patchGeo = new THREE.CircleGeometry(0.4 + Math.random() * 0.5, 8);
        const patch = new THREE.Mesh(patchGeo, potholeMat);
        patch.rotation.x = -Math.PI / 2;
        const posX = (Math.random() - 0.5) * (roadWidth - 2.0);
        const posZ = (Math.random() - 0.5) * (CHUNK_LENGTH - 20);
        patch.position.set(posX, 0.025, posZ);
        chunk.add(patch);
      }

      // 2. Left & Right Lush Paddy Fields
      const rightPaddy = new THREE.Mesh(paddyFieldGeo, paddyGroundMat);
      rightPaddy.rotation.x = -Math.PI / 2;
      rightPaddy.position.set(roadWidth / 2 + 100, -0.05, 0);
      rightPaddy.receiveShadow = true;
      chunk.add(rightPaddy);

      const leftPaddy = new THREE.Mesh(paddyFieldGeo, paddyGroundMat);
      leftPaddy.rotation.x = -Math.PI / 2;
      leftPaddy.position.set(-roadWidth / 2 - 100, -0.05, 0);
      leftPaddy.receiveShadow = true;
      chunk.add(leftPaddy);

      // Paddy Field Water Irrigation Canal
      const canal = new THREE.Mesh(new THREE.PlaneGeometry(6, CHUNK_LENGTH), waterCanalMat);
      canal.rotation.x = -Math.PI / 2;
      canal.position.set(roadWidth / 2 + 12, -0.04, 0);
      chunk.add(canal);

      // 4. Old Rusted Fence along road edge
      const rightFence = createRustedFenceChunk(CHUNK_LENGTH);
      rightFence.position.set(roadWidth / 2 + 0.4, 0, 0);
      chunk.add(rightFence);

      const leftFence = createRustedFenceChunk(CHUNK_LENGTH);
      leftFence.position.set(-roadWidth / 2 - 0.4, 0, 0);
      chunk.add(leftFence);

      // 2. Dense Coconut Palms & Tropical Bushes along both sides
      for (let z = CHUNK_LENGTH / 2 - 8; z >= -CHUNK_LENGTH / 2 + 8; z -= 14) {
        // Left coconut palm
        const leftPalm = createCoconutTree();
        leftPalm.position.set(-roadWidth / 2 - 3.5 - Math.random() * 4, 0, z + (Math.random() - 0.5) * 4);
        chunk.add(leftPalm);

        // Right coconut palm
        const rightPalm = createCoconutTree();
        rightPalm.position.set(roadWidth / 2 + 3.5 + Math.random() * 4, 0, z + (Math.random() - 0.5) * 4);
        chunk.add(rightPalm);

        // Banana plant
        const banana = createBananaPlant();
        banana.position.set(-roadWidth / 2 - 2.0 - Math.random() * 3, 0, z + 6);
        chunk.add(banana);
      }

      // 4. Roadside Rustic Boutique Kade Shop (every ~120m)
      const kade = createRoadsideKade();
      kade.position.set(roadWidth / 2 + 3.2, 0, -CHUNK_LENGTH / 4);
      kade.rotation.y = -Math.PI / 2;
      chunk.add(kade);

      scene.add(chunk);
      return chunk;
    }

    for (let i = 0; i < NUM_CHUNKS; i++) {
      roadChunks.push(createRoadChunk(-i * CHUNK_LENGTH + CHUNK_LENGTH / 2));
    }

    // Procedural Real Car Textures
    function createSriLankanLicensePlateTexture(): THREE.CanvasTexture {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#facc15'; // Sri Lankan Yellow Plate
        ctx.fillRect(0, 0, 256, 128);

        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 10;
        ctx.strokeRect(5, 5, 246, 118);

        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 26px sans-serif';
        ctx.fillText('WP', 22, 38);

        ctx.font = 'bold 44px monospace';
        ctx.fillText('CAD-2026', 16, 94);
      }
      const texture = new THREE.CanvasTexture(canvas);
      texture.needsUpdate = true;
      return texture;
    }

    function createCarbonGrilleTexture(): THREE.CanvasTexture {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, 128, 128);

        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 2;
        for (let x = 0; x < 128; x += 8) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x + 128, 128);
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(x, 128);
          ctx.lineTo(x + 128, 0);
          ctx.stroke();
        }
      }
      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(4, 4);
      return texture;
    }

    // High-Detail Real Sports Car Model Assembly
    function createDetailedRealCar(): { carGroup: THREE.Group; wheelMeshes: THREE.Mesh[] } {
      const carGroup = new THREE.Group();
      const wheelMeshes: THREE.Mesh[] = [];

      const licenseTexture = createSriLankanLicensePlateTexture();
      const grilleTexture = createCarbonGrilleTexture();

      // Premium Automotive Materials
      const carPaintMat = new THREE.MeshPhysicalMaterial({
        color: 0xdc2626, // Metallic Ruby Red
        metalness: 0.85,
        roughness: 0.15,
        clearcoat: 1.0,
        clearcoatRoughness: 0.05,
        reflectivity: 0.9,
      });

      const carbonMat = new THREE.MeshStandardMaterial({
        map: grilleTexture,
        color: 0x1e293b,
        roughness: 0.6,
        metalness: 0.4,
      });

      const glassMat = new THREE.MeshPhysicalMaterial({
        color: 0x0f172a,
        transmission: 0.7,
        transparent: true,
        opacity: 0.85,
        roughness: 0.05,
        ior: 1.5,
      });

      const chromeMat = new THREE.MeshStandardMaterial({
        color: 0xf8fafc,
        metalness: 0.95,
        roughness: 0.1,
      });

      const licenseMat = new THREE.MeshBasicMaterial({ map: licenseTexture });

      const headlightMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xffffff,
        emissiveIntensity: 3.0,
      });

      const tailLightMat = new THREE.MeshStandardMaterial({
        color: 0xef4444,
        emissive: 0xdc2626,
        emissiveIntensity: 3.5,
      });

      // 1. Main Sports Chassis
      const bodyMesh = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.52, 4.2), carPaintMat);
      bodyMesh.position.y = 0.48;
      bodyMesh.castShadow = true;
      bodyMesh.receiveShadow = true;
      carGroup.add(bodyMesh);

      // 2. Aerodynamic Hood
      const hoodMesh = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.22, 1.4), carPaintMat);
      hoodMesh.position.set(0, 0.68, -1.2);
      hoodMesh.rotation.x = 0.08;
      hoodMesh.castShadow = true;
      carGroup.add(hoodMesh);

      // Hood Carbon Intake Vents
      const scoop = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.08, 0.6), carbonMat);
      scoop.position.set(0, 0.78, -1.2);
      carGroup.add(scoop);

      // 3. Cabin & Glass Windshields
      const cabinMesh = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.58, 2.1), glassMat);
      cabinMesh.position.set(0, 0.98, -0.1);
      cabinMesh.castShadow = true;
      carGroup.add(cabinMesh);

      // Roof Metal Plate
      const roofMesh = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.06, 1.3), carPaintMat);
      roofMesh.position.set(0, 1.28, -0.1);
      carGroup.add(roofMesh);

      // Windshield Wipers
      for (let w = -0.3; w <= 0.3; w += 0.6) {
        const wiper = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.6), carbonMat);
        wiper.position.set(w, 0.95, -0.9);
        wiper.rotation.set(-0.5, 0.3, 0);
        carGroup.add(wiper);
      }

      // 4. Front Bumper & Carbon Grille
      const bumperMesh = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.32, 0.3), carPaintMat);
      bumperMesh.position.set(0, 0.32, -2.15);
      carGroup.add(bumperMesh);

      const grilleMesh = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.22, 0.05), carbonMat);
      grilleMesh.position.set(0, 0.3, -2.28);
      carGroup.add(grilleMesh);

      // Front & Rear Sri Lankan License Plates
      const frontPlate = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.25), licenseMat);
      frontPlate.position.set(0, 0.22, -2.31);
      frontPlate.rotation.y = Math.PI;
      carGroup.add(frontPlate);

      const rearPlate = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.25), licenseMat);
      rearPlate.position.set(0, 0.48, 2.12);
      carGroup.add(rearPlate);

      // 5. Projector LED Headlamps, LED Tail Lights & Side Mirrors
      for (let side = -1; side <= 1; side += 2) {
        // Front LED Projector Headlamp
        const headlamp = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.12), headlightMat);
        headlamp.position.set(side * 0.68, 0.58, -2.12);
        carGroup.add(headlamp);

        // Rear LED Ring Tail Light
        const tailLamp = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.18, 0.12), tailLightMat);
        tailLamp.position.set(side * 0.65, 0.62, 2.11);
        carGroup.add(tailLamp);

        // Side Mirrors
        const mirrorHousing = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.14, 0.22), carPaintMat);
        mirrorHousing.position.set(side * 0.98, 0.92, -0.6);
        carGroup.add(mirrorHousing);

        const mirrorGlass = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.11), chromeMat);
        mirrorGlass.position.set(side * 0.98 + side * 0.02, 0.92, -0.6);
        mirrorGlass.rotation.y = side * (Math.PI / 2);
        carGroup.add(mirrorGlass);
      }

      // 6. Rear Carbon Racing Wing Spoiler
      const wingPlank = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.06, 0.45), carbonMat);
      wingPlank.position.set(0, 1.15, 1.85);
      wingPlank.castShadow = true;
      carGroup.add(wingPlank);

      for (let s = -0.6; s <= 0.6; s += 1.2) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.35, 0.12), carbonMat);
        post.position.set(s, 0.95, 1.85);
        carGroup.add(post);
      }

      // 7. Dual Chrome Exhaust Pipes
      for (let e = -0.35; e <= 0.35; e += 0.7) {
        const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.28, 12), chromeMat);
        pipe.rotation.x = Math.PI / 2;
        pipe.position.set(e, 0.25, 2.15);
        carGroup.add(pipe);
      }

      // 8. High-Detail Wheels (Rubber Tires, 5-Spoke Alloy Rims, Red Brembo Calipers)
      const rubberMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.85 });
      const caliperMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.3 });

      const wheelPositions = [
        [-0.96, 0.36, 1.25],
        [0.96, 0.36, 1.25],
        [-0.96, 0.36, -1.25],
        [0.96, 0.36, -1.25],
      ];

      wheelPositions.forEach((pos) => {
        const wheelAssembly = new THREE.Group();

        const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.28, 20), rubberMat);
        tire.rotation.z = Math.PI / 2;
        tire.castShadow = true;
        wheelAssembly.add(tire);

        const rimCenter = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.29, 16), chromeMat);
        rimCenter.rotation.z = Math.PI / 2;
        wheelAssembly.add(rimCenter);

        for (let sp = 0; sp < 5; sp++) {
          const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.22, 0.05), chromeMat);
          const angle = (sp / 5) * Math.PI * 2;
          spoke.position.set(0, Math.sin(angle) * 0.12, Math.cos(angle) * 0.12);
          spoke.rotation.x = angle;
          wheelAssembly.add(spoke);
        }

        const brakeDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.05, 16), chromeMat);
        brakeDisc.rotation.z = Math.PI / 2;
        wheelAssembly.add(brakeDisc);

        const caliper = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.14), caliperMat);
        caliper.position.set(0, 0.12, 0);
        wheelAssembly.add(caliper);

        wheelAssembly.position.set(pos[0], pos[1], pos[2]);
        carGroup.add(wheelAssembly);
        wheelMeshes.push(tire);
      });

      return { carGroup, wheelMeshes };
    }

    const { carGroup, wheelMeshes } = createDetailedRealCar();
    scene.add(carGroup);

    const carBody = new CANNON.Body({
      mass: 1500,
      material: carMaterial,
      angularDamping: 0.5,
      linearDamping: 0.01,
    });
    const carShape = new CANNON.Box(new CANNON.Vec3(0.9, 0.35, 2.0));
    carBody.addShape(carShape, new CANNON.Vec3(0, 0.45, 0));
    const START_Z = 80;
    carBody.position.set(0, 0.42, START_Z);
    carBody.velocity.set(0, 0, 0); // Initially stopped until hand is presented
    world.addBody(carBody);

    // 5. Obstacle Generator: Fallen Coconut Palm Branch or Broken Red CTB Bus Fragment
    function createSriLankanObstacleMesh(typeIndex: number): THREE.Group {
      const group = new THREE.Group();

      if (typeIndex % 2 === 0) {
        // 5. Fallen Coconut Palm Trunk & Branch
        const logMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.9 });
        const log = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.48, 4.0, 8), logMat);
        log.rotation.z = Math.PI / 2;
        log.rotation.y = (Math.random() - 0.5) * 0.4;
        log.castShadow = true;
        group.add(log);

        // Palm fronds on log
        const frondMat = new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.7, flatShading: true });
        for (let f = 0; f < 5; f++) {
          const frond = new THREE.Mesh(new THREE.ConeGeometry(0.7, 2.4, 4), frondMat);
          const angle = (f / 5) * Math.PI * 2;
          frond.position.set((Math.random() - 0.5) * 2.2, 0.2, (Math.random() - 0.5) * 1.2);
          frond.rotation.set(Math.PI / 3, angle, Math.sin(angle));
          frond.castShadow = true;
          group.add(frond);
        }
      } else {
        // 5. Broken Piece of Red Sri Lankan CTB Bus
        const busRedMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.4, metalness: 0.6 });
        const busBody = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.4, 1.8), busRedMat);
        busBody.position.y = 0.7;
        busBody.rotation.y = (Math.random() - 0.5) * 0.3;
        busBody.castShadow = true;
        group.add(busBody);

        // CTB Yellow Stripe
        const stripeMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.5 });
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.42, 0.28, 1.82), stripeMat);
        stripe.position.y = 0.65;
        group.add(stripe);

        // Grille & Headlight frame
        const grilleMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8 });
        const grille = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.4, 0.1), grilleMat);
        grille.position.set(0, 0.45, 0.91);
        group.add(grille);
      }

      return group;
    }

    // Multi-Obstacle Pool: Authentic Sri Lankan Obstacles
    interface ObstacleItem {
      mesh: THREE.Group;
      body: CANNON.Body;
    }
    const obstacles: ObstacleItem[] = [];

    const initialObsDistances = [130, 210, 290];
    for (let i = 0; i < 3; i++) {
      const mesh = createSriLankanObstacleMesh(i);
      scene.add(mesh);

      const body = new CANNON.Body({
        mass: 800,
        material: obsMaterial,
        shape: new CANNON.Box(new CANNON.Vec3(1.2, 0.7, 1.0)),
        angularDamping: 0.3,
        linearDamping: 0.1,
      });
      const obsZ = START_Z - initialObsDistances[i];
      const obsX = (Math.random() - 0.5) * 5.0;
      body.position.set(obsX, 0.7, obsZ);
      world.addBody(body);

      mesh.position.copy(body.position as any);
      mesh.quaternion.copy(body.quaternion as any);

      obstacles.push({ mesh, body });
    }

    // Collision Detection & Auto-Recovery
    carBody.addEventListener('collide', (e: any) => {
      const collidedObstacle = obstacles.find((obs) => obs.body === e.body);
      if ((collidedObstacle || e.body === railBody) && !controlsRef.current.hasCrashed) {
        controlsRef.current.hasCrashed = true;
        sound.playHeavyCrash();
        setStatusText('CRASHED!');
        setStatusColor('text-red-400');

        if (collidedObstacle) {
          collidedObstacle.body.velocity.set((Math.random() - 0.5) * 20, 14, -18);
          collidedObstacle.body.angularVelocity.set(12, 12, 12);
        }

        carBody.angularVelocity.set((Math.random() - 0.5) * 8, 6.0, 7.0);

        setTimeout(() => {
          controlsRef.current.hasCrashed = false;
          carBody.wakeUp();
          carBody.position.x = 0;
          carBody.position.y = 0.42;
          carBody.quaternion.set(0, 0, 0, 1);
          const resumeSpeed = controlsRef.current.gestureMode === 'high_speed' ? -25 : (controlsRef.current.gestureMode === 'normal' ? -15 : 0);
          carBody.velocity.set(0, 0, resumeSpeed);
          carBody.angularVelocity.set(0, 0, 0);

          if (collidedObstacle) {
            collidedObstacle.body.position.set((Math.random() - 0.5) * 5.0, 0.7, carBody.position.z - 130);
            collidedObstacle.body.velocity.set(0, 0, 0);
            collidedObstacle.body.angularVelocity.set(0, 0, 0);
          }

          sound.init();
          setStatusText(controlsRef.current.gestureMode === 'high_speed' ? 'HIGH SPEED ⚡' : (controlsRef.current.gestureMode === 'normal' ? 'NORMAL DRIVE' : 'STOPPED (SHOW HAND)'));
          setStatusColor(controlsRef.current.gestureMode === 'high_speed' ? 'text-yellow-400' : (controlsRef.current.gestureMode === 'normal' ? 'text-emerald-400' : 'text-amber-400'));
        }, 1600);
      }
    });

    const resetGame = () => {
      controlsRef.current.hasCrashed = false;
      carBody.wakeUp();
      carBody.position.set(0, 0.42, START_Z);
      carBody.quaternion.set(0, 0, 0, 1);
      carBody.velocity.set(0, 0, 0);
      carBody.angularVelocity.set(0, 0, 0);

      roadChunks.forEach((chunk, i) => {
        chunk.position.z = -i * CHUNK_LENGTH + CHUNK_LENGTH / 2;
      });

      obstacles.forEach((obs, i) => {
        obs.body.wakeUp();
        const obsZ = START_Z - initialObsDistances[i];
        obs.body.position.set((Math.random() - 0.5) * 5.0, 0.7, obsZ);
        obs.body.quaternion.set(0, 0, 0, 1);
        obs.body.velocity.set(0, 0, 0);
        obs.body.angularVelocity.set(0, 0, 0);
      });

      sound.init();
      setDistanceM(0);
      setStatusText('DRIVING');
      setStatusColor('text-emerald-400');
    };

    resetGameRef.current = resetGame;

    /* ==========================================================================
       3. ANIMATION LOOP: CONTINUOUS ENDLESS ROAD DRIVER
       ========================================================================== */
    let lastTime = performance.now();
    let animId: number;

    const animate = () => {
      animId = requestAnimationFrame(animate);

      const currentTime = performance.now();
      const dt = Math.min((currentTime - lastTime) / 1000, 0.05);
      lastTime = currentTime;

      const ctrl = controlsRef.current;

      // Controls & Drive Forces
      if (!ctrl.hasCrashed) {
        carBody.wakeUp();

        carBody.position.y = 0.42;
        carBody.velocity.y = 0;

        const currentSpeedZ = -carBody.velocity.z;

        // 1. Hand Eka Mitimolo (Closed Fist) -> HIGH SPEED TURBO!
        if (ctrl.gestureMode === 'high_speed') {
          const maxSpeedZ = 27.0; // ~97 km/h High Speed
          if (currentSpeedZ < maxSpeedZ) {
            carBody.velocity.z -= 24.0 * dt;
          }
        }
        // 2. Hand Eka Digerala (Open Hand) -> NORMAL SPEED!
        else if (ctrl.gestureMode === 'normal') {
          const normalSpeed = 15.0; // ~54 km/h Normal Speed
          if (currentSpeedZ < normalSpeed) {
            carBody.velocity.z -= 14.0 * dt;
          } else if (currentSpeedZ > normalSpeed) {
            carBody.velocity.z += 8.0 * dt;
          }
        }
        // 3. Hand Ekak Neti Welawata -> STOP!
        else {
          if (carBody.velocity.z < 0) {
            carBody.velocity.z = Math.min(0, carBody.velocity.z + 24.0 * dt);
          }
        }

        // Smooth & responsive steering (active when hand is present)
        if (ctrl.handDetected) {
          const targetVx = ctrl.steerInputValue * 7.5; // Max 7.5 m/s lateral speed
          carBody.velocity.x += (targetVx - carBody.velocity.x) * Math.min(1.0, dt * 12.0); // Fast, sharp lerp
        } else {
          carBody.velocity.x += (0 - carBody.velocity.x) * Math.min(1.0, dt * 8.0);
        }

        if (Math.abs(ctrl.steerInputValue) > 0.8 && currentSpeedZ > 12) {
          sound.playTireScreech();
        }

        if (carBody.position.x < -roadWidth / 2 + 1.2) {
          carBody.position.x = -roadWidth / 2 + 1.2;
          carBody.velocity.x = Math.max(0, carBody.velocity.x);
        } else if (carBody.position.x > roadWidth / 2 - 1.2) {
          carBody.position.x = roadWidth / 2 - 1.2;
          carBody.velocity.x = Math.min(0, carBody.velocity.x);
        }

        const steerYaw = -ctrl.steerInputValue * 0.14;
        carBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), steerYaw);
        carBody.angularVelocity.set(0, 0, 0);

        const wheelRot = (-carBody.velocity.z * dt) / 0.35;
        wheelMeshes.forEach((w) => (w.rotation.x += wheelRot));

        const speedMs = Math.sqrt(carBody.velocity.x ** 2 + carBody.velocity.z ** 2);
        const speedKmhCalc = Math.round(speedMs * 3.6);
        setSpeedKmh(speedKmhCalc);
        sound.updateEnginePitch(speedMs / 25.0);

        const currentDist = Math.max(0, Math.round(START_Z - carBody.position.z));
        setDistanceM(currentDist);

        // Clear live status display based on user requests
        if (!ctrl.handDetected && speedKmhCalc === 0) {
          setStatusText('STOPPED (SHOW HAND)');
          setStatusColor('text-amber-400');
        } else if (!ctrl.handDetected) {
          setStatusText('STOPPING...');
          setStatusColor('text-amber-400');
        } else if (ctrl.gestureMode === 'high_speed') {
          if (ctrl.steerInputValue < -0.2) {
            setStatusText('HIGH SPEED LEFT ⚡');
            setStatusColor('text-yellow-400');
          } else if (ctrl.steerInputValue > 0.2) {
            setStatusText('HIGH SPEED RIGHT ⚡');
            setStatusColor('text-yellow-400');
          } else {
            setStatusText('HIGH SPEED ⚡');
            setStatusColor('text-yellow-400');
          }
        } else {
          if (ctrl.steerInputValue < -0.2) {
            setStatusText('STEERING LEFT');
            setStatusColor('text-sky-400');
          } else if (ctrl.steerInputValue > 0.2) {
            setStatusText('STEERING RIGHT');
            setStatusColor('text-purple-400');
          } else {
            setStatusText('NORMAL DRIVE');
            setStatusColor('text-emerald-400');
          }
        }
      }

      world.step(1 / 60, dt, 3);

      carGroup.position.copy(carBody.position as any);
      carGroup.quaternion.copy(carBody.quaternion as any);

      obstacles.forEach((obs) => {
        obs.mesh.position.copy(obs.body.position as any);
        obs.mesh.quaternion.copy(obs.body.quaternion as any);

        if (obs.body.position.z > carBody.position.z + 18) {
          obs.body.wakeUp();
          const minZ = Math.min(...obstacles.map((o) => o.body.position.z));
          const spawnZ = Math.min(carBody.position.z - 80, minZ - (75 + Math.random() * 45));
          const spawnX = (Math.random() - 0.5) * 6.4;

          obs.body.position.set(spawnX, 0.7, spawnZ);
          obs.body.quaternion.set(0, 0, 0, 1);
          obs.body.velocity.set(0, 0, 0);
          obs.body.angularVelocity.set(0, 0, 0);
        }
      });

      // Keep distant Sri Lankan mountains and Buddhist Stupa on horizon
      mountainGroup.position.z = carBody.position.z;

      const totalSpan = CHUNK_LENGTH * NUM_CHUNKS;
      roadChunks.forEach((chunk) => {
        if (chunk.position.z > carBody.position.z + CHUNK_LENGTH) {
          chunk.position.z -= totalSpan;
        }
      });

      railBody.position.z = carBody.position.z;
      dirLight.position.set(carBody.position.x - 40, 60, carBody.position.z + 30);
      dirLight.target.position.set(carBody.position.x, 0, carBody.position.z);

      camera.position.set(carBody.position.x * 0.7, carBody.position.y + 2.8, carBody.position.z + 7.5);
      camera.lookAt(carBody.position.x, carBody.position.y + 0.8, carBody.position.z - 6.0);

      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      soundRef.current.init();
      if (e.code === 'KeyR') resetGame();
      if (e.code === 'KeyW' || e.code === 'ArrowUp') {
        controlsRef.current.handDetected = true;
        controlsRef.current.gestureMode = 'high_speed';
      }
      if (e.code === 'KeyS' || e.code === 'ArrowDown') {
        controlsRef.current.gestureMode = 'stop';
      }
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') {
        controlsRef.current.handDetected = true;
        if (controlsRef.current.gestureMode === 'stop') controlsRef.current.gestureMode = 'normal';
        controlsRef.current.steerInputValue = -0.9;
      }
      if (e.code === 'KeyD' || e.code === 'ArrowRight') {
        controlsRef.current.handDetected = true;
        if (controlsRef.current.gestureMode === 'stop') controlsRef.current.gestureMode = 'normal';
        controlsRef.current.steerInputValue = 0.9;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'KeyW' || e.code === 'ArrowUp') {
        controlsRef.current.gestureMode = 'normal';
      }
      if (['KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        controlsRef.current.steerInputValue = 0;
      }
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      renderer.dispose();
    };
  }, []);

  // Clean MediaPipe Hands Detection
  const startCamera = async () => {
    setCameraError(null);
    let attempts = 0;

    const tryInitCamera = async () => {
      if (!window.Hands || !window.Camera) {
        if (attempts < 20) {
          attempts++;
          setTimeout(tryInitCamera, 300);
          return;
        }
        setCameraError('Vision libraries loading...');
        return;
      }

      try {
        const video = videoRef.current;
        const canvas = webcamCanvasRef.current;
        if (!video || !canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const hands = new window.Hands({
          locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
        });

        hands.setOptions({
          maxNumHands: 1,
          modelComplexity: 1,
          minDetectionConfidence: 0.6,
          minTrackingConfidence: 0.6,
        });

        const dist = (p1: any, p2: any) => {
          const dx = p1.x - p2.x;
          const dy = p1.y - p2.y;
          return Math.sqrt(dx * dx + dy * dy);
        };

        const EMA_ALPHA = 0.35; // Fast, responsive hand tracking

        hands.onResults((results: any) => {
          canvas.width = video.videoWidth || 640;
          canvas.height = video.videoHeight || 480;

          ctx.save();
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

          const ctrl = controlsRef.current;

          if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            ctrl.handDetected = true;
            const landmarks = results.multiHandLandmarks[0];

            if (window.drawConnectors && window.HAND_CONNECTIONS) {
              window.drawConnectors(ctx, landmarks, window.HAND_CONNECTIONS, {
                color: '#10b981',
                lineWidth: 3,
              });
            }
            if (window.drawLandmarks) {
              window.drawLandmarks(ctx, landmarks, { color: '#38bdf8', lineWidth: 1, radius: 3 });
            }

            const wrist = landmarks[0];
            const isIndex = dist(landmarks[8], wrist) > dist(landmarks[6], wrist) * 1.10;
            const isMiddle = dist(landmarks[12], wrist) > dist(landmarks[10], wrist) * 1.10;
            const isRing = dist(landmarks[16], wrist) > dist(landmarks[14], wrist) * 1.10;
            const isPinky = dist(landmarks[20], wrist) > dist(landmarks[18], wrist) * 1.10;
            const isThumb = dist(landmarks[4], landmarks[17]) > dist(landmarks[2], landmarks[17]) * 1.10;

            const extendedCount = [isIndex, isMiddle, isRing, isPinky, isThumb].filter(Boolean).length;

            if (extendedCount <= 1) {
              ctrl.gestureMode = 'high_speed';
            } else {
              ctrl.gestureMode = 'normal';
            }

            const rawX = (landmarks[0].x + landmarks[9].x) / 2;
            ctrl.smoothedHandX = EMA_ALPHA * rawX + (1 - EMA_ALPHA) * ctrl.smoothedHandX;

            const deadzone = 0.03;
            const offsetFromCenter = 0.5 - ctrl.smoothedHandX;

            if (offsetFromCenter > deadzone) {
              ctrl.steerInputValue = Math.min(1.0, (offsetFromCenter - deadzone) / 0.16);
            } else if (offsetFromCenter < -deadzone) {
              ctrl.steerInputValue = Math.max(-1.0, (offsetFromCenter + deadzone) / 0.16);
            } else {
              ctrl.steerInputValue = 0;
            }

            const centerX = canvas.width / 2;
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(centerX, 0);
            ctx.lineTo(centerX, canvas.height);
            ctx.stroke();
            ctx.setLineDash([]);
          } else {
            ctrl.handDetected = false;
            ctrl.gestureMode = 'stop';
            ctrl.steerInputValue = 0;
          }

          ctx.restore();
        });

        const cameraUtil = new window.Camera(video, {
          onFrame: async () => {
            await hands.send({ image: video });
          },
          width: 640,
          height: 480,
        });

        cameraUtil.start().then(() => {
          cameraUtilRef.current = cameraUtil;
          setIsCameraActive(true);
          setCameraError(null);
        }).catch((err: any) => {
          console.warn('Camera feed activation result:', err);
          setIsCameraActive(false);
          setCameraError(
            err?.name === 'NotAllowedError' || String(err).includes('Permission denied')
              ? 'Camera permission denied. Use touch/keyboard controls or grant camera permission.'
              : 'Camera feed unavailable. Touch or keyboard controls active.'
          );
        });
      } catch (err: any) {
        console.warn('Camera init note:', err);
        setIsCameraActive(false);
        setCameraError('Camera unavailable. Touch or keyboard controls active.');
      }
    };

    tryInitCamera();
  };

  const stopCamera = () => {
    if (cameraUtilRef.current) {
      try {
        cameraUtilRef.current.stop();
      } catch (e) {
        console.warn('Error stopping camera:', e);
      }
      cameraUtilRef.current = null;
    }
    setIsCameraActive(false);
    const canvas = webcamCanvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  // Camera is activated on explicit user gesture ("Enable Camera")
  useEffect(() => {
    setCameraError('Tap Enable Camera for Hand Controls');
  }, []);

  return (
    <div className="relative w-screen h-screen overflow-hidden select-none bg-slate-950 font-sans">
      {/* 1. Full-screen 3D Canvas (Three.js Scene) */}
      <canvas ref={threeCanvasRef} className="absolute inset-0 w-full h-full block z-0" />

      {/* 2. Small Sleek Webcam Feed in Top-Left Corner */}
      <div className="absolute top-5 left-5 w-48 h-36 bg-slate-950/85 backdrop-blur-md border border-white/10 rounded-2xl overflow-hidden shadow-2xl z-20 flex flex-col group">
        <video ref={videoRef} playsInline muted className="hidden" />
        <canvas ref={webcamCanvasRef} className="w-full h-full object-cover transform -scale-x-100" />
        
        {!isCameraActive && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-2.5 text-center bg-slate-950/90 leading-tight">
            <Camera className="w-5 h-5 text-slate-400 mb-1" />
            <p className="text-[10px] text-amber-300 font-medium mb-1.5 line-clamp-2">
              {cameraError || 'Camera inactive'}
            </p>
            <button
              onClick={() => {
                soundRef.current.init();
                startCamera();
              }}
              className="px-3 py-1 bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-slate-950 rounded-full text-[11px] font-bold cursor-pointer transition-all shadow"
            >
              Enable Camera
            </button>
          </div>
        )}

        {isCameraActive && (
          <button
            onClick={stopCamera}
            className="absolute top-2 right-2 p-1 bg-black/60 hover:bg-red-500/80 rounded-md text-white/80 hover:text-white transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
            title="Turn Off Camera"
          >
            <CameraOff className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* 3. Top-Center Minimal Floating Status & Distance Pill */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 z-20 flex items-center pointer-events-none">
        <div className="flex items-center gap-3.5 px-6 py-2 bg-slate-950/80 backdrop-blur-md border border-white/10 rounded-full shadow-2xl font-mono text-sm tracking-wider">
          <span className={`font-extrabold uppercase ${statusColor}`}>
            {statusText}
          </span>
          <span className="text-white/20">|</span>
          <span className="text-white font-semibold">
            {speedKmh} <span className="text-[11px] text-slate-400">KM/H</span>
          </span>
          <span className="text-white/20">|</span>
          <span className="text-sky-400 font-bold flex items-center gap-1">
            <span className="text-[11px] text-slate-400 font-normal">DIST:</span>
            {formatDistance(distanceM)}
          </span>
        </div>
      </div>

      {/* 4. On-screen Touch Driving Controls (Left & Right) */}
      <div className="absolute bottom-20 left-6 z-20 flex gap-2">
        <button
          onMouseDown={() => {
            soundRef.current.init();
            controlsRef.current.handDetected = true;
            if (controlsRef.current.gestureMode === 'stop') controlsRef.current.gestureMode = 'normal';
            controlsRef.current.steerInputValue = -1.0;
          }}
          onMouseUp={() => {
            controlsRef.current.steerInputValue = 0;
          }}
          onTouchStart={() => {
            soundRef.current.init();
            controlsRef.current.handDetected = true;
            if (controlsRef.current.gestureMode === 'stop') controlsRef.current.gestureMode = 'normal';
            controlsRef.current.steerInputValue = -1.0;
          }}
          onTouchEnd={() => {
            controlsRef.current.steerInputValue = 0;
          }}
          className="px-4 py-2.5 bg-slate-900/80 hover:bg-slate-800 active:scale-95 text-white border border-white/10 rounded-2xl backdrop-blur-md text-xs font-bold shadow-xl cursor-pointer"
        >
          👈 LEFT
        </button>
        <button
          onMouseDown={() => {
            soundRef.current.init();
            controlsRef.current.handDetected = true;
            if (controlsRef.current.gestureMode === 'stop') controlsRef.current.gestureMode = 'normal';
            controlsRef.current.steerInputValue = 1.0;
          }}
          onMouseUp={() => {
            controlsRef.current.steerInputValue = 0;
          }}
          onTouchStart={() => {
            soundRef.current.init();
            controlsRef.current.handDetected = true;
            if (controlsRef.current.gestureMode === 'stop') controlsRef.current.gestureMode = 'normal';
            controlsRef.current.steerInputValue = 1.0;
          }}
          onTouchEnd={() => {
            controlsRef.current.steerInputValue = 0;
          }}
          className="px-4 py-2.5 bg-slate-900/80 hover:bg-slate-800 active:scale-95 text-white border border-white/10 rounded-2xl backdrop-blur-md text-xs font-bold shadow-xl cursor-pointer"
        >
          RIGHT 👉
        </button>
      </div>

      <div className="absolute bottom-20 right-6 z-20 flex gap-2">
        <button
          onClick={() => {
            soundRef.current.init();
            controlsRef.current.gestureMode = 'stop';
          }}
          className="px-3.5 py-2.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 rounded-2xl backdrop-blur-md text-xs font-bold shadow-xl cursor-pointer"
        >
          🛑 STOP
        </button>
        <button
          onClick={() => {
            soundRef.current.init();
            controlsRef.current.handDetected = true;
            controlsRef.current.gestureMode = 'normal';
          }}
          className="px-3.5 py-2.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 rounded-2xl backdrop-blur-md text-xs font-bold shadow-xl cursor-pointer"
        >
          🚗 CRUISE
        </button>
        <button
          onClick={() => {
            soundRef.current.init();
            controlsRef.current.handDetected = true;
            controlsRef.current.gestureMode = 'high_speed';
          }}
          className="px-3.5 py-2.5 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-300 border border-yellow-500/30 rounded-2xl backdrop-blur-md text-xs font-bold shadow-xl cursor-pointer"
        >
          ⚡ TURBO
        </button>
      </div>

      {/* 5. Minimal Bottom Floating Control Bar */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 p-1.5 bg-slate-950/75 backdrop-blur-md border border-white/10 rounded-full shadow-2xl">
        <button
          onClick={() => {
            soundRef.current.init();
            resetGameRef.current();
          }}
          className="flex items-center gap-1.5 px-4 h-9 rounded-full bg-white text-slate-950 hover:bg-slate-100 active:scale-95 transition-all text-xs font-bold cursor-pointer shadow"
          title="Restart Simulation (R)"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Restart</span>
        </button>

        <button
          onClick={() => {
            soundRef.current.init();
            if (isCameraActive) stopCamera();
            else startCamera();
          }}
          className={`flex items-center gap-1.5 px-3.5 h-9 rounded-full text-xs font-semibold cursor-pointer transition-all ${
            isCameraActive
              ? 'text-emerald-400 hover:bg-emerald-500/10'
              : 'text-slate-400 hover:text-white hover:bg-white/10'
          }`}
          title="Toggle Camera"
        >
          {isCameraActive ? <Camera className="w-3.5 h-3.5" /> : <CameraOff className="w-3.5 h-3.5" />}
          <span>{isCameraActive ? 'Cam On' : 'Cam Off'}</span>
        </button>

        <button
          onClick={() => soundRef.current.toggleMute()}
          className="flex items-center justify-center w-9 h-9 rounded-full text-white/80 hover:text-white hover:bg-white/10 active:scale-95 transition-all cursor-pointer"
          title="Toggle Audio (M)"
        >
          {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}
