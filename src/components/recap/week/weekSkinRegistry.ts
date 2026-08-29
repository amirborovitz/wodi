/**
 * Week skin registry — the single list WeekDropPage flips through.
 *
 * Ids deliberately match the WOD poster's skins of the same name: someone who
 * picked Chalk for their posters should find their week in Chalk too, and a
 * shared id is what lets that hold if the two ever sync.
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

const SKIN_KEY = 'wodi.week.skin';
const FLIPPED_KEY = 'wodi.week.flipped';

/** The skin they left it on. Index, not id, because the stage steps through the list. */
export function loadWeekSkinIndex(): number {
  try {
    const id = window.localStorage.getItem(SKIN_KEY);
    const i = WEEK_SKINS.findIndex((s) => s.id === id);
    return i >= 0 ? i : 0;
  } catch {
    return 0;
  }
}

export function saveWeekSkinIndex(index: number): void {
  const skin = WEEK_SKINS[index];
  if (!skin) return;
  try {
    window.localStorage.setItem(SKIN_KEY, skin.id);
  } catch { /* private mode: they pick it again next week */ }
}

/** The tap hint is a one-time teach — once they've flipped, they know. */
export function hasFlippedWeekSkin(): boolean {
  try {
    return window.localStorage.getItem(FLIPPED_KEY) === '1';
  } catch {
    return false;
  }
}

export function markWeekSkinFlipped(): void {
  try {
    window.localStorage.setItem(FLIPPED_KEY, '1');
  } catch { /* private mode: they see the hint again */ }
}
