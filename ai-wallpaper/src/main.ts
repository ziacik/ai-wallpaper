#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { access, mkdir, unlink, writeFile } from 'node:fs/promises';
import readline from 'node:readline/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { setWallpaper } from 'wallpaper';
import { buildPrompt, loadPresets, type Preset } from './presets.js';
import { generateImage, inventConcept } from './openai-api.js';
import {
  configDir, estimateImageCost, imageDir, lastIdeas, loadState, saveState, stateFile,
  type HistoryEntry, type State
} from './storage.js';

const runCommand = promisify(execFile);
const MODEL_DEFAULT = 'gpt-image-2.6-sunburst';
const DEFAULT_PRESET = 'abstract-girl';
const commands = new Set(['presets', 'history', 'restore', 'stats', 'doctor', 'help']);

interface Options {
  command: string;
  positionals: string[];
  preset?: string;
  extra: string[];
  model: string;
  quality: string;
  complexity: string;
  size: string;
  stream: boolean;
  apply: boolean;
  span: boolean;
  concept: boolean;
  dryRun: boolean;
}

function help(): void {
  console.log([
    'AI Wallpaper — generate original desktop art with GPT-Image-2.6',
    '',
    'Usage:',
    '  ai-wallpaper [--preset NAME] [--extra "direction"]',
    '  ai-wallpaper "custom image prompt" [--extra "direction"]',
    '  wallpaper presets | history | stats | doctor | restore <id-or-number>',
    '',
    'Options:',
    '  --preset NAME       Built-in or user-defined preset (remembers your choice)',
    '  --extra TEXT        Add directions to a preset or custom prompt (repeatable)',
    '  --model NAME        sunburst (default) or flare',
    '  --quality LEVEL     low, medium, high (default), xhigh, max, auto',
    '  --complexity LEVEL  low, medium (default), high',
    '  --size WIDTHxHEIGHT (default 2560x1600), or auto',
    '  --stream            Stream and write temporary progressive JPEG previews',
    '  --span              One continuous image spanned across GNOME monitors',
    '                      (default: the same wallpaper on every monitor)',
    '  --no-concept        Skip creative concept generation to save time/cost',
    '  --no-apply          Generate and save without changing the desktop',
    '  --dry-run           Show the base prompt; do not call OpenAI',
    '  --help              Show this help',
    '',
    'Files: ' + configDir() + '/presets.json, ' + stateFile(),
    'Images: ' + imageDir()
  ].join('\n'));
}

function optionValue(args: string[], index: number, name: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error('Missing value for ' + name);
  return value;
}

export function parseArgs(args: string[]): Options {
  const options: Options = {
    command: 'generate', positionals: [], extra: [],
    model: MODEL_DEFAULT, quality: 'high', complexity: 'medium', size: '2560x1600',
    stream: false, apply: true, span: false, concept: true, dryRun: false
  };
  const command = args[0];
  if (command && commands.has(command)) {
    options.command = command;
    args = args.slice(1);
  }
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg) continue;
    if (arg === '--') {
      options.positionals.push(...args.slice(i + 1));
      break;
    }
    if (arg === '--preset') options.preset = optionValue(args, i++, arg);
    else if (arg === '--extra') options.extra.push(optionValue(args, i++, arg));
    else if (arg === '--model') options.model = optionValue(args, i++, arg);
    else if (arg === '--quality') options.quality = optionValue(args, i++, arg);
    else if (arg === '--complexity') options.complexity = optionValue(args, i++, arg);
    else if (arg === '--size') options.size = optionValue(args, i++, arg);
    else if (arg === '--stream') options.stream = true;
    else if (arg === '--span') options.span = true;
    else if (arg === '--no-concept') options.concept = false;
    else if (arg === '--no-apply') options.apply = false;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--help' || arg === '-h') options.command = 'help';
    else if (arg.startsWith('-')) throw new Error('Unknown option: ' + arg);
    else options.positionals.push(arg);
  }
  if (options.model === 'sunburst') options.model = 'gpt-image-2.6-sunburst';
  if (options.model === 'flare') options.model = 'gpt-image-2.6-flare';
  if (!['gpt-image-2.6-sunburst', 'gpt-image-2.6-flare'].includes(options.model)) {
    throw new Error('Unsupported model: ' + options.model + ' (sunburst or flare)');
  }
  if (!['low', 'medium', 'high', 'xhigh', 'max', 'auto'].includes(options.quality)) {
    throw new Error('Invalid quality: ' + options.quality);
  }
  if (!['low', 'medium', 'high'].includes(options.complexity)) {
    throw new Error('Invalid complexity: ' + options.complexity);
  }
  validateSize(options.size);
  if (options.command === 'generate' && options.preset && options.positionals.length) {
    throw new Error('Choose either --preset or a custom prompt, not both');
  }
  return options;
}

