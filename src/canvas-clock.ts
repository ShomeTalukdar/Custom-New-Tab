/**
 * Monochrome Magnetic Particle Clock & Generative Atmosphere
 * Vercel x Linear x Raycast inspired creative coding interface.
 * Dense magnetic dust particles with dual-zone cursor interaction,
 * organic idle respiration, dynamic luminance, and interactive ambient field.
 */

export interface ClockOptions {
  is24Hour: boolean;
  showSeconds: boolean;
  onFpsUpdate?: (fps: number) => void;
  onParticleCountUpdate?: (count: number) => void;
}

interface TargetPoint {
  x: number;
  y: number;
  alpha: number;
  isSeconds: boolean;
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

export class ParticleClock {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private container: HTMLElement;
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
  private lastTimeString = '';
  private lastSecond = -1;

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
    this.resizeObserver = new ResizeObserver(() => {
      this.handleResize();
    });
    this.resizeObserver.observe(this.container);

    window.addEventListener('mousemove', (e: MouseEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      const newX = e.clientX - rect.left;
      const newY = e.clientY - rect.top;

      if (this.mouse.lastX !== -9999) {
        this.mouse.vx = newX - this.mouse.lastX;
        this.mouse.vy = newY - this.mouse.lastY;
      }
      this.mouse.lastX = newX;
      this.mouse.lastY = newY;
      this.mouse.x = newX;
      this.mouse.y = newY;

      this.mouse.isHovering =
        newX >= -80 && newX <= this.width + 80 && newY >= -80 && newY <= this.height + 80;
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
    if (this.sentinelState === 'dormant') {
      this.updateTimeTargets(true);
    }
  }

  public setShowSeconds(value: boolean): void {
    this.showSeconds = value;
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

  public setSentinelCenter(x: number, y: number): void {
    this.sentinelCenterX = x;
    this.sentinelCenterY = y;
  }

  public activateSentinel(targetX?: number, targetY?: number): void {
    if (this.isSentinelActive()) return;
    this.sentinelCenterX = targetX !== undefined ? targetX : Math.floor(this.width / 2);
    this.sentinelCenterY = targetY !== undefined ? targetY : Math.floor(this.height * 0.46);

    this.sentinelState = 'transitioning_in';
    this.sentinelTransitionProgress = 0;
    this.sentinelRingAngle = 0;

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      p.originX = p.x;
      p.originY = p.y;
    }

    this.updateSentinelTargets();
  }

  public deactivateSentinel(): void {
    if (this.sentinelState === 'dormant' || this.sentinelState === 'transitioning_out') return;
    this.sentinelState = 'transitioning_out';
    this.sentinelTransitionProgress = 0;
    this.isSentinelThinking = false;

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      p.originX = p.x;
      p.originY = p.y;
    }

    this.updateTimeTargets(true);
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

  private handleResize(): void {
    const rect = this.container.getBoundingClientRect();
    this.width = Math.max(rect.width, 300);
    this.height = Math.max(rect.height, 140);

    // Cap DPR at 1.5 for optimal performance on Retina/4K screens
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);

    this.canvas.width = Math.floor(this.width * this.dpr);
    this.canvas.height = Math.floor(this.height * this.dpr);
    this.ctx.scale(this.dpr, this.dpr);

    this.mouse.radius = Math.min(Math.max(this.height * 0.75, 140), 200);
    this.mouse.scatterRadius = Math.min(Math.max(this.height * 0.42, 75), 105);

    if (this.sentinelState === 'dormant') {
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
  private createParticle(x: number, y: number, isAmbient = true, isSeconds = false): Particle {
    const angle = Math.random() * Math.PI * 2;
    const radius = 20 + Math.random() * (this.width * 0.48);
    const cx = this.width / 2;
    const cy = this.height / 2;
    const px = isAmbient ? cx + Math.cos(angle) * radius : x;
    const py = isAmbient ? cy + Math.sin(angle) * radius : y;

    const baseRadius = isAmbient ? 0.8 : isSeconds ? 0.95 : 1.1;
    const targetAlpha = isAmbient ? 0.08 + Math.random() * 0.12 : isSeconds ? 0.30 : 0.92;

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
      idlePhaseX: Math.random() * Math.PI * 2,
      idlePhaseY: Math.random() * Math.PI * 2,
      idleSpeed: 0.002 + Math.random() * 0.003,
      idleAmp: 0.2 + Math.random() * 0.3,
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
   * Big, front and center!
   */
  private sampleSentinelPoints(): TargetPoint[] {
    const cx = this.sentinelCenterX || Math.floor(this.width / 2);
    const cy = this.sentinelCenterY || Math.floor(this.height * 0.46);
    const points: TargetPoint[] = [];

    // 1. Center Core (the ● dot inside ◉) - large, dense, radiant
    points.push({ x: cx, y: cy, alpha: 1.0, isSeconds: false });

    // Inner ring 1 - radius 7px (12 particles)
    const core1Count = 12;
    for (let i = 0; i < core1Count; i++) {
      const theta = (i * Math.PI * 2) / core1Count;
      points.push({
        x: cx + Math.cos(theta) * 7,
        y: cy + Math.sin(theta) * 7,
        alpha: 1.0,
        isSeconds: false,
      });
    }

    // Inner ring 2 - radius 16px (18 particles)
    const core2Count = 18;
    for (let i = 0; i < core2Count; i++) {
      const theta = (i * Math.PI * 2) / core2Count + this.sentinelRingAngle * 0.5;
      points.push({
        x: cx + Math.cos(theta) * 16,
        y: cy + Math.sin(theta) * 16,
        alpha: 0.95,
        isSeconds: false,
      });
    }

    // 2. Primary Majestic Ring (the ○ ring of ◉) - radius ~48px (56 particles)
    // Big, front, and center!
    const ringPoints = 56;
    const ringRadius = 48;
    for (let i = 0; i < ringPoints; i++) {
      const theta = (i * Math.PI * 2) / ringPoints + this.sentinelRingAngle;
      points.push({
        x: cx + Math.cos(theta) * ringRadius,
        y: cy + Math.sin(theta) * ringRadius,
        alpha: 0.95,
        isSeconds: false,
      });
    }

    // 3. Counter-rotating Harmonic Iris - radius ~76px (44 particles)
    const haloPoints = 44;
    const haloRadius = 76;
    for (let i = 0; i < haloPoints; i++) {
      const theta = (i * Math.PI * 2) / haloPoints - this.sentinelRingAngle * 0.7;
      points.push({
        x: cx + Math.cos(theta) * haloRadius,
        y: cy + Math.sin(theta) * haloRadius,
        alpha: 0.52,
        isSeconds: true,
      });
    }

    // 4. Outer Ethereal Iris Shell - radius ~106px (36 particles)
    const outerHaloPoints = 36;
    const outerRadius = 106;
    for (let i = 0; i < outerHaloPoints; i++) {
      const theta = (i * Math.PI * 2) / outerHaloPoints + this.sentinelRingAngle * 0.35;
      points.push({
        x: cx + Math.cos(theta) * outerRadius,
        y: cy + Math.sin(theta) * outerRadius,
        alpha: 0.28,
        isSeconds: true,
      });
    }

    return points;
  }

  /**
   * Reorganize particle targets into the Sentinel indicator formation.
   */
  private updateSentinelTargets(): void {
    const targets = this.sampleSentinelPoints();
    const cx = this.sentinelCenterX || Math.floor(this.width / 2);
    const cy = this.sentinelCenterY || Math.floor(this.height * 0.46);

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
        // Surplus particles form the sweeping quantum halo around Sentinel
        p.isAmbient = true;
        const orbitIndex = i - targets.length;
        const orbitRadius = 35 + (orbitIndex % 110) * 1.5;
        const orbitSpeed = (0.0018 + (orbitIndex % 7) * 0.0008) * (orbitIndex % 2 === 0 ? 1 : -1);
        p.ambientCenterX = cx;
        p.ambientCenterY = cy;
        p.ambientRadius = orbitRadius;
        p.ambientSpeed = this.isSentinelThinking ? orbitSpeed * 2.8 : orbitSpeed;
        p.targetAlpha = 0.06 + (orbitIndex % 8) * 0.016;
        p.baseAlpha = p.targetAlpha;
        p.baseRadius = 0.85;
      }
    }

    if (this.onParticleCountUpdate) {
      this.onParticleCountUpdate(this.particles.length);
    }
  }


  /**
   * Optimized glyph contour sampling.
   * Step size tuned to 3.2px with 1.1px radius for dense continuity at 60+ FPS.
   */
  private sampleTargetPoints(): TargetPoint[] {
    const { main, sec } = this.getTimeString();
    const timeKey = this.showSeconds ? `${main}:${sec}` : main;

    const sampleWidth = Math.floor(this.width);
    const sampleHeight = Math.floor(this.height);

    if (sampleWidth <= 0 || sampleHeight <= 0) return [];

    this.offscreenCanvas.width = sampleWidth;
    this.offscreenCanvas.height = sampleHeight;
    const offCtx = this.offscreenCtx;

    offCtx.clearRect(0, 0, sampleWidth, sampleHeight);

    // Dedicate center region of canvas to clock digits to align seamlessly with Sentinel
    const clockAreaHeight = Math.min(sampleHeight * 0.75, 250);
    const baseFontSize = Math.min(
      Math.floor(clockAreaHeight * 0.78),
      Math.floor(sampleWidth / (this.showSeconds ? 6.5 : 4.6))
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
    const startX = Math.floor((sampleWidth - totalWidth) / 2);
    const centerY = Math.floor(sampleHeight * 0.46);

    // Draw main digits ('HH:MM')
    offCtx.font = `600 ${baseFontSize}px 'Geist Mono', 'JetBrains Mono', monospace`;
    offCtx.fillStyle = '#ffffff';

    for (let c = 0; c < main.length; c++) {
      const char = main[c];
      const slotX = startX + c * charWidth;
      const w = offCtx.measureText(char).width;
      const offsetX = (charWidth - w) / 2;
      offCtx.fillText(char, Math.round(slotX + offsetX), centerY);
    }

    // Draw optional seconds ('SS')
    const secStartX = startX + mainWidth + secCharWidth;
    if (this.showSeconds) {
      offCtx.font = `500 ${secFontSize}px 'Geist Mono', 'JetBrains Mono', monospace`;
      offCtx.fillStyle = 'rgba(255, 255, 255, 0.4)';

      for (let c = 0; c < sec.length; c++) {
        const char = sec[c];
        const slotX = secStartX + c * secCharWidth;
        const w = offCtx.measureText(char).width;
        const offsetX = (secCharWidth - w) / 2;
        offCtx.fillText(char, Math.round(slotX + offsetX), centerY + Math.floor(baseFontSize * 0.12));
      }
    }

    const imgData = offCtx.getImageData(0, 0, sampleWidth, sampleHeight);
    const data = imgData.data;
    const points: TargetPoint[] = [];

    // Optimal sampling step: 3.1px provides dense coverage while running at buttery 60 FPS
    const step = sampleWidth < 500 ? 2.9 : 3.2;

    for (let y = 0; y < sampleHeight; y += step) {
      const iy = Math.floor(y);
      for (let x = 0; x < sampleWidth; x += step) {
        const ix = Math.floor(x);
        const index = (iy * sampleWidth + ix) * 4;
        const alpha = data[index + 3];

        if (alpha > 65) {
          const isSec = this.showSeconds && ix >= secStartX - 2;
          points.push({
            x: ix,
            y: iy,
            alpha: isSec ? 0.30 : 0.92,
            isSeconds: isSec,
          });
        }
      }
    }

    this.lastTimeString = timeKey;
    return points;
  }

  /**
   * Assign coordinates using stable matching. Stationary digits remain frozen,
   * while new points pull the nearest available particles.
   */
  private updateTimeTargets(force = false): void {
    if (this.sentinelState !== 'dormant' && this.sentinelState !== 'transitioning_out') {
      return;
    }

    const now = new Date();
    const currentSec = now.getSeconds();

    if (!force && this.showSeconds && currentSec === this.lastSecond) {
      return;
    }
    if (!force && !this.showSeconds && this.lastTimeString.length > 0) {
      const { main } = this.getTimeString();
      if (main === this.lastTimeString) return;
    }

    this.lastSecond = currentSec;
    const targets = this.sampleTargetPoints();
    if (targets.length === 0) return;

    const keyOf = (x: number, y: number) => `${Math.round(x)},${Math.round(y)}`;

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
        p.isAmbient = false;
        p.baseRadius = target.isSeconds ? 0.95 : 1.1;
      }
    }

    // Pass 2: Unclaimed targets (dots for changed digits)
    const unclaimedTargets: TargetPoint[] = [];
    for (const t of targets) {
      const key = keyOf(t.x, t.y);
      if (!matchedTargetKeys.has(key)) {
        unclaimedTargets.push(t);
      }
    }

    // Pass 3: Free particles pool
    const freeParticleIndices: number[] = [];
    for (let i = 0; i < this.particles.length; i++) {
      if (!claimedParticleIndices.has(i)) {
        freeParticleIndices.push(i);
      }
    }

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
        p.isAmbient = false;
        p.baseRadius = target.isSeconds ? 0.95 : 1.1;
        claimedParticleIndices.add(bestIdx);
        freeParticleIndices.splice(bestFreePos, 1);
      }
    }

