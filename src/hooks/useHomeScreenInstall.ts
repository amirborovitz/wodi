import { useCallback, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { isHomeScreenApp, safariShareLocation, type SafariShareLocation } from '../utils/homeScreenApp';

const TEASER_KEY = 'wodi_home_screen_teaser';
/** A first ✕ buys this much quiet; the card then gets exactly one more showing. */
const TEASER_SNOOZE_MS = 21 * 24 * 60 * 60 * 1000;
const TEASER_MAX_DISMISSALS = 2;

interface TeaserState {
  dismissals: number;
  lastDismissedAt: number;
}

function readTeaserState(): TeaserState {
  try {
    const raw = localStorage.getItem(TEASER_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        const { dismissals, lastDismissedAt } = parsed as Partial<TeaserState>;
        return {
          dismissals: typeof dismissals === 'number' ? dismissals : 0,
          lastDismissedAt: typeof lastDismissedAt === 'number' ? lastDismissedAt : 0,
        };
      }
    }
  } catch {
    // Private mode or blocked storage — the card simply behaves as never dismissed.
  }
  return { dismissals: 0, lastDismissedAt: 0 };
}

function writeTeaserState(state: TeaserState): void {
  try {
    localStorage.setItem(TEASER_KEY, JSON.stringify(state));
  } catch {
    // Same as above: the ✕ still hides the card for this session.
  }
}

export interface HomeScreenInstall {
  /** iPhone Safari, not already the home-screen app, and never opened from the icon. */
  available: boolean;
  /** Where Share sits in this Safari — the sheet's first step reads differently for each. */
  shareLocation: SafariShareLocation;
  /** The Today card: available, has logged a workout, and not dismissed out of turn. */
  teaserVisible: boolean;
  dismissTeaser: () => void;
  sheetOpen: boolean;
  openSheet: () => void;
  closeSheet: () => void;
}

/**
 * Everything the "add wodi to your home screen" nudge decides, in one place, so the Today
 * card and the Me row can't disagree about whether the athlete needs it.
 *
 * The card waits for a first logged workout — the ask lands after the athlete has seen a
 * poster, not before they know what wodi does. A ✕ snoozes it for three weeks, a second ✕
 * retires it; the Me row stays for anyone who changes their mind. Opening the sheet is not
 * dismissing, the same as the recap card.
 */
export function useHomeScreenInstall(hasWorkouts: boolean): HomeScreenInstall {
  const { user } = useAuth();
  const [teaser, setTeaser] = useState<TeaserState>(readTeaserState);
  const [sheetOpen, setSheetOpen] = useState(false);

  const shareLocation = useMemo(
    () => safariShareLocation(navigator.userAgent, navigator.maxTouchPoints),
    [],
  );
  const available = shareLocation !== null && !isHomeScreenApp() && !user?.addedToHomeScreen;

  const teaserAllowed = teaser.dismissals === 0
    || (teaser.dismissals < TEASER_MAX_DISMISSALS && Date.now() - teaser.lastDismissedAt >= TEASER_SNOOZE_MS);

  const dismissTeaser = useCallback(() => {
    setTeaser((prev) => {
      const next = { dismissals: prev.dismissals + 1, lastDismissedAt: Date.now() };
      writeTeaserState(next);
      return next;
    });
  }, []);

  const openSheet = useCallback(() => setSheetOpen(true), []);
  const closeSheet = useCallback(() => setSheetOpen(false), []);

  return {
    available,
    shareLocation: shareLocation ?? 'toolbar',
    teaserVisible: available && hasWorkouts && teaserAllowed,
    dismissTeaser,
    sheetOpen: sheetOpen && available,
    openSheet,
    closeSheet,
  };
}
