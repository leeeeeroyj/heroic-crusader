import type Phaser from 'phaser';
import { MIRROR, type SpriteKey } from './config';

/** Points a sprite left or right, allowing for art that faces left (MIRROR). */
export function face<T extends Phaser.GameObjects.Image>(img: T, key: SpriteKey, right: boolean): T {
  return img.setFlipX(MIRROR.has(key) ? right : !right);
}
