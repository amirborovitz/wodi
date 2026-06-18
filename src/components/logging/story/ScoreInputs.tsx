import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { StoryExerciseResult } from './types';
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
// ScoreRoundsInput — big tap counter + half-round toggle
// ═══════════════════════════════════════════════════════════════════

interface ScoreRoundsInputProps {
  result: StoryExerciseResult;
  onChange: (patch: Partial<StoryExerciseResult>) => void;
}

function formatRoundsDisplay(rounds: number): string {
  const intPart = Math.floor(rounds);
  if (rounds % 1 !== 0) return intPart === 0 ? '½' : `${intPart}½`;
  return `${intPart}`;
}

export function ScoreRoundsInput({ result, onChange }: ScoreRoundsInputProps) {
  const rounds = result.rounds ?? 0;
  const intPart = Math.floor(rounds);
  const isHalf = rounds % 1 !== 0;

  const handleTap = useCallback(() => {
    onChange({ rounds: intPart + 1 });
  }, [intPart, onChange]);

  const adjustRounds = useCallback((delta: number) => {
    onChange({ rounds: Math.max(0, intPart + delta) });
  }, [intPart, onChange]);

  const toggleHalf = useCallback(() => {
    onChange({ rounds: isHalf ? intPart : intPart + 0.5 });
  }, [intPart, isHalf, onChange]);

  return (
    <div className={styles.center}>
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
              {formatRoundsDisplay(rounds)}
            </motion.span>
          </AnimatePresence>
          <span className={styles.roundsLabel}>rounds</span>

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

      <button
        type="button"
        className={`${styles.halfRoundBtn} ${isHalf ? styles.halfRoundBtnActive : ''}`}
        onClick={toggleHalf}
      >
        ½ round
      </button>
    </div>
  );
}
