import { randomBytes } from 'node:crypto';
import type { Usage } from './storage.js';

const API = 'https://api.openai.com/v1';

export class ApiError extends Error {
  constructor(
    public readonly stage: string,
    message: string,
    public readonly status?: number,
    public readonly requestId?: string
  ) {
    super(stage + ': ' + message + (requestId ? ' [request_id: ' + requestId + ']' : ''));
    this.name = 'ApiError';
  }
}

function apiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key?.trim()) throw new Error('OPENAI_API_KEY is missing. Set it in the environment.');
  return key.trim();
}

async function post(path: string, payload: Record<string, unknown>, stage: string): Promise<Response> {
  const key = apiKey();
  for (let attempt = 1; attempt <= 3; attempt++) {
    let response: Response;
    try {
      response = await fetch(API + path, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(600_000)
      });
    } catch (error) {
      if (attempt === 3) throw new ApiError(stage, 'Network/timeout error: ' + String(error));
      await new Promise(resolve => setTimeout(resolve, attempt * 1500));
      continue;
    }
    if (response.ok) return response;
    const requestId = response.headers.get('x-request-id') ?? undefined;
    let description = response.statusText;
    try {
      const body = await response.json() as { error?: { message?: string; code?: string; type?: string } };
      description = body.error?.message || description;
      if (body.error?.code) description += ' (' + body.error.code + ')';
    } catch { /* Non-JSON API error. */ }
    const retryable = response.status === 408 || response.status === 409
      || response.status === 429 || response.status >= 500;
    if (!retryable || attempt === 3) {
      throw new ApiError(stage, 'HTTP ' + response.status + ': ' + description, response.status, requestId);
    }
    const retryAfter = Number(response.headers.get('retry-after') || '0');
    const delay = Number.isFinite(retryAfter) && retryAfter > 0
      ? Math.min(retryAfter * 1000, 30_000)
      : attempt * 1500;
    console.warn(stage + ': temporary HTTP ' + response.status + '; retrying...');
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  throw new ApiError(stage, 'Retries exhausted');
}

export function wordSimilarity(a: string, b: string): number {
  const words = (text: string): Set<string> => new Set(
    (text.toLowerCase().match(/[a-z0-9]+/g) || []).filter(word => word.length > 3)
  );
  const left = words(a);
  const right = words(b);
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared++;
  return shared / (left.size + right.size - shared);
}

function extractText(body: any): string {
  if (typeof body.output_text === 'string') return body.output_text.trim();
  const pieces: string[] = [];
  for (const item of body.output || []) {
    for (const content of item.content || []) {
      if (content.type === 'output_text' && typeof content.text === 'string') pieces.push(content.text);
    }
  }
  return pieces.join(' ').trim();
}

export async function inventConcept(base: string, recent: string[]): Promise<string> {
  // The random nonce and open-ended art direction avoid a small finite preset matrix.
  const nonce = randomBytes(12).toString('hex');
  const previous = recent.slice(-30).map((idea, i) => (i + 1) + '. ' + idea).join('\n');
  let last = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    const instruction = [
      'You are an inventive art director. Invent ONE distinctive visual concept for an image generator.',
      'Stay inside the theme and constraints of this preset: ' + base,
      'Be wildly different between runs in actual artistic approach, structure, spatial arrangement, material, subject treatment and color language.',
      'Do not select from a short fixed taxonomy or reuse a habitual composition. Invent new ideas.',
      'The result must still be tasteful, cohesive, vivid, suited to a wallpaper, and avoid AI artifacts.',
      'Output ONLY one specific, evocative concept in English, under 65 words. No headings or commentary.',
      'Creative nonce: ' + nonce + '.' + attempt,
      previous ? 'DO NOT repeat any of these recent concepts:\n' + previous : '',
      last ? 'Your previous attempt was too similar: ' + last + '. Invent something substantially different.' : ''
    ].filter(Boolean).join('\n\n');
    const response = await post('/responses', {
      model: process.env.AI_WALLPAPER_CONCEPT_MODEL || 'gpt-6-luna',
      input: instruction,
      reasoning: { effort: 'none' },
      max_output_tokens: 300
    }, 'Concept generation');
    const body = await response.json();
    const idea = extractText(body);
    if (!idea) throw new ApiError('Concept generation', 'API returned no text');
    last = idea.replace(/\s+/g, ' ').slice(0, 800);
    if (recent.every(old => wordSimilarity(old, last) < 0.5)) return last;
  }
  throw new ApiError('Concept generation', 'Three proposed concepts were too similar to recent wallpapers');
}

export interface ImageOptions {
  model: string;
  prompt: string;
  quality: string;
  complexity: string;
  size: string;
  stream: boolean;
}

export interface ImageResult {
  bytes: Buffer;
  usage?: Usage;
}

export async function generateImage(
  options: ImageOptions,
  onPartial?: (base64: string, index: number) => Promise<void>
): Promise<ImageResult> {
  const response = await post('/images/generations', {
    model: options.model,
    prompt: options.prompt,
    size: options.size,
    quality: options.quality,
    complexity: options.complexity,
    output_format: 'jpeg',
    output_compression: 95,
    ...(options.stream ? { stream: true, partial_images: 2 } : {})
  }, 'Image generation');
  if (!options.stream) {
    const body = await response.json() as { data?: { b64_json?: string }[]; usage?: Usage };
    const b64 = body.data?.[0]?.b64_json;
    if (!b64) throw new ApiError('Image generation', 'API returned no image (b64_json)');
    return { bytes: Buffer.from(b64, 'base64'), usage: body.usage };
  }

  const reader = response.body?.getReader();
  if (!reader) throw new ApiError('Image generation', 'API returned no event stream');
  const decoder = new TextDecoder();
  let buffer = '';
  let finalImage: ImageResult | undefined;

  const processEvent = async (chunk: string): Promise<void> => {
    const data = chunk.split('\n').filter(line => line.startsWith('data:'))
      .map(line => line.slice(5).trimStart()).join('\n');
    if (!data || data === '[DONE]') return;
    let event: any;
    try { event = JSON.parse(data); } catch {
      throw new ApiError('Image generation', 'Invalid event stream JSON');
    }
    if (event.type === 'image_generation.partial_image' && typeof event.b64_json === 'string') {
      await onPartial?.(event.b64_json, Number(event.partial_image_index ?? 0));
    }
    if (event.type === 'image_generation.completed' && typeof event.b64_json === 'string') {
      finalImage = { bytes: Buffer.from(event.b64_json, 'base64'), usage: event.usage };
    }
    if (event.type === 'image_generation.failed' || event.error) {
      throw new ApiError('Image generation', String(event.error?.message || 'Streaming generation failed'));
    }
  };

  try {
    for (;;) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done }).replace(/\r/g, '');
      let index = buffer.indexOf('\n\n');
      while (index !== -1) {
        await processEvent(buffer.slice(0, index));
        buffer = buffer.slice(index + 2);
        index = buffer.indexOf('\n\n');
      }
      if (done) break;
    }
    if (buffer.trim()) await processEvent(buffer);
  } finally {
    reader.releaseLock();
  }
  if (!finalImage) throw new ApiError('Image generation', 'Stream ended without completed image');
  return finalImage;
}
