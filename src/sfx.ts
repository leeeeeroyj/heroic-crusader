import Phaser from 'phaser';

type Wave = 'square' | 'saw' | 'triangle' | 'sine' | 'noise';

/**
 * One retro voice, sfxr style. Times are in seconds. `slide` bends the pitch in octaves per second;
 * `steps` are semitone jumps spread evenly across the sound (arpeggios, jingles); `vibrato` is [hz, depth 0..1];
 * `duty` is the square wave's pulse width; `smooth` (0..1) low-passes the result, lower is duller;
 * `volume` is the peak level. A `loop` sound has no envelope and should hold whole cycles so it loops cleanly.
 */
export interface Voice {
  wave: Wave;
  freq: number;
  attack?: number;
  sustain?: number;
  decay?: number;
  slide?: number;
  steps?: number[];
  vibrato?: [number, number];
  duty?: number;
  smooth?: number;
  volume?: number;
  loop?: boolean;
}

/** Every sound in the game. Tweak freely: they're rebuilt from these numbers each time the game loads. */
export const SOUNDS = {
  select: { wave: 'square', freq: 880, sustain: 0.04, decay: 0.04, duty: 0.5, volume: 0.2 },
  start: { wave: 'triangle', freq: 392, steps: [0, 4, 7, 12, 7, 12], sustain: 0.5, decay: 0.2, volume: 0.45 },
  bump: { wave: 'square', freq: 140, slide: -1.5, sustain: 0.03, decay: 0.06, duty: 0.5, volume: 0.16 },
  arrive: { wave: 'triangle', freq: 660, steps: [0, 4, 7], sustain: 0.14, decay: 0.1, volume: 0.35 },
  encounter: { wave: 'square', freq: 330, steps: [12, 8, 5, 1, -2, -6], sustain: 0.42, decay: 0.12, duty: 0.25, volume: 0.3 },
  swing: { wave: 'noise', freq: 2400, slide: -3, sustain: 0.05, decay: 0.07, smooth: 0.5, volume: 0.28 },
  hit: { wave: 'noise', freq: 900, slide: -2, sustain: 0.04, decay: 0.12, smooth: 0.6, volume: 0.45 },
  valor: { wave: 'square', freq: 784, steps: [0, 7, 12, 19], sustain: 0.12, decay: 0.12, duty: 0.25, volume: 0.32 },
  guard: { wave: 'triangle', freq: 1320, slide: -0.5, sustain: 0.03, decay: 0.16, volume: 0.35 },
  hurt: { wave: 'square', freq: 220, slide: -2.5, sustain: 0.06, decay: 0.12, duty: 0.5, volume: 0.3 },
  freed: { wave: 'triangle', freq: 523, steps: [0, 5, 9, 14], slide: 0.4, sustain: 0.2, decay: 0.16, volume: 0.3 },
  flee: { wave: 'square', freq: 392, steps: [0, 3, 6, 9, 12], sustain: 0.2, decay: 0.06, duty: 0.125, volume: 0.2 },
  victory: { wave: 'triangle', freq: 440, steps: [0, 5, 9, 5, 9, 14, 17], sustain: 0.62, decay: 0.3, volume: 0.42 },
  levelup: { wave: 'square', freq: 523, steps: [0, 2, 4, 7, 9, 12, 16, 19], sustain: 0.6, decay: 0.3, duty: 0.25, volume: 0.3 },
  fall: { wave: 'triangle', freq: 330, steps: [0, -1, -3, -5, -8, -12], slide: -0.3, sustain: 1.0, decay: 0.4, volume: 0.4 },
  rest: { wave: 'triangle', freq: 523, steps: [0, 4, 7, 12, 16], sustain: 0.4, decay: 0.3, vibrato: [5, 0.01], volume: 0.32 },
  cast: { wave: 'triangle', freq: 660, slide: 1.5, sustain: 0.18, decay: 0.12, vibrato: [18, 0.03], volume: 0.28 },
  bolt: { wave: 'noise', freq: 3000, slide: -1.5, sustain: 0.12, decay: 0.12, smooth: 0.4, volume: 0.3 },
  heal: { wave: 'sine', freq: 784, steps: [0, 7, 12, 16], sustain: 0.28, decay: 0.2, volume: 0.32 },
  sleep: { wave: 'sine', freq: 392, steps: [0, -3, -7], slide: -0.4, sustain: 0.4, decay: 0.2, volume: 0.28 },
  poison: { wave: 'square', freq: 180, steps: [0, 1, 0, 1], sustain: 0.16, decay: 0.08, duty: 0.25, volume: 0.18 },
  howl: { wave: 'saw', freq: 300, slide: 0.8, sustain: 0.45, decay: 0.25, vibrato: [6, 0.04], smooth: 0.4, volume: 0.25 },
  open: { wave: 'square', freq: 523, steps: [0, 7], sustain: 0.06, decay: 0.05, duty: 0.25, volume: 0.18 },
  coin: { wave: 'square', freq: 988, steps: [0, 5], sustain: 0.08, decay: 0.12, duty: 0.5, volume: 0.2 },
} satisfies Record<string, Voice>;

