import { buildPrompt, builtInPresets } from './presets.js';
import { wordSimilarity } from './openai-api.js';
import { estimateImageCost } from './storage.js';

describe('Wallpaper prompt and preset behavior', () => {
  test('ships the original abstract mode plus themed presets', () => {
    expect(builtInPresets['abstract-girl']).toBeDefined();
    expect(builtInPresets['minimal-abstract']).toBeDefined();
    expect(Object.keys(builtInPresets)).toHaveLength(9);
  });

  test('--extra adds directions without replacing the preset', () => {
    const original = builtInPresets['abstract-girl']!.prompt;
    const result = buildPrompt(original, ['electric orange and turquoise', 'woman on the right']);
    expect(result).toContain(original);
    expect(result).toContain('electric orange and turquoise');
    expect(result).toContain('woman on the right');
    expect(result).toContain('No text');
  });

  test('each creative concept is included in the actual image prompt', () => {
    const result = buildPrompt('Minimalist scene', [], 'A gallery of floating porcelain arcs');
    expect(result).toContain('A gallery of floating porcelain arcs');
  });

  test('similar concepts are identified without rejecting different ideas', () => {
    expect(wordSimilarity('Massive red porcelain rings in a gallery', 'Porcelain rings inside a massive red gallery')).toBeGreaterThan(0.5);
    expect(wordSimilarity('Blue glass waves', 'Floating orange paper cubes')).toBe(0);
  });

  test('cost estimates never invent missing token data', () => {
    expect(estimateImageCost(undefined)).toBeUndefined();
    expect(estimateImageCost({ output_tokens: 500 })).toBeUndefined();
    expect(estimateImageCost({
      output_tokens: 1000,
      input_tokens_details: { text_tokens: 100, image_tokens: 20 }
    })).toBeCloseTo(0.03066);
  });
});
