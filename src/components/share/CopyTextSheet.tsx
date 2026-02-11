import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './CopyTextSheet.module.css';
import type { RewardData, Exercise, MovementTotal } from '../../types';

interface CopyTextSheetProps {
  open: boolean;
  onClose: () => void;
  data: RewardData;
  segment?: 'full' | number;
}

// ---------------------------------------------------------------------------
// Text builders -- results-rich, segment-aware
// ---------------------------------------------------------------------------

function buildMovementLine(mov: MovementTotal): string {
  const parts: string[] = [];
  if (mov.totalReps && mov.totalReps > 0) parts.push(`${mov.totalReps}`);
  if (mov.totalDistance && mov.totalDistance > 0) {
    parts.push(mov.totalDistance >= 1000
      ? `${(mov.totalDistance / 1000).toFixed(1)}km`
      : `${Math.round(mov.totalDistance)}m`);
  }
  if (mov.totalCalories && mov.totalCalories > 0) parts.push(`${mov.totalCalories} cal`);
  if (mov.weight && mov.weight > 0) parts.push(`@ ${mov.weight}kg`);
  const detail = parts.length > 0 ? ` — ${parts.join(' ')}` : '';
  return `${mov.name}${detail}`;
}

function buildWorkoutText(data: RewardData, segment: 'full' | number = 'full'): string {
  const { workoutSummary, exercises, workloadBreakdown } = data;
  const movements = workloadBreakdown?.movements || [];

  if (segment !== 'full') {
    // Single exercise text
    const ex = exercises[segment];
    if (!ex) return '';
    return buildSingleExerciseText(ex);
  }

  // Full workout text
  const lines: string[] = [];

  // For metcons (few exercises, many movements), show movements instead
  const isMetcon = exercises.length <= 2 && movements.length > 1;
  if (isMetcon) {
    if (exercises[0]) lines.push(exercises[0].name.toUpperCase());
    movements.forEach((mov) => {
      lines.push(buildMovementLine(mov));
    });
  } else {
    exercises.forEach((ex) => {
      lines.push(buildExerciseLine(ex));
    });
  }

  // Summary stats
  const statParts: string[] = [];
  const totalVolume = workloadBreakdown?.grandTotalVolume || workoutSummary.totalVolume || 0;
  const totalReps = workloadBreakdown?.grandTotalReps || workoutSummary.totalReps || 0;

  if (workoutSummary.duration) {
    const totalSec = Math.round(workoutSummary.duration * 60);
    statParts.push(`Time: ${formatTime(totalSec)}`);
  }
  if (totalVolume > 0) {
    statParts.push(`Volume: ${formatVolume(totalVolume)}`);
  }
  if (totalReps > 0) {
    statParts.push(`${totalReps} reps`);
  }

  if (statParts.length > 0) {
    lines.push('');
    lines.push(statParts.join(' | '));
  }

  lines.push('@wodi');

  return lines.join('\n');
}

function buildExerciseLine(ex: Exercise): string {
  const sets = (ex.sets || []).filter(s => s.completed);
  const displaySets = sets.length > 0 ? sets : ex.sets || [];
  const exType = detectExerciseType(ex);

  const nameLine = ex.name.toUpperCase();

  if (exType === 'strength') {
    const setStrs = displaySets
      .map(s => {
        const parts: string[] = [];
        if (s.weight != null) parts.push(`${s.weight}kg`);
        if (s.actualReps != null) parts.push(`x ${s.actualReps}`);
        return parts.join(' ');
      })
      .filter(Boolean);

    const prescription = ex.prescription ? `${ex.prescription} | ` : '';
    return `${nameLine}\n${prescription}${setStrs.join(', ')}`;
  }

  if (exType === 'for_time') {
    const timeSet = displaySets.find(s => s.time != null && s.time > 0);
    const timeStr = timeSet ? formatTime(timeSet.time!) : '';
    const parts = [nameLine];
    if (timeStr) parts.push(`${timeStr} | ${ex.prescription}`);
    else parts.push(ex.prescription);
    return parts.join('\n');
  }

  if (exType === 'amrap') {
    const totalRounds = displaySets.filter(s => s.completed).length;
    const lastSet = displaySets[displaySets.length - 1];
    const extraReps = lastSet?.actualReps || 0;
    const score = totalRounds > 0
      ? `${totalRounds} rounds${extraReps > 0 ? ` + ${extraReps} reps` : ''}`
      : '';
    return `${nameLine}\n${score ? `${score} | ` : ''}${ex.prescription}`;
  }

  if (exType === 'cardio') {
    const totalCal = displaySets.reduce((a, s) => a + (s.calories || 0), 0);
    const totalDist = displaySets.reduce((a, s) => a + (s.distance || 0), 0);
    const metric = totalCal > 0 ? `${totalCal} cal` : totalDist > 0 ? `${totalDist}m` : '';
    return `${nameLine}\n${metric ? `${metric} | ` : ''}${ex.prescription}`;
  }

  // Bodyweight / default
  const repStrs = displaySets
    .map(s => s.actualReps != null ? `${s.actualReps} reps` : '')
    .filter(Boolean);
  return `${nameLine}\n${repStrs.join(', ') || ex.prescription}`;
}

