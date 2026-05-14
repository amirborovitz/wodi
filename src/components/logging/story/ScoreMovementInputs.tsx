import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MovementResult } from './types';
import type { ParsedSectionType } from '../../../types';
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
  variant?: 'default' | 'amrap_intervals';
  roundsTotal?: number;
  /** Called when multiple movements need to update atomically (e.g. weight propagation). */
  onBatch?: (next: MovementResult[]) => void;
  onSubstitutionOpenChange?: (open: boolean) => void;
  /** Team size for partner workouts. When > 1, buy-in/cash-out movements
   *  show a "{total} {unit} total ÷{teamSize}" annotation below the movement
   *  name so the athlete knows they are logging their personal share. */
  teamSize?: number;
}

// Classify a movement by equipment type for weight propagation grouping.
// Barbell movements only propagate to other barbell movements, not KB or DB.
function getEquipmentType(name: string): 'barbell' | 'kb' | 'db' {
  const lower = name.toLowerCase();
  if (/\bdb\b|dumbbell/.test(lower)) return 'db';
  if (/\bkb\b|kettlebell|\bgoblet\b/.test(lower)) return 'kb';
  return 'barbell';
}

function getEquipmentLabel(type: 'barbell' | 'kb' | 'db'): string {
  if (type === 'kb') return 'KB';
  if (type === 'db') return 'DB';
  return 'Barbell';
}