export function validateSize(size: string): void {
  if (size === 'auto') return;
  const match = /^(\d+)x(\d+)$/.exec(size);
  if (!match) throw new Error('Invalid size: ' + size + ' (use WIDTHxHEIGHT or auto)');
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (width % 16 || height % 16 || Math.max(width, height) > 3840
    || Math.min(width, height) < 256 || width * height < 655_360
    || width * height > 8_294_400 || Math.max(width, height) / Math.min(width, height) > 3) {
    throw new Error('Unsupported size: ' + size + ' (multiples of 16, max 3840, max ratio 3:1, 0.66–8.29 MP)');
  }
}

async function selectPreset(presets: Record<string, Preset>): Promise<string> {
  const names = Object.keys(presets);
  console.log('Choose a preset:');
  names.forEach((name, index) => console.log('  ' + (index + 1) + '. ' + name + ' — ' + presets[name]?.description));
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question('Preset [1]: ');
    const choice = Number(answer.trim() || '1');
    if (!Number.isInteger(choice) || choice < 1 || choice > names.length) {
      throw new Error('Invalid preset number');
    }
    return names[choice - 1] as string;
  } finally {
    rl.close();
  }
}

async function applyImage(file: string, span: boolean): Promise<void> {
  await setWallpaper(file);
  // wallpaper handles setting the same image for every screen. GNOME's spanning
  // mode is opt-in, and its old value must not leak into normal invocations.
  if ((process.env.XDG_CURRENT_DESKTOP || '').toLowerCase().includes('gnome')) {
    await runCommand('gsettings', [
      'set', 'org.gnome.desktop.background', 'picture-options', span ? 'spanned' : 'zoom'
    ]);
  } else if (span) {
    throw new Error('--span requires GNOME; the wallpaper image was already applied');
  }
}

function showHistory(state: State): void {
  if (!state.history.length) {
    console.log('No generated wallpapers yet.');
    return;
  }
  state.history.slice().reverse().slice(0, 20).forEach((entry, i) => {
    console.log((i + 1) + '. ' + entry.createdAt + ' ' + entry.id.slice(0, 8)
      + (state.activeId === entry.id ? ' [active]' : '')
      + ' ' + (entry.preset || 'custom') + ' ' + entry.model
      + ' ' + (entry.estimatedCostUsd === undefined
        ? '' : '~$' + entry.estimatedCostUsd.toFixed(3))
      + '\n   ' + entry.file);
  });
  console.log('Restore: ai-wallpaper restore 1 (latest) or restore <id-prefix>');
}

function showStats(state: State): void {
  const entries = state.history;
  const metered = entries.filter(entry => entry.estimatedCostUsd !== undefined);
  const total = metered.reduce((sum, entry) => sum + (entry.estimatedCostUsd || 0), 0);
  const totalTokens = entries.reduce((sum, entry) => sum + (entry.usage?.output_tokens || 0), 0);
  console.log('Wallpapers: ' + entries.length);
  console.log('Image output tokens recorded: ' + totalTokens);
  console.log('Estimated image API cost for ' + metered.length + ' recorded generations: ~$'
    + total.toFixed(3) + ' USD');
  console.log('Estimate excludes concept-generation requests, retries, and items lacking token breakdown.');
}

async function restore(state: State, selector: string): Promise<void> {
  const entries = state.history.slice().reverse();
  const index = Number(selector);
  const entry = /^[1-9]\d*$/.test(selector) ? entries[index - 1]
    : entries.find(item => item.id.startsWith(selector));
  if (!entry) throw new Error('No wallpaper matching ' + selector);
  await access(entry.file);
  await applyImage(entry.file, entry.span);
  state.activeId = entry.id;
  entry.applied = true;
  await saveState(state);
  console.log('Restored ' + entry.file);
}

async function doctor(): Promise<void> {
  const { spawnSync } = await import('node:child_process');
  console.log('OpenAI API key: ' + (process.env.OPENAI_API_KEY ? 'configured' : 'MISSING'));
  console.log('Desktop: ' + (process.env.XDG_CURRENT_DESKTOP || 'unknown'));
  console.log('Config directory: ' + configDir());
  console.log('History: ' + stateFile());
  console.log('Wallpapers: ' + imageDir());
  console.log('Image model: ' + MODEL_DEFAULT);
  const gsettings = spawnSync('gsettings', ['--version'], { encoding: 'utf8' });
  console.log('GNOME gsettings: ' + (gsettings.status === 0 ? 'available' : 'not found'));
  try {
    await loadPresets();
    console.log('Presets: valid');
  } catch (error) {
    console.log('Presets: ERROR ' + String(error));
    process.exitCode = 1;
  }
  try {
    await loadState();
    console.log('History: valid');
  } catch (error) {
    console.log('History: ERROR ' + String(error));
    process.exitCode = 1;
  }
  if (!process.env.OPENAI_API_KEY) process.exitCode = 1;
  console.log('Note: doctor does not make a paid image request.');
}