export type SoundName = keyof typeof SOUNDS;
const cacheKey = (name: SoundName) => `sfx-${name}`;
const MUTE_STORAGE = 'heroic-crusader-muted';
/** Registry key holding the mute setting. Phaser's own `sound.mute` reads back stale until audio is running, so it isn't the source of truth. */
export const MUTED = 'muted';

function render(ctx: BaseAudioContext, v: Voice): AudioBuffer {
  const rate = ctx.sampleRate;
  const attack = v.attack ?? 0, sustain = v.sustain ?? 0, decay = v.decay ?? 0;
  const length = attack + sustain + decay;
  const buffer = ctx.createBuffer(1, Math.ceil(length * rate), rate);
  const out = buffer.getChannelData(0);
  const duty = v.duty ?? 0.5, volume = v.volume ?? 0.5, smooth = v.smooth ?? 1;
  let phase = 0, noise = Math.random() * 2 - 1, filtered = 0;
  // A loop is rendered twice and the second pass kept, so the filter has settled and the seam doesn't click.
  for (let i = v.loop ? -out.length : 0; i < out.length; i++) {
    const t = i / rate;
    let f = v.freq * 2 ** ((v.slide ?? 0) * t);
    if (v.steps) f *= 2 ** (v.steps[Math.min(v.steps.length - 1, Math.floor((t / length) * v.steps.length))] / 12);
    if (v.vibrato) f *= 1 + Math.sin(2 * Math.PI * v.vibrato[0] * t) * v.vibrato[1];
    phase += f / rate;
    if (phase >= 1) {
      phase -= Math.floor(phase);
      noise = Math.random() * 2 - 1; // noise holds one random level per cycle, so it can be pitched
    }
    let s: number;
    switch (v.wave) {
      case 'square': s = phase < duty ? 1 : -1; break;
      case 'saw': s = 2 * phase - 1; break;
      case 'triangle': s = 1 - 4 * Math.abs(phase - 0.5); break;
      case 'sine': s = Math.sin(2 * Math.PI * phase); break;
      case 'noise': s = noise; break;
    }
    filtered += (s - filtered) * smooth;
    let env = 1;
    if (!v.loop) {
      if (t < attack) env = t / attack;
      else if (t > attack + sustain) env = (1 - (t - attack - sustain) / decay) ** 2;
    }
    if (i >= 0) out[i] = filtered * env * volume;
  }
  return buffer;
}

/** Builds every sound into Phaser's audio cache. Without Web Audio the game just stays silent. */
export function registerSounds(scene: Phaser.Scene) {
  if (!(scene.sound instanceof Phaser.Sound.WebAudioSoundManager)) return;
  for (const [name, voice] of Object.entries(SOUNDS) as Array<[SoundName, Voice]>) {
    if (!scene.cache.audio.exists(cacheKey(name))) scene.cache.audio.add(cacheKey(name), render(scene.sound.context, voice));
  }
}

export function playSound(scene: Phaser.Scene, name: SoundName, config?: Phaser.Types.Sound.SoundConfig) {
  if (scene.cache.audio.exists(cacheKey(name))) scene.sound.play(cacheKey(name), config);
}

/** A looping sound you start and stop yourself, removed when the scene shuts down. */
export function loopSound(scene: Phaser.Scene, name: SoundName) {
  if (!scene.cache.audio.exists(cacheKey(name))) return undefined;
  const sound = scene.sound.add(cacheKey(name), { loop: true }) as Phaser.Sound.WebAudioSound;
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => sound.destroy());
  return sound;
}

export function restoreMute(scene: Phaser.Scene) {
  if (scene.registry.has(MUTED)) return;
  let muted = false;
  try {
    muted = localStorage.getItem(MUTE_STORAGE) === '1';
  } catch {
    // Storage blocked: sound stays on.
  }
  scene.registry.set(MUTED, muted);
  scene.sound.mute = muted;
}

export function toggleMute(scene: Phaser.Scene) {
  const muted = scene.registry.get(MUTED) !== true;
  scene.registry.set(MUTED, muted);
  scene.sound.mute = muted;
  try {
    localStorage.setItem(MUTE_STORAGE, muted ? '1' : '0');
  } catch {
    // Storage blocked: the setting lasts for this visit only.
  }
}
