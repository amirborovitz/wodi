import { forwardRef } from 'react';
import styles from './StickerCard.module.css';
import type { RewardData, Exercise, ExerciseSet, ParsedMovement } from '../../types';

interface StickerCardProps {
  data: RewardData;
  userName?: string;
  segment?: 'full' | number; // 'full' = whole workout, number = exercise index
  label?: string;            // Optional override for single-exercise card title
}

/**
 * A compact card showing actual workout results -- weights, times, reps.
 * Adapts to show either the full workout or a single exercise slice.
 *
 * Design constraints (html2canvas):
 *   - No backdrop-filter
 *   - No CSS animations or transitions
 *   - Transparent outer shell; glass effect is solid rgba
 */
export const StickerCard = forwardRef<HTMLDivElement, StickerCardProps>(
  function StickerCard({ data, userName, segment = 'full', label }, ref) {
    const { workoutSummary, workloadBreakdown, heroAchievement } = data;
    const exercises = data.exercises || [];

    const hasPR = heroAchievement?.type === 'pr';

    // Stats for footer
    const totalVolume = workloadBreakdown?.grandTotalVolume || workoutSummary.totalVolume || 0;
    const durationSec = Math.round((workoutSummary.duration || 0) * 60);

    if (segment === 'full') {
      return (
        <div ref={ref} className={styles.root}>
          <div className={styles.glass}>
            <div className={styles.glowTop} aria-hidden="true" />
            <div className={styles.glowBottom} aria-hidden="true" />

            {/* Header */}
            <header className={styles.header}>
              <h2 className={styles.title}>{workoutSummary.title}</h2>
              <span className={styles.brand}>
                {userName ? `${userName} \u00b7 ` : ''}wodi
              </span>
            </header>

            {/* Exercise results list */}
            <div className={styles.exerciseList}>
              {exercises.map((ex, i) => (
                <ExerciseBlock key={ex.id || i} exercise={ex} compact />
              ))}
            </div>

            {/* Stats row */}
            <div className={styles.statsRow}>
              {durationSec > 0 && (
                <div className={styles.statChip}>
                  <span className={styles.statChipValue}>{formatTime(durationSec)}</span>
                  <span className={styles.statChipLabel}>TIME</span>
                </div>
              )}
              {totalVolume > 0 && (
                <div className={styles.statChip}>
                  <span className={styles.statChipValue}>{formatVolume(totalVolume)}</span>
                  <span className={styles.statChipLabel}>VOL</span>
                </div>
              )}
              {hasPR && (
                <div className={`${styles.statChip} ${styles.statChipPR}`}>
                  <span className={styles.statChipValue}>{'\u{1F3C6}'} PR</span>
                </div>
              )}
            </div>

            {/* Footer */}
            <footer className={styles.footer}>
              <div className={styles.footerLine} aria-hidden="true" />
              <span className={styles.footerText}>WORKOUT COMPLETE</span>
            </footer>
          </div>
        </div>
      );
    }

    // --- Single exercise mode ---
    const exIndex = typeof segment === 'number' ? segment : 0;
    const exercise = exercises[exIndex];
    if (!exercise) {
      return (
        <div ref={ref} className={styles.root}>
          <div className={styles.glass}>
            <div className={styles.glowTop} aria-hidden="true" />
            <span className={styles.brand}>No data</span>
          </div>
        </div>
      );
    }

    // Compute exercise-level stats
    const exVolume = computeExerciseVolume(exercise);
    const exTime = getExerciseTime(exercise);

    return (
      <div ref={ref} className={styles.root}>
        <div className={styles.glass}>
          <div className={styles.glowTop} aria-hidden="true" />
          <div className={styles.glowBottom} aria-hidden="true" />

          {/* Header */}
          <header className={styles.header}>
            <h2 className={styles.title}>{label || exercise.name}</h2>
            <span className={styles.brand}>
              {userName ? `${userName} \u00b7 ` : ''}wodi
            </span>
          </header>

          {/* Detailed sets */}
          <div className={styles.exerciseList}>
            <ExerciseBlock exercise={exercise} compact={false} />
          </div>

          {/* Single-exercise stat row */}
          <div className={styles.statsRow}>
            {exVolume > 0 && (
              <div className={styles.statChip}>
                <span className={styles.statChipValue}>{formatVolume(exVolume)}</span>
                <span className={styles.statChipLabel}>VOL</span>
              </div>
            )}
            {exTime > 0 && (
              <div className={styles.statChip}>
                <span className={styles.statChipValue}>{formatTime(exTime)}</span>
                <span className={styles.statChipLabel}>TIME</span>
              </div>
            )}
          </div>

          {/* Footer */}
          <footer className={styles.footer}>
            <div className={styles.footerLine} aria-hidden="true" />
            <span className={styles.footerText}>WORKOUT COMPLETE</span>
          </footer>
        </div>
      </div>
    );
  }
);

// ---------------------------------------------------------------------------
// ExerciseBlock: renders a single exercise's results
// ---------------------------------------------------------------------------