function buildSingleExerciseText(ex: Exercise): string {
  const sets = (ex.sets || []).filter(s => s.completed);
  const displaySets = sets.length > 0 ? sets : ex.sets || [];
  const exType = detectExerciseType(ex);
  const lines: string[] = [ex.name.toUpperCase()];

  if (exType === 'strength') {
    displaySets.forEach((s, i) => {
      const parts: string[] = [];
      if (s.weight != null) parts.push(`${s.weight}kg`);
      if (s.actualReps != null) parts.push(`x ${s.actualReps}`);
      lines.push(`Set ${s.setNumber || i + 1}: ${parts.join(' ')}`);
    });

    // Volume
    const vol = displaySets.reduce((a, s) => {
      if (s.weight && s.actualReps) return a + s.weight * s.actualReps;
      return a;
    }, 0);
    if (vol > 0) {
      lines.push('');
      lines.push(`Volume: ${formatVolume(vol)}`);
    }
  } else if (exType === 'for_time') {
    const timeSet = displaySets.find(s => s.time != null && s.time > 0);
    if (timeSet) lines.push(`${formatTime(timeSet.time!)} completed`);
    // Show prescription as movement list
    if (ex.prescription) lines.push(ex.prescription);
  } else if (exType === 'amrap') {
    const totalRounds = displaySets.filter(s => s.completed).length;
    const lastSet = displaySets[displaySets.length - 1];
    const extraReps = lastSet?.actualReps || 0;
    if (totalRounds > 0) {
      lines.push(`${totalRounds} rounds${extraReps > 0 ? ` + ${extraReps} reps` : ''}`);
    }
    if (ex.prescription) lines.push(ex.prescription);
  } else if (exType === 'cardio') {
    const totalCal = displaySets.reduce((a, s) => a + (s.calories || 0), 0);
    const totalDist = displaySets.reduce((a, s) => a + (s.distance || 0), 0);
    if (totalCal > 0) lines.push(`${totalCal} cal`);
    else if (totalDist > 0) lines.push(`${totalDist}m`);
  } else {
    displaySets.forEach((s, i) => {
      if (s.actualReps != null) {
        lines.push(`Set ${s.setNumber || i + 1}: ${s.actualReps} reps`);
      }
    });
  }

  lines.push('');
  lines.push('@wodi');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ExType = 'strength' | 'for_time' | 'amrap' | 'cardio' | 'bodyweight';

function detectExerciseType(ex: Exercise): ExType {
  const sets = ex.sets || [];
  const hasWeight = sets.some(s => s.weight != null && s.weight > 0);
  const hasTime = sets.some(s => s.time != null && s.time > 0);
  const hasCals = sets.some(s => s.calories != null && s.calories > 0);
  const hasDist = sets.some(s => s.distance != null && s.distance > 0);

  const rx = (ex.prescription || '').toLowerCase();
  if (rx.includes('amrap')) return 'amrap';
  if (rx.includes('for time') || rx.includes('for_time')) return 'for_time';

  if (hasWeight) return 'strength';
  if (hasCals || hasDist) return 'cardio';
  if (hasTime && !hasWeight) return 'for_time';
  return 'bodyweight';
}

function formatTime(totalSeconds: number): string {
  if (totalSeconds === 0) return '--';
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.round(totalSeconds % 60);
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    const rm = mins % 60;
    return `${hrs}:${rm.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatVolume(kg: number): string {
  if (kg >= 1000) return `${(kg / 1000).toFixed(1)}t`;
  return `${parseFloat(kg.toFixed(1)).toLocaleString()}kg`;
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function CopyCheckIcon({ success }: { success: boolean }) {
  if (success) {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CopyTextSheet({ open, onClose, data, segment = 'full' }: CopyTextSheetProps) {
  const [textCopied, setTextCopied] = useState(false);

  const workoutText = useMemo(() => buildWorkoutText(data, segment), [data, segment]);

  const title = segment === 'full'
    ? 'Copy Text'
    : `Copy Text \u2014 ${getSegmentLabel(data.exercises[segment as number])}`;

  function getSegmentLabel(ex?: Exercise): string {
    if (!ex) return 'Exercise';
    switch (ex.type) {
      case 'strength': return 'Strength';
      case 'wod': return 'Metcon';
      case 'cardio': return 'Cardio';
      case 'skill': return 'Skill';
      default: return 'Workout';
    }
  }

  const copyToClipboard = async (str: string): Promise<boolean> => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(str);
        return true;
      }
      const textarea = document.createElement('textarea');
      textarea.value = str;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(textarea);
      return ok;
    } catch {
      return false;
    }
  };

  const handleCopyText = async () => {
    const ok = await copyToClipboard(workoutText);
    if (ok) {
      setTextCopied(true);
      setTimeout(() => setTextCopied(false), 1600);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className={styles.backdrop}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Bottom sheet */}
          <motion.div
            className={styles.sheet}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 380 }}
          >
            {/* Drag handle */}
            <div className={styles.dragHandle} aria-hidden="true" />

            {/* Header */}
            <div className={styles.sheetHeader}>
              <h2 className={styles.sheetTitle}>{title}</h2>
              <button
                className={styles.closeBtn}
                onClick={onClose}
                type="button"
                aria-label="Close"
              >
                <CloseIcon />
              </button>
            </div>

            {/* ---- Workout Text section ---- */}
            <div className={styles.section}>
              <div className={styles.sectionHeadRow}>
                <span className={styles.sectionLabel}>Workout Text</span>
                <button
                  className={`${styles.copyBtn} ${textCopied ? styles.copyBtnSuccess : ''}`}
                  onClick={handleCopyText}
                  type="button"
                  aria-label="Copy workout text"
                >
                  <CopyCheckIcon success={textCopied} />
                  <span>{textCopied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
              <pre className={styles.textBlock}>{workoutText}</pre>
            </div>

            {/* ---- Dismiss ---- */}
            <button
              className={styles.dismissBtn}
              onClick={onClose}
              type="button"
            >
              Dismiss
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
