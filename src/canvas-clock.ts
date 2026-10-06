/**
 * Monochrome Magnetic Particle Clock & Generative Atmosphere
 * Vercel x Linear x Raycast inspired creative coding interface.
 * Dense magnetic dust particles with dual-zone cursor interaction,
 * organic idle respiration, dynamic luminance, and interactive ambient field.
 */

export interface ClockOptions {
  is24Hour: boolean;
  showSeconds: boolean;
  anchorElement?: HTMLElement;
  onFpsUpdate?: (fps: number) => void;
  onParticleCountUpdate?: (count: number) => void;
}

interface TargetPoint {
  x: number;
  y: number;
  alpha: number;
  isSeconds: boolean;
  secSlot?: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  targetX: number;
  targetY: number;
  finalTargetX: number;
  finalTargetY: number;
  radius: number;
  baseRadius: number;
  alpha: number;
  targetAlpha: number;
  baseAlpha: number;
  isSeconds: boolean;
  secSlot?: number;

  // Origin coordinates when transition began
  originX: number;
  originY: number;

  // Organic idle respiration
  idlePhaseX: number;
  idlePhaseY: number;
  idleSpeed: number;
  idleAmp: number;

  // Ambient dust field
  isAmbient: boolean;
  ambientAngle: number;
  ambientSpeed: number;
  ambientRadius: number;
  ambientCenterX: number;
  ambientCenterY: number;
}

const SEC_ALPHA_TIERS = [
  { minAlpha: 0.03, maxAlpha: 0.09, style: 'rgba(255, 255, 255, 0.06)' },
  { minAlpha: 0.09, maxAlpha: 0.16, style: 'rgba(255, 255, 255, 0.12)' },
  { minAlpha: 0.16, maxAlpha: 0.23, style: 'rgba(255, 255, 255, 0.19)' },
  { minAlpha: 0.23, maxAlpha: 0.30, style: 'rgba(255, 255, 255, 0.26)' },
  { minAlpha: 0.30, maxAlpha: 0.37, style: 'rgba(255, 255, 255, 0.33)' },
  { minAlpha: 0.37, maxAlpha: 0.45, style: 'rgba(255, 255, 255, 0.42)' },
  { minAlpha: 0.45, maxAlpha: 0.55, style: 'rgba(255, 255, 255, 0.50)' },
  { minAlpha: 0.55, maxAlpha: 99.0, style: 'rgba(255, 255, 255, 0.68)' },
] as const;

// High-performance Sine/Cosine lookup table (1024 entries) for zero-overhead physics calculations
const SIN_TABLE_SIZE = 1024;
const SIN_TABLE = new Float32Array(SIN_TABLE_SIZE);
for (let i = 0; i < SIN_TABLE_SIZE; i++) {
  SIN_TABLE[i] = Math.sin((i / SIN_TABLE_SIZE) * Math.PI * 2);
}
const RAD_TO_INDEX = SIN_TABLE_SIZE / (Math.PI * 2);

function fastSin(rad: number): number {
  const idx = Math.floor(rad * RAD_TO_INDEX) & (SIN_TABLE_SIZE - 1);
  return SIN_TABLE[idx];
}

function fastCos(rad: number): number {
  const idx = Math.floor((rad + Math.PI * 0.5) * RAD_TO_INDEX) & (SIN_TABLE_SIZE - 1);
  return SIN_TABLE[idx];
}

export class ParticleClock {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private container: HTMLElement;
  private anchorElement?: HTMLElement;
  private offscreenCanvas: HTMLCanvasElement;
  private offscreenCtx: CanvasRenderingContext2D;

  private is24Hour: boolean;
  private showSeconds: boolean;
  private onFpsUpdate?: (fps: number) => void;
  private onParticleCountUpdate?: (count: number) => void;

  private particles: Particle[] = [];
  private ambientCount = 80;
  private animationFrameId: number | null = null;
  private isRunning = false;

  // Viewport / canvas dimensions (CSS pixels)
  private width = 0;
  private height = 0;
  private dpr = 1;

  // Smooth mouse tracking with dual-zone physics
  private mouse = {
    x: -9999,
    y: -9999,
    vx: 0,
    vy: 0,
    lastX: -9999,
    lastY: -9999,
    radius: 170, // Outer magnetic zone
    scatterRadius: 90, // Inner physical collision zone
    isHovering: false,
  };

  // Time caching to detect string changes
  private lastMainString = '';
  private lastSecString = '';

  // Performance monitoring
  private frameCount = 0;
  private lastFpsTimestamp = 0;
  private currentFps = 60;

  // Resize observer
  private resizeObserver: ResizeObserver | null = null;

  // Sentinel Mode State
  private sentinelState: 'dormant' | 'transitioning_in' | 'active' | 'thinking' | 'transitioning_out' = 'dormant';
  private sentinelCenterX = 0;
  private sentinelCenterY = 0;
  private sentinelTransitionProgress = 0;
  private sentinelRingAngle = 0;
  private isSentinelThinking = false;

