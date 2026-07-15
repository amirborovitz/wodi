import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import type { CSSProperties } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { StoryExerciseResult, MovementResult } from './types';
import styles from './ScoreInputs.module.css';

function selectAllInput(target: HTMLInputElement) {
  requestAnimationFrame(() => {
    target.focus();
    target.setSelectionRange(0, target.value.length);
  });
}

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
  const minRef = useRef<HTMLInputElement>(null);
  const secRef = useRef<HTMLInputElement>(null);
  const activeFieldRef = useRef<'minutes' | 'seconds' | null>(null);
  const [minuteText, setMinuteText] = useState(() => (totalSeconds > 0 ? String(minutes) : ''));
  const [secondText, setSecondText] = useState(() => (totalSeconds > 0 ? String(seconds).padStart(2, '0') : ''));

  const setTime = useCallback((m: number, s: number) => {
    const nextMinutes = Math.max(0, m);
    const nextSeconds = Math.max(0, Math.min(59, s));
    const clamped = nextMinutes * 60 + nextSeconds;
    onChange({ timeSeconds: clamped });
  }, [onChange]);

  useEffect(() => {
    if (activeFieldRef.current) return;
    setMinuteText(totalSeconds > 0 ? String(minutes) : '');
    setSecondText(totalSeconds > 0 ? String(seconds).padStart(2, '0') : '');
  }, [totalSeconds, minutes, seconds]);

  const normalizeTimeFields = useCallback((currentMins: string, currentSecs: string) => {
    const parsedMinutes = parseInt(currentMins.replace(/\D/g, '') || '0', 10) || 0;
    const parsedSeconds = Math.min(59, parseInt(currentSecs.replace(/\D/g, '') || '0', 10) || 0);
    const hasAnyTime = parsedMinutes > 0 || parsedSeconds > 0;
    setMinuteText(hasAnyTime ? String(parsedMinutes).padStart(2, '0') : '');
    setSecondText(hasAnyTime ? String(parsedSeconds).padStart(2, '0') : '');
  }, []);

  const handleMinutesChange = useCallback((value: string) => {
    const digits = value.replace(/\D/g, '');
    const nextMinuteText = digits.slice(0, 2);
    setMinuteText(nextMinuteText);
    setTime(parseInt(nextMinuteText || '0', 10) || 0, parseInt(secondText.replace(/\D/g, '') || '0', 10) || 0);
    if (nextMinuteText.length === 2) {
      secRef.current?.focus();
    }
  }, [secondText, setTime]);

  const handleSecondsChange = useCallback((value: string) => {
    const digits = value.replace(/\D/g, '');
    const nextSecondText = digits.slice(0, 2);
    setSecondText(nextSecondText);
    setTime(
      parseInt(minuteText.replace(/\D/g, '') || '0', 10) || 0,
      Math.min(59, parseInt(nextSecondText || '0', 10) || 0),
    );
  }, [minuteText, setTime]);

  return (
    <div className={styles.center}>
      <div className={styles.timeDisplay}>
        <div className={styles.timeDrum}>
          <input
            ref={minRef}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            className={styles.timeDrumInput}
            value={minuteText}
            placeholder="00"
            onFocus={(e) => {
              activeFieldRef.current = 'minutes';
              selectAllInput(e.currentTarget);
            }}
            onPointerUp={(e) => selectAllInput(e.currentTarget)}
            onChange={(e) => handleMinutesChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                secRef.current?.focus();
              }
            }}
            onBlur={(e) => {
              activeFieldRef.current = null;
              normalizeTimeFields(e.currentTarget.value, secondText);
            }}
          />
          <span className={styles.timeDrumLabel}>min</span>
        </div>

        <span className={styles.timeSeparator}>:</span>

        <div className={styles.timeDrum}>
          <input
            ref={secRef}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            className={styles.timeDrumInput}
            value={secondText}
            placeholder="00"
            onFocus={(e) => {
              activeFieldRef.current = 'seconds';
              selectAllInput(e.currentTarget);
            }}
            onPointerUp={(e) => selectAllInput(e.currentTarget)}
            onChange={(e) => handleSecondsChange(e.target.value)}
            onBlur={(e) => {
              activeFieldRef.current = null;
              normalizeTimeFields(minuteText, e.currentTarget.value);
            }}
          />
          <span className={styles.timeDrumLabel}>sec</span>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// ScoreRoundsInput — big tap counter + partial-round checklist
// ═══════════════════════════════════════════════════════════════════

interface ScoreRoundsInputProps {
  result: StoryExerciseResult;
  onChange: (patch: Partial<StoryExerciseResult>) => void;
}

