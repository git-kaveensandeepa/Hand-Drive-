/**
 * Realistic procedural audio using Web Audio API
 * Features:
 * 1. Continuous engine humming sound that changes pitch when the car speeds up
 * 2. Loud tire screech sound when the car loses control / spins out
 * 3. Heavy metal crash sound when the car hits the obstacle
 * 4. Glass breaking sound after the crash
 */

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;

  // Engine synthesizer nodes
  private engineOsc1: OscillatorNode | null = null;
  private engineOsc2: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineGain: GainNode | null = null;

  // Ambient nodes
  private oceanGain: GainNode | null = null;
  private rainGain: GainNode | null = null;
  private isRaining: boolean = false;

  // Tire screech active state to prevent excessive stacking
  private isScreeching: boolean = false;
  private initialized: boolean = false;

  constructor() {
    // Lazily initialized on first user interaction
  }

  public init() {
    if (this.initialized && this.ctx && this.ctx.state === 'running') return;
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

      if (!this.ctx) {
        this.ctx = new AudioCtx();
        this.setupEngineSound();
        this.setupOceanAmbience();
        this.setupRainSound();
      }

      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }

      this.initialized = true;
    } catch {
      // Audio context not allowed or supported
    }
  }

  /**
   * 1. Continuous engine humming sound that changes pitch when the car speeds up
   */
  private setupEngineSound() {
    if (!this.ctx) return;
    try {
      const now = this.ctx.currentTime;

      // Primary low-frequency sawtooth for cylinder combustion pulse
      this.engineOsc1 = this.ctx.createOscillator();
      this.engineOsc1.type = 'sawtooth';
      this.engineOsc1.frequency.setValueAtTime(48, now);

      // Secondary harmonic triangle for engine body resonance (2x fundamental)
      this.engineOsc2 = this.ctx.createOscillator();
      this.engineOsc2.type = 'triangle';
      this.engineOsc2.frequency.setValueAtTime(96, now);

      // Lowpass filter modeling the intake manifold & exhaust muffler
      this.engineFilter = this.ctx.createBiquadFilter();
      this.engineFilter.type = 'lowpass';
      this.engineFilter.frequency.setValueAtTime(280, now);
      this.engineFilter.Q.setValueAtTime(2.2, now);

      // Main engine gain
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.setValueAtTime(this.isMuted ? 0 : 0.16, now);

      // Sub-mixer for dual oscillators
      const osc1Gain = this.ctx.createGain();
      osc1Gain.gain.setValueAtTime(0.65, now);
      const osc2Gain = this.ctx.createGain();
      osc2Gain.gain.setValueAtTime(0.45, now);

      this.engineOsc1.connect(osc1Gain);
      this.engineOsc2.connect(osc2Gain);

      osc1Gain.connect(this.engineFilter);
      osc2Gain.connect(this.engineFilter);

      this.engineFilter.connect(this.engineGain);
      this.engineGain.connect(this.ctx.destination);

      this.engineOsc1.start();
      this.engineOsc2.start();
    } catch {
      // Ignore audio failure
    }
  }

  /**
   * Smoothly updates engine RPM pitch & filter opening based on vehicle speed
   * @param speedRatio Speed normalized from 0.0 (idle/stopped) to 1.0 (top speed ~100 km/h)
   */
  public updateEnginePitch(speedRatio: number) {
    if (!this.ctx || !this.engineOsc1 || !this.engineOsc2 || !this.engineFilter || this.isMuted) return;
    try {
      const now = this.ctx.currentTime;
      const clampedRatio = Math.max(0.05, Math.min(1.2, speedRatio));

      // Fundamental frequency sweeps from 46 Hz (idle) up to 165 Hz (high speed)
      const baseFreq = 44 + clampedRatio * 120;
      this.engineOsc1.frequency.setTargetAtTime(baseFreq, now, 0.06);
      this.engineOsc2.frequency.setTargetAtTime(baseFreq * 2.02, now, 0.06);

      // Filter opens up with speed, letting high combustion harmonics through
      const filterCutoff = 260 + clampedRatio * 680;
      this.engineFilter.frequency.setTargetAtTime(filterCutoff, now, 0.08);

      // Slight volume swell under hard acceleration
      if (this.engineGain && !this.isMuted) {
        const targetVol = 0.14 + clampedRatio * 0.06;
        this.engineGain.gain.setTargetAtTime(targetVol, now, 0.08);
      }
    } catch {
      // Safe fallback
    }
  }

  /**
   * Stalls engine when vehicle crashes
   */
  public stallEngine() {
    if (!this.ctx || !this.engineGain || !this.engineOsc1) return;
    try {
      const now = this.ctx.currentTime;
      // Quick pitch dive then cut
      this.engineOsc1.frequency.exponentialRampToValueAtTime(25, now + 0.35);
      this.engineGain.gain.setTargetAtTime(0, now, 0.15);
    } catch {
      // Safe fallback
    }
  }

  /**
   * 2. Loud tire screech sound when the car loses control / spins out
   */
  public playLoudTireScreech() {
    if (!this.ctx || this.isMuted || this.isScreeching) return;
    try {
      this.isScreeching = true;
      const now = this.ctx.currentTime;
      const duration = 1.25;

      // 1. Modulated Screaming Friction Oscillator (Rubber sticking & slipping)
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(1050, now);
      osc.frequency.exponentialRampToValueAtTime(620, now + duration);

      // Pitch vibrato / shudder
      const lfo = this.ctx.createOscillator();
      lfo.frequency.setValueAtTime(24, now); // 24Hz slip flutter
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.setValueAtTime(95, now);
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      lfo.start(now);
      lfo.stop(now + duration);

      // 2. High-Q Bandpass Filter for screaming asphalt squeal
      const bandpass = this.ctx.createBiquadFilter();
      bandpass.type = 'bandpass';
      bandpass.frequency.setValueAtTime(1150, now);
      bandpass.frequency.linearRampToValueAtTime(850, now + duration);
      bandpass.Q.setValueAtTime(7.5, now);

      // 3. Shaped Noise layer for tire friction gravel sizzle
      const bufferSize = Math.floor(this.ctx.sampleRate * duration);
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * 0.45;
      }
      const noiseSrc = this.ctx.createBufferSource();
      noiseSrc.buffer = noiseBuffer;

      const noiseFilter = this.ctx.createBiquadFilter();
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.setValueAtTime(1450, now);
      noiseFilter.Q.setValueAtTime(4.0, now);

      // Loud Screech Master Gain with realistic attack and squeal decay
      const screechGain = this.ctx.createGain();
      screechGain.gain.setValueAtTime(0.01, now);
      screechGain.gain.linearRampToValueAtTime(0.55, now + 0.08); // Quick loud bite
      screechGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      osc.connect(bandpass);
      bandpass.connect(screechGain);

      noiseSrc.connect(noiseFilter);
      noiseFilter.connect(screechGain);

      screechGain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + duration);
      noiseSrc.start(now);
      noiseSrc.stop(now + duration);

      setTimeout(() => {
        this.isScreeching = false;
      }, 900);
    } catch {
      this.isScreeching = false;
    }
  }

  /**
   * 3. Heavy metal crash sound when the car hits the obstacle
   */
  public playHeavyMetalCrash() {
    if (!this.ctx || this.isMuted) return;
    try {
      const now = this.ctx.currentTime;

      // Component A: Sub-Bass Impact Boom (Body punch)
      const subOsc = this.ctx.createOscillator();
      subOsc.type = 'sine';
      subOsc.frequency.setValueAtTime(165, now);
      subOsc.frequency.exponentialRampToValueAtTime(26, now + 0.55);

      const subGain = this.ctx.createGain();
      subGain.gain.setValueAtTime(0.95, now);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);

      subOsc.connect(subGain);
      subGain.connect(this.ctx.destination);
      subOsc.start(now);
      subOsc.stop(now + 0.65);

      // Component B: Heavy Sheet Metal Resonators (Chassis & frame crumple clang)
      const metallicModes = [240, 480, 860, 1380];
      for (const freq of metallicModes) {
        const metalOsc = this.ctx.createOscillator();
        metalOsc.type = 'sawtooth';
        metalOsc.frequency.setValueAtTime(freq, now);
        metalOsc.frequency.exponentialRampToValueAtTime(freq * 0.85, now + 0.5);

        const metalFilter = this.ctx.createBiquadFilter();
        metalFilter.type = 'bandpass';
        metalFilter.frequency.setValueAtTime(freq, now);
        metalFilter.Q.setValueAtTime(9.0, now);

        const metalGain = this.ctx.createGain();
        metalGain.gain.setValueAtTime(0.28, now);
        metalGain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

        metalOsc.connect(metalFilter);
        metalFilter.connect(metalGain);
        metalGain.connect(this.ctx.destination);

        metalOsc.start(now);
        metalOsc.stop(now + 0.5);
      }

      // Component C: Violent Crumple Noise Burst (Metal folding & obstacle impact)
      const bufferSize = Math.floor(this.ctx.sampleRate * 0.9);
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        // High density distorted noise burst with non-linear decay
        const env = Math.exp(-i / (this.ctx.sampleRate * 0.16));
        data[i] = (Math.random() * 2 - 1) * env;
      }

      const noiseSrc = this.ctx.createBufferSource();
      noiseSrc.buffer = noiseBuffer;

      const crumpleFilter = this.ctx.createBiquadFilter();
      crumpleFilter.type = 'lowpass';
      crumpleFilter.frequency.setValueAtTime(2200, now);
      crumpleFilter.frequency.linearRampToValueAtTime(350, now + 0.7);

      const crumpleGain = this.ctx.createGain();
      crumpleGain.gain.setValueAtTime(0.9, now);
      crumpleGain.gain.exponentialRampToValueAtTime(0.001, now + 0.85);

      noiseSrc.connect(crumpleFilter);
      crumpleFilter.connect(crumpleGain);
      crumpleGain.connect(this.ctx.destination);

      noiseSrc.start(now);
      noiseSrc.stop(now + 0.9);

      // Shut down engine upon impact
      this.stallEngine();
    } catch {
      // Safe fallback
    }
  }

  /**
   * 4. Glass breaking sound after the crash
   */
  public playGlassBreaking() {
    if (!this.ctx || this.isMuted) return;
    try {
      const now = this.ctx.currentTime;
      const duration = 0.85;

      // Component A: Sharp initial brittle fracture (high-pass noise crack)
      const crackBufferSize = Math.floor(this.ctx.sampleRate * 0.25);
      const crackBuffer = this.ctx.createBuffer(1, crackBufferSize, this.ctx.sampleRate);
      const crackData = crackBuffer.getChannelData(0);
      for (let i = 0; i < crackBufferSize; i++) {
        crackData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.04));
      }

      const crackSrc = this.ctx.createBufferSource();
      crackSrc.buffer = crackBuffer;

      const crackFilter = this.ctx.createBiquadFilter();
      crackFilter.type = 'highpass';
      crackFilter.frequency.setValueAtTime(4200, now);

      const crackGain = this.ctx.createGain();
      crackGain.gain.setValueAtTime(0.65, now);
      crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

      crackSrc.connect(crackFilter);
      crackFilter.connect(crackGain);
      crackGain.connect(this.ctx.destination);
      crackSrc.start(now);

      // Component B: Cascade of shattered glass shards raining down (High-frequency pings)
      const shardFrequencies = [3400, 4800, 5600, 6800, 7500, 8900];
      shardFrequencies.forEach((freq, idx) => {
        const shardOsc = this.ctx!.createOscillator();
        shardOsc.type = 'triangle';
        const delayOffset = 0.02 + idx * 0.035 + Math.random() * 0.03;
        const startTime = now + delayOffset;

        shardOsc.frequency.setValueAtTime(freq + (Math.random() - 0.5) * 400, startTime);
        shardOsc.frequency.exponentialRampToValueAtTime(freq * 0.65, startTime + 0.35);

        const shardFilter = this.ctx!.createBiquadFilter();
        shardFilter.type = 'bandpass';
        shardFilter.frequency.setValueAtTime(freq, startTime);
        shardFilter.Q.setValueAtTime(14, startTime);

        const shardGain = this.ctx!.createGain();
        shardGain.gain.setValueAtTime(0.001, now);
        shardGain.gain.setValueAtTime(0.25, startTime);
        shardGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.35);

        shardOsc.connect(shardFilter);
        shardFilter.connect(shardGain);
        shardGain.connect(this.ctx!.destination);

        shardOsc.start(startTime);
        shardOsc.stop(startTime + 0.38);
      });

      // Component C: Sizzling glass granules scatter
      const scatterBufferSize = Math.floor(this.ctx.sampleRate * duration);
      const scatterBuffer = this.ctx.createBuffer(1, scatterBufferSize, this.ctx.sampleRate);
      const scatterData = scatterBuffer.getChannelData(0);
      for (let i = 0; i < scatterBufferSize; i++) {
        const env = Math.exp(-i / (this.ctx.sampleRate * 0.3));
        scatterData[i] = (Math.random() * 2 - 1) * env * 0.35;
      }

      const scatterSrc = this.ctx.createBufferSource();
      scatterSrc.buffer = scatterBuffer;

      const scatterFilter = this.ctx.createBiquadFilter();
      scatterFilter.type = 'bandpass';
      scatterFilter.frequency.setValueAtTime(5800, now);
      scatterFilter.Q.setValueAtTime(3.0, now);

      const scatterGain = this.ctx.createGain();
      scatterGain.gain.setValueAtTime(0.001, now);
      scatterGain.gain.setValueAtTime(0.35, now + 0.05);
      scatterGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      scatterSrc.connect(scatterFilter);
      scatterFilter.connect(scatterGain);
      scatterGain.connect(this.ctx.destination);

      scatterSrc.start(now + 0.05);
      scatterSrc.stop(now + duration);
    } catch {
      // Safe fallback
    }
  }

  /**
   * Sound of obstacle breaking loose and tumbling down the hill
   */
  public playRockTumble() {
    if (!this.ctx || this.isMuted) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(110, now);
      osc.frequency.exponentialRampToValueAtTime(45, now + 0.6);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.38, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(now + 0.6);
    } catch {
      // Safe fallback
    }
  }

  private setupOceanAmbience() {
    if (!this.ctx) return;
    try {
      const bufferSize = this.ctx.sampleRate * 2;
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;

      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        output[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
        output[i] *= 0.11;
        b6 = white * 0.115926;
      }

      const whiteNoise = this.ctx.createBufferSource();
      whiteNoise.buffer = noiseBuffer;
      whiteNoise.loop = true;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(450, this.ctx.currentTime);

      const lfo = this.ctx.createOscillator();
      lfo.frequency.setValueAtTime(0.18, this.ctx.currentTime);
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.setValueAtTime(180, this.ctx.currentTime);
      lfo.connect(lfoGain);
      lfoGain.connect(filter.frequency);
      lfo.start();

      this.oceanGain = this.ctx.createGain();
      this.oceanGain.gain.setValueAtTime(this.isMuted ? 0 : 0.16, this.ctx.currentTime);

      whiteNoise.connect(filter);
      filter.connect(this.oceanGain);
      this.oceanGain.connect(this.ctx.destination);

      whiteNoise.start();
    } catch {
      // Ignore audio failure
    }
  }

  private setupRainSound() {
    if (!this.ctx) return;
    try {
      const bufferSize = this.ctx.sampleRate * 2;
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = (Math.random() * 2 - 1) * 0.12;
      }

      const rainNoise = this.ctx.createBufferSource();
      rainNoise.buffer = noiseBuffer;
      rainNoise.loop = true;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1400, this.ctx.currentTime);
      filter.Q.setValueAtTime(0.8, this.ctx.currentTime);

      this.rainGain = this.ctx.createGain();
      this.rainGain.gain.setValueAtTime(0, this.ctx.currentTime);

      rainNoise.connect(filter);
      filter.connect(this.rainGain);
      this.rainGain.connect(this.ctx.destination);

      rainNoise.start();
    } catch {
      // Ignore audio failure
    }
  }

  public setRain(enabled: boolean) {
    this.isRaining = enabled;
    if (!this.ctx || !this.rainGain) return;
    try {
      const targetGain = !this.isMuted && enabled ? 0.22 : 0;
      this.rainGain.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.2);
    } catch {
      // Safe fallback
    }
  }

  public resetAudio() {
    if (!this.ctx) return;
    try {
      if (this.engineGain) {
        this.engineGain.gain.setValueAtTime(this.isMuted ? 0 : 0.16, this.ctx.currentTime);
      }
      if (this.engineOsc1) {
        this.engineOsc1.frequency.setValueAtTime(48, this.ctx.currentTime);
      }
      if (this.engineOsc2) {
        this.engineOsc2.frequency.setValueAtTime(96, this.ctx.currentTime);
      }
    } catch {
      // Safe fallback
    }
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (this.ctx) {
      if (this.engineGain) {
        this.engineGain.gain.setValueAtTime(this.isMuted ? 0 : 0.16, this.ctx.currentTime);
      }
      if (this.oceanGain) {
        this.oceanGain.gain.setValueAtTime(this.isMuted ? 0 : 0.16, this.ctx.currentTime);
      }
      if (this.rainGain) {
        this.rainGain.gain.setValueAtTime(this.isMuted || !this.isRaining ? 0 : 0.22, this.ctx.currentTime);
      }
    }
    return this.isMuted;
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public pause() {
    if (this.ctx && this.ctx.state === 'running') {
      this.ctx.suspend();
    }
  }

  public resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }
}