  constructor(canvas: HTMLCanvasElement, options: ClockOptions) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) {
      throw new Error('Failed to acquire 2D canvas context');
    }
    this.ctx = ctx;
    this.container = canvas.parentElement || document.body;
    this.anchorElement = options.anchorElement || canvas.parentElement || undefined;

    this.offscreenCanvas = document.createElement('canvas');
    const offCtx = this.offscreenCanvas.getContext('2d', { willReadFrequently: true });
    if (!offCtx) {
      throw new Error('Failed to acquire offscreen canvas context');
    }
    this.offscreenCtx = offCtx;

    this.is24Hour = options.is24Hour;
    this.showSeconds = options.showSeconds;
    this.onFpsUpdate = options.onFpsUpdate;
    this.onParticleCountUpdate = options.onParticleCountUpdate;

    this.initEvents();
    this.handleResize();
    this.start();
  }

  private initEvents(): void {
    window.addEventListener('resize', () => {
      this.handleResize();
    });

    if (this.anchorElement) {
      this.resizeObserver = new ResizeObserver(() => {
        this.handleResize();
      });
      this.resizeObserver.observe(this.anchorElement);
    } else {
      this.resizeObserver = new ResizeObserver(() => {
        this.handleResize();
      });
      this.resizeObserver.observe(this.container);
    }

    window.addEventListener('mousemove', (e: MouseEvent) => {
      const newX = e.clientX;
      const newY = e.clientY;

      if (this.mouse.lastX !== -9999) {
        this.mouse.vx = newX - this.mouse.lastX;
        this.mouse.vy = newY - this.mouse.lastY;
      }
      this.mouse.lastX = newX;
      this.mouse.lastY = newY;
      this.mouse.x = newX;
      this.mouse.y = newY;
      this.mouse.isHovering = true;
    });

    window.addEventListener('mouseleave', () => {
      this.mouse.x = -9999;
      this.mouse.y = -9999;
      this.mouse.lastX = -9999;
      this.mouse.lastY = -9999;
      this.mouse.vx = 0;
      this.mouse.vy = 0;
      this.mouse.isHovering = false;
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.stop();
      } else {
        this.start();
        if (this.sentinelState === 'dormant') {
          this.updateTimeTargets(true);
        }
      }
    });

    if (document.fonts) {
      document.fonts.ready.then(() => {
        if (this.sentinelState === 'dormant') {
          this.updateTimeTargets(true);
        }
      });
    }
  }

  public set24Hour(value: boolean): void {
    this.is24Hour = value;
    this.lastMainString = '';
    this.lastSecString = '';
    if (this.sentinelState === 'dormant') {
      this.updateTimeTargets(true);
    }
  }

  public setShowSeconds(value: boolean): void {
    this.showSeconds = value;
    this.lastMainString = '';
    this.lastSecString = '';
    if (this.sentinelState === 'dormant') {
      this.updateTimeTargets(true);
    }
  }

  public getSentinelState(): 'dormant' | 'transitioning_in' | 'active' | 'thinking' | 'transitioning_out' {
    return this.sentinelState;
  }

  public isSentinelActive(): boolean {
    return this.sentinelState === 'active' || this.sentinelState === 'thinking' || this.sentinelState === 'transitioning_in';
  }

  public isSentinelBusy(): boolean {
    return this.sentinelState !== 'dormant';
  }

  public isTransitioning(): boolean {
    return this.sentinelState === 'transitioning_in' || this.sentinelState === 'transitioning_out';
  }

  public setSentinelCenter(x: number, y: number): void {
    this.sentinelCenterX = x;
    this.sentinelCenterY = y;
  }

  public activateSentinel(targetX?: number, targetY?: number): void {
    if (this.sentinelState === 'active' || this.sentinelState === 'thinking' || this.sentinelState === 'transitioning_in') return;
    const center = this.getClockCenter();
    this.sentinelCenterX = targetX !== undefined ? targetX : center.x;
    this.sentinelCenterY = targetY !== undefined ? targetY : center.y;

    this.sentinelState = 'transitioning_in';
    this.sentinelTransitionProgress = 0;
    this.sentinelRingAngle = 0;

    const targets = this.sampleSentinelPoints();
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      p.originX = p.x;
      p.originY = p.y;
      p.vx *= 0.25;
      p.vy *= 0.25;
      if (i >= targets.length) {
        const orbitIndex = i - targets.length;
        p.ambientAngle = (orbitIndex * 137.5 * Math.PI) / 180;
      }
    }

    this.updateSentinelTargets();
  }

  public deactivateSentinel(): void {
    if (this.sentinelState === 'dormant' || this.sentinelState === 'transitioning_out') return;
    this.sentinelState = 'transitioning_out';
    this.sentinelTransitionProgress = 0;
    this.isSentinelThinking = false;

    const targets = this.sampleTargetPoints();
    const cx = this.sentinelCenterX || Math.floor(this.width / 2);
    const cy = this.sentinelCenterY || Math.floor(this.height * 0.46);

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      p.originX = p.x;
      p.originY = p.y;
      p.vx = 0;
      p.vy = 0;

      if (i < targets.length) {
        // Map directly into the clock digit points
        const t = targets[i];
        p.finalTargetX = t.x;
        p.finalTargetY = t.y;
        p.targetAlpha = t.alpha;
        p.baseAlpha = t.alpha;
        p.isSeconds = t.isSeconds;
        p.isAmbient = false;
        p.baseRadius = t.isSeconds ? 0.95 : 1.1;
      } else {
        // Surplus particles disperse smoothly into wide ambient cosmic stardust (identical to initial launch)
        p.finalTargetX = cx + (Math.random() - 0.5) * (this.width * 0.75);
        p.finalTargetY = cy + (Math.random() - 0.5) * (this.height * 0.75);
        p.ambientCenterX = p.finalTargetX;
        p.ambientCenterY = p.finalTargetY;
        p.ambientRadius = 40 + Math.random() * (this.width * 0.35);
        p.ambientAngle = Math.random() * Math.PI * 2;
        p.ambientSpeed = 0.0015 + Math.random() * 0.003;
        p.targetAlpha = 0.12 + Math.random() * 0.14;
        p.baseAlpha = p.targetAlpha;
        p.baseRadius = 0.85;
        p.isAmbient = true;
      }
    }
  }

  public setSentinelThinking(thinking: boolean): void {
    this.isSentinelThinking = thinking;
    if (this.sentinelState === 'active' || this.sentinelState === 'thinking') {
      this.sentinelState = thinking ? 'thinking' : 'active';
    }
  }

  private easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  public getClockCenter(): { x: number; y: number } {
    if (this.anchorElement) {
      const rect = this.anchorElement.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        return {
          x: Math.floor(rect.left + rect.width / 2),
          y: Math.floor(rect.top + rect.height / 2),
        };
      }
    }
    return {
      x: Math.floor(this.width / 2),
      y: Math.floor(this.height * 0.44),
    };
  }

  private handleResize(): void {
    const newWidth = Math.max(window.innerWidth, 320);
    const newHeight = Math.max(window.innerHeight, 240);

    // Only reconfigure context & dimensions if actual bounds changed
    const sizeChanged = newWidth !== this.width || newHeight !== this.height;
    if (!sizeChanged && this.canvas.width > 0) {
      return;
    }

    this.width = newWidth;
    this.height = newHeight;

    // Cap DPR at 1.5 for optimal performance on Retina/4K screens
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);

    this.canvas.width = Math.floor(this.width * this.dpr);
    this.canvas.height = Math.floor(this.height * this.dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    this.mouse.radius = Math.min(Math.max(this.height * 0.75, 140), 220);
    this.mouse.scatterRadius = Math.min(Math.max(this.height * 0.42, 75), 110);

    const center = this.getClockCenter();
    this.sentinelCenterX = center.x;
    this.sentinelCenterY = center.y;

    if (this.sentinelState === 'dormant' || this.sentinelState === 'transitioning_out') {
      this.updateTimeTargets(true);
    } else {
      this.updateSentinelTargets();
    }
  }

  private getTimeString(): { main: string; sec: string } {
    const now = new Date();
    let hours = now.getHours();
    const minutes = now.getMinutes();
    const seconds = now.getSeconds();

    if (!this.is24Hour) {
      hours = hours % 12;
      if (hours === 0) hours = 12;
    }

    const hh = String(hours).padStart(2, '0');
    const mm = String(minutes).padStart(2, '0');
    const ss = String(seconds).padStart(2, '0');

    return {
      main: `${hh}:${mm}`,
      sec: ss,
    };
  }

  /**
   * Helper to instantiate a silky magnetic dust particle with organic properties
   */
  private createParticle(x: number, y: number, isAmbient = true, isSeconds = false, secSlot = -1): Particle {
    const center = this.getClockCenter();
    const angle = Math.random() * Math.PI * 2;
    const radius = 20 + Math.random() * (this.width * 0.48);
    const cx = center.x;
    const cy = center.y;
    const px = isAmbient ? cx + Math.cos(angle) * radius : x;
    const py = isAmbient ? cy + Math.sin(angle) * radius : y;

    const baseRadius = isAmbient ? 0.85 : isSeconds ? 0.95 : 1.1;
    const targetAlpha = isAmbient ? 0.18 + Math.random() * 0.20 : isSeconds ? 0.42 : 0.95;

    return {
      x: px + (Math.random() - 0.5) * 30,
      y: py + (Math.random() - 0.5) * 30,
      vx: (Math.random() - 0.5) * 0.8,
      vy: (Math.random() - 0.5) * 0.8,
      targetX: x,
      targetY: y,
      finalTargetX: x,
      finalTargetY: y,
      originX: px,
      originY: py,
      radius: baseRadius,
      baseRadius,
      alpha: 0,
      targetAlpha,
      baseAlpha: targetAlpha,
      isSeconds,
      secSlot,
      idlePhaseX: Math.random() * Math.PI * 2,
      idlePhaseY: Math.random() * Math.PI * 2,
      idleSpeed: 0.002 + Math.random() * 0.003,
      idleAmp: isSeconds ? 0.12 + Math.random() * 0.12 : 0.2 + Math.random() * 0.3,
      isAmbient,
      ambientAngle: Math.random() * Math.PI * 2,
      ambientSpeed: 0.0015 + Math.random() * 0.003,
      ambientRadius: 40 + Math.random() * (this.width * 0.45),
      ambientCenterX: cx + (Math.random() - 0.5) * (this.width * 0.6),
      ambientCenterY: cy + (Math.random() - 0.5) * (this.height * 0.6),
    };
  }

  /**
   * Sample geometric points forming the Sentinel indicator:
   * Concentric inner core (●), large primary ring (○), and orbital energy shells (◉).
   * Front and center with full luminous monochrome intensity!
   */
  private sampleSentinelPoints(): TargetPoint[] {
    const cx = this.sentinelCenterX;
    const cy = this.sentinelCenterY;
    const points: TargetPoint[] = [];

    // 1. Center Core (the ● dot inside ◉) - large, dense, radiant
    points.push({ x: cx, y: cy, alpha: 1.0, isSeconds: false });

    // Inner ring 1 - radius 8px (12 particles)
    const core1Count = 12;
    for (let i = 0; i < core1Count; i++) {
      const theta = (i * Math.PI * 2) / core1Count;
      points.push({
        x: cx + Math.cos(theta) * 8,
        y: cy + Math.sin(theta) * 8,
        alpha: 1.0,
        isSeconds: false,
      });
    }

    // Inner ring 2 - radius 18px (20 particles)
    const core2Count = 20;
    for (let i = 0; i < core2Count; i++) {
      const theta = (i * Math.PI * 2) / core2Count + this.sentinelRingAngle * 0.5;
      points.push({
        x: cx + Math.cos(theta) * 18,
        y: cy + Math.sin(theta) * 18,
        alpha: 0.98,
        isSeconds: false,
      });
    }

    // 2. Primary Majestic Ring (the ○ ring of ◉) - radius ~54px (60 particles)
    const ringPoints = 60;
    const ringRadius = 54;
    for (let i = 0; i < ringPoints; i++) {
      const theta = (i * Math.PI * 2) / ringPoints + this.sentinelRingAngle;
      points.push({
        x: cx + Math.cos(theta) * ringRadius,
        y: cy + Math.sin(theta) * ringRadius,
        alpha: 0.96,
        isSeconds: false,
      });
    }

    // 3. Counter-rotating Harmonic Iris - radius ~82px (46 particles)
    const haloPoints = 46;
    const haloRadius = 82;
    for (let i = 0; i < haloPoints; i++) {
      const theta = (i * Math.PI * 2) / haloPoints - this.sentinelRingAngle * 0.7;
      points.push({
        x: cx + Math.cos(theta) * haloRadius,
        y: cy + Math.sin(theta) * haloRadius,
        alpha: 0.86,
        isSeconds: true,
      });
    }

    // 4. Outer Ethereal Iris Shell - radius ~110px (38 particles)
    const outerHaloPoints = 38;
    const outerRadius = 110;
    for (let i = 0; i < outerHaloPoints; i++) {
      const theta = (i * Math.PI * 2) / outerHaloPoints + this.sentinelRingAngle * 0.35;
      points.push({
        x: cx + Math.cos(theta) * outerRadius,
        y: cy + Math.sin(theta) * outerRadius,
        alpha: 0.72,
        isSeconds: true,
      });
    }

    return points;
  }

  /**
   * Reorganize particle targets into the Sentinel indicator formation.
   */
  private updateSentinelTargets(): void {
    const center = this.getClockCenter();
    if (this.sentinelCenterX === 0 && this.sentinelCenterY === 0) {
      this.sentinelCenterX = center.x;
      this.sentinelCenterY = center.y;
    } else {
      this.sentinelCenterX += (center.x - this.sentinelCenterX) * 0.25;
      this.sentinelCenterY += (center.y - this.sentinelCenterY) * 0.25;
    }

    const cx = this.sentinelCenterX;
    const cy = this.sentinelCenterY;
    const targets = this.sampleSentinelPoints();

    const isTransitioning = this.sentinelState === 'transitioning_in';
    const progress = Math.min(1, Math.max(0, this.sentinelTransitionProgress));
    const ease = isTransitioning ? this.easeInOutCubic(progress) : 1;

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];

      if (i < targets.length) {
        const t = targets[i];
        if (isTransitioning) {
          p.targetX = p.originX + (t.x - p.originX) * ease;
          p.targetY = p.originY + (t.y - p.originY) * ease;
        } else {
          p.targetX = t.x;
          p.targetY = t.y;
        }
        p.targetAlpha = t.alpha;
        p.baseAlpha = t.alpha;
        p.isSeconds = t.isSeconds;
        p.isAmbient = false;
        p.baseRadius = t.alpha > 0.9 ? 1.25 : 0.95;
      } else {
        // Surplus particles form the majestic black hole accretion disk & quantum halo around Sentinel
        p.isAmbient = true;
        const orbitIndex = i - targets.length;
        const orbitRadius = 36 + (orbitIndex % 95) * 1.6;
        const orbitSpeed = (0.0018 + (orbitIndex % 7) * 0.0008) * (orbitIndex % 2 === 0 ? 1 : -1);
        p.ambientCenterX = cx;
        p.ambientCenterY = cy;
        p.ambientRadius = orbitRadius;
        p.ambientSpeed = this.isSentinelThinking ? orbitSpeed * 2.8 : orbitSpeed;
        p.targetAlpha = 0.35 + (orbitIndex % 8) * 0.06;
        p.baseAlpha = p.targetAlpha;
        p.baseRadius = 0.95;
      }
    }

    if (this.onParticleCountUpdate) {
      this.onParticleCountUpdate(this.particles.length);
    }
  }


  /**
   * Optimized glyph contour sampling.
   * Step size tuned to 3.2px with 1.1px radius for dense continuity at 60+ FPS.
   * When onlySeconds is true, isolates the seconds bounding box to avoid 90% of GPU readback overhead.
   */
  private sampleTargetPoints(onlySeconds = false): TargetPoint[] {
    const { main, sec } = this.getTimeString();

    // Use a dedicated bounding box for rendering clock typography
    const canvasW = Math.min(Math.max(Math.floor(this.width), 320), 1000);
    const canvasH = 220;

    if (this.offscreenCanvas.width !== canvasW || this.offscreenCanvas.height !== canvasH) {
      this.offscreenCanvas.width = canvasW;
      this.offscreenCanvas.height = canvasH;
    }
    const offCtx = this.offscreenCtx;

    const baseFontSize = Math.min(
      Math.floor(canvasH * 0.72),
      Math.floor(canvasW / (this.showSeconds ? 6.5 : 4.6))
    );
    const secFontSize = Math.floor(baseFontSize * 0.44);

    offCtx.textBaseline = 'middle';
    offCtx.textAlign = 'left';

    // Strict tabular monospace metrics
    offCtx.font = `600 ${baseFontSize}px 'Geist Mono', 'JetBrains Mono', monospace`;
    const charWidth = offCtx.measureText('0').width;
    const mainWidth = charWidth * 5;

    let secWidth = 0;
    let secCharWidth = 0;
    if (this.showSeconds) {
      offCtx.font = `500 ${secFontSize}px 'Geist Mono', 'JetBrains Mono', monospace`;
      secCharWidth = offCtx.measureText('0').width;
      secWidth = secCharWidth * 3;
    }

    const totalWidth = mainWidth + secWidth;
    const offscreenStartX = Math.floor((canvasW - totalWidth) / 2);
    const offscreenCenterY = Math.floor(canvasH / 2);
    const secStartX = offscreenStartX + mainWidth + secCharWidth;

    const center = this.getClockCenter();
    const globalOriginX = Math.floor(center.x - canvasW / 2);
    const globalOriginY = Math.floor(center.y - canvasH / 2);
    const step = 3.2;

    // ULTRA-FAST PATH: When only seconds tick, sample ONLY the seconds region
    if (onlySeconds && this.showSeconds) {
      const clearX = Math.max(0, secStartX - 8);
      const clearW = Math.min(canvasW - clearX, secWidth + 16);
      offCtx.clearRect(clearX, 0, clearW, canvasH);

      offCtx.font = `500 ${secFontSize}px 'Geist Mono', 'JetBrains Mono', monospace`;
      offCtx.fillStyle = 'rgba(255, 255, 255, 0.4)';

      for (let c = 0; c < sec.length; c++) {
        const char = sec[c];
        const slotX = secStartX + c * secCharWidth;
        const w = offCtx.measureText(char).width;
        const offsetX = (secCharWidth - w) / 2;
        offCtx.fillText(char, Math.round(slotX + offsetX), offscreenCenterY + Math.floor(baseFontSize * 0.12));
      }

      const sampleX = Math.max(0, secStartX - 4);
      const sampleW = Math.min(canvasW - sampleX, secWidth + 8);
      const imgData = offCtx.getImageData(sampleX, 0, sampleW, canvasH);
      const data = imgData.data;
      const stride = imgData.width;
      const points: TargetPoint[] = [];

      for (let y = 0; y < canvasH; y += step) {
        const iy = Math.floor(y);
        for (let relX = 0; relX < sampleW; relX += step) {
          const ix = Math.floor(relX);
          const index = (iy * stride + ix) * 4;
          const alpha = data[index + 3];

          if (alpha > 65) {
            const actualCanvasX = sampleX + ix;
            const globalX = globalOriginX + actualCanvasX;
            const globalY = globalOriginY + iy;
            const secSlot = actualCanvasX < secStartX + secCharWidth ? 0 : 1;
            points.push({
              x: globalX,
              y: globalY,
              alpha: 0.42,
              isSeconds: true,
              secSlot: secSlot,
            });
          }
        }
      }

      return points;
    }

    // FULL PATH: Sample both main digits and seconds
    offCtx.clearRect(0, 0, canvasW, canvasH);

    // Draw main digits ('HH:MM')
    offCtx.font = `600 ${baseFontSize}px 'Geist Mono', 'JetBrains Mono', monospace`;
    offCtx.fillStyle = '#ffffff';

    for (let c = 0; c < main.length; c++) {
      const char = main[c];
      const slotX = offscreenStartX + c * charWidth;
      const w = offCtx.measureText(char).width;
      const offsetX = (charWidth - w) / 2;
      offCtx.fillText(char, Math.round(slotX + offsetX), offscreenCenterY);
    }

    // Draw optional seconds ('SS')
    if (this.showSeconds) {
      offCtx.font = `500 ${secFontSize}px 'Geist Mono', 'JetBrains Mono', monospace`;
      offCtx.fillStyle = 'rgba(255, 255, 255, 0.4)';

      for (let c = 0; c < sec.length; c++) {
        const char = sec[c];
        const slotX = secStartX + c * secCharWidth;
        const w = offCtx.measureText(char).width;
        const offsetX = (secCharWidth - w) / 2;
        offCtx.fillText(char, Math.round(slotX + offsetX), offscreenCenterY + Math.floor(baseFontSize * 0.12));
      }
    }

    const imgData = offCtx.getImageData(0, 0, canvasW, canvasH);
    const data = imgData.data;
    const stride = imgData.width;
    const points: TargetPoint[] = [];

    for (let y = 0; y < canvasH; y += step) {
      const iy = Math.floor(y);
      for (let x = 0; x < canvasW; x += step) {
        const ix = Math.floor(x);
        const index = (iy * stride + ix) * 4;
        const alpha = data[index + 3];

        if (alpha > 65) {
          const globalX = globalOriginX + ix;
          const globalY = globalOriginY + iy;
          const isSec = this.showSeconds && ix >= secStartX - 2;
          const secSlot = isSec ? (ix < secStartX + secCharWidth ? 0 : 1) : -1;
          points.push({
            x: globalX,
            y: globalY,
            alpha: isSec ? 0.42 : 0.96,
            isSeconds: isSec,
            secSlot: isSec ? secSlot : undefined,
          });
        }
      }
    }

    return points;
  }

  /**
   * Smoothly morph particles within a dedicated seconds slot (tens or ones digit).
   * Prevents criss-crossing, collapses surplus particles gracefully into the new digit contour
   * without ghost remnants, and ensures inactive digits (like tens in 20 -> 21) remain 100% frozen.
   */
  private morphSecondsSlot(slot: number, slotTargets: TargetPoint[]): void {
    if (slotTargets.length === 0) return;

    // 1. Gather all existing particles for this specific slot
    const slotParticleIndices: number[] = [];
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (p.isSeconds && p.secSlot === slot) {
        slotParticleIndices.push(i);
      }
    }

    // 2. Ensure enough particles exist in this slot pool
    while (slotParticleIndices.length < slotTargets.length) {
      const refTarget = slotTargets[slotParticleIndices.length % slotTargets.length];
      const newP = this.createParticle(refTarget.x, refTarget.y, false, true, slot);
      newP.x = refTarget.x + (Math.random() - 0.5) * 6;
      newP.y = refTarget.y + (Math.random() - 0.5) * 6;
      newP.alpha = 0;
      newP.targetAlpha = 0;
      newP.baseAlpha = 0;
      this.particles.push(newP);
      slotParticleIndices.push(this.particles.length - 1);
    }

    // 3. Separate particles into active (visible) vs dormant (already collapsed/faded)
    const activeIndices: number[] = [];
    const dormantIndices: number[] = [];
    for (const idx of slotParticleIndices) {
      if (this.particles[idx].targetAlpha > 0.05) {
        activeIndices.push(idx);
      } else {
        dormantIndices.push(idx);
      }
    }

    const assignedTargetSet = new Set<TargetPoint>();
    const claimedParticleIndices = new Set<number>();

    // Pass A: Pin overlapping points (sub-pixel match between old and new digit)
    for (const pIdx of activeIndices) {
      const p = this.particles[pIdx];
      for (const target of slotTargets) {
        if (!assignedTargetSet.has(target)) {
          const dx = p.targetX - target.x;
          const dy = p.targetY - target.y;
          if (dx * dx + dy * dy < 12) {
            assignedTargetSet.add(target);
            claimedParticleIndices.add(pIdx);
            p.targetX = target.x;
            p.targetY = target.y;
            p.finalTargetX = target.x;
            p.finalTargetY = target.y;
            p.targetAlpha = target.alpha;
            p.baseAlpha = target.alpha;
            p.baseRadius = 0.95;
            break;
          }
        }
      }
    }

    // Pass B: Match remaining targets to available particles (active prioritized over dormant)
    const unassignedTargets = slotTargets.filter((t) => !assignedTargetSet.has(t));
    const availableActive = activeIndices.filter((idx) => !claimedParticleIndices.has(idx));
    const availableDormant = dormantIndices.filter((idx) => !claimedParticleIndices.has(idx));

    for (const target of unassignedTargets) {
      let bestIdx = -1;
      let bestDistSq = Infinity;
      let bestInActive = true;
      let bestPos = -1;

      // Check active particles first so visible particles flow directly into the new shape
      for (let k = 0; k < availableActive.length; k++) {
        const pIdx = availableActive[k];
        const p = this.particles[pIdx];
        const dx = p.x - target.x;
        const dy = p.y - target.y;
        const distSq = dx * dx + dy * dy;

        if (distSq < bestDistSq) {
          bestDistSq = distSq;
          bestIdx = pIdx;
          bestInActive = true;
          bestPos = k;
        }
      }

      // If needed, check dormant particles
      if (bestIdx === -1) {
        for (let k = 0; k < availableDormant.length; k++) {
          const pIdx = availableDormant[k];
          const p = this.particles[pIdx];
          const dx = p.x - target.x;
          const dy = p.y - target.y;
          const distSq = dx * dx + dy * dy;

          if (distSq < bestDistSq) {
            bestDistSq = distSq;
            bestIdx = pIdx;
            bestInActive = false;
            bestPos = k;
          }
        }
      }

      if (bestIdx !== -1) {
        const p = this.particles[bestIdx];
        p.targetX = target.x;
        p.targetY = target.y;
        p.finalTargetX = target.x;
        p.finalTargetY = target.y;
        p.targetAlpha = target.alpha;
        p.baseAlpha = target.alpha;
        p.baseRadius = 0.95;
        claimedParticleIndices.add(bestIdx);

        if (bestInActive) {
          availableActive.splice(bestPos, 1);
        } else {
          availableDormant.splice(bestPos, 1);
        }
      }
    }

    // Pass C: SURPLUS PARTICLES COLLAPSE & MELT INTO NEW DIGIT
    // All surplus particles (e.g. 0 -> 1 where 0 has ~110 and 1 has ~40)
    // are pulled into the NEAREST point on the new digit while targetAlpha drops to 0.
    // The entire loop of 0 gracefully collapses inward into 1, completely vanishing
    // without leaving a hollow static outline!
    const surplusIndices = slotParticleIndices.filter((idx) => !claimedParticleIndices.has(idx));
    for (const pIdx of surplusIndices) {
      const p = this.particles[pIdx];
      let closestTarget = slotTargets[0];
      let minDistSq = Infinity;
      for (const t of slotTargets) {
        const dx = p.x - t.x;
        const dy = p.y - t.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < minDistSq) {
          minDistSq = distSq;
          closestTarget = t;
        }
      }

      if (closestTarget) {
        p.targetX = closestTarget.x;
        p.targetY = closestTarget.y;
        p.finalTargetX = closestTarget.x;
        p.finalTargetY = closestTarget.y;
      }
      p.targetAlpha = 0;
      p.baseAlpha = 0;
    }
  }

  /**
   * Assign coordinates using stable matching. Stationary digits remain frozen,
   * while changing digits or seconds smoothly morph locally without shifting ambient or distant particles.
   */
  private updateTimeTargets(force = false): void {
    if (this.sentinelState !== 'dormant' && this.sentinelState !== 'transitioning_out') {
      return;
    }

    const { main, sec } = this.getTimeString();
    const mainChanged = force || main !== this.lastMainString;
    const secChanged = this.showSeconds && (force || sec !== this.lastSecString);

    if (!mainChanged && !secChanged) {
      return;
    }

    const keyOf = (x: number, y: number) => `${Math.round(x)},${Math.round(y)}`;

    // CASE 1: ONLY the seconds digit changed (e.g. 20 -> 21).
    // Main digits ('HH:MM') and ambient particles are 100% FROZEN and NEVER touched!
    if (!mainChanged && secChanged) {
      const prevSec = this.lastSecString;
      this.lastSecString = sec;

      const allTargets = this.sampleTargetPoints(true);
      const tensChanged = force || prevSec.length < 2 || prevSec[0] !== sec[0];
      const onesChanged = force || prevSec.length < 2 || prevSec[1] !== sec[1];

      if (tensChanged) {
        const slot0Targets = allTargets.filter((t) => t.isSeconds && t.secSlot === 0);
        this.morphSecondsSlot(0, slot0Targets);
      }

      if (onesChanged) {
        const slot1Targets = allTargets.filter((t) => t.isSeconds && t.secSlot === 1);
        this.morphSecondsSlot(1, slot1Targets);
      }

      return;
    }

    // CASE 2: Main time string changed (e.g. minute roll 09:46 -> 09:47) or force initial render.
    this.lastMainString = main;
    this.lastSecString = sec;

    const targets = this.sampleTargetPoints();
    if (targets.length === 0) return;

    const targetMap = new Map<string, TargetPoint>();
    targets.forEach((t) => {
      targetMap.set(keyOf(t.x, t.y), t);
    });

    const claimedParticleIndices = new Set<number>();
    const matchedTargetKeys = new Set<string>();

    // Pass 1: Keep already-matched particles frozen in place
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (p.isAmbient) continue;

      const key = keyOf(p.targetX, p.targetY);
      const target = targetMap.get(key);

      if (target && !matchedTargetKeys.has(key)) {
        matchedTargetKeys.add(key);
        claimedParticleIndices.add(i);
        p.finalTargetX = target.x;
        p.finalTargetY = target.y;
        if (this.sentinelState === 'transitioning_out') {
          p.targetX = p.originX;
          p.targetY = p.originY;
        } else {
          p.targetX = target.x;
          p.targetY = target.y;
        }
        p.targetAlpha = target.alpha;
        p.baseAlpha = target.alpha;
        p.isSeconds = target.isSeconds;
        p.secSlot = target.secSlot;
        p.isAmbient = false;
        p.baseRadius = target.isSeconds ? 0.95 : 1.1;
      }
    }

    // Pass 2: Unclaimed targets
    const unclaimedTargets: TargetPoint[] = [];
    for (const t of targets) {
      const key = keyOf(t.x, t.y);
      if (!matchedTargetKeys.has(key)) {
        unclaimedTargets.push(t);
      }
    }

    // Pass 3: Free particles pool (prioritize non-ambient particles before ambient ones)
    const freeNonAmbientIndices: number[] = [];
    const freeAmbientIndices: number[] = [];
    for (let i = 0; i < this.particles.length; i++) {
      if (!claimedParticleIndices.has(i)) {
        if (this.particles[i].isAmbient) {
          freeAmbientIndices.push(i);
        } else {
          freeNonAmbientIndices.push(i);
        }
      }
    }

    // Use non-ambient free particles first to avoid disturbing ambient field
    const freeParticleIndices = [...freeNonAmbientIndices, ...freeAmbientIndices];

    // Ensure particle pool has enough elements for all targets + ambient field
    while (freeParticleIndices.length < unclaimedTargets.length + this.ambientCount) {
      const newP = this.createParticle(this.width / 2, this.height / 2, true);
      this.particles.push(newP);
      freeParticleIndices.push(this.particles.length - 1);
    }

    // Pass 4: Nearest neighbor assignment for unclaimed targets
    for (const target of unclaimedTargets) {
      let bestIdx = -1;
      let bestDistSq = Infinity;
      let bestFreePos = -1;

      for (let k = 0; k < freeParticleIndices.length; k++) {
        const pIdx = freeParticleIndices[k];
        const p = this.particles[pIdx];
        const dx = p.x - target.x;
        const dy = p.y - target.y;
        const distSq = dx * dx + dy * dy;

        if (distSq < bestDistSq) {
          bestDistSq = distSq;
          bestIdx = pIdx;
          bestFreePos = k;
        }
      }

      if (bestIdx !== -1) {
        const p = this.particles[bestIdx];
        p.finalTargetX = target.x;
        p.finalTargetY = target.y;
        if (this.sentinelState === 'transitioning_out') {
          p.targetX = p.originX;
          p.targetY = p.originY;
        } else {
          p.targetX = target.x;
          p.targetY = target.y;
        }
        p.targetAlpha = target.alpha;
        p.baseAlpha = target.alpha;
        p.isSeconds = target.isSeconds;
        p.secSlot = target.secSlot;
        p.isAmbient = false;
        p.baseRadius = target.isSeconds ? 0.95 : 1.1;
        claimedParticleIndices.add(bestIdx);
        freeParticleIndices.splice(bestFreePos, 1);
      }
    }

    // Pre-seed dedicated pools for seconds slots so morphing has instant capacity
    if (this.showSeconds) {
      const center = this.getClockCenter();
      for (const slot of [0, 1]) {
        const slotCount = this.particles.filter((p) => p.isSeconds && p.secSlot === slot).length;
        for (let k = slotCount; k < 125; k++) {
          const newP = this.createParticle(center.x + 100, center.y, false, true, slot);
          newP.alpha = 0;
          newP.targetAlpha = 0;
          newP.baseAlpha = 0;
          this.particles.push(newP);
        }
      }
    }

    // Pass 5: Surplus particles become floating ambient stardust only if they weren't already ambient
    const center = this.getClockCenter();
    for (const pIdx of freeParticleIndices) {
      const p = this.particles[pIdx];
      if (!p.isAmbient && !p.isSeconds) {
        p.isAmbient = true;
        p.targetAlpha = 0.12 + Math.random() * 0.14;
        p.baseAlpha = p.targetAlpha;
        p.baseRadius = 0.85;
        p.ambientCenterX = center.x + (Math.random() - 0.5) * (this.width * 0.75);
        p.ambientCenterY = center.y + (Math.random() - 0.5) * (this.height * 0.75);
        p.ambientRadius = 40 + Math.random() * (this.width * 0.35);
      }
    }

    if (this.onParticleCountUpdate) {
      this.onParticleCountUpdate(this.particles.length);
    }
  }

  /**
   * Dual-Zone Magnetic Physics Engine (Optimized with zero redundant sqrts)
   */
  private updateParticles(): void {
    const mouse = this.mouse;
    const outerRadius = mouse.radius;
    const scatterRadius = mouse.scatterRadius;
    const outerRadiusSq = outerRadius * outerRadius;
    const scatterRadiusSq = scatterRadius * scatterRadius;

    const springMain = 0.055;
    const frictionMain = 0.84;
    const springSec = 0.038;
    const frictionSec = 0.865;

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      const spring = p.isSeconds ? springSec : springMain;
      const friction = p.isSeconds ? frictionSec : frictionMain;

      // Organic idle breathing / harmonic micro-drift (accelerated with fastSin/fastCos)
      p.idlePhaseX += p.idleSpeed;
      p.idlePhaseY += p.idleSpeed * 0.82;
      const driftX = fastSin(p.idlePhaseX) * p.idleAmp;
      const driftY = fastCos(p.idlePhaseY) * p.idleAmp;

      let effectiveTargetX = p.targetX + driftX;
      let effectiveTargetY = p.targetY + driftY;

      if (p.isAmbient) {
        p.ambientAngle += p.ambientSpeed;
        if (this.sentinelState !== 'dormant') {
          // Black hole tilted accretion disk: sweeping cosmic dust streams tracking Sentinel center
          p.targetX = this.sentinelCenterX + fastCos(p.ambientAngle) * p.ambientRadius;
          p.targetY = this.sentinelCenterY + fastSin(p.ambientAngle * 0.75) * (p.ambientRadius * 0.40);
        } else {
          // Normal clock ambient mode: serene wide cosmic drift
          p.targetX = p.ambientCenterX + fastCos(p.ambientAngle) * p.ambientRadius;
          p.targetY = p.ambientCenterY + fastSin(p.ambientAngle) * (p.ambientRadius * 0.65);
        }
        effectiveTargetX = p.targetX;
        effectiveTargetY = p.targetY;
      }

      // Spring acceleration toward target
      const dx = effectiveTargetX - p.x;
      const dy = effectiveTargetY - p.y;
      p.vx += dx * spring;
      p.vy += dy * spring;

      // Gentle, elegant swirl during Sentinel transition
      if (this.sentinelState === 'transitioning_in' || this.sentinelState === 'transitioning_out') {
        const cx = this.sentinelCenterX || Math.floor(this.width / 2);
        const cy = this.sentinelCenterY || Math.floor(this.height * 0.46);
        const toCx = cx - p.x;
        const toCy = cy - p.y;
        const dist = Math.hypot(toCx, toCy);

        if (dist > 12) {
          const progress = Math.min(1, Math.max(0, this.sentinelTransitionProgress));
          const swirlMag = this.sentinelState === 'transitioning_in' ? 0.22 : -0.12;
          const swirl = Math.sin(progress * Math.PI) * swirlMag;
          const normalX = toCx / dist;
          const normalY = toCy / dist;
          p.vx += -normalY * swirl;
          p.vy += normalX * swirl;
        }
      }

      let isDisturbed = false;

      // Mouse field interaction
      if (mouse.isHovering) {
        const mx = p.x - mouse.x;
        const my = p.y - mouse.y;
        const distSq = mx * mx + my * my;

        if (distSq < outerRadiusSq && distSq > 0.01) {
          const dist = Math.sqrt(distSq);
          const normalX = mx / dist;
          const normalY = my / dist;

          if (distSq < scatterRadiusSq) {
            // Zone 1: Inner scatter zone (strong physical repulsion & kinetic wake)
            const scatterForce = Math.pow(1 - dist / scatterRadius, 1.7) * 9.2;
            p.vx += normalX * scatterForce + mouse.vx * 0.16;
            p.vy += normalY * scatterForce + mouse.vy * 0.16;
            isDisturbed = true;
          } else {
            // Zone 2: Outer magnetic eddy (subtle gravitational pull towards cursor)
            const factor = Math.sin(((dist - scatterRadius) / (outerRadius - scatterRadius)) * Math.PI);
            const pullForce = -factor * 0.38;
            p.vx += normalX * pullForce;
            p.vy += normalY * pullForce;
          }
        }
      }

      // Dynamic Luminance & Size (check squared speed to eliminate Math.sqrt)
      const speedSq = p.vx * p.vx + p.vy * p.vy;
      if (isDisturbed) {
        // Direct cursor disturbance causes flare
        p.radius += (p.baseRadius * 1.3 - p.radius) * 0.15;
        p.alpha += (Math.min(1.0, p.baseAlpha + 0.35) - p.alpha) * 0.15;
      } else if (!p.isSeconds && speedSq > 1.44) {
        // Non-seconds particles can flare on speed
        p.radius += (p.baseRadius * 1.25 - p.radius) * 0.12;
        p.alpha += (Math.min(1.0, p.baseAlpha + 0.25) - p.alpha) * 0.12;
      } else {
        // Smooth target alpha approach (seconds particles glide gently without flashing)
        p.radius += (p.baseRadius - p.radius) * 0.08;
        p.alpha += (p.targetAlpha - p.alpha) * (p.isSeconds ? 0.09 : 0.08);
      }

      // Damping & speed cap so particles never shoot across the screen or act weirdly
      p.vx *= friction;
      p.vy *= friction;

      const maxSpeedSq = p.isSeconds ? 81 : 144;
      if (speedSq > maxSpeedSq) {
        const curSpeed = Math.sqrt(speedSq);
        const maxSpeed = p.isSeconds ? 9 : 12;
        p.vx = (p.vx / curSpeed) * maxSpeed;
        p.vy = (p.vy / curSpeed) * maxSpeed;
      }

      // Position update
      p.x += p.vx;
      p.y += p.vy;
    }

    // Mouse velocity decay
    mouse.vx *= 0.82;
    mouse.vy *= 0.82;
  }

  /**
   * High-Performance Single-Pass Batched Renderer:
   * Consolidates 11 redundant loops into 1 single pass with Path2D & quad rasterization.
   * Completely avoids 200,000+ arc Bézier calculations per second.
   */
  private render(): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    const len = this.particles.length;

    const pathAmbient = new Path2D();
    const pathMain = new Path2D();
    const pathGlow = new Path2D();
    let hasAmbient = false;
    let hasMain = false;
    let hasGlow = false;

    const tierPaths: Path2D[] = [
      new Path2D(), new Path2D(), new Path2D(), new Path2D(),
      new Path2D(), new Path2D(), new Path2D(), new Path2D(),
    ];
    const tierCounts = [0, 0, 0, 0, 0, 0, 0, 0];

    for (let i = 0; i < len; i++) {
      const p = this.particles[i];
      if (p.alpha <= 0.02) continue;

      const r = Math.max(0.1, p.radius);
      const d = r * 2;

      if (p.isAmbient) {
        pathAmbient.rect(p.x - r, p.y - r, d, d);
        hasAmbient = true;
      } else if (p.isSeconds) {
        const a = p.alpha;
        let t = 0;
        if (a < 0.09) t = 0;
        else if (a < 0.16) t = 1;
        else if (a < 0.23) t = 2;
        else if (a < 0.30) t = 3;
        else if (a < 0.37) t = 4;
        else if (a < 0.45) t = 5;
        else if (a < 0.55) t = 6;
        else t = 7;

        const scale = Math.max(0.3, Math.min(1.0, a / 0.42));
        const sr = Math.max(0.1, r * scale);
        const sd = sr * 2;
        tierPaths[t].rect(p.x - sr, p.y - sr, sd, sd);
        tierCounts[t]++;
      } else if (p.alpha > 0.98) {
        pathGlow.rect(p.x - r, p.y - r, d, d);
        hasGlow = true;
      } else {
        pathMain.rect(p.x - r, p.y - r, d, d);
        hasMain = true;
      }
    }

    if (hasAmbient) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.42)';
      ctx.fill(pathAmbient);
    }

    for (let t = 0; t < 8; t++) {
      if (tierCounts[t] > 0) {
        ctx.fillStyle = SEC_ALPHA_TIERS[t].style;
        ctx.fill(tierPaths[t]);
      }
    }

    if (hasMain) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
      ctx.fill(pathMain);
    }

    if (hasGlow) {
      ctx.fillStyle = 'rgba(255, 255, 255, 1.0)';
      ctx.fill(pathGlow);
    }
  }

  private tick = (timestamp: number): void => {
    if (!this.isRunning) return;

    try {
      if (this.sentinelState === 'transitioning_in') {
        this.sentinelTransitionProgress += 0.016; // ~1.0 second smooth & cinematic
        this.sentinelRingAngle += 0.02;
        this.updateSentinelTargets();
        if (this.sentinelTransitionProgress >= 1) {
          this.sentinelState = 'active';
        }
      } else if (this.sentinelState === 'active' || this.sentinelState === 'thinking') {
        this.sentinelRingAngle += this.sentinelState === 'thinking' ? 0.045 : 0.01;
        this.updateSentinelTargets();
      } else if (this.sentinelState === 'transitioning_out') {
        this.sentinelTransitionProgress += 0.022; // ~0.75 second smooth return
        const progress = Math.min(1, this.sentinelTransitionProgress);
        const ease = this.easeInOutCubic(progress);

        for (let i = 0; i < this.particles.length; i++) {
          const p = this.particles[i];
          p.targetX = p.originX + (p.finalTargetX - p.originX) * ease;
          p.targetY = p.originY + (p.finalTargetY - p.originY) * ease;
        }

        if (this.sentinelTransitionProgress >= 1) {
          this.sentinelState = 'dormant';
          // Ensure every particle locks cleanly into its final clock target
          for (let i = 0; i < this.particles.length; i++) {
            const p = this.particles[i];
            p.targetX = p.finalTargetX;
            p.targetY = p.finalTargetY;
          }
          // Force synchronize clock targets to current time
          this.updateTimeTargets(true);
        }
      } else {
        this.updateTimeTargets(false);
      }

      this.updateParticles();
      this.render();

      this.frameCount++;
      if (timestamp - this.lastFpsTimestamp >= 1000) {
        this.currentFps = Math.round((this.frameCount * 1000) / (timestamp - this.lastFpsTimestamp));
        this.frameCount = 0;
        this.lastFpsTimestamp = timestamp;
        if (this.onFpsUpdate) {
          this.onFpsUpdate(this.currentFps);
        }
      }
    } catch (err) {
      console.error('ParticleClock tick error:', err);
    }

    this.animationFrameId = requestAnimationFrame(this.tick);
  };

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastFpsTimestamp = performance.now();
    this.frameCount = 0;
    this.animationFrameId = requestAnimationFrame(this.tick);
  }

  public stop(): void {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  public destroy(): void {
    this.stop();
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
  }
}