function formatRoundsDisplay(rounds: number): string {
  const intPart = Math.floor(rounds);
  // Legacy results may carry fractional rounds from the old ½-round toggle.
  if (rounds % 1 !== 0) return intPart === 0 ? '½' : `${intPart}½`;
  return `${intPart}`;
}

// ─── Partial-round checklist ─────────────────────────────────────
// Instead of a raw "extra reps" number, the athlete checks off which
// movements they finished in the incomplete round — in any order.
// partialMovements (names, in round order) is what the save pipeline
// consumes (+1 effective round per checked movement); partialReps is
// the derived rep count shown on pills and stored on the set.

interface PartialRow {
  name: string;
  quantityLabel: string;
  reps: number; // rep-equivalent for the "+N reps" summary (reps or calories)
}

// Only per-round work is checkable: buy-in/cash-out sections and
// once/per-interval/per-station movements don't repeat with the round,
// so finishing them says nothing about progress into the next round.
function buildPartialRows(movementResults: MovementResult[] | undefined): PartialRow[] {
  const rows: PartialRow[] = [];
  const seen = new Set<string>();
  for (const mr of movementResults ?? []) {
    if (mr.sectionType != null && mr.sectionType !== 'rounds') continue;
    const counting = mr.movement.countingMode;
    if (counting != null && counting !== 'per_round') continue;
    if (seen.has(mr.movement.name)) continue;
    seen.add(mr.movement.name);

    const reps = mr.reps ?? mr.movement.reps;
    const calories = mr.calories ?? mr.movement.calories;
    const distance = mr.distance ?? mr.movement.distance;
    if (reps != null && reps > 0) {
      rows.push({ name: mr.movement.name, quantityLabel: `${reps} reps`, reps });
    } else if (calories != null && calories > 0) {
      rows.push({ name: mr.movement.name, quantityLabel: `${calories} cal`, reps: calories });
    } else if (distance != null && distance > 0) {
      rows.push({ name: mr.movement.name, quantityLabel: `${distance}m`, reps: 0 });
    } else {
      rows.push({ name: mr.movement.name, quantityLabel: '', reps: 0 });
    }
  }
  return rows;
}

function PartialRoundControl({ result, onChange }: ScoreRoundsInputProps) {
  const [open, setOpen] = useState(false);
  const rows = useMemo(() => buildPartialRows(result.movementResults), [result.movementResults]);

  const checkedNames = useMemo(
    () => new Set(result.partialMovements ?? []),
    [result.partialMovements],
  );
  const checkedRows = rows.filter(row => checkedNames.has(row.name));
  const partialReps = checkedRows.reduce((sum, row) => sum + row.reps, 0);

  const toggleMovement = useCallback((name: string) => {
    const next = new Set(checkedNames);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    const nextRows = rows.filter(row => next.has(row.name));
    onChange({
      partialMovements: nextRows.length > 0 ? nextRows.map(row => row.name) : undefined,
      partialReps: nextRows.length > 0 ? nextRows.reduce((sum, row) => sum + row.reps, 0) : undefined,
    });
  }, [checkedNames, rows, onChange]);

  if (rows.length === 0) return null;

  const count = checkedRows.length;
  // Restored legacy results carry partialReps without movement names — still show as set.
  const legacyReps = count === 0 ? (result.partialReps ?? 0) : 0;
  const hasPartial = count > 0 || legacyReps > 0;
  const pct = Math.round((count / rows.length) * 100);

  let pillLabel: string;
  if (count > 0) {
    pillLabel = open
      ? `${count} of ${rows.length} moves`
      : `${count} of ${rows.length} · +${partialReps} reps`;
  } else if (legacyReps > 0) {
    pillLabel = `+${legacyReps} reps`;
  } else {
    pillLabel = '+ partial round';
  }

  return (
    <div className={styles.partialWrap}>
      <button
        type="button"
        className={`${styles.partialPill} ${hasPartial ? styles.partialPillActive : ''}`}
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
      >
        <span
          className={styles.partialRing}
          style={{ '--pct': pct } as CSSProperties}
        />
        <span>{pillLabel}</span>
        <svg
          className={`${styles.partialChev} ${open ? styles.partialChevOpen : ''}`}
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className={styles.partialCard}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.32, ease: [0.4, 0, 0.2, 1] }}
          >
            <div className={styles.partialBody}>
              <div className={styles.partialTitle}>Which moves did you finish?</div>
              <div>
                {rows.map(row => {
                  const isDone = checkedNames.has(row.name);
                  return (
                    <motion.button
                      key={row.name}
                      type="button"
                      className={`${styles.mvRow} ${isDone ? styles.mvRowDone : ''}`}
                      onClick={() => toggleMovement(row.name)}
                      whileTap={{ scale: 0.97 }}
                      aria-pressed={isDone}
                    >
                      <span className={styles.mvCheck}>
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="#0a0a08"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </span>
                      <span className={styles.mvName}>{row.name}</span>
                      {row.quantityLabel && <span className={styles.mvReps}>{row.quantityLabel}</span>}
                    </motion.button>
                  );
                })}
              </div>
              <div className={styles.partialSummary}>
                <span className={styles.partialFrac}>
                  {count} <span>of {rows.length}</span>
                </span>
                <span className={styles.partialRepsNote}>+{partialReps} reps</span>
              </div>
              <button
                type="button"
                className={styles.partialDoneBtn}
                onClick={() => setOpen(false)}
              >
                Done
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface RoundsTapCounterProps {
  value: number;
  label: string;
  onTap: () => void;
  onAdjust: (delta: number) => void;
}

