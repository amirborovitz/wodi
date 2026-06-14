/**
 * Wodi poster design system constants.
 * Yellow is the only product accent; feeling states vary by label, not color.
 */

import type { PosterVibeKey } from '../../../../types';

export const BRAND = {
  yellow: '#f5c200',
  yellowHi: '#ffe14d',
  ink: '#0b0c0e',
  inkSoft: '#16181c',
  paper: '#f1e7cf',
  paperInk: '#211d15',
  white: '#f3f1ea',
  dim: 'rgba(243,241,234,0.46)',
  faint: 'rgba(243,241,234,0.26)',
} as const;

export const T = {
  white: '#f2f2f0',
  dim: 'rgba(242,242,240,0.5)',
  faint: 'rgba(242,242,240,0.28)',
  you: BRAND.yellow,
  ink: '#11223a',
  paper: '#f3ecd8',
} as const;

export type VibeKey = PosterVibeKey;

export interface VibeConfig {
  label: string;
  color: string;
}

export const VIBE: Record<VibeKey, VibeConfig> = {
  chill: { label: 'CHILL', color: BRAND.yellow },
  solid: { label: 'SOLID', color: BRAND.yellow },
  sweaty: { label: 'SWEATY', color: BRAND.yellow },
  cooked: { label: 'COOKED', color: BRAND.yellow },
  smoked: { label: 'SMOKED', color: BRAND.yellow },
  wrecked: { label: 'WRECKED', color: BRAND.yellow },
};

export const VIBE_KEYS: VibeKey[] = ['chill', 'solid', 'sweaty', 'cooked', 'smoked', 'wrecked'];

/** Barlow Condensed: hero numbers, WOD name. */
export const fD = "'Barlow Condensed', sans-serif";
/** Barlow: body text, buttons, labels. */
export const fB = "'Barlow', sans-serif";
/** DM Mono: timestamps, metadata. */
export const fM = "'DM Mono', monospace";
/** Caveat: handwritten annotations, scores. */
export const fH = "'Caveat', cursive";
/** Archivo Black: format tags, metric labels. */
export const fBL = "'Archivo Black', sans-serif";