async function generate(options: Options, state: State): Promise<void> {
  const presets = await loadPresets();
  let preset = options.preset;
  let base = options.positionals.join(' ').trim();
  if (!base) {
    if (!preset) {
      preset = state.lastPreset && presets[state.lastPreset]
        ? state.lastPreset
        : process.stdin.isTTY ? await selectPreset(presets) : DEFAULT_PRESET;
    }
    if (!presets[preset]) throw new Error('Unknown preset "' + preset + '". Run "ai-wallpaper presets"');
    base = presets[preset].prompt;
  }
  if (options.dryRun) {
    console.log(buildPrompt(base, options.extra));
    if (options.concept) console.log('\n[The AI will add a unique concept during actual generation.]');
    return;
  }
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is missing. Run "ai-wallpaper doctor"');
  console.log('Preset: ' + (preset || 'custom') + ', image model: ' + options.model
    + ', size: ' + options.size + ', quality: ' + options.quality);

  let idea: string | undefined;
  if (options.concept) {
    console.log('Inventing a fresh art concept...');
    idea = await inventConcept(base, lastIdeas(state));
    console.log('Concept: ' + idea);
  }
  const prompt = buildPrompt(base, options.extra, idea);
  const outputDir = imageDir();
  await mkdir(outputDir, { recursive: true });
  const id = randomUUID();
  const timestamp = new Date().toISOString();
  const imagePath = path.join(outputDir, 'ai-wallpaper-' + timestamp.replace(/[:.]/g, '-') + '-' + id.slice(0, 8) + '.jpg');
  const previewPaths: string[] = [];

  console.log('Generating image...');
  let image: Awaited<ReturnType<typeof generateImage>>;
  try {
    image = await generateImage({
      model: options.model, prompt, size: options.size, quality: options.quality,
      complexity: options.complexity, stream: options.stream
    }, async (base64, index) => {
      const file = imagePath.replace(/\.jpg$/, '.preview-' + (index + 1) + '.jpg');
      await writeFile(file, Buffer.from(base64, 'base64'));
      previewPaths.push(file);
      console.log('Preview ' + (index + 1) + ': ' + file);
    });
  } finally {
    for (const file of previewPaths) await unlink(file).catch(() => undefined);
  }
  if (!image.bytes.length) throw new Error('Image generation returned empty bytes');
  await writeFile(imagePath, image.bytes, { flag: 'wx' });
  console.log('Saved: ' + imagePath);

  const entry: HistoryEntry = {
    id, createdAt: timestamp, file: imagePath, preset, idea, prompt,
    model: options.model, size: options.size, quality: options.quality,
    complexity: options.complexity, span: options.span, applied: false,
    usage: image.usage, estimatedCostUsd: estimateImageCost(image.usage)
  };
  state.history.push(entry);
  if (preset) state.lastPreset = preset;
  await saveState(state);

  if (options.apply) {
    try {
      await applyImage(imagePath, options.span);
      entry.applied = true;
      state.activeId = id;
      await saveState(state);
      console.log('Wallpaper applied.');
    } catch (error) {
      throw new Error('Wallpaper saved at ' + imagePath + ', but desktop apply failed: ' + String(error));
    }
  }
  if (entry.estimatedCostUsd !== undefined) {
    console.log('Estimated image cost: ~$' + entry.estimatedCostUsd.toFixed(3) + ' USD (excludes concept tokens)');
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.command === 'help') return help();
  if (options.command === 'presets') {
    for (const [name, preset] of Object.entries(await loadPresets())) {
      console.log(name.padEnd(20) + ' ' + preset.description);
    }
    return;
  }
  if (options.command === 'doctor') return doctor();
  const state = await loadState();
  if (options.command === 'history') return showHistory(state);
  if (options.command === 'stats') return showStats(state);
  if (options.command === 'restore') {
    if (options.positionals.length !== 1) throw new Error('Usage: ai-wallpaper restore <number-or-id>');
    return restore(state, options.positionals[0] as string);
  }
  return generate(options, state);
}

if (process.env.NODE_ENV !== 'test') {
  main().catch(error => {
    console.error('Error: ' + (error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  });
}
