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
import { SkinBout } from './SkinBout';

export const SKINS = [
  { id: 'slab',      name: 'Slab',      Comp: SkinSlab      },
  { id: 'chalk',     name: 'Chalk',     Comp: SkinChalk     },
  { id: 'flare',     name: 'Flare',     Comp: SkinFlare     },
  { id: 'stadium',   name: 'Stadium',   Comp: SkinStadium   },
  { id: 'press',     name: 'Press',     Comp: SkinPress     },
  { id: 'blueprint', name: 'Blueprint', Comp: SkinBlueprint },
  { id: 'hazard',    name: 'Hazard',    Comp: SkinHazard    },
  { id: 'ink',       name: 'Ink',       Comp: SkinInk       },
  { id: 'bout',      name: 'Bout',      Comp: SkinBout      },
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
