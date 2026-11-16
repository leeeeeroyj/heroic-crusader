import Phaser from 'phaser';
import type { Dir } from './world';

export type Device = 'kbm' | 'pad' | 'touch';

export interface ControlState {
  /** The direction held now (walking keeps going while it's held). */
  dir: Dir | null;
  /** A direction pressed this frame (menu cursors move once per press). */
  tapped: Dir | null;
  /** Edges: true only on the frame they're pressed. */
  confirm: boolean;
  back: boolean;
  menu: boolean;
  mute: boolean;
  device: Device;
}

const STICK = 0.5;
// Standard gamepad mapping (Xbox layout).
const BTN = { A: 0, B: 1, BACK: 8, START: 9 } as const;
const TRACKED = Object.values(BTN);

type KeyName = 'LEFT' | 'RIGHT' | 'UP' | 'DOWN' | 'W' | 'A' | 'S' | 'D' | 'Z' | 'X' | 'SPACE' | 'ENTER' | 'BACKSPACE' | 'ESC' | 'M';

/**
 * One input layer. Keyboard: arrows or WASD walk and choose, Z / Space / Enter confirm, X / Backspace go back,
 * Esc opens the menu, M toggles sound. Controller: D-pad or left stick, A confirm, B back, Start menu, Back sound.
 * Touch arrives with the touch controls. The last device used decides the hints. Construct one per scene.
 */
export class Controls {
  /** Phones and tablets start in touch mode, so the hints are right before the first touch. */
  device: Device = window.matchMedia?.('(pointer: coarse)').matches ? 'touch' : 'kbm';
  private prevButtons = new Set<number>();
  private prevPadDir: Dir | null = null;
  private readonly keys: Record<KeyName, Phaser.Input.Keyboard.Key>;
  /** Each key's press time as of the last read: a new time means a new press. */
  private readonly seen = new Map<Phaser.Input.Keyboard.Key, number>();

  constructor(private readonly scene: Phaser.Scene) {
    this.keys = scene.input.keyboard!.addKeys('LEFT,RIGHT,UP,DOWN,W,A,S,D,Z,X,SPACE,ENTER,BACKSPACE,ESC,M') as Controls['keys'];
    for (const key of Object.values(this.keys)) this.seen.set(key, key.timeDown);
    scene.input.mouse?.disableContextMenu();
    scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => { this.device = p.wasTouch ? 'touch' : 'kbm'; });
  }

  /** The first connected controller, if the browser has seen one (it needs a button press first). */
  pad(): Phaser.Input.Gamepad.Gamepad | undefined {
    const pad = this.scene.input.gamepad?.pad1;
    return pad && pad.connected ? pad : undefined;
  }

  read(): ControlState {
    const k = this.keys;
    // A press is a new down time. Phaser's JustDown misses a tap that goes down and up inside one frame (the key-up
    // clears it), which slow frames make common. A reset (Phaser resets keys when a scene pauses) zeroes the time.
    const pressed = (key: Phaser.Input.Keyboard.Key) => {
      const t = key.timeDown, fresh = t > 0 && t !== this.seen.get(key);
      this.seen.set(key, t);
      return fresh;
    };
    const j = Object.fromEntries(Object.entries(k).map(([name, key]) => [name, pressed(key)])) as Record<KeyName, boolean>;
    let confirm = j.Z || j.SPACE || j.ENTER;
    let back = j.X || j.BACKSPACE;
    let menu = j.ESC;
    let mute = j.M;
    let tapped: Dir | null = j.UP || j.W ? 'up' : j.DOWN || j.S ? 'down' : j.LEFT || j.A ? 'left' : j.RIGHT || j.D ? 'right' : null;
    let dir: Dir | null = k.UP.isDown || k.W.isDown ? 'up' : k.DOWN.isDown || k.S.isDown ? 'down'
      : k.LEFT.isDown || k.A.isDown ? 'left' : k.RIGHT.isDown || k.D.isDown ? 'right' : null;
    if (confirm || back || menu || mute || dir || tapped) this.device = 'kbm';

    const pad = this.pad();
    const down = new Set(pad ? TRACKED.filter((i) => pad.buttons[i]?.pressed) : []);
    const edges = new Set([...down].filter((i) => !this.prevButtons.has(i)));
    this.prevButtons = down;
    if (pad) {
      const sx = pad.leftStick.x, sy = pad.leftStick.y;
      let padDir: Dir | null = pad.up ? 'up' : pad.down ? 'down' : pad.left ? 'left' : pad.right ? 'right' : null;
      if (!padDir && Math.max(Math.abs(sx), Math.abs(sy)) > STICK) padDir = Math.abs(sx) > Math.abs(sy) ? (sx > 0 ? 'right' : 'left') : sy > 0 ? 'down' : 'up';
      if (padDir || down.size) this.device = 'pad';
      if (padDir && padDir !== this.prevPadDir) tapped ??= padDir;
      this.prevPadDir = padDir;
      dir ??= padDir;
      confirm ||= edges.has(BTN.A);
      back ||= edges.has(BTN.B);
      menu ||= edges.has(BTN.START);
      mute ||= edges.has(BTN.BACK);
    }
    return { dir, tapped, confirm, back, menu, mute, device: this.device };
  }
}
