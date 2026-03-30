import { motion } from 'framer-motion';
import { ResultPill } from './ResultPill';
import { getRowState, kindToTrinityColor, type StoryExerciseResult } from './types';
import styles from './ExerciseRow.module.css';

interface ExerciseRowProps {
  result: StoryExerciseResult;
  onEdit: () => void;
  index: number;
}

// ─── Prescription formatting ────────────────────────────────────
// Split long prescription text into readable lines.
// Breaks on commas (followed by movement-like text) and "Into" boundaries.

function formatPrescription(result: StoryExerciseResult): string {
  const ex = result.exercise;
  if (ex.prescription) return ex.prescription;
  const parts: string[] = [];
  if (ex.suggestedSets > 1) parts.push(`${ex.suggestedSets}x`);
  if (ex.suggestedReps) parts.push(`${ex.suggestedReps}`);
  return parts.join('') || '';
}

interface PrescriptionSegment {
  text: string;
  isBreak: boolean; // true = "Into ..." separator
}

function structurePrescription(raw: string): PrescriptionSegment[] {
  if (!raw) return [];

  // Split on "Into" boundaries first (e.g., "Into 6 Rounds...")
  const intoParts = raw.split(/\b(Into\s)/i);
  const segments: PrescriptionSegment[] = [];

  for (let i = 0; i < intoParts.length; i++) {
    const part = intoParts[i].trim();
    if (!part) continue;

    // "Into " prefix — merge with next part
    if (/^into\s*$/i.test(part) && i + 1 < intoParts.length) {
      segments.push({ text: '', isBreak: true });
      segments.push({ text: `Into ${intoParts[i + 1].trim()}`, isBreak: false });
      i++; // skip next
      continue;
    }

    // Split on comma-separated movements within a section
    // Match: ", N Movement" or ", Movement"
    const movementParts = part.split(/,\s*(?=\d+\s+[A-Z])/i);
    for (const mp of movementParts) {
      const trimmed = mp.trim();
      if (trimmed) {
        segments.push({ text: trimmed, isBreak: false });
      }
    }
  }

  return segments;
}

// ─── Component ──────────────────────────────────────────────────

export function ExerciseRow({ result, onEdit, index }: ExerciseRowProps) {
  const state = getRowState(result);
  const color = kindToTrinityColor(result.kind);

  const isSkipped = result.skipped && state === 'empty';

  const stateClass =
    isSkipped           ? styles.skipped :
    state === 'filled'  ? styles.filled :
    state === 'partial' ? styles.partial :
    '';

  const rawPrescription = formatPrescription(result);
  const segments = structurePrescription(rawPrescription);

  return (
    <motion.div
      className={`${styles.card} ${stateClass}`}
      style={{ '--row-color': color } as React.CSSProperties}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.05, ease: [0.16, 1, 0.3, 1] }}
      onClick={onEdit}
    >
      <div className={styles.accentStrip} />

      <div className={styles.cardBody}>
        <div className={styles.movementInfo}>
          <span className={styles.movementName}>{result.exercise.name}</span>
          {segments.length > 0 && (
            <span className={styles.prescription}>
              {segments.map((seg, i) => (
                seg.isBreak
                  ? <span key={i} className={styles.prescriptionSep} />
                  : <span key={i} className={styles.prescriptionLine}>{seg.text}</span>
              ))}
            </span>
          )}
        </div>

        <div className={styles.actionArea}>
          <ResultPill
            result={result}
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
          />
        </div>

        <span className={styles.chevron}>&rsaquo;</span>
      </div>
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
