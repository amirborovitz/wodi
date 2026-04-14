import { useCallback, useRef, useState } from 'react';
import type { MovementResult } from './types';
import type { ParsedSectionType } from '../../../types';
import { kindToTrinityColor, getWeightStep } from './types';
import { StepperInput } from './StepperInput';
import { SubstitutionSheet } from './SubstitutionSheet';
import { hasAlternatives, findExerciseDefinition } from '../../../data/exerciseDefinitions';
import type { MovementSubstitution } from '../../../types';
import styles from './ScoreMovementInputs.module.css';


interface ScoreMovementInputsProps {
  movements: MovementResult[];
  inputMovements: MovementResult[];
  onChange: (index: number, patch: Partial<MovementResult>) => void;
  /** Called when multiple movements need to update atomically (e.g. weight propagation). */
  onBatch?: (next: MovementResult[]) => void;
  /** Team size for partner workouts. When > 1, buy-in/cash-out movements
   *  show a "{total} {unit} total ÷{teamSize}" annotation below the movement
   *  name so the athlete knows they are logging their personal share. */
  teamSize?: number;
}

// Classify a movement by equipment type for weight propagation grouping.
// Barbell movements only propagate to other barbell movements, not KB or DB.
function getEquipmentType(name: string): 'barbell' | 'kb' | 'db' {
  const lower = name.toLowerCase();
  if (/\bkb\b|kettlebell/.test(lower)) return 'kb';
  if (/\bdb\b|dumbbell/.test(lower)) return 'db';
  return 'barbell';
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

interface PrescribedTag {
  label: string;
  colorClass: string;
}

function getPrescribedTag(mr: MovementResult): PrescribedTag | null {
  const mov = mr.movement;

  // Calories (cardio machines)
  if (mov.inputType === 'calories' || (mov.calories != null && mov.calories > 0)) {
    const val = mov.calories;
    if (val != null && val > 0) return { label: `${val} cal`, colorClass: styles.rxMagenta };
  }

  // Distance
  if (mov.distance != null && mov.distance > 0) {
    const d = mov.distance;
    const unit = mov.unit ?? 'm';
    const fmt = unit === 'km' || d >= 1000
      ? `${d >= 1000 ? (d / 1000).toFixed(1) : d}${unit === 'km' || d >= 1000 ? 'km' : unit}`
      : `${d}${unit}`;
    return { label: fmt, colorClass: styles.rxCyan };
  }

  // Reps (bodyweight / gymnastics)
  if (mov.reps != null && mov.reps > 0) {
    return { label: `${mov.reps}`, colorClass: styles.rxMagenta };
  }

  // Weight (if Rx weights prescribed but no reps/distance/cal)
  if (mov.rxWeights) {
    const w = mov.rxWeights.male ?? mov.rxWeights.female;
    if (w != null && w > 0) return { label: `${w}kg`, colorClass: styles.rxYellow };
  }

  return null;
}

// ─── Movement name block ──────────────────────────────────────────
// Renders the movement name, sub badge, partner annotation, AI toggle,
// and the swap icon affordance when alternatives exist.

interface MovNameProps {
  mr: MovementResult;
  teamSize?: number;
  onSwapTap: () => void;
  onChange: (patch: Partial<MovementResult>) => void;
}

function MovName({ mr, teamSize, onSwapTap, onChange }: MovNameProps) {
  const annotation = teamSize != null ? partnerAnnotation(mr, teamSize) : null;
  const sub = getSubState(mr);
  const hasAlts = hasAlternatives(mr.movement.name) || !!mr.movement.alternative;
  const rxTag = getPrescribedTag(mr);

  return (
    <div className={styles.movNameBlock}>
      {/* Name row: entire area tappable to open substitution sheet */}
      <div
        className={`${styles.movNameRow} ${hasAlts ? styles.movNameRowTappable : ''}`}
        onClick={hasAlts ? onSwapTap : undefined}
        role={hasAlts ? 'button' : undefined}
        tabIndex={hasAlts ? 0 : undefined}
      >
        {/* Prescribed value tag (reps / distance / calories) */}
        {rxTag && (
          <span className={`${styles.rxTag} ${rxTag.colorClass}`}>{rxTag.label}</span>
        )}

        {sub.isSubstituted ? (
          <div className={styles.movNameSubstituted}>
            {/* Original name struck through */}
            <span className={styles.movNameOriginal}>{stripWeightFromName(mr.movement.name)}</span>
            {/* Selected alternative */}
            <span className={styles.movNameSelected}>{stripWeightFromName(sub.displayName)}</span>
          </div>
        ) : (
          <span className={styles.movName}>{stripWeightFromName(mr.movement.name)}</span>
        )}

        {/* Scaling badge — show conversion when available, type label as fallback */}
        {sub.badgeType && (
          <span className={`${styles.subBadge} ${styles[`subBadge_${sub.badgeType}`]}`}>
            {sub.badgeType === 'scaled' ? 'SCALED' : sub.badgeType === 'rx-plus' ? 'RX+' : 'SWAP'}
          </span>
        )}

        {/* Swap icon — shown when alternatives exist */}
        {hasAlts && (
          <span className={styles.swapBtn} aria-hidden="true">
            <SwapIcon />
          </span>
        )}
      </div>

      {/* Conversion note: "400m → 1200m" */}
      {sub.conversionNote && (
        <span className={styles.conversionNote}>{sub.conversionNote}</span>
      )}

      {/* AI quick-toggle chip */}
      <AiAlternativeToggle mr={mr} onChange={onChange} />

      {/* Partner annotation */}
      {annotation && (
        <span className={styles.partnerAnnotation}>{annotation}</span>
      )}
    </div>
  );
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
export function ScoreMovementInputs({ movements, inputMovements: _inputMovements, onChange, onBatch, teamSize }: ScoreMovementInputsProps) {
  // Track which movements the user has manually edited weight on.
  // First weight edit propagates to all same-equipment load movements that haven't been touched.
  const manuallyEditedRef = useRef<Set<string>>(new Set());

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

  // Which movement key has the substitution sheet open
  const [swapOpenKey, setSwapOpenKey] = useState<string | null>(null);

  const openSwap = (key: string) => setSwapOpenKey(key);
  const closeSwap = () => setSwapOpenKey(null);

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
          }
          // reps/time: no special field to set
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

    onChange(globalIndex, patch);
    closeSwap();
  };

  // Render a single movField row
  const renderMovField = (mr: MovementResult) => {
    const globalIndex = movements.indexOf(mr);
    return (
      <div key={mr.movementKey}>
        {mr.movement.stationLabel && (
          <div className={styles.stationDivider}>
            <span className={styles.stationLabel}>{mr.movement.stationLabel}</span>
            <span className={styles.sectionLine} />
          </div>
        )}
        <div className={styles.movField}>
          <MovName
            mr={mr}
            teamSize={teamSize}
            onSwapTap={() => openSwap(mr.movementKey)}
            onChange={(patch) => onChange(globalIndex, patch)}
          />
          {mr.kind === 'load' && (
            <WeightField mr={mr} onChange={(patch) => handleWeightChange(globalIndex, mr, patch.weight)} />
          )}
          {mr.kind === 'distance' && (
            <DistanceField mr={mr} onChange={(patch) => onChange(globalIndex, patch)} />
          )}
          {/* MAX bodyweight: no prescribed quantity of any kind → let user log their score.
              Guard is strict: distance or calories present means display-only (e.g. 400m Run, 7 cal Bike). */}
          {mr.kind === 'reps'
            && mr.movement.reps == null
            && mr.movement.distance == null
            && mr.movement.calories == null && (
            <RepsField mr={mr} onChange={(patch) => onChange(globalIndex, patch)} />
          )}
        </div>
      </div>
    );
  };

  // Show ALL movements so users can see swap affordances on every movement,
  // not just the ones that need weight/distance input.
  // Try section grouping on all movements first
  const sectionGroups = groupBySections(movements);

  return (
    <>
      {sectionGroups ? (
        <div className={styles.multiRow}>
          {sectionGroups.map((group) => (
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
          {movements.map(renderMovField)}
        </div>
      )}

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
    </>
  );
}

function WeightField({ mr, onChange }: { mr: MovementResult; onChange: (p: Partial<MovementResult>) => void }) {
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
      color={kindToTrinityColor('load')}
      inputMode="decimal"
      size="sm"
    />
  );
}

function DistanceField({ mr, onChange }: { mr: MovementResult; onChange: (p: Partial<MovementResult>) => void }) {
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
      color={kindToTrinityColor('distance')}
      inputMode="decimal"
      size="sm"
    />
  );
}

function RepsField({ mr, onChange }: { mr: MovementResult; onChange: (p: Partial<MovementResult>) => void }) {
  return (
    <StepperInput
      value={mr.reps}
      onChange={(v) => onChange({ reps: v != null ? Math.max(0, v) : undefined })}
      step={1}
      min={0}
      placeholder="0"
      unit="reps"
      color={kindToTrinityColor('reps')}
      inputMode="numeric"
      size="sm"
    />
  );
}
