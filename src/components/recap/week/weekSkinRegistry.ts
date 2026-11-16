/**
 * Week skin registry — the surfaces a week can be drawn on.
 *
 * Ids match the WOD poster's skins of the same name: someone who picked Chalk for
 * their posters finds their week in Chalk too (weekSkinFor).
 */

import type { ComponentType } from 'react';
import type { PosterSkinId } from '../../../types';
import type { WeekSkinProps } from './types';
import { WeekSkinSlab } from './WeekSkinSlab';
import { WeekSkinChalk } from './WeekSkinChalk';
import { WeekSkinFlare } from './WeekSkinFlare';
import { WeekSkinStadium } from './WeekSkinStadium';
import { WeekSkinPress } from './WeekSkinPress';
import { WeekSkinHazard } from './WeekSkinHazard';

export interface WeekSkin {
  id: Extract<PosterSkinId, 'slab' | 'chalk' | 'flare' | 'stadium' | 'press' | 'hazard'>;
  name: string;
  Comp: ComponentType<WeekSkinProps>;
}

export const WEEK_SKINS: WeekSkin[] = [
  { id: 'slab', name: 'Slab', Comp: WeekSkinSlab },
  { id: 'chalk', name: 'Chalk', Comp: WeekSkinChalk },
  { id: 'flare', name: 'Flare', Comp: WeekSkinFlare },
  { id: 'stadium', name: 'Stadium', Comp: WeekSkinStadium },
  { id: 'press', name: 'Press', Comp: WeekSkinPress },
  { id: 'hazard', name: 'Hazard', Comp: WeekSkinHazard },
];

/**
 * The week is drawn in the athlete's own poster style — the first style in their order
 * that has a week version — so it arrives looking like their posters, with nothing to
 * pick. Slab when none of theirs does.
 */
export function weekSkinFor(order: readonly PosterSkinId[]): WeekSkin {
  for (const id of order) {
    const skin = WEEK_SKINS.find((s) => s.id === id);
    if (skin) return skin;
  }
  return WEEK_SKINS[0];
}