    // Pass 5: Surplus particles become floating ambient stardust
    for (const pIdx of freeParticleIndices) {
      const p = this.particles[pIdx];
      if (!p.isAmbient) {
        p.isAmbient = true;
        p.targetAlpha = 0.08 + Math.random() * 0.12;
        p.baseAlpha = p.targetAlpha;
        p.baseRadius = 0.8;
        p.ambientCenterX = p.x;
        p.ambientCenterY = p.y;
        p.ambientRadius = 30 + Math.random() * 80;
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

    const spring = 0.046;
    const friction = 0.87;

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];

      // Organic idle breathing / harmonic micro-drift
      p.idlePhaseX += p.idleSpeed;
      p.idlePhaseY += p.idleSpeed * 0.82;
      const driftX = Math.sin(p.idlePhaseX) * p.idleAmp;
      const driftY = Math.cos(p.idlePhaseY) * p.idleAmp;

      let effectiveTargetX = p.targetX + driftX;
      let effectiveTargetY = p.targetY + driftY;

      if (p.isAmbient) {
        p.ambientAngle += p.ambientSpeed;
        p.targetX = p.ambientCenterX + Math.cos(p.ambientAngle) * p.ambientRadius;
        p.targetY = p.ambientCenterY + Math.sin(p.ambientAngle * 0.75) * (p.ambientRadius * 0.45);
        effectiveTargetX = p.targetX;
        effectiveTargetY = p.targetY;
      }

      // Spring acceleration toward target
      const dx = effectiveTargetX - p.x;
      const dy = effectiveTargetY - p.y;
      p.vx += dx * spring;
      p.vy += dy * spring;

      // Inward / outward organic swirl during Sentinel transition
      if (this.sentinelState === 'transitioning_in' || this.sentinelState === 'transitioning_out') {
        const cx = this.sentinelCenterX || Math.floor(this.width / 2);
        const cy = this.sentinelCenterY || Math.floor(this.height * 0.46);
        const toCx = cx - p.x;
        const toCy = cy - p.y;
        const dist = Math.hypot(toCx, toCy);

        if (dist > 8) {
          const progress = Math.min(1, Math.max(0, this.sentinelTransitionProgress));
          const swirlMag = this.sentinelState === 'transitioning_in' ? 1.6 : -1.2;
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
      if (isDisturbed || speedSq > 1.44) {
        p.radius += (p.baseRadius * 1.3 - p.radius) * 0.15;
        p.alpha += (Math.min(1.0, p.baseAlpha + 0.35) - p.alpha) * 0.15;
      } else {
        p.radius += (p.baseRadius - p.radius) * 0.08;
        p.alpha += (p.baseAlpha - p.alpha) * 0.08;
      }

      // Damping
      p.vx *= friction;
      p.vy *= friction;

      // Position update
      p.x += p.vx;
      p.y += p.vy;
    }

    // Mouse velocity decay
    mouse.vx *= 0.82;
    mouse.vy *= 0.82;
  }

  /**
   * Batched Renderer: Reduces draw calls from 1,500+ down to 4 single calls per frame,
   * completely eliminating canvas context state thrashing and string allocations.
   */
  private render(): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    const len = this.particles.length;

    // Batch 1: Ambient stardust & Sentinel aura
    ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.beginPath();
    for (let i = 0; i < len; i++) {
      const p = this.particles[i];
      if (p.isAmbient && p.alpha > 0.02) {
        ctx.moveTo(p.x + p.radius, p.y);
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      }
    }
    ctx.fill();

    // Batch 2: Seconds digits / subtle ring particles
    ctx.fillStyle = 'rgba(255, 255, 255, 0.32)';
    ctx.beginPath();
    for (let i = 0; i < len; i++) {
      const p = this.particles[i];
      if (!p.isAmbient && p.isSeconds && p.alpha <= 0.55 && p.alpha > 0.02) {
        ctx.moveTo(p.x + p.radius, p.y);
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      }
    }
    ctx.fill();

    // Batch 3: Main clock digits & Sentinel core/ring
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.beginPath();
    for (let i = 0; i < len; i++) {
      const p = this.particles[i];
      if (!p.isAmbient && !p.isSeconds && p.alpha <= 0.96 && p.alpha > 0.02) {
        ctx.moveTo(p.x + p.radius, p.y);
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      }
    }
    ctx.fill();

    // Batch 4: Disturbed / glowing particles (expanded, flaring state)
    ctx.fillStyle = 'rgba(255, 255, 255, 1.0)';
    ctx.beginPath();
    for (let i = 0; i < len; i++) {
      const p = this.particles[i];
      if (!p.isAmbient && p.alpha > (p.isSeconds ? 0.55 : 0.96)) {
        ctx.moveTo(p.x + p.radius, p.y);
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      }
    }
    ctx.fill();
  }

