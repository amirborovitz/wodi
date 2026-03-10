import { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { StoryExerciseResult } from './types';
import styles from './ScoreInputs.module.css';

// ═══════════════════════════════════════════════════════════════════
// ScoreTimeInput — mm:ss completion time
// ═══════════════════════════════════════════════════════════════════

interface ScoreTimeInputProps {
  result: StoryExerciseResult;
  onChange: (patch: Partial<StoryExerciseResult>) => void;
}

export function ScoreTimeInput({ result, onChange }: ScoreTimeInputProps) {
  const totalSeconds = result.timeSeconds ?? 0;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const secRef = useRef<HTMLInputElement>(null);

  const setTime = useCallback((m: number, s: number) => {
    const clamped = Math.max(0, m * 60 + s);
    onChange({ timeSeconds: clamped });
  }, [onChange]);

  const handleMinutesChange = useCallback((value: string) => {
    const m = parseInt(value) || 0;
    setTime(m, seconds);
  }, [seconds, setTime]);

  const handleSecondsChange = useCallback((value: string) => {
    const s = Math.min(59, parseInt(value) || 0);
    setTime(minutes, s);
  }, [minutes, setTime]);

  return (
    <div className={styles.center}>
      <div className={styles.timeDisplay}>
        <div className={styles.timeDrum}>
          <input
            type="number"
            inputMode="numeric"
            className={styles.timeDrumInput}
            value={totalSeconds > 0 ? String(minutes) : ''}
            placeholder="00"
            onFocus={(e) => e.target.select()}
            onChange={(e) => handleMinutesChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || (e.key >= '0' && e.key <= '9' && (e.currentTarget.value.length >= 2))) {
                secRef.current?.focus();
              }
            }}
            min={0}
          />
          <span className={styles.timeDrumLabel}>min</span>
        </div>

        <span className={styles.timeSeparator}>:</span>

        <div className={styles.timeDrum}>
          <input
            ref={secRef}
            type="number"
            inputMode="numeric"
            className={styles.timeDrumInput}
            value={totalSeconds > 0 ? String(seconds).padStart(2, '0') : ''}
            placeholder="00"
            onFocus={(e) => e.target.select()}
            onChange={(e) => handleSecondsChange(e.target.value)}
            min={0}
            max={59}
          />
          <span className={styles.timeDrumLabel}>sec</span>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// ScoreRoundsInput — big tap counter + partial movement checklist
// ═══════════════════════════════════════════════════════════════════

interface ScoreRoundsInputProps {
  result: StoryExerciseResult;
  onChange: (patch: Partial<StoryExerciseResult>) => void;
}

/** Abbreviate movement names for social-ready display */
function abbreviateMovement(name: string): string {
  return name
    .replace(/^Alt(?:ernating)?\s+/i, '')
    .replace(/^Single\s+/i, '')
    .replace(/Toes[- ]to[- ]Bar/i, 'TTB')
    .replace(/Chest[- ]to[- ]Bar/i, 'C2B')
    .replace(/Handstand Push[- ]?Ups?/i, 'HSPU')
    .replace(/Pull[- ]?Ups?/i, 'Pull-Ups')
    .replace(/Push[- ]?Ups?/i, 'Push-Ups')
    .replace(/Wall[- ]?Balls?/i, 'Wall Balls')
    .replace(/Box[- ]?Jumps?/i, 'Box Jumps')
    .replace(/Muscle[- ]?Ups?/i, 'MU')
    .replace(/Double[- ]?Unders?/i, 'DU')
    .replace(/Burpees?.*$/i, 'Burpees');
}

export function ScoreRoundsInput({ result, onChange }: ScoreRoundsInputProps) {
  const rounds = result.rounds ?? 0;
  const [drawerOpen, setDrawerOpen] = useState(
    () => (result.partialMovements ?? []).length > 0
  );

  // Get the movements from the exercise prescription
  const movements = result.exercise.movements ?? [];
  const checkedMoves = result.partialMovements ?? [];


  const handleTap = useCallback(() => {
    onChange({ rounds: rounds + 1 });
  }, [rounds, onChange]);

  const adjustRounds = useCallback((delta: number) => {
    onChange({ rounds: Math.max(0, rounds + delta) });
  }, [rounds, onChange]);

  const toggleMovement = useCallback((movName: string) => {
    const current = result.partialMovements ?? [];
    let next: string[];
    if (current.includes(movName)) {
      next = current.filter(n => n !== movName);
    } else {
      next = [...current, movName];
    }

    // Derive partialReps from checked movements for legacy save compatibility
    let partialReps = 0;
    for (const mov of movements) {
      if (next.includes(mov.name)) {
        partialReps += mov.reps || mov.calories || mov.distance || 1;
      } else {
        break; // Stop at first unchecked — movements are sequential in a round
      }
    }

    onChange({
      partialMovements: next.length > 0 ? next : undefined,
      partialReps: partialReps > 0 ? partialReps : undefined,
    });
  }, [result.partialMovements, movements, onChange]);

  // Build the social headline preview
  const headlinePreview = buildPartialHeadline(rounds, checkedMoves);

  return (
    <div className={styles.center}>
      {/* Big tap zone — tap to add a round */}
      <div className={styles.tapRow}>
        <button
          type="button"
          className={styles.undoBtn}
          onClick={() => adjustRounds(-1)}
          aria-label="Remove one round"
        >
          −
        </button>

        <motion.div
          className={styles.roundsTapZone}
          onTap={handleTap}
          whileTap={{ scale: 0.95 }}
        >
          <AnimatePresence mode="popLayout">
            <motion.span
              key={rounds}
              className={styles.roundsNumber}
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -20, opacity: 0 }}
              transition={{ duration: 0.12 }}
            >
              {rounds}
            </motion.span>
          </AnimatePresence>
          <span className={styles.roundsLabel}>rounds</span>

          {/* Pulse ring animation on tap */}
          <AnimatePresence>
            {rounds > 0 && (
              <motion.div
                key={rounds}
                className={styles.pulseRing}
                initial={{ scale: 0.8, opacity: 0.6 }}
                animate={{ scale: 1.2, opacity: 0 }}
                transition={{ duration: 0.4 }}
              />
            )}
          </AnimatePresence>
        </motion.div>

        <button
          type="button"
          className={styles.undoBtn}
          onClick={() => adjustRounds(1)}
          aria-label="Add one round"
        >
          +
        </button>
      </div>

      <span className={styles.roundsTapHint}>
        Tap the circle to count each completed round
      </span>

      {/* Social headline preview */}
      {headlinePreview && (
        <motion.div
          className={styles.headlinePreview}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          {headlinePreview}
        </motion.div>
      )}

      {/* Partial movements: trigger pill + expandable drawer */}
      {movements.length > 0 && (
        <div className={styles.partialBlock}>
          {!drawerOpen ? (
            <motion.button
              type="button"
              className={styles.partialTrigger}
              onClick={() => setDrawerOpen(true)}
              whileTap={{ scale: 0.97 }}
            >
              + Add partial moves
            </motion.button>
          ) : (
            <AnimatePresence>
              <motion.div
                className={styles.partialDrawer}
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              >
                <div className={styles.drawerHeader}>
                  <span className={styles.drawerTitle}>
                    Into round {rounds + 1}
                  </span>
                  <button
                    type="button"
                    className={styles.drawerClose}
                    onClick={() => {
                      setDrawerOpen(false);
                      // Clear selections when closing
                      if (checkedMoves.length > 0) {
                        onChange({ partialMovements: undefined, partialReps: undefined });
                      }
                    }}
                  >
                    ✕
                  </button>
                </div>

                <div className={styles.movementList}>
                  {movements.map((mov) => {
                    const isChecked = checkedMoves.includes(mov.name);
                    return (
                      <motion.button
                        key={mov.name}
                        type="button"
                        className={`${styles.movementItem} ${isChecked ? styles.movementItemChecked : ''}`}
                        onClick={() => toggleMovement(mov.name)}
                        whileTap={{ scale: 0.97 }}
                      >
                        <span className={styles.movementName}>
                          {abbreviateMovement(mov.name)}
                        </span>
                        <span className={styles.movementCheck}>
                          {isChecked && (
                            <motion.span
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                              className={styles.checkMark}
                            >
                              ✓
                            </motion.span>
                          )}
                        </span>
                      </motion.button>
                    );
                  })}
                </div>
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Headline builder ────────────────────────────────────────────

function buildPartialHeadline(rounds: number, checkedMoves: string[]): string | null {
  if (rounds <= 0) return null;

  const base = `${rounds} ROUNDS`;
  if (checkedMoves.length === 0) return base;

  // Show the LAST checked movement as the partial context
  const lastMove = checkedMoves[checkedMoves.length - 1];
  const abbreviated = abbreviateMovement(lastMove).toUpperCase();
  return `${base} + ${abbreviated}`;
}
