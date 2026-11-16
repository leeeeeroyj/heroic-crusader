import type Phaser from 'phaser';
import { CREATURES, MIRROR, NPC_KIN, type CreatureId, type SpriteKey } from './config';
import { tintImage } from './tiles';

/** Points a sprite left or right, allowing for art that faces left (MIRROR). */
export function face<T extends Phaser.GameObjects.Image>(img: T, key: SpriteKey, right: boolean): T {
  return img.setFlipX(MIRROR.has(key) ? right : !right);
}

/** The texture a creature is drawn with: its base sprite, or its recoloured kin. */
export function creatureTexture(id: CreatureId): string {
  return 'tint' in CREATURES[id] ? `kin-${id}` : CREATURES[id].slot;
}

/** Bakes every recoloured kin (creatures and townsfolk) from its base sprite. Run once the sprites have loaded. */
export function bakeKin(scene: Phaser.Scene) {
  for (const [id, c] of Object.entries(CREATURES)) {
    if (!('tint' in c) || scene.textures.exists(`kin-${id}`)) continue;
    const src = scene.textures.get(c.slot).getSourceImage() as HTMLImageElement;
    scene.textures.addCanvas(`kin-${id}`, tintImage(src, c.tint));
  }
  for (const [key, k] of Object.entries(NPC_KIN)) {
    if (scene.textures.exists(key)) continue;
    scene.textures.addCanvas(key, tintImage(scene.textures.get(k.base).getSourceImage() as HTMLImageElement, k.tint));
  }
}
