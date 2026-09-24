/**
 * Skin registry + vibe resolution — single source of truth shared by the poster
 * editor (HandwrittenFace) and any other surface that renders a saved poster
 * (e.g. PosterThumbnail on Home/Gallery). Keeping this here means a thumbnail
 * can never drift from what the editor actually shows.
 */

import type { CelebrationData } from '../../../../hooks/useCelebrationData';
import type { VibeKey } from './brand';
import { SkinSlab } from './SkinSlab';
import { SkinChalk } from './SkinChalk';
import { SkinFlare } from './SkinFlare';
import { SkinStadium } from './SkinStadium';
import { SkinBlueprint } from './SkinBlueprint';
import { SkinPress } from './SkinPress';
import { SkinHazard } from './SkinHazard';
import { SkinInk } from './SkinInk';
import { SkinFoil } from './SkinFoil';
import { SkinAurum } from './SkinAurum';

/**
 * The five colours a skin reduces to when a poster has to appear at the size of
 * a card rather than a page — the feed's WodTicket.
 *
 * It is a reduction of the skin, never a second design: the surface and the ink
 * are the skin's own, so a Chalk workout still arrives on cream and a Flare one
 * still arrives yellow. What is dropped is everything that needs room to work
 * (the grid, the halftone, the foil sweep, the LED matrix), because at ticket
 * size those read as noise.
 *
 * `dot` is the wordmark's period, and the design system is explicit about it:
 * yellow everywhere except on a yellow field, where it inverts to ink. It lives
 * here rather than being computed from the surface so a new skin states its own
 * answer instead of relying on a guess about its brightness.
 */
export interface SkinTicket {
  bg: string;
  ink: string;
  dim: string;
  line: string;
  dot: string;
}

const YEL = '#f5c200';

const DARK_TICKET = { ink: '#f3f1ea', dim: 'rgba(243,241,234,0.5)', line: 'rgba(255,255,255,0.12)', dot: YEL } as const;
const PAPER_TICKET = { ink: '#211d15', dim: 'rgba(33,29,21,0.55)', line: 'rgba(0,0,0,0.13)', dot: YEL } as const;

export const SKINS = [
  { id: 'slab',      name: 'Slab',      Comp: SkinSlab,      ticket: { bg: '#0b0c0e', ...DARK_TICKET } },
  { id: 'chalk',     name: 'Chalk',     Comp: SkinChalk,     ticket: { bg: '#f1e7cf', ...PAPER_TICKET } },
  // The one yellow field in the set: ink text, and the wordmark's dot inverts
  // with it — yellow-on-yellow is the design system's single hard "never".
  { id: 'flare',     name: 'Flare',     Comp: SkinFlare,     ticket: { bg: YEL, ink: '#0b0c0e', dim: 'rgba(11,12,14,0.62)', line: 'rgba(0,0,0,0.16)', dot: '#0b0c0e' } },
  { id: 'stadium',   name: 'Stadium',   Comp: SkinStadium,   ticket: { bg: '#050506', ...DARK_TICKET } },
  { id: 'press',     name: 'Press',     Comp: SkinPress,     ticket: { bg: '#f1e7cf', ...PAPER_TICKET } },
  { id: 'blueprint', name: 'Blueprint', Comp: SkinBlueprint, ticket: { bg: '#192640', ink: '#f3f1ea', dim: 'rgba(200,220,255,0.55)', line: 'rgba(140,180,255,0.24)', dot: YEL } },
  { id: 'hazard',    name: 'Hazard',    Comp: SkinHazard,    ticket: { bg: '#0b0c0e', ...DARK_TICKET } },
  { id: 'ink',       name: 'Ink',       Comp: SkinInk,       ticket: { bg: '#eee7d5', ink: '#171814', dim: 'rgba(23,24,20,0.5)', line: 'rgba(45,44,37,0.2)', dot: YEL } },
  { id: 'foil',      name: 'Foil',      Comp: SkinFoil,      ticket: { bg: '#15171d', ink: '#e8e7ef', dim: 'rgba(232,231,239,0.48)', line: 'rgba(232,231,239,0.16)', dot: YEL } },
  { id: 'aurum',     name: 'Aurum',     Comp: SkinAurum,     ticket: { bg: '#100d09', ink: '#efe9d8', dim: 'rgba(239,233,216,0.5)', line: 'rgba(245,194,0,0.22)', dot: YEL } },
] as const;

export function getSkin(id: string | undefined): (typeof SKINS)[number] {
  return SKINS.find((s) => s.id === id) ?? SKINS[0];
}

const INTENSITY_VIBE_MAP: Record<string, VibeKey> = {
  cooked: 'cooked', smoked: 'smoked', barely: 'wrecked', sent_it: 'sweaty',
  gassed: 'sweaty', held_on: 'wrecked', machine: 'chill', dark_place: 'cooked',
  solid: 'solid', easy_day: 'chill', survived: 'wrecked', dialed_in: 'solid',
};

/** Real signal only — legacy per-exercise intensity logged before "Felt" moved to the poster. */
export function getLoggedVibe(data: CelebrationData): VibeKey | null {
  const userVibe = data.exercises?.find((ex) => ex.intensity)?.intensity;
  return (userVibe && INTENSITY_VIBE_MAP[userVibe]) || null;
}

/** Pure guess (EP-based) — only used to pre-seed the Felt picker, never shown unconfirmed. */
export function guessVibe(data: CelebrationData): VibeKey {
  const ep = data.totalEP ?? 0;
  if (ep >= 250) return 'cooked';
  if (ep >= 160) return 'smoked';
  if (ep >= 80)  return 'sweaty';
  return 'solid';
}

/** The vibe actually shown on a poster — confirmed only, never an unconfirmed guess. */
export function resolvePosterVibe(data: CelebrationData): VibeKey | null {
  return data.posterVibe ?? getLoggedVibe(data) ?? null;
}
