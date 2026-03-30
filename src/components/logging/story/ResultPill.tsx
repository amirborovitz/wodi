import type { StoryExerciseResult } from './types';
import { getRowState, kindToTrinityColor } from './types';
import styles from './ResultPill.module.css';

interface ResultPillProps {
  result: StoryExerciseResult;
  onClick?: (e: React.MouseEvent) => void;
}

// ─── Formatting helpers ─────────────────────────────────────────

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatWeight(kg: number, implement?: 1 | 2): string {
  const prefix = implement === 2 ? '2x' : '';
  const display = kg % 1 === 0 ? String(kg) : kg.toFixed(1);
  return `${prefix}${display}kg`;
}

function formatDistance(value: number, unit?: string): string {
  const u = unit ?? 'm';
  if (u === 'km' || u === 'mi') {
    return `${value % 1 === 0 ? value : value.toFixed(1)}${u}`;
  }
  return `${Math.round(value)}${u}`;
}

// ─── Format a result into a compact string ──────────────────────
// No emoji — clean text labels per design system.

interface FormattedPill {
  text: string;
  secondary?: string;
}

function formatResult(r: StoryExerciseResult): FormattedPill {
  // Scored exercises always show time/rounds — even with multiple movements.
  if (r.kind === 'score_time') {
    if (r.timeSeconds == null) {
      const hasWeightInputs = (r.movementResults ?? []).some(
        mr => mr.kind === 'load' || mr.kind === 'distance'
      );
      return { text: hasWeightInputs ? 'Log results' : 'Add time' };
    }
    return { text: formatTime(r.timeSeconds) };
  }
  if (r.kind === 'score_rounds') {
    if (r.rounds == null || r.rounds === 0) return { text: 'Log results' };
    const rds = `${r.rounds} rds`;
    if (r.partialMovements && r.partialMovements.length > 0) {
      const last = r.partialMovements[r.partialMovements.length - 1]
        .replace(/^Alt(?:ernating)?\s+/i, '')
        .replace(/^Single\s+/i, '');
      const short = last.length > 12 ? last.slice(0, 11) + '\u2026' : last;
      return { text: `${rds} + ${short}` };
    }
    if (r.partialReps != null && r.partialReps > 0) {
      return { text: `${rds} + ${r.partialReps}` };
    }
    return { text: rds };
  }

  // Superset: show filled count
  if (r.movementResults && r.movementResults.length > 1) {
    const total = r.movementResults.length;
    const filled = r.movementResults.filter(mr => {
      switch (mr.kind) {
        case 'load': return (mr.weight != null && mr.weight > 0) || mr.loadMode === 'bodyweight';
        case 'reps': return true;
        case 'duration': return mr.durationSeconds != null && mr.durationSeconds > 0;
        case 'distance': return (mr.distance != null && mr.distance > 0) || (mr.calories != null && mr.calories > 0);
        default: return true;
      }
    }).length;
    if (filled === total) return { text: `${total}/${total} done` };
    if (filled > 0) return { text: `${filled}/${total} done` };
    return { text: `${total} moves` };
  }

  switch (r.kind) {
    case 'load': {
      if (r.loadMode === 'bodyweight') return { text: 'BW' };
      if (r.weight == null) return { text: 'Add weight' };
      const start = formatWeight(r.weight, r.implementCount);
      if (r.loadMode === 'range' && r.weightEnd != null && r.weightEnd !== r.weight) {
        return { text: start, secondary: formatWeight(r.weightEnd, r.implementCount) };
      }
      return { text: start };
    }

    case 'reps': {
      const done = r.setsCompleted ?? r.setsTotal;
      const total = r.setsTotal;
      if (done === total) return { text: `${done}/${total} sets` };
      return { text: `${done}/${total} sets` };
    }

    case 'duration': {
      if (r.durationSeconds == null) return { text: 'Add time' };
      return { text: `${r.durationSeconds}s` };
    }

    case 'distance': {
      if (r.distanceValue == null) return { text: 'Add dist' };
      return { text: formatDistance(r.distanceValue, r.distanceUnit) };
    }

    case 'intervals': {
      const done = r.intervalsCompleted ?? 0;
      const total = r.intervalsTotal ?? r.setsTotal;
      return { text: `${done}/${total}` };
    }

    case 'note': {
      if (r.notes && r.notes.trim()) return { text: 'Noted' };
      return { text: 'Add note' };
    }

    default:
      return { text: 'Log' };
  }
}

// ─── Component ──────────────────────────────────────────────────

export function ResultPill({ result, onClick }: ResultPillProps) {
  const state = getRowState(result);
  const color = kindToTrinityColor(result.kind);
  const { text, secondary } = formatResult(result);

  const stateClass =
    state === 'filled'  ? styles.filled :
    state === 'partial' ? styles.partial :
    styles.empty;

  return (
    <button
      type="button"
      className={`${styles.pill} ${stateClass}`}
      style={{ '--pill-color': color } as React.CSSProperties}
      onClick={onClick}
    >
      <span className={styles.value}>{text}</span>
      {secondary && (
        <>
          <span className={styles.arrow}>&rarr;</span>
          <span className={styles.value}>{secondary}</span>
        </>
      )}
    </button>
  );
}
