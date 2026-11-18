import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

export interface Usage {
  input_tokens?: number;
  output_tokens?: number;
  input_tokens_details?: { text_tokens?: number; image_tokens?: number };
}

export interface HistoryEntry {
  id: string;
  createdAt: string;
  file: string;
  preset?: string;
  idea?: string;
  prompt: string;
  model: string;
  size: string;
  quality: string;
  complexity: string;
  span: boolean;
  applied: boolean;
  usage?: Usage;
  estimatedCostUsd?: number;
}

export interface State {
  lastPreset?: string;
  activeId?: string;
  history: HistoryEntry[];
}

export function configDir(): string {
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'ai-wallpaper');
}

export function imageDir(): string {
  return process.env.AI_WALLPAPER_OUTPUT_DIR || path.join(os.homedir(), 'Pictures', 'GeneratedWallpapers');
}

export function stateFile(): string {
  return path.join(configDir(), 'state.json');
}

export async function loadState(): Promise<State> {
  let raw: string;
  try {
    raw = await readFile(stateFile(), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { history: [] };
    throw new Error('Cannot read state file: ' + String(error));
  }
  try {
    const value = JSON.parse(raw) as Partial<State>;
    if (!value || !Array.isArray(value.history)) throw new Error('Missing history array');
    return {
      lastPreset: typeof value.lastPreset === 'string' ? value.lastPreset : undefined,
      activeId: typeof value.activeId === 'string' ? value.activeId : undefined,
      history: value.history.filter((entry): entry is HistoryEntry =>
        !!entry && typeof entry.id === 'string' && typeof entry.file === 'string'
        && typeof entry.createdAt === 'string')
    };
  } catch (error) {
    throw new Error('Invalid state file ' + stateFile() + ': ' + String(error));
  }
}

export async function saveState(state: State): Promise<void> {
  await mkdir(configDir(), { recursive: true, mode: 0o700 });
  const file = stateFile();
  const tempFile = file + '.' + process.pid + '.tmp';
  try {
    await writeFile(tempFile, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
    await rename(tempFile, file);
  } catch (error) {
    throw new Error('Cannot save state: ' + String(error));
  }
}

export function lastIdeas(state: State): string[] {
  return state.history.slice(-30).map(entry => entry.idea).filter((idea): idea is string => !!idea);
}

// Approximate published GPT-Image-2.6 input/output token rates in USD per million.
// A missing usage breakdown is not guessed: in that case return undefined.
export function estimateImageCost(usage: Usage | undefined): number | undefined {
  if (!usage || !usage.input_tokens_details
    || typeof usage.output_tokens !== 'number') return undefined;
  const details = usage.input_tokens_details;
  if (typeof details.text_tokens !== 'number' || typeof details.image_tokens !== 'number') return undefined;
  return (details.text_tokens * 5 + details.image_tokens * 8
    + usage.output_tokens * 30) / 1_000_000;
}
