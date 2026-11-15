import Phaser from 'phaser';
import { HEIGHT, WIDTH } from './config';

const SPARK = 'fx-spark';
const WHITE = 0xffffff;

/** Shake and flashes are dropped for players who ask their system for less motion. */
export const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** Slows particles down over their life, so sparks fly out fast and hang in the air. */
class Drag extends Phaser.GameObjects.Particles.ParticleProcessor {
  constructor(private readonly perSecond: number) {
    super(0, 0, true);
  }

  override update(p: Phaser.GameObjects.Particles.Particle, _delta: number, step: number) {
    const k = Math.exp(-this.perSecond * step);
    p.velocityX *= k;
    p.velocityY *= k;
  }
}

/**
 * Juice for a fixed screen, adapted from Mars Patrol's: spark bursts, rings, a shake in game pixels and a white flash.
 * No full-screen filters, so it stays cheap on phones. `stats` counts what fired, for tests.
 */
export class Effects {
  readonly stats = { bursts: 0, rings: 0, shakes: 0, flashes: 0 };
  readonly calm = reducedMotion();
  private readonly sparks: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly flashRect: Phaser.GameObjects.Rectangle;
  private readonly rest: { x: number; y: number };
  private shakeAmt = 0;
  // The next burst's settings, read by the emitter's onEmit callbacks.
  private palette = [WHITE];
  private speed = 60;
  private life = 400;

  constructor(private readonly scene: Phaser.Scene, private readonly depth: number) {
    if (!scene.textures.exists(SPARK)) {
      const g = scene.make.graphics({}, false);
      g.fillStyle(WHITE).fillRect(0, 0, 2, 1);
      g.generateTexture(SPARK, 2, 1);
      g.destroy();
    }
    let angle = 0;
    this.sparks = scene.add.particles(0, 0, SPARK, {
      emitting: false,
      blendMode: Phaser.BlendModes.ADD,
      // rotate is worked out before angle, so it picks the direction and angle reuses it: each streak points where it flies.
      rotate: { onEmit: () => (angle = Math.random() * 360) },
      angle: { onEmit: () => angle },
      speed: { onEmit: () => this.speed * (0.25 + Math.random() * 0.75) },
      lifespan: { onEmit: () => this.life * (0.5 + Math.random() * 0.5) },
      tint: { onEmit: () => Phaser.Utils.Array.GetRandom(this.palette) },
      scaleX: { start: 1.5, end: 0.4 },
      scaleY: 1,
      alpha: { start: 1, end: 0 },
    }).setDepth(depth);
    this.sparks.addParticleProcessor(new Drag(4));
    this.flashRect = scene.add.rectangle(0, 0, WIDTH, HEIGHT, WHITE).setOrigin(0).setDepth(30).setAlpha(0);
    const cam = scene.cameras.main;
    this.rest = { x: cam.scrollX, y: cam.scrollY };
  }

  /** Sparks from (x, y) in the given colours: [count, speed px/s, life ms]. */
  burst(x: number, y: number, colors: number[], [count, speed, life]: readonly [number, number, number]) {
    this.stats.bursts++;
    this.palette = [...colors, ...colors, WHITE];
    this.speed = speed;
    this.life = life;
    this.sparks.explode(count, x, y);
  }

  /** A ring spreading out from (x, y). Flat ellipses read as ripples on water. */
  ring(x: number, y: number, color: number, radius: number, ms: number, flat = false) {
    this.stats.rings++;
    const g = this.scene.add.graphics().setDepth(this.depth).setBlendMode(Phaser.BlendModes.ADD);
    const t = { p: 0 };
    this.scene.tweens.add({
      targets: t, p: 1, duration: ms, ease: 'Quad.out',
      onUpdate: () => {
        const r = 2 + radius * t.p;
        g.clear().lineStyle(1, color, 1 - t.p);
        if (flat) g.strokeEllipse(x, y, r * 2, r);
        else g.strokeCircle(x, y, r);
      },
      onComplete: () => g.destroy(),
    });
  }

  shake(px: number) {
    if (this.calm) return;
    this.stats.shakes++;
    this.shakeAmt = Math.max(this.shakeAmt, px);
  }

  flash(alpha: number) {
    if (this.calm) return;
    this.stats.flashes++;
    this.scene.tweens.killTweensOf(this.flashRect);
    this.flashRect.setAlpha(alpha);
    this.scene.tweens.add({ targets: this.flashRect, alpha: 0, duration: 200, ease: 'Quad.out' });
  }

  update(dt: number) {
    this.shakeAmt *= Math.exp(-8 * dt);
    if (this.shakeAmt < 0.1) this.shakeAmt = 0;
    const s = this.shakeAmt;
    this.scene.cameras.main.setScroll(this.rest.x + Math.round((Math.random() * 2 - 1) * s), this.rest.y + Math.round((Math.random() * 2 - 1) * s));
  }
}
