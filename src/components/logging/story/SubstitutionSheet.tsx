import { useCallback, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  getExerciseAlternatives,
  findExerciseDefinition,
  type ExerciseAlternative,
} from '../../../data/exerciseDefinitions';
import type { MovementSubstitution } from '../../../types';
import styles from './SubstitutionSheet.module.css';

// ─── Types ───────────────────────────────────────────────────────

interface SubstitutionSheetProps {
  open: boolean;
  /** The movement name from the parsed workout (the original Rx movement) */
  originalName: string;
  /** Original prescribed reps/distance/calories (for conversion preview) */
  originalReps?: number;
  originalDistance?: number;
  originalCalories?: number;
  /** Currently active substitution, if any */
  currentSubstitution?: MovementSubstitution | null;
  /** AI-detected alternative from ParsedMovement.alternative, if present */
  aiAlternative?: { name: string; reps?: number; distance?: number; calories?: number } | null;
  onSelect: (substitution: MovementSubstitution | null) => void;
  onClose: () => void;
}

// ─── Section label ───────────────────────────────────────────────

function SectionDivider({ label }: { label: string }) {
  return (
    <div className={styles.sectionDivider}>
      <span className={styles.sectionDividerLine} />
      <span className={styles.sectionDividerLabel}>{label}</span>
      <span className={styles.sectionDividerLine} />
    </div>
  );
}

// ─── Multiplier label ────────────────────────────────────────────

function multiplierLabel(alt: ExerciseAlternative): string | null {
  const m = alt.ratio ?? alt.distanceMultiplier;
  if (m == null || m === 1) return null;
  // Format: ×3, ×1.25, ×0.5
  return `×${Number.isInteger(m) ? m : m.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}`;
}

// ─── Compute default adjusted value ─────────────────────────────

function computeAdjustedValue(
  alt: ExerciseAlternative,
  originalReps?: number,
  originalDistance?: number,
  originalCalories?: number,
): number | undefined {
  if (alt.ratio && alt.ratio !== 1) {
    const base = originalReps ?? originalCalories;
    if (base != null && base > 0) {
      return Math.round(base * alt.ratio);
    }
  }
  if (alt.distanceMultiplier && alt.distanceMultiplier !== 1) {
    if (originalDistance != null && originalDistance > 0) {
      return Math.round(originalDistance * alt.distanceMultiplier);
    }
    if (originalCalories != null && originalCalories > 0) {
      return Math.round(originalCalories * alt.distanceMultiplier);
    }
  }
  return undefined;
}

// ─── Conversion hint string ─────────────────────────────────────
// Read-only preview: "40 → 120" so the user knows what to expect

function conversionHint(
  alt: ExerciseAlternative,
  originalReps?: number,
  originalDistance?: number,
  originalCalories?: number,
): string | null {
  const adjusted = computeAdjustedValue(alt, originalReps, originalDistance, originalCalories);
  if (adjusted == null) return null;

  const original = originalReps ?? originalDistance ?? originalCalories;
  if (original == null) return null;

  // Format distance nicely
  const isDistance = (originalDistance != null && originalDistance > 0);
  const fmtVal = (v: number) => {
    if (!isDistance) return `${v}`;
    return v >= 1000 ? `${(v / 1000).toFixed(1)}km` : `${v}m`;
  };

  return `${fmtVal(original)} → ${fmtVal(adjusted)}`;
}

// ─── Pure picker option row ─────────────────────────────────────

interface OptionRowProps {
  name: string;
  isSelected: boolean;
  multiplier?: string | null;
  hint?: string | null;
  onTap: () => void;
}