function ExerciseBlock({ exercise, compact }: { exercise: Exercise; compact: boolean }) {
  const sets = exercise.sets || [];
  const completedSets = sets.filter(s => s.completed);
  if (completedSets.length === 0 && sets.length === 0) return null;

  const displaySets = completedSets.length > 0 ? completedSets : sets;
  const exType = detectExerciseDisplayType(exercise);

  return (
    <div className={styles.exerciseBlock}>
      {compact && (
        <span className={styles.exerciseName}>{exercise.name}</span>
      )}

      {exType === 'strength' && (
        <StrengthSets sets={displaySets} compact={compact} exercise={exercise} />
      )}
      {exType === 'for_time' && (
        <ForTimeSets sets={displaySets} exercise={exercise} compact={compact} />
      )}
      {exType === 'amrap' && (
        <AmrapSets sets={displaySets} exercise={exercise} compact={compact} />
      )}
      {exType === 'cardio' && (
        <CardioSets sets={displaySets} compact={compact} />
      )}
      {exType === 'bodyweight' && (
        <BodyweightSets sets={displaySets} compact={compact} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Set renderers by type
// ---------------------------------------------------------------------------

function StrengthSets({ sets, compact, exercise }: { sets: ExerciseSet[]; compact: boolean; exercise: Exercise }) {
  const maxShow = compact ? 4 : 6;
  const shown = sets.slice(0, maxShow);
  const overflow = sets.length - maxShow;

  // Format Rx weight label if available
  const rxWeights = exercise.rxWeights;
  const rxLabel = rxWeights
    ? rxWeights.female && rxWeights.male
      ? `Rx ${rxWeights.female}/${rxWeights.male}kg`
      : `Rx ${rxWeights.male || rxWeights.female}kg`
    : null;

  if (compact) {
    return (
      <div className={styles.setRowInline}>
        {rxLabel && <span className={styles.rxTag}>{rxLabel}</span>}
        {shown.map((s, i) => (
          <span key={s.id || i} className={styles.setPill}>
            {s.weight != null ? `${s.weight}kg` : ''}{s.weight != null && s.actualReps != null ? ' \u00d7 ' : ''}{s.actualReps != null ? s.actualReps : ''}
          </span>
        ))}
        {overflow > 0 && <span className={styles.setOverflow}>+{overflow}</span>}
      </div>
    );
  }

  // Detailed rows for single-exercise mode
  return (
    <div className={styles.setRowsDetailed}>
      {rxLabel && <div className={styles.rxTagDetailed}>{rxLabel}</div>}
      {shown.map((s, i) => (
        <div key={s.id || i} className={styles.setRowDetailed}>
          <span className={styles.setLabel}>Set {s.setNumber || i + 1}</span>
          <span className={styles.setData}>
            {s.weight != null ? `${s.weight}kg` : ''}{s.weight != null && s.actualReps != null ? ' \u00d7 ' : ''}{s.actualReps ?? ''}
          </span>
        </div>
      ))}
      {overflow > 0 && <span className={styles.setOverflow}>+{overflow} more</span>}
    </div>
  );
}

function ForTimeSets({ sets, exercise, compact }: { sets: ExerciseSet[]; exercise: Exercise; compact: boolean }) {
  const timeSet = sets.find(s => s.time != null && s.time > 0);
  const completionTime = timeSet?.time || 0;
  const movements = exercise.movements;

  if (compact) {
    return (
      <div className={styles.setRowInline}>
        {completionTime > 0 && (
          <span className={styles.timeHeroCompact}>{formatTime(completionTime)}</span>
        )}
        {movements && movements.length > 0 ? (
          <MovementList movements={movements} rounds={exercise.rounds} />
        ) : (
          <span className={styles.movementSummary}>{exercise.prescription}</span>
        )}
      </div>
    );
  }

  return (
    <div className={styles.setRowsDetailed}>
      {completionTime > 0 && (
        <div className={styles.timeHero}>{formatTime(completionTime)}</div>
      )}
      {movements && movements.length > 0 ? (
        <MovementList movements={movements} rounds={exercise.rounds} />
      ) : (
        <span className={styles.movementSummary}>{exercise.prescription}</span>
      )}
    </div>
  );
}

function AmrapSets({ sets, exercise, compact }: { sets: ExerciseSet[]; exercise: Exercise; compact: boolean }) {
  const totalRounds = sets.filter(s => s.completed).length;
  const lastSet = sets[sets.length - 1];
  const extraReps = lastSet?.actualReps || 0;
  const movements = exercise.movements;

  if (compact) {
    return (
      <div className={styles.setRowInline}>
        <span className={styles.timeHeroCompact}>
          {totalRounds > 0 ? `${totalRounds} rds` : ''}{extraReps > 0 ? ` + ${extraReps}` : ''}
        </span>
        {movements && movements.length > 0 ? (
          <MovementList movements={movements} />
        ) : (
          <span className={styles.movementSummary}>{exercise.prescription}</span>
        )}
      </div>
    );
  }

  return (
    <div className={styles.setRowsDetailed}>
      <div className={styles.timeHero}>
        {totalRounds > 0 ? `${totalRounds} rounds` : ''}{extraReps > 0 ? ` + ${extraReps} reps` : ''}
      </div>
      {movements && movements.length > 0 ? (
        <MovementList movements={movements} />
      ) : (
        <span className={styles.movementSummary}>{exercise.prescription}</span>
      )}
    </div>
  );
}

function CardioSets({ sets, compact }: { sets: ExerciseSet[]; compact: boolean }) {
  const totalCal = sets.reduce((acc, s) => acc + (s.calories || 0), 0);
  const totalDist = sets.reduce((acc, s) => acc + (s.distance || 0), 0);

  const display = totalCal > 0
    ? `${totalCal} cal`
    : totalDist > 0
      ? `${totalDist}m`
      : '';

  if (!display) return null;

  if (compact) {
    return (
      <div className={styles.setRowInline}>
        <span className={styles.timeHeroCompact}>{display}</span>
      </div>
    );
  }

  return (
    <div className={styles.setRowsDetailed}>
      <div className={styles.timeHero}>{display}</div>
    </div>
  );
}

function BodyweightSets({ sets, compact }: { sets: ExerciseSet[]; compact: boolean }) {
  const maxShow = compact ? 4 : 6;
  const shown = sets.slice(0, maxShow);
  const overflow = sets.length - maxShow;

  if (compact) {
    return (
      <div className={styles.setRowInline}>
        {shown.map((s, i) => (
          <span key={s.id || i} className={styles.setPill}>
            {s.actualReps != null ? `${s.actualReps} reps` : (s.time ? formatTime(s.time) : '')}
          </span>
        ))}
        {overflow > 0 && <span className={styles.setOverflow}>+{overflow}</span>}
      </div>
    );
  }

  return (
    <div className={styles.setRowsDetailed}>
      {shown.map((s, i) => (
        <div key={s.id || i} className={styles.setRowDetailed}>
          <span className={styles.setLabel}>Set {s.setNumber || i + 1}</span>
          <span className={styles.setData}>
            {s.actualReps != null ? `${s.actualReps} reps` : (s.time ? formatTime(s.time) : '')}
          </span>
        </div>
      ))}
      {overflow > 0 && <span className={styles.setOverflow}>+{overflow} more</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MovementList: renders structured movement data directly (no string parsing)
// ---------------------------------------------------------------------------

function MovementList({ movements, rounds }: { movements: ParsedMovement[]; rounds?: number }) {
  const lines = movements.map(m => {
    const parts: string[] = [];
    if (m.reps) parts.push(`${m.reps}`);
    if (m.distance) {
      parts.push(m.distance >= 1000 ? `${m.distance / 1000}km` : `${m.distance}m`);
    }
    if (m.calories) parts.push(`${m.calories} cal`);
    parts.push(m.name);
    if (m.rxWeights) {
      const w = m.rxWeights;
      if (w.female && w.male && w.female !== w.male) {
        parts.push(`@${w.female}/${w.male}${w.unit || 'kg'}`);
      } else {
        parts.push(`@${w.male || w.female}${w.unit || 'kg'}`);
      }
    }
    return parts.join(' ');
  });

  const prefix = rounds && rounds > 1 ? `${rounds} rds: ` : '';

  return (
    <span className={styles.movementSummary}>
      {prefix}{lines.join(', ')}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ExerciseDisplayType = 'strength' | 'for_time' | 'amrap' | 'cardio' | 'bodyweight';

function detectExerciseDisplayType(exercise: Exercise): ExerciseDisplayType {
  // Use exercise type as primary signal
  if (exercise.type === 'wod') {
    const rx = (exercise.prescription || '').toLowerCase();
    if (rx.includes('amrap')) return 'amrap';
    return 'for_time'; // WODs are for_time unless AMRAP
  }
  if (exercise.type === 'cardio') return 'cardio';

  // Fall back to set-data inference for strength/bodyweight
  const sets = exercise.sets || [];
  const hasWeight = sets.some(s => s.weight != null && s.weight > 0);
  const hasTime = sets.some(s => s.time != null && s.time > 0);
  const hasCals = sets.some(s => s.calories != null && s.calories > 0);
  const hasDist = sets.some(s => s.distance != null && s.distance > 0);

  const rx = (exercise.prescription || '').toLowerCase();
  if (rx.includes('amrap')) return 'amrap';
  if (rx.includes('for time') || rx.includes('for_time')) return 'for_time';

  if (hasWeight) return 'strength';
  if (hasCals || hasDist) return 'cardio';
  if (hasTime && !hasWeight) return 'for_time';

  return 'bodyweight';
}

function computeExerciseVolume(exercise: Exercise): number {
  return (exercise.sets || []).reduce((acc, s) => {
    if (s.weight && s.actualReps) return acc + s.weight * s.actualReps;
    return acc;
  }, 0);
}

function getExerciseTime(exercise: Exercise): number {
  const sets = exercise.sets || [];
  // For for_time exercises, return the completion time from the first set
  const timeSet = sets.find(s => s.time != null && s.time > 0);
  return timeSet?.time || 0;
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
