// Partner workouts come in two genuinely different shapes, and the poster must render each
// differently:
//  - 'rounds' — partners trade WHOLE rounds (IGUG / "I go you go" / "(N each)"). Within any
//    round, whoever's up does ALL the movements, so a per-movement personal number is
//    meaningless — what's personal is which rounds you took.
//  - 'reps' — partners share one flat/continuous total with no round structure (e.g. "100 wall
//    balls, split however"). A per-movement personal share number IS meaningful here.
//
// teamSize > 1 (workout-level, AI-set) only means SOME part of this session is partnered — the
// AI prompt explicitly stamps it at the top level "for the entire session" so EP/volume math
// scales correctly everywhere, even on a multi-part workout where only one block is actually
// partnered. It is NOT a signal that THIS specific block/exercise is the partnered one. Display
// decisions (round ledger, blanked values, team-share math) must never be driven by teamSize
// alone — they require this block's OWN text to confirm partner/round-trade language. Skipping
// that check is exactly how a solo strength block or warm-up inherits partner treatment it never
// asked for, just because a sibling block in the same session happens to be partnered.
export type PartnerSplit = 'reps' | 'rounds';

export interface PartnerSplitInfo {
  split: PartnerSplit;
  totalRounds?: number;
  personalRounds?: number;
}

// Matches the language the AI prompt documents as partner/team triggers (src/services/openai.ts)
// and the standalone isPartnerWorkout detector in AddWorkoutScreen.tsx — kept in sync with that
// pattern rather than re-deriving a narrower one here. Bare "partner" is included (broader than
// AddWorkoutScreen's phrase-only match) because the AI commonly titles a block "Partner Metcon"
// with no other partner phrasing retained in that block's own text.
const PARTNER_LANGUAGE = /\bpartner\b|\bin pairs\b|\bpairs\b|\bteams?\s+of\s+\d+\b|\b\d+[- ]person\b|\bigug\b|\bigyg\b|\bi\s*go\s*you\s*go\b|\bgroups?\s+of\s+\d+\b/i;

export function detectPartnerSplit(params: {
  teamSize: number;
  scopedText: string;
  prescribedRoundCount: number | undefined;
  // AI-determined (or post-processor-backfilled) per-exercise fields, persisted on Exercise —
  // see src/types/index.ts. When present they short-circuit the corresponding text-regex/math
  // step below rather than running alongside it, so this stays ONE function/one path: every
  // already-saved workout (and any future AI miss) falls through to the exact same regex logic
  // that already existed, untouched.
  aiPartnerWorkout?: boolean;
  aiPartnerSplit?: 'reps' | 'rounds';
  aiPersonalRounds?: number;
}): PartnerSplitInfo | undefined {
  const { teamSize, scopedText, prescribedRoundCount, aiPartnerWorkout, aiPartnerSplit, aiPersonalRounds } = params;

  // Trust an explicit AI negative for THIS exercise — skip the text gate entirely rather than
  // letting a stray "partner" mention elsewhere override it.
  if (aiPartnerWorkout === false) return undefined;

  const eachMatch = scopedText.match(/\((\d+)\s*each\)/i);

  // This block's own text must confirm it's the partnered one — teamSize alone (workout-level)
  // is not enough. See module comment. An explicit AI `true` confirms it directly.
  const confirmed = aiPartnerWorkout === true || !!eachMatch || PARTNER_LANGUAGE.test(scopedText);
  if (!confirmed) {
    return undefined;
  }

  const split = aiPartnerSplit ?? (!prescribedRoundCount || prescribedRoundCount <= 1 ? 'reps' : 'rounds');
  if (split === 'reps') {
    return { split: 'reps' };
  }

  const totalRounds = prescribedRoundCount ?? (aiPersonalRounds ? aiPersonalRounds * teamSize : teamSize);
  const personalRounds = aiPersonalRounds
    ?? (eachMatch ? parseInt(eachMatch[1], 10) : Math.max(1, Math.round(totalRounds / teamSize)));
  return { split: 'rounds', totalRounds, personalRounds };
}

export type RoundLedgerEntry = 'me' | 'partner' | 'pending';

// Completed rounds cycle through the team starting with 'me' (the athlete logging the workout
// is "I" in "I go, you go"): in a pair every other round is mine; in a team of 3 every third
// round is. Rounds beyond what was actually completed are 'pending' — a flat symbolic state,
// never a computed partial (mirrors the ladderTrack ghost-rung convention: a round is several
// movements, so "how far into round 7" can't be rendered as a fraction).
export function buildRoundLedger(
  totalRounds: number,
  completedRounds: number,
  teamSize = 2,
): RoundLedgerEntry[] {
  const cycle = Math.max(2, teamSize);
  return Array.from({ length: totalRounds }, (_, i) =>
    i >= completedRounds ? 'pending' : (i % cycle === 0 ? 'me' : 'partner'));
}
