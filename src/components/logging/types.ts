import type { ParsedMovement } from '../../types';
import type { ExerciseLoggingMode, LoggingGuidanceResponse } from '../../types';
import type { KeyboardEvent } from 'react';

/** Props passed to MovementListEditor (17-prop bundle) */
export interface MovementEditorProps {
  movements: ParsedMovement[];
  selectedAlternatives: Record<string, string>;
  customDistances: Record<string, number>;
  customTimes: Record<string, number>;
  customWeights: Record<string, number>;
  customReps: Record<string, number>;
  customCalories: Record<string, number>;
  movementImplementCounts: Record<string, 1 | 2>;
  movementImplementFixed: Record<string, boolean>;
  onAlternativeChange: (originalName: string, alternativeName: string | null, newDistance?: number) => void;
  onDistanceChange: (movementName: string, distance: number) => void;
  onTimeChange: (movementName: string, time: number) => void;
  onWeightChange: (movementName: string, weight: number) => void;
  onRepsChange: (movementName: string, reps: number) => void;
  onCaloriesChange: (movementName: string, calories: number) => void;
  onImplementCountChange: (movementName: string, count: 1 | 2) => void;
  readOnly?: boolean;
  labels?: string[];
}

/** Progress bar config */
export interface WizardProgress {
  current: number;
  total: number;
  label: string;
}

/** Navigation button config */
export interface WizardNav {
  onBack: () => void;
  onNext: () => void;
  nextLabel: string;
  nextDisabled?: boolean;
  nextVariant: 'primary' | 'danger';
  isFinish: boolean; // true = save button styling
}

/** Mode selector config */
export interface ModeSelectorConfig {
  show: boolean;
  value: ExerciseLoggingMode;
  onChange: (mode: ExerciseLoggingMode) => void;
  isLoading: boolean;
  guidance?: LoggingGuidanceResponse;
  options: Array<{ value: ExerciseLoggingMode; label: string }>;
}

/** WizardShell props */
export interface WizardShellProps {
  motionKey: string | number;
  title?: string;
  showTitle?: boolean;
  progress?: WizardProgress;
  exerciseName: string;
  exercisePrescription?: string;
  showPrescription?: boolean;
  movementEditor?: MovementEditorProps & { movements: ParsedMovement[] };
  modeSelector?: ModeSelectorConfig;
  nav: WizardNav;
  onMobileNextInput: (event: KeyboardEvent<HTMLElement>) => void;
  children: React.ReactNode;
}
