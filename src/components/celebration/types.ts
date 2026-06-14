export interface HeroResult {
  value: string;
  unit?: string;
  subtitle?: string;
  formatLine?: string;
  storyLine?: string;
  storyMovements?: StoryMovementLine[];
  accentClass: string;
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
  subNote?: string;
  accent: 'yellow' | 'magenta' | 'cyan';
  missing?: boolean;
  stationRow?: boolean;
  roundLabel?: string; // left-aligned label for progressive round rows (R1, R2, BUY-IN, etc.)
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
