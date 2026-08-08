import { useCallback, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { StoryExerciseResult } from './types';
import { getMaxRepsMovement, prescribesUnbrokenMax } from './types';
import { StepperInput } from './StepperInput';
import { CustomNumpadSheet } from './CustomNumpadSheet';
import styles from './RepsSetsInput.module.css';

/** Design system v1.0: yellow is the only accent. */
const ACCENT = '#f5c200';
const MAX_REPS_DIGITS = 3;

interface RepsSetsInputProps {
  result: StoryExerciseResult;
  onChange: (patch: Partial<StoryExerciseResult>) => void;
  /** Most recent logged max per movement (lowercased name) — shown as context, never a value. */
  lastMaxReps?: Record<string, number>;
}

export function RepsSetsInput({ result, onChange, lastMaxReps }: RepsSetsInputProps) {
  const total = result.setsTotal;
  // A practice block whose board asks for a max-effort test carries one number worth keeping —
  // the max itself. Everything else about the block is "did the sets", which the toggle covers.
  const maxMovement = useMemo(() => getMaxRepsMovement(result.exercise), [result.exercise]);
  const lastMax = maxMovement
    ? lastMaxReps?.[maxMovement.name.trim().toLowerCase()]
    : undefined;
  // undefined setsCompleted = all done (the happy path)
  const allCompleted = result.setsCompleted == null;
  const completed = result.setsCompleted ?? total;

  const toggleAllCompleted = useCallback(() => {
    if (allCompleted) {
      // Switch to partial: start with total - 1
      onChange({ setsCompleted: Math.max(0, total - 1) });
    } else {
      // Back to all completed
      onChange({ setsCompleted: undefined });
    }
  }, [allCompleted, total, onChange]);

  const adjustSets = useCallback((delta: number) => {
    const next = Math.max(0, Math.min(total, completed + delta));
    onChange({ setsCompleted: next });
  }, [completed, total, onChange]);

  // Typing stays available alongside +/−: stepping from "last time" is the fast path, but an
  // athlete whose max jumped has no business tapping twenty times to say so.
  const [numpadOpen, setNumpadOpen] = useState(false);
  const [numpadDraft, setNumpadDraft] = useState('');

  const setMaxReps = useCallback((v: number | undefined) => {
    onChange({ maxReps: v != null ? Math.max(0, Math.round(v)) : undefined });
  }, [onChange]);

  const openNumpad = useCallback(() => {
    setNumpadDraft(result.maxReps != null ? String(result.maxReps) : '');
    setNumpadOpen(true);
  }, [result.maxReps]);

  const commitDraft = useCallback((next: string) => {
    setNumpadDraft(next);
    setMaxReps(next === '' ? undefined : Number(next));
  }, [setMaxReps]);

  // When the block has a max test, THAT is its result — so the sets confirmation stops being the
  // headline. The ✅ panel is dropped (the logged max already says the work happened) and the
  // toggle only appears when there is more than one set to account for. A one-set practice is
  // then a single card that fits the screen: the design system's "let the card hug its content"
  // instead of a fixed stack of three blocks the athlete has to scroll past for one number.
  const showSetsSection = !maxMovement || total > 1;
  const showConfirmedPanel = !maxMovement;

  return (
    <div className={styles.container}>
      {/* Max-effort test — the one number this practice actually scores */}
      {maxMovement && (
        <div className={styles.maxBlock}>
          <span className={styles.maxLabel}>
            {prescribesUnbrokenMax(result.exercise) ? 'MAX UNBROKEN' : 'MAX SET'}
          </span>
          <StepperInput
            value={result.maxReps}
            onChange={setMaxReps}
            step={1}
            min={0}
            max={200}
            // Always starts empty — never seeded from, or stepping up from, last session's max.
            // A greyed "18" borrowed from history reads as an entered value, so an athlete who
            // never touched the field walked away believing the number was logged (it wasn't:
            // nothing is committed until they tap, so the block earned no poster page). Last
            // time stays visible as the hint below, where it informs without pretending to be
            // this session's result.
            unit="reps"
            inputMode="numeric"
            size="arcade"
            emphasis="hero"
            color={ACCENT}
            onCenterPress={openNumpad}
            active={numpadOpen}
          />
          <span className={styles.maxHint}>
            {lastMax != null ? `Last time ${lastMax}` : 'Your best unbroken set'}
          </span>
        </div>
      )}

      {showSetsSection && (
        <div
          className={`${styles.toggleRow} ${allCompleted ? styles.toggleRowOn : ''}`}
          onClick={toggleAllCompleted}
          role="switch"
          aria-checked={allCompleted}
        >
          <span className={styles.toggleLabel}>
            All {total} sets completed
          </span>
          <div className={`${styles.toggleSwitch} ${allCompleted ? styles.toggleOn : styles.toggleOff}`}>
            <div className={`${styles.toggleKnob} ${allCompleted ? styles.toggleKnobOn : styles.toggleKnobOff}`} />
          </div>
        </div>
      )}

      {/* Content based on toggle state */}
      <AnimatePresence mode="wait">
        {!showSetsSection ? null : allCompleted ? (
          showConfirmedPanel ? (
          <motion.div
            key="complete"
            className={styles.confirmedDisplay}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15 }}
          >
            <span className={styles.confirmedEmoji}>✅</span>
            <span className={styles.confirmedText}>{total}/{total} sets</span>
            <span className={styles.confirmedHint}>
              {result.exercise.suggestedReps
                ? `${result.exercise.suggestedReps} reps each`
                : 'As prescribed'}
            </span>
          </motion.div>
          ) : null
        ) : (
          <motion.div
            key="partial"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-4)' }}
          >
            <div className={styles.setsStepperRow}>
              <button
                type="button"
                className={styles.setsStepperBtn}
                onClick={() => adjustSets(-1)}
              >
                −
              </button>

              <div className={styles.setsDisplay}>
                <AnimatePresence mode="popLayout">
                  <motion.span
                    key={completed}
                    className={styles.setsNumber}
                    initial={{ y: 12, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -12, opacity: 0 }}
                    transition={{ duration: 0.12 }}
                  >
                    {completed}
                  </motion.span>
                </AnimatePresence>
                <div className={styles.setsTotal}>/ {total} sets</div>
              </div>

              <button
                type="button"
                className={styles.setsStepperBtn}
                onClick={() => adjustSets(1)}
              >
                +
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {maxMovement && (
        <CustomNumpadSheet
          open={numpadOpen}
          label={prescribesUnbrokenMax(result.exercise) ? 'Max unbroken' : 'Max set'}
          value={numpadDraft}
          unit="reps"
          accentColor={ACCENT}
          onDigit={(d) => commitDraft((numpadDraft + d).slice(0, MAX_REPS_DIGITS))}
          onBackspace={() => commitDraft(numpadDraft.slice(0, -1))}
          onNext={() => setNumpadOpen(false)}
          onClose={() => setNumpadOpen(false)}
        />
      )}
    </div>
  );
}
