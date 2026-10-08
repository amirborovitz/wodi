import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { ADVANCED_EXAMPLES, ADVANCED_EXAMPLE_TRAITS, PART_TRAITS, buildParsePrompt } from './openai';

const hash = (s: string): string => createHash('sha256').update(s).digest('hex').slice(0, 16);

// The full prompt each part used to get. Pinned so the fallback (no traits from the segmenter)
// is provably unchanged — a part we know nothing about still gets every example.
describe('buildParsePrompt — the full prompt is unchanged', () => {
  it('pins today\'s prompt per kind', () => {
    expect({
      none: hash(buildParsePrompt()),
      metcon: hash(buildParsePrompt('metcon')),
      strength: hash(buildParsePrompt('strength')),
      accessory: hash(buildParsePrompt('accessory')),
    }).toMatchInlineSnapshot(`
      {
        "accessory": "4e35335ae85c772c",
        "metcon": "d182398858c58f3d",
        "none": "d182398858c58f3d",
        "strength": "4e35335ae85c772c",
      }
    `);
  });
});

describe('buildParsePrompt — a part gets the examples its structure needs', () => {
  it('every advanced example is tagged, and every tag names a real example', () => {
    const ids = ADVANCED_EXAMPLES.map((e) => e.id);
    expect(ids.every((id) => id && ADVANCED_EXAMPLE_TRAITS[id])).toBe(true);
    expect(Object.keys(ADVANCED_EXAMPLE_TRAITS).sort()).toEqual([...ids].sort());
  });

  it('flagging every trait is exactly the full prompt', () => {
    expect(buildParsePrompt('metcon', PART_TRAITS)).toBe(buildParsePrompt('metcon'));
  });

  it('a plain metcon drops the advanced examples; a partner one keeps only the partner examples', () => {
    const plain = buildParsePrompt('metcon', []);
    const partner = buildParsePrompt('metcon', ['partner']);
    expect(plain.length).toBeLessThan(buildParsePrompt('metcon').length * 0.75);
    expect(plain).not.toContain('### 5b.');
    expect(['### 7.', '### 15.', '### 15b.', '### 15c.'].every((h) => partner.includes(h))).toBe(true);
    expect(partner).not.toContain('### 5b.');
    expect(partner).not.toContain('### 16.');
  });

  it('strength and accessory parts are unaffected by traits', () => {
    expect(buildParsePrompt('strength', [])).toBe(buildParsePrompt('strength'));
  });
});
