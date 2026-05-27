import { motion } from 'framer-motion';
import type { ExerciseLoggingMode } from '../../../types';
import type { StoryExerciseResult } from './types';
import styles from './WodComponentSelectionScreen.module.css';

interface WodComponentSelectionScreenProps {
  results: StoryExerciseResult[];
  onSelect: (index: number) => void;
  onSkipAll: () => void;
}

// ─── Badge helpers ───────────────────────────────────────────────

function modeLabel(mode: ExerciseLoggingMode | undefined): string {
  switch (mode) {
    case 'strength':         return 'STRENGTH';
    case 'sets':             return 'STRENGTH';
    case 'for_time':         return 'FOR TIME';
    case 'amrap':            return 'AMRAP';
    case 'amrap_intervals':  return 'AMRAP';
    case 'intervals':        return 'INTERVALS';
    case 'emom':             return 'EMOM';
    case 'cardio':           return 'CARDIO';
    case 'cardio_distance':  return 'CARDIO';
    case 'bodyweight':       return 'BODYWEIGHT';
    default:                 return 'WORKOUT';
  }
}

function modeColor(mode: ExerciseLoggingMode | undefined): string {
  switch (mode) {
    case 'strength':
    case 'sets':
      return 'var(--color-volume)';
    case 'intervals':
    case 'emom':
      return 'var(--color-sessions)';
    default:
      return 'var(--color-metcon)';
  }
}

// ─── Component ───────────────────────────────────────────────────

export function WodComponentSelectionScreen({
  results,
  onSelect,
  onSkipAll,
}: WodComponentSelectionScreenProps) {
  return (
    <div className={styles.screen}>
      <div className={styles.header}>
        <h1 className={styles.heading}>Where do you<br />want to start?</h1>
      </div>

      <div className={styles.list}>
        {results.map((result, i) => {
          const mode = result.exercise.loggingMode;
          const color = modeColor(mode);
          const label = modeLabel(mode);
          const prescription = result.exercise.prescription;

          return (
            <motion.button
              key={result.exerciseIndex}
              className={styles.card}
              style={{ '--card-color': color } as React.CSSProperties}
              onClick={() => onSelect(i)}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, delay: i * 0.055, ease: [0.16, 1, 0.3, 1] }}
            >
              <span className={styles.badge}>{label}</span>

              <div className={styles.titleRow}>
                <span className={styles.title}>{result.exercise.name}</span>
                <span className={styles.chevron} aria-hidden>›</span>
              </div>

              {prescription && (
                <span className={styles.prescription}>{prescription}</span>
              )}
            </motion.button>
          );
        })}
      </div>

      <div className={styles.footer}>
        <button className={styles.skipLink} onClick={onSkipAll}>
          Skip all → just mark complete
        </button>
      </div>
    </div>
  );
}
