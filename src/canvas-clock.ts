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
  radius: number;
  baseRadius: number;
  alpha: number;
  targetAlpha: number;
  baseAlpha: number;
  isSeconds: boolean;

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
        this.updateTimeTargets(true);
      }
    });

    if (document.fonts) {
      document.fonts.ready.then(() => {
        this.updateTimeTargets(true);
      });
    }
  }

  public set24Hour(value: boolean): void {
    this.is24Hour = value;
    this.updateTimeTargets(true);
  }

  public setShowSeconds(value: boolean): void {
    this.showSeconds = value;
    this.updateTimeTargets(true);
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

    this.updateTimeTargets(true);
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

    const baseFontSize = Math.min(
      Math.floor(sampleHeight * 0.72),
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
    const centerY = Math.floor(sampleHeight / 2);

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
        p.targetX = target.x;
        p.targetY = target.y;
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
        p.targetX = target.x;
        p.targetY = target.y;
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

    // Batch 1: Ambient stardust
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

    // Batch 2: Seconds digits (dimmer, rest state)
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

    // Batch 3: Main clock digits (hours, colons, minutes, rest state)
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

    this.updateTimeTargets(false);
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
