import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { StoryExerciseResult, MovementResult } from './types';
import { PartialRoundChecklist, type PartialRow } from './PartialRoundChecklist';
import { StepperInput } from './StepperInput';
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
// the derived rep count shown on pills and stored on the set. The pill +
// checklist UI is the shared PartialRoundChecklist; this file just builds
// the rows from the AMRAP's per-round movements.

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
  const rows = useMemo(() => buildPartialRows(result.movementResults), [result.movementResults]);
  const checkedNames = result.partialMovements ?? [];

  const toggleMovement = useCallback((name: string) => {
    const next = new Set(result.partialMovements ?? []);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    const nextRows = rows.filter(row => next.has(row.name));
    onChange({
      partialMovements: nextRows.length > 0 ? nextRows.map(row => row.name) : undefined,
      partialReps: nextRows.length > 0 ? nextRows.reduce((sum, row) => sum + row.reps, 0) : undefined,
    });
  }, [result.partialMovements, rows, onChange]);

  // Restored legacy results carry partialReps without movement names — still show as set.
  const legacyReps = checkedNames.length === 0 ? (result.partialReps ?? 0) : 0;

  return (
    <PartialRoundChecklist
      rows={rows}
      checkedNames={checkedNames}
      onToggle={toggleMovement}
      legacyReps={legacyReps}
    />
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

// ═══════════════════════════════════════════════════════════════════
// OpenRepsPerIntervalInput — the block's open count, window by window
// ═══════════════════════════════════════════════════════════════════
// For a board that prescribes all its rounds and leaves one movement open: "[2:00 AMRAP /
// 2:00 REST] x4 — 2 rounds of 8 Push Press + 8 Box Jumps, INTO max burpees". The rounds are
// written down, so there is no rounds score to ask for; the burpees are the only number the
// athlete brings. See services/blockScore.
//
// Asked per window rather than as one total because the shape of the four numbers IS the story
// ("14 · 12 · 11 · 9" — you can see where it fell apart), and because a per-window recollection
// is more honest than a summed one. Nobody counts burpees precisely while racing a clock, so the
// prompt says so out loud: a rough number entered beats an exact one skipped. That admission is
// what earns the "~" the poster prints on the total.
//
// Entering the first window copies it forward, so the common case is one number plus small
// tweaks rather than four entries from a cold start.
//
// ONLY while the windows are few enough to remember. The grid drew one box per interval with no
// limit, so a perfectly ordinary "EMOM 25: max cal bike" asked for twenty-five numbers on a
// scrolling wall of boxes — for a workout the athlete experienced as "about twelve a minute".
// Past the threshold the question changes to the average, which is the honest one at that
// length, and the block's total is that average across the windows.

/**
 * How many windows an athlete can still recall one by one. Six is a set of numbers you remember
 * as a shape ("14 · 12 · 11 · 9 · 9 · 8"); twenty-five is a wall of boxes nobody fills honestly,
 * and the per-window story it exists to capture is gone at that length anyway.
 */
const MAX_RECALLED_WINDOWS = 6;

/**
 * Whether the block is asked window by window, or once as an average.
 *
 * Exported so the boundary has a regression net: the per-window grid drew one box per interval
 * with NO limit, and a 25-minute EMOM with one open movement rendered twenty-five of them. There
 * are no component tests here, so this is the only place that behaviour can be pinned.
 */
export function asksPerWindow(intervals: number): boolean {
  return (intervals > 0 ? intervals : 1) <= MAX_RECALLED_WINDOWS;
}

interface OpenRepsPerIntervalInputProps {
  result: StoryExerciseResult;
  /** The open movement's name, for the prompt — "burpees over the bar", not "reps". */
  movementName: string;
  intervals: number;
  /** This athlete's last logged count on the movement, to seed window 1. */
  seed?: number;
  onChange: (patch: Partial<StoryExerciseResult>) => void;
}

export function OpenRepsPerIntervalInput({
  result,
  movementName,
  intervals,
  seed,
  onChange,
}: OpenRepsPerIntervalInputProps) {
  const windowCount = intervals > 0 ? intervals : 1;
  const asAverage = !asksPerWindow(windowCount);

  const values = useMemo(() => {
    const stored = result.maxRepsPerInterval ?? [];
    return Array.from({ length: windowCount }, (_, i) => stored[i]);
  }, [result.maxRepsPerInterval, windowCount]);

  const commit = useCallback((next: (number | undefined)[]) => {
    const entered = next.filter((v): v is number => typeof v === 'number' && v > 0);
    onChange({
      maxRepsPerInterval: next.map((v) => v ?? 0),
      // The sum is the block's score — kept in the field every existing consumer already reads,
      // so hero/EP/breakdown need no per-window awareness to get the right total.
      maxReps: entered.length > 0 ? entered.reduce((sum, v) => sum + v, 0) : undefined,
    });
  }, [onChange]);

  const setWindow = useCallback((index: number, raw: number) => {
    const value = Math.max(0, Math.min(999, raw));
    const next = [...values];
    next[index] = value;
    // First entry seeds the rest: four windows of the same movement land in the same
    // neighbourhood, so copying forward turns this into one entry plus adjustments. Only ever
    // fills windows the athlete hasn't touched.
    if (index === 0) {
      for (let i = 1; i < windowCount; i += 1) {
        if (next[i] == null) next[i] = value;
      }
    }
    commit(next);
  }, [values, windowCount, commit]);

  const total = values.reduce((sum: number, v) => sum + (v ?? 0), 0);

  if (asAverage) {
    // One number, spread across every window. Written into the SAME field the grid fills so the
    // total, the poster's "~", and the breakdown all read it without knowing which way it was
    // asked — a second storage shape here would be a second thing to keep in sync.
    const average = values[0];
    const setAverage = (next: number) => {
      const value = Math.max(0, Math.min(999, next));
      commit(Array.from({ length: windowCount }, () => value));
    };
    return (
      <div className={styles.center}>
        <div className={styles.prompt}>
          How many {movementName.toLowerCase()} in an average round?
        </div>
        <div className={styles.roughNote}>
          Roughly is fine — we'll count it across all {windowCount}.
        </div>
        <StepperInput
          value={average}
          onChange={(v: number | undefined) => setAverage(v ?? 0)}
          step={1}
          min={0}
          max={999}
          placeholder={seed ? String(seed) : '0'}
          unit="per round"
          size="arcade"
          emphasis="hero"
        />
        {average != null && average > 0 && (
          <div className={styles.windowTotal}>
            ~{average * windowCount} total
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={styles.center}>
      <div className={styles.prompt}>
        How many {movementName.toLowerCase()} each window?
      </div>
      <div className={styles.roughNote}>
        Roughly is fine — nobody counts perfectly mid-workout.
      </div>

      <div className={styles.windowGrid}>
        {values.map((value, index) => (
          <div className={styles.windowCell} key={index}>
            <span className={styles.windowLabel}>{index + 1}</span>
            <input
              className={styles.windowInput}
              type="number"
              inputMode="numeric"
              min={0}
              max={999}
              placeholder={index === 0 && seed ? String(seed) : '–'}
              value={value != null ? String(value) : ''}
              onFocus={(e) => selectAllInput(e.currentTarget)}
              onChange={(e) => {
                const parsed = parseInt(e.currentTarget.value, 10);
                setWindow(index, Number.isNaN(parsed) ? 0 : parsed);
              }}
              aria-label={`${movementName}, window ${index + 1} of ${windowCount}`}
            />
          </div>
        ))}
      </div>

      {total > 0 && (
        <div className={styles.windowTotal}>
          ~{total} total
        </div>
      )}
    </div>
  );
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
