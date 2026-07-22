import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MovementResult } from './types';
import type { ParsedMovement, ParsedSectionType } from '../../../types';
import { getWeightStep } from './types';
import { StepperInput } from './StepperInput';
import { SubstitutionSheet } from './SubstitutionSheet';
import { CustomNumpadSheet } from './CustomNumpadSheet';
import { hasAlternatives, findExerciseDefinition } from '../../../data/exerciseDefinitions';
import type { MovementSubstitution } from '../../../types';
import styles from './ScoreMovementInputs.module.css';


interface ScoreMovementInputsProps {
  movements: MovementResult[];
  inputMovements: MovementResult[];
  onChange: (index: number, patch: Partial<MovementResult>) => void;
  /** Called when multiple movements need to update atomically (e.g. weight propagation). */
  onBatch?: (next: MovementResult[]) => void;
  onSubstitutionOpenChange?: (open: boolean) => void;
  /** Team size for partner workouts. When > 1, buy-in/cash-out movements
   *  show a "{total} {unit} total /{teamSize}" annotation below the movement
   *  name so the athlete knows they are logging their personal share. */
  teamSize?: number;
  /** True only in partner/relay AMRAPs where a prescribed distance movement represents
   *  a relay trip count (how many times the athlete ran X meters), not a total distance. */
  isRelayContext?: boolean;
  /** True in solo rounds-scored workouts: a prescribed-distance movement (e.g. 300m run
   *  per round) is fully counted by the ROUNDS input, so it renders display-only. */
  distanceDerivedFromRounds?: boolean;
}

// Classify a movement by equipment type for weight propagation grouping.
// Barbell movements only propagate to other barbell movements, not KB or DB.
// Weight-input grouping bucket: same-bucket load movements share ONE weight input (the
// shared hero screen). 'other' movements never share — each renders its own WeightField.
type SharedEquipment = 'barbell' | 'kb' | 'db';
type LoadEquipment = SharedEquipment | 'other';

// AI-stamped ParsedMovement.equipment → grouping bucket. The AI is the authority for the
// implement; the name regexes below are the fallback for docs parsed before the field existed.
// 'none' on a load-kind movement means the athlete added a load of their own choosing.
function equipmentFromAi(mov: ParsedMovement): LoadEquipment | null {
  switch (mov.equipment) {
    case 'barbell': return 'barbell';
    case 'dumbbell': return 'db';
    case 'kettlebell': return 'kb';
    case 'other':
    case 'none': return 'other';
    default: return null;
  }
}