  private tick = (timestamp: number): void => {
    if (!this.isRunning) return;

    if (this.sentinelState === 'transitioning_in') {
      this.sentinelTransitionProgress += 0.007; // ~2.4 seconds at 60fps - smooth, slow and cinematic
      this.sentinelRingAngle += 0.015;
      this.updateSentinelTargets();
      if (this.sentinelTransitionProgress >= 1) {
        this.sentinelState = 'active';
      }
    } else if (this.sentinelState === 'active' || this.sentinelState === 'thinking') {
      this.sentinelRingAngle += this.sentinelState === 'thinking' ? 0.045 : 0.01;
      this.updateSentinelTargets();
    } else if (this.sentinelState === 'transitioning_out') {
      this.sentinelTransitionProgress += 0.009; // ~1.8 seconds - smooth return
      const progress = Math.min(1, this.sentinelTransitionProgress);
      const ease = this.easeInOutCubic(progress);

      for (let i = 0; i < this.particles.length; i++) {
        const p = this.particles[i];
        if (!p.isAmbient) {
          p.targetX = p.originX + (p.finalTargetX - p.originX) * ease;
          p.targetY = p.originY + (p.finalTargetY - p.originY) * ease;
        }
      }

      if (this.sentinelTransitionProgress >= 1) {
        this.sentinelState = 'dormant';
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