function OptionRow({ name, isSelected, multiplier, hint, onTap }: OptionRowProps) {
  return (
    <motion.div
      className={`${styles.optionRow} ${isSelected ? styles.optionRowSelected : ''}`}
      onClick={onTap}
      whileTap={isSelected ? undefined : { scale: 0.97 }}
      transition={{ duration: 0.12, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className={styles.optionContent}>
        <div className={styles.optionMain}>
          <div className={styles.optionLeft}>
            <span className={styles.optionName}>
              {name}
              {multiplier && <span className={styles.multiplierLabel}>{multiplier}</span>}
            </span>
            {hint && <span className={styles.optionConversion}>{hint}</span>}
          </div>

          <div className={styles.optionRight}>
            <span className={`${styles.optionCheck} ${isSelected ? styles.optionCheckVisible : ''}`}>
              ✓
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Pending selection ──────────────────────────────────────────

interface PendingSelection {
  name: string;
  type: 'easier' | 'equivalent' | 'harder';
  adjustedValue?: number;
  ratio?: number;
  distanceMultiplier?: number;
  isAi?: boolean;
  targetUnit?: 'reps' | 'distance' | 'calories' | 'time';
}

// ─── Main component ──────────────────────────────────────────────

export function SubstitutionSheet({
  open,
  originalName,
  originalReps,
  originalDistance,
  originalCalories,
  currentSubstitution,
  aiAlternative,
  onSelect,
  onClose,
}: SubstitutionSheetProps) {
  const alternatives = useMemo(() => getExerciseAlternatives(originalName), [originalName]);

  // Group by type for sectioned display
  const easier = useMemo(() => alternatives.filter(a => a.type === 'easier'), [alternatives]);
  const equivalent = useMemo(() => alternatives.filter(a => a.type === 'equivalent'), [alternatives]);
  const harder = useMemo(() => alternatives.filter(a => a.type === 'harder'), [alternatives]);

  const [pending, setPending] = useState<PendingSelection | null>(null);

  // The original rep/distance/calorie value (whichever is relevant)
  const originalValue = originalReps ?? originalDistance ?? originalCalories;

  // Determine the origin unit
  const originUnit: 'distance' | 'calories' | 'reps' =
    originalDistance != null && originalDistance > 0 ? 'distance'
    : originalCalories != null && originalCalories > 0 ? 'calories'
    : 'reps';

  // Resolve the target movement's preferred unit — may differ from origin
  // e.g., Run (distance) → Echo Bike (calories)
  const resolveTargetUnit = useCallback((targetName: string): 'reps' | 'distance' | 'calories' | 'time' => {
    const def = findExerciseDefinition(targetName);
    return def?.defaultUnit ?? originUnit;
  }, [originUnit]);

  // Unit label for the stepper — driven by target, not origin
  const unitLabel = (unit: string | undefined) => {
    if (unit === 'distance') return 'm';
    if (unit === 'calories') return 'cal';
    if (unit === 'time') return 's';
    return 'reps';
  };

  // Smart step: scale-aware increments
  const getAdjustStep = (targetUnit?: string) => {
    // Cross-unit swap (e.g., distance→calories): step by 1 since the numbers are different scale
    if (targetUnit && targetUnit !== originUnit) return 1;
    // Distance: step by 50m (or 100m for large values)
    if (targetUnit === 'distance' || originUnit === 'distance') {
      const val = pending?.adjustedValue ?? originalValue ?? 0;
      return val >= 500 ? 100 : 50;
    }
    // Calories: step by 5
    if (targetUnit === 'calories' || originUnit === 'calories') return 5;
    // Reps: step by the original rep count (for multiplied conversions)
    return originalValue && originalValue > 1 ? originalValue : 5;
  };

  const isOriginalSelected = pending == null && currentSubstitution == null;
  const isPendingName = (name: string) =>
    pending?.name?.toLowerCase() === name.toLowerCase();

  // Select an alternative from the definition list — opens inline stepper
  const handleSelect = useCallback((alt: ExerciseAlternative) => {
    // If this option is already selected, don't reset the user's adjusted value
    if (pending?.name?.toLowerCase() === alt.name.toLowerCase()) return;

    let tUnit = resolveTargetUnit(alt.name);
    const adjusted = computeAdjustedValue(alt, originalReps, originalDistance, originalCalories);

    // When distanceMultiplier is used with a distance origin, keep target as distance
    // regardless of the target movement's defaultUnit. The multiplier explicitly means
    // "multiply the distance" (e.g., 200m run × 3 = 600m echo bike).
    if (alt.distanceMultiplier && originUnit === 'distance') {
      tUnit = 'distance';
    }

    // If target uses a different unit and no multiplier applies, don't auto-fill a misleading number
    const crossUnit = tUnit !== originUnit;
    const defaultValue = crossUnit && adjusted == null ? undefined : (adjusted ?? originalValue);

    setPending({
      name: alt.name,
      type: alt.type,
      adjustedValue: defaultValue,
      ratio: alt.ratio,
      distanceMultiplier: alt.distanceMultiplier,
      targetUnit: tUnit,
    });
  }, [pending, originalReps, originalDistance, originalCalories, originalValue, originUnit, resolveTargetUnit]);

  // Select the AI alternative — opens inline stepper
  const handleSelectAi = useCallback(() => {
    if (!aiAlternative) return;
    // If already selected, don't reset the user's adjusted value
    if (pending?.name?.toLowerCase() === aiAlternative.name.toLowerCase()) return;
    const tUnit = resolveTargetUnit(aiAlternative.name);
    const aiValue = aiAlternative.reps ?? aiAlternative.distance ?? aiAlternative.calories;
    setPending({
      name: aiAlternative.name,
      type: 'easier',
      adjustedValue: aiValue ?? originalValue,
      isAi: true,
      targetUnit: tUnit,
    });
  }, [aiAlternative, originalValue, resolveTargetUnit]);

  // Rx: instant close, clear substitution
  const handleSelectOriginal = useCallback(() => {
    setPending(null);
    onSelect(null);
    onClose();
  }, [onSelect, onClose]);

  // Confirm the pending selection
  const handleConfirm = useCallback(() => {
    if (!pending) return;
    const sub: MovementSubstitution = {
      originalName,
      selectedName: pending.name,
      substitutionType: pending.type,
      distanceMultiplier: pending.distanceMultiplier,
      repMultiplier: pending.ratio,
      originalValue,
      adjustedValue: pending.adjustedValue,
      targetUnit: pending.targetUnit,
    };
    onSelect(sub);
    setPending(null);
    onClose();
  }, [pending, originalName, originalValue, onSelect, onClose]);

  // Update adjusted value from stepper
  const handleAdjust = useCallback((v: number | undefined) => {
    setPending(prev => prev ? { ...prev, adjustedValue: v ?? 0 } : null);
  }, []);

  // Reset pending when sheet closes
  const handleClose = useCallback(() => {
    setPending(null);
    onClose();
  }, [onClose]);

  // Check if AI alternative is in the alternatives list already (avoid duplicate)
  const aiAltIsKnown = aiAlternative
    ? alternatives.some(a => a.name.toLowerCase() === aiAlternative.name.toLowerCase())
    : false;

  const hasAnyAlts = alternatives.length > 0 || (aiAlternative && !aiAltIsKnown);

  // AI alternative conversion hint
  const aiHint = useMemo(() => {
    if (!aiAlternative) return null;
    const aiValue = aiAlternative.reps ?? aiAlternative.distance ?? aiAlternative.calories;
    const original = originalReps ?? originalDistance ?? originalCalories;
    if (aiValue == null || original == null || aiValue === original) return null;
    return `${original} → ${aiValue}`;
  }, [aiAlternative, originalReps, originalDistance, originalCalories]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className={styles.backdrop}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={handleClose}
        >
          <motion.div
            className={styles.sheet}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle */}
            <div className={styles.handle} />

            {/* Header */}
            <div className={styles.header}>
              <div className={styles.headerLeft}>
                <span className={styles.headerLabel}>SCALING</span>
                <h3 className={styles.headerTitle}>{originalName}</h3>
              </div>
              <button
                type="button"
                className={styles.closeBtn}
                onClick={handleClose}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {/* Body */}
            <div className={styles.body}>
              {/* Rx (original) option — always first */}
              <motion.button
                type="button"
                className={`${styles.optionRow} ${styles.optionRowRx} ${isOriginalSelected ? styles.optionRowSelected : ''}`}
                onClick={handleSelectOriginal}
                whileTap={{ scale: 0.97 }}
                transition={{ duration: 0.12, ease: [0.16, 1, 0.3, 1] }}
              >
                <div className={styles.optionContent}>
                  <div className={styles.optionMain}>
                    <div className={styles.optionLeft}>
                      <span className={styles.optionName}>{originalName}</span>
                      <span className={styles.optionConversion}>as prescribed</span>
                    </div>
                    <div className={styles.optionRight}>
                      <span className={`${styles.badge} ${styles.badgeRx}`}>RX</span>
                      <span className={`${styles.optionCheck} ${isOriginalSelected ? styles.optionCheckVisible : ''}`}>
                        ✓
                      </span>
                    </div>
                  </div>
                </div>
              </motion.button>

              {/* AI-detected alternative */}
              {aiAlternative && !aiAltIsKnown && (
                <>
                  <SectionDivider label="FROM WORKOUT" />
                  <OptionRow
                    name={aiAlternative.name}
                    isSelected={isPendingName(aiAlternative.name)}
                    hint={aiHint}
                    onTap={handleSelectAi}
                  />
                </>
              )}

              {/* Easier alternatives */}
              {easier.length > 0 && (
                <>
                  <SectionDivider label="SCALED" />
                  {easier.map((alt) => (
                    <OptionRow
                      key={alt.name}
                      name={alt.name}
                      isSelected={isPendingName(alt.name)}
                      multiplier={multiplierLabel(alt)}
                      hint={conversionHint(alt, originalReps, originalDistance, originalCalories)}
                      onTap={() => handleSelect(alt)}
                    />
                  ))}
                </>
              )}

              {/* Equivalent alternatives */}
              {equivalent.length > 0 && (
                <>
                  <SectionDivider label="EQUIVALENT" />
                  {equivalent.map((alt) => (
                    <OptionRow
                      key={alt.name}
                      name={alt.name}
                      isSelected={isPendingName(alt.name)}
                      multiplier={multiplierLabel(alt)}
                      hint={conversionHint(alt, originalReps, originalDistance, originalCalories)}
                      onTap={() => handleSelect(alt)}
                    />
                  ))}
                </>
              )}

              {/* Harder alternatives */}
              {harder.length > 0 && (
                <>
                  <SectionDivider label="RX+" />
                  {harder.map((alt) => (
                    <OptionRow
                      key={alt.name}
                      name={alt.name}
                      isSelected={isPendingName(alt.name)}
                      multiplier={multiplierLabel(alt)}
                      hint={conversionHint(alt, originalReps, originalDistance, originalCalories)}
                      onTap={() => handleSelect(alt)}
                    />
                  ))}
                </>
              )}

              {!hasAnyAlts && (
                <p className={styles.emptyHint}>
                  No alternatives on file for this movement.
                </p>
              )}
            </div>

            {/* Bottom bar: stepper + Done — only when a substitution is pending */}
            {pending && (
              <motion.div
                className={styles.doneBar}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              >
                {/* Value adjuster — shows selected name + stepper */}
                {pending.adjustedValue != null && (
                  <div className={styles.bottomAdjust}>
                    <span className={styles.bottomAdjustLabel}>
                      {pending.name}
                      {originalValue != null && (
                        <span className={styles.bottomAdjustHint}>
                          {' '}{originalValue} → {pending.adjustedValue}
                        </span>
                      )}
                    </span>
                    <div className={styles.inlineStepper}>
                      <button
                        type="button"
                        className={styles.inlineBtn}
                        onClick={() => handleAdjust(Math.max(1, (pending.adjustedValue ?? 0) - getAdjustStep(pending.targetUnit)))}
                      >−</button>
                      <div className={styles.inlineValueArea}>
                        <input
                          type="number"
                          inputMode="numeric"
                          className={styles.inlineInput}
                          value={pending.adjustedValue != null ? String(pending.adjustedValue) : ''}
                          placeholder="0"
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => {
                            const raw = e.target.value;
                            if (raw === '') { handleAdjust(undefined); return; }
                            const num = parseInt(raw, 10);
                            if (!isNaN(num) && num >= 0) handleAdjust(num);
                          }}
                        />
                        <span className={styles.inlineUnit}>{unitLabel(pending.targetUnit)}</span>
                      </div>
                      <button
                        type="button"
                        className={styles.inlineBtn}
                        onClick={() => handleAdjust((pending.adjustedValue ?? 0) + getAdjustStep(pending.targetUnit))}
                      >+</button>
                    </div>
                  </div>
                )}
                <motion.button
                  type="button"
                  className={styles.doneBtn}
                  onClick={handleConfirm}
                  whileTap={{ scale: 0.97 }}
                >
                  Done
                </motion.button>
              </motion.div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