function getEquipmentType(name: string): LoadEquipment {
  const lower = name.toLowerCase();
  if (/\bdb\b|dumbbell/.test(lower)) return 'db';
  if (/\bkb\b|kettlebell|\bsuitcase\b|\bfarmer'?s?\b|\bcarry\b/.test(lower)) return 'kb';
  if (isImplicitHeldLoad(lower)) return 'other';
  return 'barbell';
}

// Name-based classification, but a DOUBLE implement (twin/double DBs or KBs) can NEVER be a
// barbell — you can't hold two barbells — so it must resolve to DB/KB, not the barbell default.
// Defense for docs whose equipment field the AI/post-processor didn't stamp. General.
function getMovementEquipmentType(mov: ParsedMovement): LoadEquipment {
  const named = getEquipmentType(mov.name);
  if (mov.implementCount === 2 && named === 'barbell') return 'db';
  return named;
}

// "Weighted X" with no stated implement (weighted box step-up, weighted pull-up, weighted
// sit-up) is a held load the athlete picks — DBs/KBs/plate — never the session's barbell.
function isImplicitHeldLoad(name: string): boolean {
  return /\bweighted\b/i.test(name) && getExplicitEquipmentType(name) === null;
}

function getExplicitEquipmentType(name: string): 'barbell' | 'kb' | 'db' | null {
  const lower = name.toLowerCase();
  if (/\bdb\b|dumbbell/.test(lower)) return 'db';
  if (/\bkb\b|kettlebell/.test(lower)) return 'kb';
  if (/\bbarbell\b/.test(lower)) return 'barbell';
  return null;
}

function getEquipmentLabel(type: 'barbell' | 'kb' | 'db'): string {
  if (type === 'kb') return 'KB';
  if (type === 'db') return 'DB';
  return 'Barbell';
}

function getLegalWeightStep(mr: MovementResult): number {
  return getWeightStep(mr.movement.name, mr.movement.equipment);
}

function roundToLegalWeight(value: number, mr: MovementResult): number {
  const step = getLegalWeightStep(mr);
  if (step <= 0) return value;
  const rounded = Math.round(value / step) * step;
  return Math.max(0, Math.round(rounded * 10) / 10);
}

function getRxWeight(mr: MovementResult): number | undefined {
  const rx = mr.movement.rxWeights?.male ?? mr.movement.rxWeights?.female;
  return rx && rx > 0 ? rx : undefined;
}

function getDefaultMetconWeight(mr: MovementResult): number | undefined {
  const rx = getRxWeight(mr);
  if (!rx) return undefined;
  return roundToLegalWeight(rx * 0.8, mr);
}

function getFallbackWeight(type: LoadEquipment): number | undefined {
  if (type === 'kb') return 16;
  // No default prior for DBs or odd implements — the athlete states the load.
  if (type === 'db' || type === 'other') return undefined;
  return 40;
}

function getMovementCaptionName(mr: MovementResult): string {
  const name = cleanTileLabel(mr.movement.name) || stripWeightFromName(mr.movement.name) || mr.movement.name;
  return name
    .replace(/\bKettlebell\b/gi, 'KB')
    .replace(/\bDumbbell\b/gi, 'DB')
    .replace(/\s+/g, ' ')
    .trim();
}

function movementHasAlternate(mr: MovementResult): boolean {
  return hasAlternatives(mr.movement.name) || !!mr.movement.alternative || !!mr.substitution;
}

function movementAlternateKey(mr: MovementResult): string {
  return (cleanTileLabel(mr.movement.name) || stripWeightFromName(mr.movement.name) || mr.movement.name)
    .replace(/^(Buy-In|Cash-Out):\s*/i, '')
    .toLowerCase()
    .trim();
}

function movementHasInput(mr: MovementResult, distanceDerivedFromRounds: boolean): boolean {
  return getTileConfig(mr, distanceDerivedFromRounds) != null;
}

// A distance-kind movement measured in calories rather than meters (prescribed cals,
// calorie inputType, or a cardio machine with no prescribed distance).
function isCalorieBased(mr: MovementResult): boolean {
  const isCardioMachine = /\b(bike|row|ski)\b/i.test(mr.movement.name);
  return mr.movement.inputType === 'calories'
    || (mr.movement.calories != null && mr.movement.calories > 0)
    || (isCardioMachine && !mr.movement.distance && mr.movement.inputType !== 'distance');
}

// Per-trip prescribed distance of a distance movement, honoring a distance substitution
// (e.g. 200m run -> 1200m bike). 0 when the movement is calorie-based or unprescribed.
function getPrescribedTripDistance(mr: MovementResult): number {
  if (mr.kind !== 'distance' || isCalorieBased(mr)) return 0;
  const sub = mr.substitution;
  const perTripSub = sub?.targetUnit === 'distance' && sub.adjustedValue != null
    ? sub.adjustedValue
    : null;
  return perTripSub ?? mr.movement.distance ?? 0;
}

// Human-readable labels for section types
function sectionLabel(type: ParsedSectionType, rounds: number): string {
  if (type === 'buy_in') return 'Buy-in';
  if (type === 'cash_out') return 'Cash-out';
  return `${rounds} round${rounds !== 1 ? 's' : ''}`;
}

// Returns the partner-split annotation string for a movement in a partner workout.
// Shows the workout total and division so athletes know what to log.
// Examples: "100 cal total - your part 50", "600 m total - your part 300"
// "Together" movements show "together" instead of a split.
function partnerAnnotation(mr: MovementResult, teamSize: number): string | null {
  if (teamSize <= 1) return null;

  // "Together" movements: everyone does the full amount
  if (mr.movement.together) {
    return 'together';
  }

  // Runs are independent in IGYG: each partner runs the full distance, no split annotation
  if (/\b(run|running|sprint)\b/i.test(mr.movement.name)) return null;

  const isCal =
    mr.movement.inputType === 'calories' ||
    (mr.movement.calories != null && mr.movement.calories > 0);

  if (isCal && mr.movement.calories) {
    const personal = Math.round(mr.movement.calories / teamSize);
    return `${mr.movement.calories} cal total - your part ${personal}`;
  }
  if (mr.movement.distance) {
    const unit = mr.distanceUnit ?? mr.movement.unit ?? 'm';
    const personal = Math.round(mr.movement.distance / teamSize);
    return `${mr.movement.distance} ${unit} total - your part ${personal}`;
  }
  if (mr.movement.reps) {
    const personal = Math.round(mr.movement.reps / teamSize);
    return `${mr.movement.reps} total - your part ${personal}`;
  }
  return null;
}

// Strip weight from movement name for display
// Removes leading/trailing weight patterns like "22.5kg", "95lb", "135#"
// so the label reads "Alt DB Snatch" instead of "22.5kg Alt DB Snatch".
function stripWeightFromName(name: string): string {
  return name
    // Leading: "22.5kg Alt DB Snatch" -> "Alt DB Snatch"
    .replace(/^\d+(\.\d+)?\s*(kg|lb|lbs|#)\s+/i, '')
    // Trailing: "Alt DB Snatch 22.5kg" -> "Alt DB Snatch"
    .replace(/\s+\d+(\.\d+)?\s*(kg|lb|lbs|#)$/i, '')
    // Parenthetical: "Thruster (95lb)" -> "Thruster"
    .replace(/\s*\(\d+(\.\d+)?\s*(kg|lb|lbs|#)\)/i, '')
    .trim();
}

function cleanTileLabel(name: string): string {
  return stripWeightFromName(name)
    .replace(/^(?:(?:for\s+)?(?:max|amrap)\s+)+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function clampValue(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// Substitution state summary
// Returns the currently displayed movement name (substituted or original)
// and whether a substitution is active.

interface SubState {
  displayName: string;
  isSubstituted: boolean;
  badgeType: 'scaled' | 'rx-plus' | 'equal' | null;
  /** Human-readable conversion, e.g. "400m -> 1200m" */
  conversionNote: string | null;
}

function fmtValue(v: number, isDistance: boolean): string {
  if (!isDistance) return `${v}`;
  return v >= 1000 ? `${(v / 1000).toFixed(1)}km` : `${v}m`;
}

function getSubState(mr: MovementResult): SubState {
  if (!mr.substitution) {
    return { displayName: mr.movement.name, isSubstituted: false, badgeType: null, conversionNote: null };
  }
  const sub = mr.substitution;
  const type = sub.substitutionType;
  const badgeType = type === 'easier' ? 'scaled' as const : type === 'harder' ? 'rx-plus' as const : 'equal' as const;

  // Build conversion note: "400m -> 1200m" or "30 -> 90"
  let conversionNote: string | null = null;
  if (sub.originalValue != null && sub.adjustedValue != null && sub.originalValue !== sub.adjustedValue) {
    const isDistance = (mr.movement.distance != null && mr.movement.distance > 0);
    conversionNote = `${fmtValue(sub.originalValue, isDistance)} -> ${fmtValue(sub.adjustedValue, isDistance)}`;
  }

  return {
    displayName: sub.selectedName,
    isSubstituted: true,
    badgeType,
    conversionNote,
  };
}

// AI quick-toggle
// When the AI parsed two slash-alternatives (e.g. "40 DU / 60 singles"),
// We show an inline chip to flip between them; no sheet needed.

interface AiToggleProps {
  mr: MovementResult;
  onChange: (patch: Partial<MovementResult>) => void;
}

function AiAlternativeToggle({ mr, onChange }: AiToggleProps) {
  const aiAlt = mr.movement.alternative;
  if (!aiAlt) return null;

  const isUsingAiAlt = mr.substitution?.selectedName?.toLowerCase() === aiAlt.name.toLowerCase();

  const handleToggle = () => {
    if (isUsingAiAlt) {
      // Revert to original
      onChange({ substitution: null });
    } else {
      // Switch to AI alternative
      const sub: MovementSubstitution = {
        originalName: mr.movement.name,
        selectedName: aiAlt.name,
        substitutionType: 'easier',
        originalValue: mr.movement.reps ?? mr.movement.distance ?? mr.movement.calories,
        adjustedValue: aiAlt.reps ?? aiAlt.distance ?? aiAlt.calories,
      };
      onChange({ substitution: sub });
    }
  };

  return (
    <button
      type="button"
      className={`${styles.aiToggle} ${isUsingAiAlt ? styles.aiToggleActive : ''}`}
      onClick={handleToggle}
    >
      {isUsingAiAlt
        ? `<- ${mr.movement.name}`
        : `${aiAlt.name} <->`
      }
    </button>
  );
}

// Prescribed value tag
// Returns the inline prescribed value (e.g. "10", "400m", "15 cal")
// and its Trinity color class for display next to the movement name.

interface TileConfig {
  field: 'weight' | 'distance' | 'calories' | 'reps';
  value: number | undefined;
  placeholder: string;
  unit?: string;
  color: string;
  step: number;
  min: number;
  max: number;
  inputMode: 'decimal' | 'numeric';
}

const LOAD_TILE_COLOR = '#f5c200';
const METRIC_TILE_COLOR = '#f5c200';

function getTileConfig(mr: MovementResult, distanceDerivedFromRounds = false): TileConfig | null {
  const isMaxBodyweight =
    mr.kind === 'reps' &&
    mr.movement.reps == null &&
    mr.movement.distance == null &&
    mr.movement.calories == null;

  if (mr.kind === 'load') {
    return {
      field: 'weight',
      value: mr.weight,
      placeholder: mr.movement.rxWeights?.male ? String(mr.movement.rxWeights.male) : '0',
      unit: mr.implementCount === 2 ? '2x kg' : 'kg',
      color: LOAD_TILE_COLOR,
      step: getWeightStep(mr.movement.name, mr.movement.equipment),
      min: 0,
      max: 500,
      inputMode: 'decimal',
    };
  }

  if (mr.kind === 'distance') {
    const isCal = isCalorieBased(mr);
    // Solo rounds-scored workout: the ROUNDS counter already counts every trip of a
    // prescribed-distance movement, so it takes no input of its own.
    if (distanceDerivedFromRounds && getPrescribedTripDistance(mr) > 0) return null;
    const unit = isCal ? 'cal' : (mr.distanceUnit ?? mr.movement.unit ?? 'm');
    return {
      field: isCal ? 'calories' : 'distance',
      value: isCal ? mr.calories : mr.distance,
      placeholder: isCal
        ? (mr.movement.calories ? String(mr.movement.calories) : '0')
        : (mr.movement.distance ? String(mr.movement.distance) : '0'),
      unit,
      color: METRIC_TILE_COLOR,
      step: isCal ? 1 : (unit === 'km' ? 0.5 : unit === 'mi' ? 0.1 : 50),
      min: 0,
      max: isCal ? 999 : 99999,
      inputMode: 'decimal',
    };
  }

  if (isMaxBodyweight) {
    return {
      field: 'reps',
      value: mr.reps,
      placeholder: '0',
      unit: 'reps',
      color: METRIC_TILE_COLOR,
      step: 1,
      min: 0,
      max: 999,
      inputMode: 'numeric',
    };
  }

  return null;
}

// Swap icon (two-arrow cycle symbol)

function SwapIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M2 4.5h8M8 2.5l2 2-2 2M12 9.5H4M4 7.5l-2 2 2 2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Group movements by sectionIndex, preserving order
interface SectionGroup {
  sectionIndex: number;
  sectionType: ParsedSectionType;
  sectionRounds: number;
  movements: MovementResult[];
}

function groupBySections(mrs: MovementResult[]): SectionGroup[] | null {
  if (!mrs.every(mr => mr.sectionIndex != null)) return null;

  const groups: SectionGroup[] = [];
  for (const mr of mrs) {
    const last = groups[groups.length - 1];
    if (last && last.sectionIndex === mr.sectionIndex) {
      last.movements.push(mr);
    } else {
      groups.push({
        sectionIndex: mr.sectionIndex!,
        sectionType: mr.sectionType!,
        sectionRounds: mr.sectionRounds ?? 1,
        movements: [mr],
      });
    }
  }
  return groups.length > 1 ? groups : null;
}

/**
 * Compact inline inputs for scored exercises (for_time, AMRAP, intervals).
 * Each movement row includes a swap affordance when alternatives exist.
 * When an AI-detected alternative is present, shows a quick-toggle chip.
 * When teamSize > 1, buy-in/cash-out movements show "100 cal total /2".
 */
export function ScoreMovementInputs({
  movements,
  inputMovements: _inputMovements,
  onChange,
  onBatch,
  onSubstitutionOpenChange,
  teamSize,
  isRelayContext = false,
  distanceDerivedFromRounds = false,
}: ScoreMovementInputsProps) {
  // Track which movements the user has manually edited weight on.
  // First weight edit propagates to all same-equipment load movements that haven't been touched.
  const manuallyEditedRef = useRef<Set<string>>(new Set());
  const [separateWeightGroups, setSeparateWeightGroups] = useState<Set<string>>(() => new Set());
  const seededDefaultsRef = useRef(false);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressFiredRef = useRef(false);

  const equipmentByKey = useMemo(() => {
    const explicitTypes = new Set<SharedEquipment>();
    movements.forEach((mr) => {
      if (mr.kind !== 'load') return;
      const explicit = getExplicitEquipmentType(mr.movement.name);
      if (explicit) explicitTypes.add(explicit);
    });

    const sharedExplicitType = explicitTypes.size === 1 ? [...explicitTypes][0] : null;
    const byKey = new Map<string, LoadEquipment>();
    movements.forEach((mr) => {
      if (mr.kind !== 'load') return;
      // AI-stamped equipment outranks every name heuristic. Below it, implicit held loads
      // must not adopt a sibling's explicit equipment either — a "Weighted Pull-up" next
      // to a "Barbell Bench" is not done with the barbell.
      byKey.set(
        mr.movementKey,
        equipmentFromAi(mr.movement)
          ?? getExplicitEquipmentType(mr.movement.name)
          ?? (isImplicitHeldLoad(mr.movement.name) ? 'other' : null)
          ?? sharedExplicitType
          ?? getMovementEquipmentType(mr.movement),
      );
    });
    return byKey;
  }, [movements]);

  const getMovementEquipment = useCallback((mr: MovementResult) => (
    equipmentByKey.get(mr.movementKey) ?? getMovementEquipmentType(mr.movement)
  ), [equipmentByKey]);

  const loadGroups = useMemo(() => {
    const groups = new Map<SharedEquipment, { type: SharedEquipment; movements: MovementResult[] }>();
    movements.forEach((mr) => {
      if (mr.kind !== 'load') return;
      const type = getMovementEquipment(mr);
      // 'other' implements never share a weight input — they stay out of every group and
      // render as individual WeightField tiles.
      if (type === 'other') return;
      const group = groups.get(type) ?? { type, movements: [] };
      group.movements.push(mr);
      groups.set(type, group);
    });
    return [...groups.values()];
  }, [movements, getMovementEquipment]);

  // Only the first (focused) load group uses the hero shared-weight screen.
  // Secondary groups (different equipment type) are rendered as individual tiles.
  const sharedWeightKeys = useMemo(() => {
    const keys = new Set<string>();
    const focusedGroup = loadGroups[0];
    if (!focusedGroup || separateWeightGroups.has(focusedGroup.type)) return keys;
    focusedGroup.movements.forEach((mr) => keys.add(mr.movementKey));
    return keys;
  }, [loadGroups, separateWeightGroups]);

  const alternateMovements = useMemo(() => {
    const seen = new Set<string>();
    return movements.filter((mr) => {
      if (!movementHasAlternate(mr)) return false;
      const key = movementAlternateKey(mr);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [movements]);

  const firstAlternateKeys = useMemo(() => {
    const keys = new Set<string>();
    alternateMovements.forEach((mr) => keys.add(mr.movementKey));
    return keys;
  }, [alternateMovements]);

  const canOpenAlternate = useCallback((mr: MovementResult): boolean => (
    movementHasAlternate(mr) && firstAlternateKeys.has(mr.movementKey)
  ), [firstAlternateKeys]);

  const handleWeightChange = useCallback((globalIndex: number, mr: MovementResult, weight: number | undefined) => {
    const w = weight != null ? Math.max(0, weight) : undefined;

    manuallyEditedRef.current.add(mr.movementKey);

    // On the first manual weight edit, propagate atomically to all same-equipment
    // load movements that haven't been manually edited yet (barbell -> barbell, KB -> KB,
    // DB -> DB). 'other' implements are each their own thing — never propagate between them.
    if (w != null && manuallyEditedRef.current.size === 1 && onBatch && getMovementEquipment(mr) !== 'other') {
      const srcEquip = getMovementEquipment(mr);
      const next = movements.map((other, otherIdx) => {
        if (otherIdx === globalIndex) return { ...other, weight: w };
        if (other.kind !== 'load') return other;
        if (manuallyEditedRef.current.has(other.movementKey)) return other;
        if (getMovementEquipment(other) !== srcEquip) return other;
        return { ...other, weight: w };
      });
      onBatch(next);
    } else {
      onChange(globalIndex, { weight: w });
    }
  }, [movements, onChange, onBatch, getMovementEquipment]);

  const handleSharedWeightChange = useCallback((equipmentType: 'barbell' | 'kb' | 'db', weight: number | undefined) => {
    const w = weight != null ? Math.max(0, weight) : undefined;
    const next = movements.map((mr) => {
      if (mr.kind !== 'load') return mr;
      if (getMovementEquipment(mr) !== equipmentType) return mr;
      return { ...mr, weight: w };
    });
    if (onBatch) {
      onBatch(next);
      return;
    }
    next.forEach((mr, index) => {
      if (mr !== movements[index]) onChange(index, { weight: mr.weight });
    });
  }, [movements, onBatch, onChange, getMovementEquipment]);

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const startLongPress = useCallback((onLongPress: () => void) => {
    clearLongPress();
    longPressFiredRef.current = false;
    longPressTimerRef.current = window.setTimeout(() => {
      longPressFiredRef.current = true;
      onLongPress();
    }, 420);
  }, [clearLongPress]);

  const runClickUnlessLongPressed = useCallback((onClick: () => void) => {
    if (longPressFiredRef.current) {
      longPressFiredRef.current = false;
      return;
    }
    onClick();
  }, []);

  useEffect(() => {
    if (seededDefaultsRef.current) return;
    const next = movements.map((mr) => {
      if (mr.kind !== 'load' || mr.weight != null) return mr;
      // Seed from Rx weight (80% of prescribed) when available, otherwise fall back to
      // the equipment default (barbell=40, KB=16). This keeps the persisted value consistent
      // with what the hero weight screen visually displays; without seeding, the screen
      // shows a fallback weight that is lost if the user never taps +/-.
      const defaultWeight = getDefaultMetconWeight(mr) ?? getFallbackWeight(getMovementEquipment(mr));
      return defaultWeight != null ? { ...mr, weight: defaultWeight } : mr;
    });
    const changed = next.some((mr, i) => mr !== movements[i]);
    if (!changed) {
      seededDefaultsRef.current = true;
      return;
    }
    seededDefaultsRef.current = true;
    if (onBatch) {
      onBatch(next);
      return;
    }
    next.forEach((mr, index) => {
      if (mr !== movements[index]) onChange(index, { weight: mr.weight });
    });
  }, [movements, onBatch, onChange, getMovementEquipment]);

  // Which movement key has the substitution sheet open
  const [swapOpenKey, setSwapOpenKey] = useState<string | null>(null);

  const openSwap = (key: string) => {
    setSwapOpenKey(key);
    onSubstitutionOpenChange?.(true);
  };
  const closeSwap = () => {
    setSwapOpenKey(null);
    onSubstitutionOpenChange?.(false);
  };

  // Find the movement currently being swapped (for the sheet)
  const swapMr = swapOpenKey != null
    ? movements.find(m => m.movementKey === swapOpenKey) ?? null
    : null;

  // Handler: apply substitution to the correct movement
  const handleSubstitution = (sub: MovementSubstitution | null) => {
    if (!swapMr) return;
    const globalIndex = movements.indexOf(swapMr);
    if (globalIndex < 0) return;

    // When substituting, auto-adjust the logged value if conversion data exists
    const patch: Partial<MovementResult> = { substitution: sub };
    if (sub) {
      if (sub.adjustedValue != null) {
        // Use targetUnit from the substitution sheet if available; it knows
        // the target movement's default unit (e.g., Run -> Echo Bike = calories).
        if (sub.targetUnit) {
          if (sub.targetUnit === 'distance') {
            patch.distance = sub.adjustedValue;
            patch.calories = undefined;
          } else if (sub.targetUnit === 'calories') {
            patch.calories = sub.adjustedValue;
            patch.distance = undefined;
          } else if (sub.targetUnit === 'reps') {
            patch.reps = sub.adjustedValue;
          }
          // time: no special field to set
        } else {
          // Legacy fallback: detect from origin movement
          const originIsDistance = swapMr.kind === 'distance'
            || (swapMr.movement.distance != null && swapMr.movement.distance > 0);
          const originIsCal = !originIsDistance && (
            swapMr.movement.inputType === 'calories' ||
            (swapMr.movement.calories != null && swapMr.movement.calories > 0)
          );
          if (originIsDistance) {
            patch.distance = sub.adjustedValue;
            patch.calories = undefined;
          } else if (originIsCal) {
            patch.calories = sub.adjustedValue;
            patch.distance = undefined;
          } else {
            const targetDef = findExerciseDefinition(sub.selectedName);
            const targetUsesCal = targetDef?.defaultUnit === 'calories';
            if (targetUsesCal) {
              patch.calories = sub.adjustedValue;
            } else if (swapMr.movement.distance != null) {
              patch.distance = sub.adjustedValue;
            }
          }
        }
      }
    } else {
      // Reverting to Rx: restore original prescribed values
      const isDistance = swapMr.kind === 'distance'
        || (swapMr.movement.distance != null && swapMr.movement.distance > 0);
      const isCal = !isDistance && (
        swapMr.movement.inputType === 'calories' ||
        (swapMr.movement.calories != null && swapMr.movement.calories > 0)
      );
      if (isCal) {
        patch.calories = swapMr.movement.calories ?? undefined;
      } else if (swapMr.movement.distance != null) {
        patch.distance = swapMr.movement.distance;
        // Clear calories if reverting from a calorie-based substitute
        patch.calories = undefined;
      } else if (isDistance) {
        // Distance-based row but no prescribed distance: clear user-entered distance.
        patch.distance = undefined;
      }
    }

    const sameMovementIndices = movements
      .map((mr, index) => ({ mr, index }))
      .filter(({ mr }) => movementAlternateKey(mr) === movementAlternateKey(swapMr))
      .map(({ index }) => index);

    if (onBatch && sameMovementIndices.length > 1) {
      const next = movements.map((mr, index) => (
        sameMovementIndices.includes(index) ? { ...mr, ...patch } : mr
      ));
      onBatch(next);
    } else {
      onChange(globalIndex, patch);
    }
    closeSwap();
  };

  const handleAiAlternativeToggle = (mr: MovementResult, patch: Partial<MovementResult>) => {
    const globalIndex = movements.indexOf(mr);
    if (globalIndex < 0) return;
    const sameMovementIndices = movements
      .map((candidate, index) => ({ candidate, index }))
      .filter(({ candidate }) => movementAlternateKey(candidate) === movementAlternateKey(mr))
      .map(({ index }) => index);

    if (onBatch && sameMovementIndices.length > 1) {
      const next = movements.map((candidate, index) => (
        sameMovementIndices.includes(index) ? { ...candidate, ...patch } : candidate
      ));
      onBatch(next);
      return;
    }

    onChange(globalIndex, patch);
  };

  const editableTiles = useMemo(() => (
    movements.flatMap((mr, globalIndex) => {
      const config = getTileConfig(mr, distanceDerivedFromRounds);
      if (!config) return [];
      const sub = getSubState(mr);
      const labelSource = sub.isSubstituted ? sub.displayName : mr.movement.name;
      const cleaned = cleanTileLabel(labelSource) || stripWeightFromName(labelSource) || labelSource;
      return [{
        tileId: mr.movementKey,
        globalIndex,
        mr,
        label: cleaned.toUpperCase(),
        config,
      }];
    })
  ), [movements, distanceDerivedFromRounds]);

  const tileRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [activeTileId, setActiveTileId] = useState<string | null>(null);
  const [numpadValue, setNumpadValue] = useState('');
  const [replaceOnDigit, setReplaceOnDigit] = useState(true);

  const activeTile = activeTileId != null
    ? editableTiles.find((tile) => tile.tileId === activeTileId) ?? null
    : null;

  const closeNumpad = useCallback(() => {
    setActiveTileId(null);
    setNumpadValue('');
    setReplaceOnDigit(true);
  }, []);

  const openTile = useCallback((tileId: string) => {
    const tile = editableTiles.find((entry) => entry.tileId === tileId);
    if (!tile) return;
    setActiveTileId(tileId);
    setNumpadValue(tile.config.value != null ? String(tile.config.value) : '');
    setReplaceOnDigit(true);
  }, [editableTiles]);

  useEffect(() => {
    if (activeTileId == null) return;
    if (!editableTiles.some((tile) => tile.tileId === activeTileId)) {
      closeNumpad();
    }
  }, [activeTileId, closeNumpad, editableTiles]);

  useEffect(() => {
    if (activeTileId == null) return;
    tileRefs.current[activeTileId]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [activeTileId]);

  const commitTileValue = useCallback((tileId: string, rawValue: string) => {
    const tile = editableTiles.find((entry) => entry.tileId === tileId);
    if (!tile) return;

    const sanitized = tile.config.inputMode === 'decimal'
      ? rawValue.replace(/[^0-9.]/g, '')
      : rawValue.replace(/\D/g, '');
    const deduped = tile.config.inputMode === 'decimal'
      ? sanitized.replace(/(\..*)\./g, '$1')
      : sanitized;
    const nextRaw = deduped.replace(/^0+(?=\d)/, '');
    if (nextRaw === '') {
      setNumpadValue('');
      switch (tile.config.field) {
        case 'weight':
          handleWeightChange(tile.globalIndex, tile.mr, undefined);
          return;
        case 'distance':
          onChange(tile.globalIndex, { distance: undefined });
          return;
        case 'calories':
          onChange(tile.globalIndex, { calories: undefined });
          return;
        case 'reps':
          onChange(tile.globalIndex, { reps: undefined });
          return;
      }
    }

    const parsed = Number(nextRaw);
    if (Number.isNaN(parsed)) return;
    const clamped = clampValue(parsed, tile.config.min, tile.config.max);
    const displayValue = tile.config.inputMode === 'decimal' && nextRaw.endsWith('.')
      ? `${clamped}.`
      : String(clamped);
    setNumpadValue(displayValue);

    switch (tile.config.field) {
      case 'weight':
        handleWeightChange(tile.globalIndex, tile.mr, clamped);
        return;
      case 'distance':
        onChange(tile.globalIndex, { distance: clamped });
        return;
      case 'calories':
        onChange(tile.globalIndex, { calories: clamped });
        return;
      case 'reps':
        onChange(tile.globalIndex, { reps: clamped });
        return;
    }
  }, [editableTiles, handleWeightChange, onChange]);

  const handleNumpadDigit = useCallback((digit: string) => {
    if (!activeTileId) return;
    const tile = editableTiles.find((entry) => entry.tileId === activeTileId);
    if (!tile) return;
    if (digit === '.' && tile.config.inputMode !== 'decimal') return;
    if (digit === '.' && (replaceOnDigit ? numpadValue === '.' : numpadValue.includes('.'))) return;
    const normalizedDigit = digit === '.' && replaceOnDigit ? '0.' : digit;
    const nextRaw = replaceOnDigit ? normalizedDigit : `${numpadValue}${digit}`;
    setReplaceOnDigit(false);
    commitTileValue(activeTileId, nextRaw);
  }, [activeTileId, commitTileValue, editableTiles, numpadValue, replaceOnDigit]);

  const handleNumpadBackspace = useCallback(() => {
    if (!activeTileId) return;
    const nextRaw = replaceOnDigit ? '' : numpadValue.slice(0, -1);
    setReplaceOnDigit(false);
    commitTileValue(activeTileId, nextRaw);
  }, [activeTileId, commitTileValue, numpadValue, replaceOnDigit]);

  const handleNumpadNext = useCallback(() => {
    if (!activeTileId) return;
    const currentIndex = editableTiles.findIndex((tile) => tile.tileId === activeTileId);
    const nextTile = currentIndex >= 0 ? editableTiles[currentIndex + 1] : null;
    if (!nextTile) {
      closeNumpad();
      return;
    }
    openTile(nextTile.tileId);
  }, [activeTileId, closeNumpad, editableTiles, openTile]);

  // Arcade tile renderer
  const renderMovField = (mr: MovementResult) => {
    const globalIndex = movements.indexOf(mr);
    if (focusedLoadStep && focusedLoadGroupKeys.has(mr.movementKey)) {
      if (mr.movementKey !== focusedLoadFirstKey) return null;
      return (
        <React.Fragment key={`shared-${mr.movementKey}`}>
          {mr.movement.stationLabel && (
            <div className={styles.stationDivider}>
              <span className={styles.stationLabel}>{mr.movement.stationLabel}</span>
              <span className={styles.sectionLine} />
            </div>
          )}
          {focusedLoadStep}
        </React.Fragment>
      );
    }

    const sub = getSubState(mr);
    const rawMovName = sub.isSubstituted ? sub.displayName : mr.movement.name;
    // Strip AI-generated "Buy-In:"/"Cash-Out:" prefix from display; these labels can be
    // misparsed for the first movement of a numbered AMRAP block.
    const displayMovName = rawMovName.replace(/^(Buy-In|Cash-Out):\s*/i, '');
    const hasAlts = canOpenAlternate(mr);
    const tileName = (
      cleanTileLabel(displayMovName)
      || stripWeightFromName(displayMovName)
      || displayMovName
    ).toUpperCase();

    const partnerNote = teamSize != null ? partnerAnnotation(mr, teamSize) : null;
    const isSharedWeight = sharedWeightKeys.has(mr.movementKey);
    const tileField = getTileConfig(mr, distanceDerivedFromRounds)?.field;

    return (
      <React.Fragment key={mr.movementKey}>
        {mr.movement.stationLabel && (
          <div className={styles.stationDivider}>
            <span className={styles.stationLabel}>{mr.movement.stationLabel}</span>
            <span className={styles.sectionLine} />
          </div>
        )}
        <div
          className={styles.tile}
          ref={(node) => {
            tileRefs.current[mr.movementKey] = node;
          }}
        >
          {/* Tile header: name + optional sub badge + swap affordance; tappable for substitution */}
          <div
            className={styles.tileHeader}
            onClick={hasAlts ? () => openSwap(mr.movementKey) : undefined}
            role={hasAlts ? 'button' : undefined}
            style={hasAlts ? { cursor: 'pointer' } : undefined}
          >
            {sub.isSubstituted ? (
              <div className={styles.tileNameSubstituted}>
                <span className={styles.tileNameOriginal}>
                  {(cleanTileLabel(displayMovName) || stripWeightFromName(displayMovName) || displayMovName).toUpperCase()}
                </span>
                <span className={styles.tileName}>{tileName}</span>
              </div>
            ) : (
              <span className={styles.tileName}>{tileName}</span>
            )}
            {sub.badgeType && (
              <span className={`${styles.subBadge} ${styles[`subBadge_${sub.badgeType}`]}`}>
                {sub.badgeType === 'scaled' ? 'SCALED' : sub.badgeType === 'rx-plus' ? 'RX+' : 'SWAP'}
              </span>
            )}
            {sub.conversionNote && (
              <span className={styles.conversionNote}>{sub.conversionNote}</span>
            )}
            {hasAlts && (
              <span className={styles.tileSwapIcon} aria-hidden="true">
                <SwapIcon />
              </span>
            )}
          </div>

          {/* Partner annotation */}
          {partnerNote && (
            <span className={styles.partnerAnnotation}>{partnerNote}</span>
          )}

          {/* AI quick-toggle chip */}
          {hasAlts && <AiAlternativeToggle mr={mr} onChange={(patch) => handleAiAlternativeToggle(mr, patch)} />}

          {/* Input: arcade stepper or nothing for prescribed-reps display movements */}
          {mr.kind === 'load' && !isSharedWeight && (
            <WeightField
              mr={mr}
              onChange={(patch) => handleWeightChange(globalIndex, mr, patch.weight)}
              onCenterPress={() => openTile(mr.movementKey)}
              active={activeTileId === mr.movementKey}
            />
          )}
          {(tileField === 'distance' || tileField === 'calories') && (
            <DistanceField
              mr={mr}
              onChange={(patch) => onChange(globalIndex, patch)}
              onCenterPress={() => openTile(mr.movementKey)}
              active={activeTileId === mr.movementKey}
              isRelayContext={isRelayContext}
            />
          )}
          {/* MAX bodyweight: no prescribed quantity; let user log their score */}
          {tileField === 'reps' && (
            <RepsField
              mr={mr}
              onChange={(patch) => onChange(globalIndex, patch)}
              onCenterPress={() => openTile(mr.movementKey)}
              active={activeTileId === mr.movementKey}
            />
          )}
        </div>
      </React.Fragment>
    );
  };

  const focusedLoadGroup = loadGroups[0] ?? null;
  const renderFocusedLoadStep = () => {
    if (!focusedLoadGroup) return null;

    const isSeparate = separateWeightGroups.has(focusedLoadGroup.type);
    const firstWithValue = focusedLoadGroup.movements.find(mr => mr.weight != null);
    const firstRx = focusedLoadGroup.movements.find(mr => getRxWeight(mr) != null);
    const base = firstWithValue ?? firstRx ?? focusedLoadGroup.movements[0];
    const currentWeight = base?.weight ?? getDefaultMetconWeight(base) ?? getFallbackWeight(focusedLoadGroup.type) ?? 0;
    const rx = getRxWeight(base);
    const step = getLegalWeightStep(base);
    const caption = focusedLoadGroup.movements.map(getMovementCaptionName).join(' - ');
    const groupLabel = getEquipmentLabel(focusedLoadGroup.type);

    const setSharedValue = (next: number) => {
      handleSharedWeightChange(focusedLoadGroup.type, roundToLegalWeight(next, base));
    };
    const nudgeShared = (direction: -1 | 1, multiplier = 1) => {
      setSharedValue(currentWeight + direction * step * multiplier);
    };

    if (isSeparate) {
      return (
        <div className={styles.implementWeightScreen}>
          <div className={styles.implementWeightHeader}>
            <span className={styles.implementEyebrow}>{groupLabel} WEIGHTS</span>
            <span className={styles.implementCaption}>Set each movement separately</span>
          </div>
          <div className={styles.separateWeightList}>
            {focusedLoadGroup.movements.map((mr) => {
              const globalIndex = movements.indexOf(mr);
              const value = mr.weight ?? getDefaultMetconWeight(mr) ?? getFallbackWeight(focusedLoadGroup.type) ?? 0;
              const movementStep = getLegalWeightStep(mr);
              return (
                <div key={mr.movementKey} className={styles.separateWeightRow}>
                  <span className={styles.separateWeightName}>{getMovementCaptionName(mr)}</span>
                  <div className={styles.separateStepper}>
                    <button
                      type="button"
                      className={styles.separateStepButton}
                      onClick={() => handleWeightChange(globalIndex, mr, roundToLegalWeight(value - movementStep, mr))}
                      aria-label={`Decrease ${getMovementCaptionName(mr)} weight`}
                    >
                      -
                    </button>
                    <span className={styles.separateWeightValue}>
                      {value}
                      <span>kg</span>
                    </span>
                    <button
                      type="button"
                      className={styles.separateStepButton}
                      onClick={() => handleWeightChange(globalIndex, mr, roundToLegalWeight(value + movementStep, mr))}
                      aria-label={`Increase ${getMovementCaptionName(mr)} weight`}
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <button
            type="button"
            className={styles.differentWeightsLink}
            onClick={() => {
              setSeparateWeightGroups(prev => {
                const next = new Set(prev);
                next.delete(focusedLoadGroup.type);
                return next;
              });
            }}
          >
            Use one {groupLabel} weight {'->'}
          </button>
        </div>
      );
    }

    const isRx = rx != null && Math.abs(currentWeight - rx) < 0.001;

    return (
      <div className={styles.implementWeightScreen}>
        <div className={styles.implementWeightHeader}>
          <span className={styles.implementEyebrow}>{groupLabel} WEIGHT</span>
          <span className={styles.implementCaption}>Used for {caption}</span>
        </div>

        <div className={styles.heroWeightStepper} aria-label={`${groupLabel} weight`}>
          <button
            type="button"
            className={styles.heroWeightButton}
            onPointerDown={() => startLongPress(() => nudgeShared(-1, 2))}
            onPointerUp={clearLongPress}
            onPointerCancel={clearLongPress}
            onPointerLeave={clearLongPress}
            onClick={() => runClickUnlessLongPressed(() => nudgeShared(-1))}
            aria-label={`Decrease ${groupLabel} weight`}
          >
            -
          </button>
          <div className={styles.heroWeightCenter}>
            <span className={styles.heroWeightValue}>{currentWeight}</span>
            <span className={styles.heroWeightUnit}>kg</span>
            {rx != null && (
              <span className={`${styles.rxHint} ${isRx ? styles.rxHit : ''}`}>
                {isRx ? 'Rx ✓' : `Rx is ${rx}kg`}
              </span>
            )}
          </div>
          <button
            type="button"
            className={styles.heroWeightButton}
            onPointerDown={() => startLongPress(() => nudgeShared(1, 2))}
            onPointerUp={clearLongPress}
            onPointerCancel={clearLongPress}
            onPointerLeave={clearLongPress}
            onClick={() => runClickUnlessLongPressed(() => nudgeShared(1))}
            aria-label={`Increase ${groupLabel} weight`}
          >
            +
          </button>
        </div>

        {focusedLoadGroup.movements.length > 1 && (
          <button
            type="button"
            className={styles.differentWeightsLink}
            onClick={() => {
              setSeparateWeightGroups(prev => {
                const next = new Set(prev);
                next.add(focusedLoadGroup.type);
                return next;
              });
            }}
          >
            Use different weights for each {'->'}
          </button>
        )}

        {alternateMovements.filter(mr => mr.kind === 'load').length > 0 && (
          <div className={styles.inlineAlternateList}>
            {alternateMovements.filter(mr => mr.kind === 'load').map((mr) => {
              const sub = getSubState(mr);
              const isActive = sub.isSubstituted;
              return (
                <button
                  key={mr.movementKey}
                  type="button"
                  className={`${styles.inlineAlternateRow} ${isActive ? styles.inlineAlternateRowActive : ''}`}
                  onClick={() => openSwap(mr.movementKey)}
                >
                  <span className={styles.inlineAlternateText}>
                    <span className={styles.inlineAlternateName}>
                      {cleanTileLabel((isActive ? sub.displayName : mr.movement.name).replace(/^(Buy-In|Cash-Out):\s*/i, ''))}
                    </span>
                    <span className={styles.inlineAlternateMeta}>
                      {isActive ? (sub.conversionNote ?? 'alternate selected') : 'tap to scale / alternate'}
                    </span>
                  </span>
                  <span className={styles.inlineAlternateIcon} aria-hidden="true">
                    <SwapIcon />
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // Only stop on movements where the athlete can actually change something.
  // Plain bodyweight movements with no alternate are omitted from this input step.
  const visibleMovements = movements.filter(mr => movementHasInput(mr, distanceDerivedFromRounds) || canOpenAlternate(mr));
  const visibleSectionGroups = groupBySections(visibleMovements);
  const focusedLoadStep = renderFocusedLoadStep();
  const focusedLoadFirstKey = focusedLoadGroup?.movements[0]?.movementKey ?? null;
  const focusedLoadGroupKeys = new Set(focusedLoadGroup?.movements.map(mr => mr.movementKey) ?? []);

  const movementTileBlock = visibleSectionGroups
    ? (
      <div className={styles.multiRow}>
        {visibleSectionGroups.map((group) => (
          <div key={group.sectionIndex} className={styles.sectionGroup}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionLabel}>
                {sectionLabel(group.sectionType, group.sectionRounds)}
              </span>
              <span className={styles.sectionLine} />
            </div>
            {group.movements.map(renderMovField)}
          </div>
        ))}
      </div>
    )
    : <div className={styles.multiRow}>{visibleMovements.map(renderMovField)}</div>;

  return (
    <>
      {movementTileBlock}

      {/* Substitution sheet; single instance, driven by swapOpenKey */}
      {swapMr && (
        <SubstitutionSheet
          open={swapOpenKey != null}
          originalName={swapMr.movement.name.replace(/^(Buy-In|Cash-Out):\s*/i, '')}
          originalReps={swapMr.movement.reps}
          originalDistance={swapMr.movement.distance}
          originalCalories={swapMr.movement.calories}
          currentSubstitution={swapMr.substitution}
          aiAlternative={swapMr.movement.alternative}
          onSelect={handleSubstitution}
          onClose={closeSwap}
        />
      )}

      <CustomNumpadSheet
        open={activeTile != null}
        label={activeTile?.label ?? ''}
        value={numpadValue}
        unit={activeTile?.config.unit}
        accentColor="#00F2FF"
        showDecimal={activeTile?.config.inputMode === 'decimal'}
        onDigit={handleNumpadDigit}
        onBackspace={handleNumpadBackspace}
        onNext={handleNumpadNext}
        onClose={closeNumpad}
      />
    </>
  );
}

function WeightField({
  mr,
  onChange,
  onCenterPress,
  active,
}: {
  mr: MovementResult;
  onChange: (p: Partial<MovementResult>) => void;
  onCenterPress: () => void;
  active: boolean;
}) {
  const placeholder = mr.movement.rxWeights?.male ? String(mr.movement.rxWeights.male) : '0';
  const unitLabel = mr.implementCount === 2 ? '2x kg' : 'kg';
  const step = getWeightStep(mr.movement.name, mr.movement.equipment);

  return (
    <StepperInput
      value={mr.weight}
      onChange={(v) => onChange({ weight: v != null ? Math.max(0, v) : undefined })}
      step={step}
      min={0}
      max={500}
      placeholder={placeholder}
      unit={unitLabel}
      color={LOAD_TILE_COLOR}
      inputMode="decimal"
      size="arcade"
      onCenterPress={onCenterPress}
      active={active}
    />
  );
}

function DistanceField({
  mr,
  onChange,
  onCenterPress,
  active,
  isRelayContext = false,
}: {
  mr: MovementResult;
  onChange: (p: Partial<MovementResult>) => void;
  onCenterPress: () => void;
  active: boolean;
  isRelayContext?: boolean;
}) {
  const isCal = isCalorieBased(mr);

  // In a partner/relay AMRAP, a prescribed distance means "how many trips": show a count stepper.
  // In a for-time workout, a prescribed distance is just the fixed target: show normal entry.
  const prescribedDist = getPrescribedTripDistance(mr);
  const isRelayCount = isRelayContext && prescribedDist > 0;

  if (isRelayCount) {
    const count = mr.distance != null && prescribedDist > 0
      ? Math.round(mr.distance / prescribedDist)
      : undefined;
    const unit = `x ${prescribedDist}${mr.distanceUnit ?? mr.movement.unit ?? 'm'}`;
    return (
      <StepperInput
        value={count}
        onChange={(v) => {
          const c = v != null ? Math.max(0, Math.round(v)) : undefined;
          onChange({ distance: c != null ? c * prescribedDist : undefined });
        }}
        step={1}
        min={0}
        placeholder="0"
        unit={unit}
        color={METRIC_TILE_COLOR}
        inputMode="numeric"
        size="arcade"
        onCenterPress={onCenterPress}
        active={active}
      />
    );
  }

  const unit = isCal ? 'cal' : (mr.distanceUnit ?? mr.movement.unit ?? 'm');
  const value = isCal ? mr.calories : mr.distance;
  const placeholder = isCal
    ? (mr.movement.calories ? String(mr.movement.calories) : '0')
    : '0';
  const step = isCal ? 1 : (unit === 'km' ? 0.5 : unit === 'mi' ? 0.1 : 50);

  return (
    <StepperInput
      value={value}
      onChange={(v) => {
        const parsed = v != null ? Math.max(0, v) : undefined;
        onChange(isCal ? { calories: parsed } : { distance: parsed });
      }}
      step={step}
      min={0}
      placeholder={placeholder}
      unit={unit}
      color={METRIC_TILE_COLOR}
      inputMode="decimal"
      size="arcade"
      onCenterPress={onCenterPress}
      active={active}
    />
  );
}

function RepsField({
  mr,
  onChange,
  onCenterPress,
  active,
}: {
  mr: MovementResult;
  onChange: (p: Partial<MovementResult>) => void;
  onCenterPress: () => void;
  active: boolean;
}) {
  return (
    <StepperInput
      value={mr.reps}
      onChange={(v) => onChange({ reps: v != null ? Math.max(0, v) : undefined })}
      step={1}
      min={0}
      placeholder="0"
      unit="reps"
      color={METRIC_TILE_COLOR}
      inputMode="numeric"
      size="arcade"
      onCenterPress={onCenterPress}
      active={active}
    />
  );
}