// Shared tap-to-increment counter UI — used by ScoreRoundsInput (total rounds) and
// RoundsPerIntervalInput (rounds per interval, for round-alternating partner AMRAP-intervals).
function RoundsTapCounter({ value, label, onTap, onAdjust }: RoundsTapCounterProps) {
  return (
    <div className={styles.tapRow}>
      <button
        type="button"
        className={styles.undoBtn}
        onClick={() => onAdjust(-1)}
        aria-label={`Remove one ${label}`}
      >
        −
      </button>

      <motion.div
        className={styles.roundsTapZone}
        onTap={onTap}
        whileTap={{ scale: 0.95 }}
      >
        <AnimatePresence mode="popLayout">
          <motion.span
            key={value}
            className={styles.roundsNumber}
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            transition={{ duration: 0.12 }}
          >
            {formatRoundsDisplay(value)}
          </motion.span>
        </AnimatePresence>
        <span className={styles.roundsLabel}>{label}</span>

        <AnimatePresence>
          {value > 0 && (
            <motion.div
              key={value}
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
        onClick={() => onAdjust(1)}
        aria-label={`Add one ${label}`}
      >
        +
      </button>
    </div>
  );
}

export function ScoreRoundsInput({ result, onChange }: ScoreRoundsInputProps) {
  const rounds = result.rounds ?? 0;
  const intPart = Math.floor(rounds);

  const handleTap = useCallback(() => {
    onChange({ rounds: intPart + 1 });
  }, [intPart, onChange]);

  const adjustRounds = useCallback((delta: number) => {
    onChange({ rounds: Math.max(0, intPart + delta) });
  }, [intPart, onChange]);

  return (
    <div className={styles.center}>
      <RoundsTapCounter value={rounds} label="rounds" onTap={handleTap} onAdjust={adjustRounds} />

      {result.kind === 'score_rounds' && (
        <PartialRoundControl result={result} onChange={onChange} />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// RoundsPerIntervalInput — round-alternating partner AMRAP-intervals
// ═══════════════════════════════════════════════════════════════════
// Whoever's "up" for an interval does the FULL prescribed round — there's no meaningful
// per-movement personal share to log (see partnerSplit.ts). The athlete just estimates how many
// full rounds they got through per interval; we convert to the team total rounds (the same
// `result.rounds` field a plain AMRAP writes) so the existing hero/EP/breakdown/poster pipeline
// picks it up unmodified.

interface RoundsPerIntervalInputProps {
  result: StoryExerciseResult;
  intervalCount: number;
  onChange: (patch: Partial<StoryExerciseResult>) => void;
}

export function RoundsPerIntervalInput({ result, intervalCount, onChange }: RoundsPerIntervalInputProps) {
  const safeIntervalCount = intervalCount > 0 ? intervalCount : 1;
  const perInterval = Math.round((result.rounds ?? 0) / safeIntervalCount);

  const setPerInterval = useCallback((next: number) => {
    onChange({ rounds: Math.max(0, next) * safeIntervalCount });
  }, [onChange, safeIntervalCount]);

  const handleTap = useCallback(() => setPerInterval(perInterval + 1), [perInterval, setPerInterval]);
  const adjustPerInterval = useCallback((delta: number) => setPerInterval(perInterval + delta), [perInterval, setPerInterval]);

  return (
    <div className={styles.center}>
      <div className={styles.prompt}>
        Approximately how many rounds did you complete per interval?
      </div>
      <RoundsTapCounter
        value={perInterval}
        label="per interval"
        onTap={handleTap}
        onAdjust={adjustPerInterval}
      />
    </div>
  );
}
