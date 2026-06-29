export interface HeroResult {
  value: string;
  unit?: string;
  subtitle?: string;
  formatLine?: string;
  storyLine?: string;
  storyMovements?: StoryMovementLine[];
  accentClass: string;
  // Ladder AMRAP only — the round the partial reps are logged into ("into round 7"), shown
  // beside the rounds+partial hero. No rep-total field: the poster never carries a checkable
  // total for a ladder score (a round is often several movements, so it can't be verified at a
  // glance) — that reconciliation belongs in the log/edit view, never on the shared poster.
  ladderIntoRound?: number;
}

export interface StoryMovementLine {
  perRound: string;
  name: string;
  total: string;
  color?: 'cyan' | 'magenta' | 'yellow';
  weight?: number;
  weightProgression?: number[];
  unit?: string;
  sectionHeader?: string;
  sectionColor?: 'yellow' | 'magenta' | 'cyan';
  burnout?: { reps: number; weight: number };
  strengthTotalReps?: number;
  partnerNote?: string;
  wasSubstituted?: boolean;
  originalMovement?: string;
  substitutionType?: 'easier' | 'harder' | 'equivalent';
  substitutedPerRound?: string;
}

export interface HighlightStampData {
  title: string;
  value: string;
  note: string;
  color: 'yellow' | 'magenta';
  rotation: number;
  variant?: 'complex';
}

export interface ArtifactRow {
  primary: string;
  name: string;
  nameWithLoad?: string;
  loadNote?: string;
  subNote?: string;
  totalNote?: string;
  accent: 'yellow' | 'magenta' | 'cyan';
  missing?: boolean;
  stationRow?: boolean;
  roundLabel?: string; // left-aligned label for progressive round rows (R1, R2, BUY-IN, etc.)
  // Rounds this row's `primary` repeats over (e.g. 12 for "12 RFT"). When set and >1, `primary`
  // is a per-round/per-turn value (e.g. "5 reps every round"), never a one-shot team total — the
  // poster layer must not run it through partner team-share math a second time.
  repeatCount?: number;
  // Set when this row belongs to a teamSize>1 workout. 'rounds' means partners trade whole
  // rounds (IGUG) — the poster must show no per-row personal number at all (see
  // ArtifactSection.roundLedger instead). 'reps' means a flat shared total, where a per-row
  // personal share number is still meaningful.
  partnerSplit?: 'reps' | 'rounds';
  // TEAM/ME contract for split-round partner posters: when present, this is the athlete's
  // accumulated personal work for the row. The round ledger is context, not the only ME stat.
  partnerMine?: string;
  // Poster rows that already carry their load inline (e.g. sectioned partner prescriptions)
  // should not render a second handwritten/logged load value on the right.
  suppressMine?: boolean;
  // Ascending-ladder AMRAP bar-chart track, rendered as a SEPARATE visual element right below
  // this row (the row itself renders normally through the skin's own markup, so the movement
  // name/weight inherit that skin's exact font/size treatment — the chart never duplicates
  // them). `reps` is the prescribed rung sequence, `step` is rungs completed, `partial` is reps
  // into the next rung, `cadence` states the per-round increment explicitly ("+2 REPS EVERY
  // ROUND") so the climb rule is read, not guessed.
  ladderTrack?: { reps: number[]; step: number; partial?: number; cadence?: string };
}

export interface ArtifactSection {
  title: string;
  eyebrow?: string;
  blueprint?: string;
  blueprintSub?: string;
  rows: ArtifactRow[];
  hiddenCount?: number;
  watermark?: string;
  rxStamp?: boolean;
  descLadderScheme?: number[];
  descLadderCompleted?: number;
  // True only when THIS section's own text confirmed partner/round-trade language (see
  // partnerSplit.ts) — never derived from the workout-level teamSize alone. A multi-part
  // workout's teamSize is stamped once for the whole session (so EP/volume math scales
  // correctly everywhere); it does not mean every part is the partnered one. Poster-level
  // partner UI (round ledger, TEAM|ME header, "OUR ___" hero label) must gate on this, not on
  // raw teamSize, or an unconfirmed solo part inherits partner treatment from a sibling part.
  isPartnerConfirmed?: boolean;
  // Partner poster display mode. 'shares' is the flat TEAM/ME share layout for one-shot shared
  // totals. 'sections' is for sectioned for-time partner WODs where each section stays readable
  // as a full prescription row, with no round ledger or TEAM/ME split.
  partnerDisplayMode?: 'shares' | 'sections';
  // Set only for a teamSize>1 section whose rows are partnerSplit==='rounds' — the round-trade
  // ledger data ("who took which round"), one per section since every row in an IGUG round
  // shares the same round structure.
  roundLedger?: {
    totalRounds: number;
    personalRounds: number;
    rounds: ('me' | 'partner' | 'pending')[];
  };
}

export type PosterLayout = 'chipper' | 'complex' | 'ladder' | 'multi-part' | 'standard';