function getLegalWeightStep(mr: MovementResult): number {
  const equipmentType = getEquipmentType(mr.movement.name);
  if (equipmentType === 'kb') return 2;
  if (equipmentType === 'db') return 1;
  return getWeightStep(mr.movement.name, mr.implementCount);
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

function getFallbackWeight(type: 'barbell' | 'kb' | 'db'): number {
  if (type === 'kb') return 16;
  if (type === 'db') return 10;
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

function movementHasInput(mr: MovementResult): boolean {
  return getTileConfig(mr) != null;
}

// Human-readable labels for section types
function sectionLabel(type: ParsedSectionType, rounds: number): string {
  if (type === 'buy_in') return 'Buy-in';
  if (type === 'cash_out') return 'Cash-out';
  return `${rounds} round${rounds !== 1 ? 's' : ''}`;
}

// Returns the partner-split annotation string for a movement in a partner workout.
// Shows the workout total and division so athletes know what to log.
// Examples: "100 cal total · your part 50", "600 m total · your part 300"
// "Together" movements show "together" instead of a split.
function partnerAnnotation(mr: MovementResult, teamSize: number): string | null {
  if (teamSize <= 1) return null;

  // "Together" movements: everyone does the full amount
  if (mr.movement.together) {
    return 'together';
  }

  const isCal =
    mr.movement.inputType === 'calories' ||
    (mr.movement.calories != null && mr.movement.calories > 0);

  if (isCal && mr.movement.calories) {
    const personal = Math.round(mr.movement.calories / teamSize);
    return `${mr.movement.calories} cal total · your part ${personal}`;
  }
  if (mr.movement.distance) {
    const unit = mr.distanceUnit ?? mr.movement.unit ?? 'm';
    const personal = Math.round(mr.movement.distance / teamSize);
    return `${mr.movement.distance} ${unit} total · your part ${personal}`;
  }
  if (mr.movement.reps) {
    const personal = Math.round(mr.movement.reps / teamSize);
    return `${mr.movement.reps} total · your part ${personal}`;
  }
  return null;
}

function getIntervalValue(mr: MovementResult): number {
  if (mr.kind === 'distance') {
    const isCal = mr.movement.inputType === 'calories'
      || (mr.movement.calories != null && mr.movement.calories > 0);
    return isCal
      ? (mr.calories ?? mr.movement.calories ?? 0)
      : (mr.distance ?? mr.movement.distance ?? 0);
  }
  return mr.reps ?? mr.movement.reps ?? 0;
}

function getIntervalUnit(mr: MovementResult): string {
  if (mr.kind === 'distance') {
    const isCal = mr.movement.inputType === 'calories'
      || (mr.movement.calories != null && mr.movement.calories > 0);
    return isCal ? 'cal' : (mr.distanceUnit ?? mr.movement.unit ?? 'm');
  }
  return 'reps';
}

function getIntervalRx(mr: MovementResult): number {
  if (mr.kind === 'distance') {
    const isCal = mr.movement.inputType === 'calories'
      || (mr.movement.calories != null && mr.movement.calories > 0);
    return isCal ? (mr.movement.calories ?? 0) : (mr.movement.distance ?? 0);
  }
  return mr.movement.reps ?? 0;
}

function formatLoadNote(mr: MovementResult): string | null {
  const weight = mr.weight ?? mr.movement.rxWeights?.male ?? mr.movement.rxWeights?.female;
  if (weight == null || weight <= 0) return null;
  return mr.implementCount === 2 ? `@ ${weight}kg each` : `@ ${weight}kg`;
}

function getIntervalPatch(mr: MovementResult, value: number): Partial<MovementResult> {
  const nextValue = Math.max(0, Math.round(value));
  if (mr.kind === 'distance') {
    const isCal = mr.movement.inputType === 'calories'
      || (mr.movement.calories != null && mr.movement.calories > 0);
    return isCal ? { calories: nextValue } : { distance: nextValue };
  }
  return { reps: nextValue };
}

// ─── Strip weight from movement name for display ─────────────────
// Removes leading/trailing weight patterns like "22.5kg", "95lb", "135#"
// so the label reads "Alt DB Snatch" instead of "22.5kg Alt DB Snatch".
function stripWeightFromName(name: string): string {
  return name
    // Leading: "22.5kg Alt DB Snatch" → "Alt DB Snatch"
    .replace(/^\d+(\.\d+)?\s*(kg|lb|lbs|#)\s+/i, '')
    // Trailing: "Alt DB Snatch 22.5kg" → "Alt DB Snatch"
    .replace(/\s+\d+(\.\d+)?\s*(kg|lb|lbs|#)$/i, '')
    // Parenthetical: "Thruster (95lb)" → "Thruster"
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

// ─── Substitution state summary ───────────────────────────────────
// Returns the currently displayed movement name (substituted or original)
// and whether a substitution is active.

interface SubState {
  displayName: string;
  isSubstituted: boolean;
  badgeType: 'scaled' | 'rx-plus' | 'equal' | null;
  /** Human-readable conversion, e.g. "400m → 1200m" */
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

  // Build conversion note: "400m → 1200m" or "30 → 90"
  let conversionNote: string | null = null;
  if (sub.originalValue != null && sub.adjustedValue != null && sub.originalValue !== sub.adjustedValue) {
    const isDistance = (mr.movement.distance != null && mr.movement.distance > 0);
    conversionNote = `${fmtValue(sub.originalValue, isDistance)} → ${fmtValue(sub.adjustedValue, isDistance)}`;
  }

  return {
    displayName: sub.selectedName,
    isSubstituted: true,
    badgeType,
    conversionNote,
  };
}

// ─── AI quick-toggle ─────────────────────────────────────────────
// When the AI parsed two slash-alternatives (e.g. "40 DU / 60 singles"),
// we show an inline chip to flip between them — no sheet needed.

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
        ? `← ${mr.movement.name}`
        : `${aiAlt.name} ↔`
      }
    </button>
  );
}

// ─── Prescribed value tag ────────────────────────────────────────
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

const LOAD_TILE_COLOR = '#FFD700';
const METRIC_TILE_COLOR = '#FF00FF';

function getTileConfig(mr: MovementResult): TileConfig | null {
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
      unit: mr.implementCount === 2 ? '2× kg' : 'kg',
      color: LOAD_TILE_COLOR,
      step: getWeightStep(mr.movement.name, mr.implementCount),
      min: 0,
      max: 500,
      inputMode: 'decimal',
    };
  }

  if (mr.kind === 'distance') {
    const isCardioMachine = /\b(bike|row|ski)\b/i.test(mr.movement.name);
    const isCal = mr.movement.inputType === 'calories'
      || (mr.movement.calories != null && mr.movement.calories > 0)
      || (isCardioMachine && !mr.movement.distance && mr.movement.inputType !== 'distance');
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

// ─── Swap icon (two-arrow cycle symbol) ─────────────────────────

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
 * When teamSize > 1, buy-in/cash-out movements show "100 cal total ÷2".
 */
export function ScoreMovementInputs({
  movements,
  inputMovements: _inputMovements,
  onChange,
  variant = 'default',
  roundsTotal,
  onBatch,
  onSubstitutionOpenChange,
  teamSize,
}: ScoreMovementInputsProps) {
  // Track which movements the user has manually edited weight on.
  // First weight edit propagates to all same-equipment load movements that haven't been touched.
  const manuallyEditedRef = useRef<Set<string>>(new Set());
  const [separateWeightGroups, setSeparateWeightGroups] = useState<Set<string>>(() => new Set());
  const seededDefaultsRef = useRef(false);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressFiredRef = useRef(false);

  const loadGroups = useMemo(() => {
    const groups = new Map<'barbell' | 'kb' | 'db', { type: 'barbell' | 'kb' | 'db'; movements: MovementResult[] }>();
    movements.forEach((mr) => {
      if (mr.kind !== 'load') return;
      const type = getEquipmentType(mr.movement.name);
      const group = groups.get(type) ?? { type, movements: [] };
      group.movements.push(mr);
      groups.set(type, group);
    });
    return [...groups.values()];
  }, [movements]);

  const sharedWeightKeys = useMemo(() => {
    const keys = new Set<string>();
    loadGroups.forEach((group) => {
      if (separateWeightGroups.has(group.type)) return;
      group.movements.forEach((mr) => keys.add(mr.movementKey));
    });
    return keys;
  }, [loadGroups, separateWeightGroups]);

  const alternateMovements = useMemo(() => {
    const seen = new Set<string>();
    return movements.filter((mr) => {
      if (!movementHasAlternate(mr)) return false;
      const key = cleanTileLabel(mr.movement.name).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [movements]);

  const handleWeightChange = useCallback((globalIndex: number, mr: MovementResult, weight: number | undefined) => {
    const w = weight != null ? Math.max(0, weight) : undefined;

    manuallyEditedRef.current.add(mr.movementKey);

    // On the first manual weight edit, propagate atomically to all same-equipment
    // load movements that haven't been manually edited yet (barbell→barbell, KB→KB, DB→DB).
    if (w != null && manuallyEditedRef.current.size === 1 && onBatch) {
      const srcEquip = getEquipmentType(mr.movement.name);
      const next = movements.map((other, otherIdx) => {
        if (otherIdx === globalIndex) return { ...other, weight: w };
        if (other.kind !== 'load') return other;
        if (manuallyEditedRef.current.has(other.movementKey)) return other;
        if (getEquipmentType(other.movement.name) !== srcEquip) return other;
        return { ...other, weight: w };
      });
      onBatch(next);
    } else {
      onChange(globalIndex, { weight: w });
    }
  }, [movements, onChange, onBatch]);

  const handleSharedWeightChange = useCallback((equipmentType: 'barbell' | 'kb' | 'db', weight: number | undefined) => {
    const w = weight != null ? Math.max(0, weight) : undefined;
    const next = movements.map((mr) => {
      if (mr.kind !== 'load') return mr;
      if (getEquipmentType(mr.movement.name) !== equipmentType) return mr;
      return { ...mr, weight: w };
    });
    if (onBatch) {
      onBatch(next);
      return;
    }
    next.forEach((mr, index) => {
      if (mr !== movements[index]) onChange(index, { weight: mr.weight });
    });
  }, [movements, onBatch, onChange]);

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
      const defaultWeight = getDefaultMetconWeight(mr) ?? getFallbackWeight(getEquipmentType(mr.movement.name));
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
  }, [movements, onBatch, onChange]);

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
        // Use targetUnit from the substitution sheet if available — it knows
        // the target movement's default unit (e.g., Run→Echo Bike = calories).
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
        // Distance-based row but no prescribed distance — clear user-entered distance.
        patch.distance = undefined;
      }
    }

    const sameMovementIndices = movements
      .map((mr, index) => ({ mr, index }))
      .filter(({ mr }) => cleanTileLabel(mr.movement.name).toLowerCase() === cleanTileLabel(swapMr.movement.name).toLowerCase())
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

  const editableTiles = useMemo(() => (
    movements.flatMap((mr, globalIndex) => {
      const config = getTileConfig(mr);
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
  ), [movements]);

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

  const renderIntervalField = (mr: MovementResult) => {
    const globalIndex = movements.indexOf(mr);
    const sub = getSubState(mr);
    const hasAlts = hasAlternatives(mr.movement.name) || !!mr.movement.alternative;
    const label = (
      cleanTileLabel(sub.isSubstituted ? sub.displayName : mr.movement.name)
      || stripWeightFromName(sub.isSubstituted ? sub.displayName : mr.movement.name)
      || (sub.isSubstituted ? sub.displayName : mr.movement.name)
    ).toUpperCase();
    const value = getIntervalValue(mr);
    const rx = getIntervalRx(mr);
    const unit = getIntervalUnit(mr);
    const loadNote = formatLoadNote(mr);
    const progress = rx > 0 ? clampValue((value / rx) * 100, 0, 140) : (value > 0 ? 100 : 0);

    const setValue = (next: number) => onChange(globalIndex, getIntervalPatch(mr, next));
    const handleInput = (raw: string) => {
      const parsed = parseInt(raw.replace(/\D/g, ''), 10);
      setValue(Number.isNaN(parsed) ? 0 : parsed);
    };

    return (
      <div key={mr.movementKey} className={styles.intervalTile}>
        <div
          className={styles.intervalHeader}
          onClick={hasAlts ? () => openSwap(mr.movementKey) : undefined}
          role={hasAlts ? 'button' : undefined}
        >
          <div className={styles.intervalTitleBlock}>
            {sub.isSubstituted && (
              <span className={styles.intervalOriginal}>
                {(cleanTileLabel(mr.movement.name) || stripWeightFromName(mr.movement.name) || mr.movement.name).toUpperCase()}
              </span>
            )}
            <span className={styles.intervalName}>{label}</span>
            <span className={styles.intervalMeta}>
              {rx > 0 ? `${rx} rx` : 'per round'}
              {loadNote ? ` - ${loadNote}` : ''}
            </span>
          </div>
          {hasAlts && (
            <span className={styles.tileSwapIcon} aria-hidden="true">
              <SwapIcon />
            </span>
          )}
        </div>

        <div className={styles.intervalControl}>
          <button
            type="button"
            className={styles.intervalStep}
            onClick={() => setValue(value - 1)}
            aria-label={`Decrease ${label}`}
          >
            -
          </button>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            className={styles.intervalValue}
            value={String(value)}
            onChange={(event) => handleInput(event.target.value)}
            aria-label={`${label} per round`}
          />
          <span className={styles.intervalUnit}>{unit}</span>
          <button
            type="button"
            className={styles.intervalStep}
            onClick={() => setValue(value + 1)}
            aria-label={`Increase ${label}`}
          >
            +
          </button>
        </div>

        <div className={styles.intervalTrack} aria-hidden="true">
          <span
            className={styles.intervalFill}
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>
      </div>
    );
  };

  if (variant === 'amrap_intervals') {
    const roundLabel = roundsTotal && roundsTotal > 0
      ? `${roundsTotal} rounds - totals calculated from your per-round reps`
      : 'Totals calculated from your per-round reps';

    return (
      <>
        <div className={styles.intervalPrompt}>
          Roughly how many of each did you hit per round?
        </div>
        <div className={styles.intervalList}>
          {movements.map(renderIntervalField)}
        </div>
        <div className={styles.intervalFootnote}>{roundLabel}</div>

        {swapMr && (
          <SubstitutionSheet
            open={swapOpenKey != null}
            originalName={swapMr.movement.name}
            originalReps={swapMr.movement.reps}
            originalDistance={swapMr.movement.distance}
            originalCalories={swapMr.movement.calories}
            currentSubstitution={swapMr.substitution}
            aiAlternative={swapMr.movement.alternative}
            onSelect={handleSubstitution}
            onClose={closeSwap}
          />
        )}
      </>
    );
  }

  // ── Arcade tile renderer ─────────────────────────────────────────
  const renderMovField = (mr: MovementResult) => {
    const globalIndex = movements.indexOf(mr);
    const sub = getSubState(mr);
    const hasAlts = hasAlternatives(mr.movement.name) || !!mr.movement.alternative;
    const tileName = (
      cleanTileLabel(sub.isSubstituted ? sub.displayName : mr.movement.name)
      || stripWeightFromName(sub.isSubstituted ? sub.displayName : mr.movement.name)
      || (sub.isSubstituted ? sub.displayName : mr.movement.name)
    ).toUpperCase();

    const partnerNote = teamSize != null ? partnerAnnotation(mr, teamSize) : null;
    const isSharedWeight = sharedWeightKeys.has(mr.movementKey);

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
          {/* Tile header: name + optional sub badge + swap affordance — tappable for substitution */}
          <div
            className={styles.tileHeader}
            onClick={hasAlts ? () => openSwap(mr.movementKey) : undefined}
            role={hasAlts ? 'button' : undefined}
            style={hasAlts ? { cursor: 'pointer' } : undefined}
          >
            {sub.isSubstituted ? (
              <div className={styles.tileNameSubstituted}>
                <span className={styles.tileNameOriginal}>
                  {(cleanTileLabel(mr.movement.name) || stripWeightFromName(mr.movement.name) || mr.movement.name).toUpperCase()}
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
          <AiAlternativeToggle mr={mr} onChange={(patch) => onChange(globalIndex, patch)} />

          {/* Input: arcade stepper or nothing for prescribed-reps display movements */}
          {mr.kind === 'load' && !isSharedWeight && (
            <WeightField
              mr={mr}
              onChange={(patch) => handleWeightChange(globalIndex, mr, patch.weight)}
              onCenterPress={() => openTile(mr.movementKey)}
              active={activeTileId === mr.movementKey}
            />
          )}
          {mr.kind === 'distance' && (
            <DistanceField
              mr={mr}
              onChange={(patch) => onChange(globalIndex, patch)}
              onCenterPress={() => openTile(mr.movementKey)}
              active={activeTileId === mr.movementKey}
            />
          )}
          {/* MAX bodyweight: no prescribed quantity → let user log their score */}
          {getTileConfig(mr)?.field === 'reps' && (
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
    const currentWeight = base?.weight ?? getDefaultMetconWeight(base) ?? getFallbackWeight(focusedLoadGroup.type);
    const rx = getRxWeight(base);
    const step = getLegalWeightStep(base);
    const caption = focusedLoadGroup.movements.map(getMovementCaptionName).join(' · ');
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
              const value = mr.weight ?? getDefaultMetconWeight(mr) ?? getFallbackWeight(focusedLoadGroup.type);
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
            onDoubleClick={() => nudgeShared(-1, 2)}
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
            onDoubleClick={() => nudgeShared(1, 2)}
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

        {alternateMovements.length > 0 && (
          <div className={styles.inlineAlternateList}>
            {alternateMovements.map((mr) => {
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
                      {cleanTileLabel(isActive ? sub.displayName : mr.movement.name)}
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
  const visibleMovements = movements.filter(mr => movementHasInput(mr) || movementHasAlternate(mr));
  const visibleSectionGroups = groupBySections(visibleMovements);
  const focusedLoadStep = renderFocusedLoadStep();

  return (
    <>
      {focusedLoadStep ?? (visibleSectionGroups ? (
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
      ) : (
        <div className={styles.multiRow}>
          {visibleMovements.map(renderMovField)}
        </div>
      ))}

      {/* Substitution sheet — single instance, driven by swapOpenKey */}
      {swapMr && (
        <SubstitutionSheet
          open={swapOpenKey != null}
          originalName={swapMr.movement.name}
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
  const unitLabel = mr.implementCount === 2 ? '2× kg' : 'kg';
  const step = getWeightStep(mr.movement.name, mr.implementCount);

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
}: {
  mr: MovementResult;
  onChange: (p: Partial<MovementResult>) => void;
  onCenterPress: () => void;
  active: boolean;
}) {
  // Cardio machines (bike, row, ski) measure in calories when AI didn't prescribe distance.
  const isCardioMachine = /\b(bike|row|ski)\b/i.test(mr.movement.name);
  const isCal = mr.movement.inputType === 'calories'
    || (mr.movement.calories != null && mr.movement.calories > 0)
    || (isCardioMachine && !mr.movement.distance && mr.movement.inputType !== 'distance');
  const unit = isCal ? 'cal' : (mr.distanceUnit ?? mr.movement.unit ?? 'm');
  const value = isCal ? mr.calories : mr.distance;
  const placeholder = isCal
    ? (mr.movement.calories ? String(mr.movement.calories) : '0')
    : (mr.movement.distance ? String(mr.movement.distance) : '0');
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
