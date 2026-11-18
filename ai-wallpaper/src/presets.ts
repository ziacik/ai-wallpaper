import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { configDir } from './storage.js';

export interface Preset {
  description: string;
  prompt: string;
}

export const builtInPresets: Record<string, Preset> = {
  'abstract-girl': {
    description: 'Vivid minimal-abstract art with a small full-body woman',
    prompt: 'A bold, original, sophisticated minimal-abstract desktop artwork, with saturated, expressive colors, strong visual hierarchy, generous breathing room, and a tiny full-body young adult woman with long flowing hair integrated naturally into the composition. Her location, pose, clothing, scale, visual treatment and orientation may change radically. Explore inventive forms, color relationships and spatial arrangements. The composition must feel like contemporary gallery art rather than a generic anime poster. Clean finish, no visual glitches, no unnecessary decoration.'
  },
  'anime-girl': {
    description: 'Vibrant anime illustration with a small full-body heroine',
    prompt: 'Create an imaginative, beautifully executed anime-style desktop wallpaper featuring one young adult female character shown full-body at a relatively small scale within a much larger artistic environment. Use clean, confident anime illustration rather than photorealism: expressive character design, elegant linework, polished color, intentional details, and natural anatomy. Favor vivid, striking, harmonious colors. Invent a radically different visual world each time; the environment may be abstract, graphic, architectural, surreal, natural or fantastical, with unusual compositions and visual ideas. The character MUST always wear an aesthetically pleasing dress, never a Western/cowgirl outfit. Explore a broad variety of lovely anime dresses: flowing summer dresses, delicate sundresses, romantic dresses, elegant short or long dresses, and imaginative fantasy-inspired dresses, with different cuts, fabrics, details and colors. No cowboy hats, boots, denim, jeans, trousers, shorts, military clothing, leather gunslinger clothing, or other Wild West costume elements. Do not substitute a jacket-and-pants outfit for a dress. Vary her dress design, pose, expression, orientation, placement, and scale freely across the scene; do not repeatedly put her in the center. Treat the dress requirement as mandatory even when inventing a new concept. Keep the figure fully visible and clearly separated from important background shapes without dominating the wallpaper. Strong artistic coherence, memorable atmosphere, no excessive clutter, no artifacts, no generic stock anime poster look.'
  },
  'minimal-abstract': {
    description: 'Clean colorful abstract art with striking composition',
    prompt: 'An original contemporary abstract-art wallpaper. Strong minimal composition, striking saturated colors, sophisticated negative space, elegant large forms and subtle material contrasts. Every generation should explore a genuinely different visual idea. Avoid clutter, generic gradients, repeated motifs or an overly busy image.'
  },
  'sci-fi-city': {
    description: 'Unexpected cinematic futuristic city',
    prompt: 'An imaginative science-fiction cityscape with bold architectural ideas, dramatic scale, original worldbuilding, and cinematic color. Make the layout and artistic direction surprising, suitable as an atmospheric desktop background.'
  },
  'alien-landscape': {
    description: 'Surreal otherworldly landscapes',
    prompt: 'A visually original alien landscape, striking unfamiliar geology, unexpected visual forms, imaginative environments, evocative lighting, a sophisticated artistic composition and rich colors.'
  },
  'moody-forest': {
    description: 'Atmospheric mysterious woodland',
    prompt: 'A mysterious woodland interpreted with distinctive artistic direction, interesting silhouettes, atmosphere, deep layers, evocative light, and a harmonious desktop composition.'
  },
  'dark-space': {
    description: 'Minimal cinematic deep space',
    prompt: 'A compelling deep-space abstract scene, immense cosmic scale, original celestial structures, controlled highlights, beautiful negative space, refined geometry and deep color.'
  },
  'underwater-ruins': {
    description: 'Dreamlike submerged architecture',
    prompt: 'A dreamlike underwater world with mysterious ancient architecture, unusual aquatic light, grand shapes, spatial depth and a memorable artistic interpretation.'
  },
  'brutalist-future': {
    description: 'Sculptural futuristic brutalism',
    prompt: 'A futuristic brutalist architectural vision. Sculptural concrete and unexpected materials, powerful monumental geometry, bold color accents, intriguing lighting and a striking abstract composition.'
  },
  'surreal-mountains': {
    description: 'Graphic surreal mountain worlds',
    prompt: 'A radically imaginative surreal mountain landscape, bold geometry, interesting color relationships, unusual scale and a composition with clear visual structure.'
  }
};

function isPreset(value: unknown): value is Preset {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.description === 'string' && entry.description.trim().length > 0
    && typeof entry.prompt === 'string' && entry.prompt.trim().length > 0;
}

export async function loadPresets(): Promise<Record<string, Preset>> {
  const file = path.join(configDir(), 'presets.json');
  let raw: string;
  try {
    raw = await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { ...builtInPresets };
    throw new Error('Cannot read custom presets at ' + file + ': ' + String(error));
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Invalid JSON in ' + file);
  }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error('Custom presets must be an object in ' + file);
  }
  const custom: Record<string, Preset> = {};
  for (const [name, preset] of Object.entries(parsed)) {
    if (!name.trim() || !isPreset(preset)) {
      throw new Error('Invalid preset "' + name + '" in ' + file + ' (requires description and prompt)');
    }
    custom[name] = preset;
  }
  return { ...builtInPresets, ...custom };
}

export function buildPrompt(base: string, extra: string[], idea?: string): string {
  return [
    base.trim(),
    extra.length ? 'Additional user direction (honor this): ' + extra.join('; ') : '',
    idea ? 'Unique creative concept for this run: ' + idea : '',
    'Desktop wallpaper composition, not a poster or advertisement. No text, lettering, logos, signatures, borders or watermarks. Clear focal areas, crisp and intentional forms, believable construction, and no distorted anatomy or AI artifacts. Allow comfortable cropping. Be visually inventive; never imitate a fixed template.'
  ].filter(Boolean).join('\n\n');
}
