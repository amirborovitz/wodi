import { motion } from 'framer-motion';
import { ResultPill } from './ResultPill';
import { getRowState, kindToTrinityColor, type StoryExerciseResult } from './types';
import styles from './ExerciseRow.module.css';

interface ExerciseRowProps {
  result: StoryExerciseResult;
  onEdit: () => void;
  index: number;
}

function formatPrescription(result: StoryExerciseResult): string {
  const ex = result.exercise;
  // Use the AI prescription string if available
  if (ex.prescription) return ex.prescription;
  // Fallback: build from suggested sets/reps
  const parts: string[] = [];
  if (ex.suggestedSets > 1) parts.push(`${ex.suggestedSets}x`);
  if (ex.suggestedReps) parts.push(`${ex.suggestedReps}`);
  return parts.join('') || '';
}

export function ExerciseRow({ result, onEdit, index }: ExerciseRowProps) {
  const state = getRowState(result);
  const color = kindToTrinityColor(result.kind);

  const isSkipped = result.skipped && state === 'empty';

  const stateClass =
    isSkipped           ? styles.skipped :
    state === 'filled'  ? styles.filled :
    state === 'partial' ? styles.partial :
    styles.empty;

  const prescription = formatPrescription(result);

  return (
    <motion.div
      className={`${styles.row} ${stateClass}`}
      style={{ '--row-color': color } as React.CSSProperties}
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2, delay: index * 0.04, ease: [0.16, 1, 0.3, 1] }}
      onClick={onEdit}
    >
      <div className={styles.movementInfo}>
        <span className={styles.movementName}>{result.exercise.name}</span>
        {prescription && (
          <span className={styles.prescription}>{prescription}</span>
        )}
      </div>

      <div className={styles.resultArea}>
        <ResultPill
          result={result}
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
        />
      </div>

      <span className={styles.chevron}>›</span>
    </motion.div>
  );
}

// ─── Section Header (Part A / Part B / etc.) ────────────────────

interface SectionHeaderProps {
  label: string;
}

export function SectionHeader({ label }: SectionHeaderProps) {
  return (
    <div className={styles.sectionHeader}>
      <span className={styles.sectionLabel}>{label}</span>
      <div className={styles.sectionLine} />
    </div>
  );
}
