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
}

export type PosterLayout = 'chipper' | 'complex' | 'ladder' | 'multi-part' | 'standard';
