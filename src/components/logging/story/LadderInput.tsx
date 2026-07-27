import { useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { StoryExerciseResult } from './types';
import { PartialRoundChecklist, type PartialRow } from './PartialRoundChecklist';
import styles from './LadderInput.module.css';

interface LadderInputProps {
  result: StoryExerciseResult;
  onChange: (patch: Partial<StoryExerciseResult>) => void;
}

/**
 * Get the rep value for a ladder rung, extrapolating beyond the prescribed array.
 * E.g., ladderReps=[4,6,8,10,12], rungIdx=5 → step=2 → 14.
 */
function getRungValue(ladderReps: number[], rungIdx: number): number {
  if (rungIdx < ladderReps.length) return ladderReps[rungIdx];
  const step = ladderReps.length >= 2
    ? ladderReps[ladderReps.length - 1] - ladderReps[ladderReps.length - 2]
    : 2;
  return ladderReps[ladderReps.length - 1] + step * (rungIdx - ladderReps.length + 1);
}

/**
 * LadderInput — single continuous ladder.
 * Athlete taps the last rung they *fully* completed. The ladder extends beyond
 * the prescribed values for athletes who go further. A partial climb into the
 * next rung is captured with the shared "which moves did you finish?" checklist
 * (each per-round movement did that rung's rep count) — never a raw rep number
 * assumed uniform across every movement.
 */
export function LadderInput({ result, onChange }: LadderInputProps) {
  const ladderReps = result.exercise.ladderReps!;
  const step = result.ladderStep ?? 0;

  // Only the laddered (per-round) movements climb; fixed "after each round"
  // work (e.g. burpees, double-unders marked perRound: false) is counted by
  // round elsewhere and isn't part of the ladder total or the partial checklist.
  const laddered = useMemo(
    () => (result.exercise.movements ?? []).filter(m => m.perRound !== false),
    [result.exercise.movements],
  );
  const movementCount = laddered.length || 1;

  // The rung the athlete is currently climbing into (next incomplete one).
  const nextRungVal = getRungValue(ladderReps, step);

  // Show extra rungs beyond prescribed if athlete is fast.
  const EXTRA_RUNGS = 3;
  const visibleRungs = Math.max(ladderReps.length, step + 1) + EXTRA_RUNGS;

  // One row per laddered movement; finishing it adds this rung's rep count.
  const partialRows = useMemo<PartialRow[]>(
    () => laddered.map(m => ({
      name: m.name,
      quantityLabel: `${nextRungVal} reps`,
      reps: nextRungVal,
    })),
    [laddered, nextRungVal],
  );

  const checkedNames = result.partialMovements ?? [];
  const checkedCount = partialRows.filter(r => checkedNames.includes(r.name)).length;
  // Live partial total: each checked movement did the next rung's reps. Restored
  // legacy docs carry partialReps without names — fall back to that.
  const partialTotal = checkedCount > 0 ? checkedCount * nextRungVal : (result.partialReps ?? 0);

  // Full rungs completed, summed per movement then across the laddered movements.
  const fullPerMovement = useMemo(() => {
    let sum = 0;
    for (let j = 0; j < step; j++) sum += getRungValue(ladderReps, j);
    return sum;
  }, [ladderReps, step]);
  const totalReps = fullPerMovement * movementCount + partialTotal;

  const handleStepTap = useCallback((rungIdx: number) => {
    // Tapping the current top rung deselects it. Moving the rung invalidates any
    // partial marks (they were "into" the old next rung), so clear them.
    const newStep = step === rungIdx + 1 ? rungIdx : rungIdx + 1;
    onChange({ ladderStep: newStep, partialMovements: undefined, partialReps: undefined });
  }, [step, onChange]);

  const togglePartial = useCallback((name: string) => {
    const next = new Set(result.partialMovements ?? []);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    const names = laddered.filter(m => next.has(m.name)).map(m => m.name);
    onChange({
      partialMovements: names.length > 0 ? names : undefined,
      partialReps: names.length > 0 ? names.length * nextRungVal : undefined,
    });
  }, [result.partialMovements, laddered, nextRungVal, onChange]);

  const legacyReps = checkedCount === 0 ? (result.partialReps ?? 0) : 0;

  return (
    <div className={styles.container}>
      {/* Live total reps */}
      <div className={styles.totalRow}>
        <AnimatePresence mode="popLayout">
          <motion.span
            key={totalReps}
            className={styles.totalNumber}
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -12, opacity: 0 }}
            transition={{ duration: 0.12 }}
          >
            {totalReps}
          </motion.span>
        </AnimatePresence>
        <span className={styles.totalLabel}>total reps</span>
      </div>

      {/* Headline: "Completed through the 10s · into the 12s" */}
      {step > 0 && (
        <motion.div
          className={styles.headline}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          Completed through the {getRungValue(ladderReps, step - 1)}s
          {(checkedCount > 0 || legacyReps > 0) && ` · into the ${nextRungVal}s`}
        </motion.div>
      )}

      {/* Step track: tap the last completed rung */}
      <div className={styles.stepTrack}>
        {Array.from({ length: visibleRungs }).map((_, rungIdx) => {
          const rungVal = getRungValue(ladderReps, rungIdx);
          const isCompleted = rungIdx < step;
          const isCurrent = rungIdx === step - 1;
          const isExtrapolated = rungIdx >= ladderReps.length;
          return (
            <motion.button
              key={rungIdx}
              type="button"
              className={`${styles.stepBtn} ${isCompleted ? styles.stepBtnActive : ''} ${isCurrent ? styles.stepBtnCurrent : ''} ${isExtrapolated ? styles.stepBtnExtra : ''}`}
              onClick={() => handleStepTap(rungIdx)}
              whileTap={{ scale: 0.93 }}
              layout
            >
              <span className={styles.stepValue}>{rungVal}</span>
            </motion.button>
          );
        })}
      </div>

      {/* Partial climb into the next rung — same checklist as AMRAP rounds */}
      <PartialRoundChecklist
        rows={partialRows}
        checkedNames={checkedNames}
        onToggle={togglePartial}
        legacyReps={legacyReps}
        title={`Into the ${nextRungVal}s — which moves did you finish?`}
      />
    </div>
  );
}
