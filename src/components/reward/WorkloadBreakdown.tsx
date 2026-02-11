import { useMemo, useState } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import type { PanInfo } from 'framer-motion';
import type { WorkloadBreakdown as WorkloadBreakdownType, MovementTotal } from '../../types';
import styles from './WorkloadBreakdown.module.css';

interface WorkloadBreakdownProps {
  breakdown: WorkloadBreakdownType;
  animationDelay?: number;
  editable?: boolean;
  onEditMovement?: (movement: MovementTotal) => void;
  onDeleteMovement?: (movementName: string) => void;
}

/**
 * Format time in seconds to mm:ss or just seconds
 */
function formatTime(seconds: number): string {
  if (seconds >= 60) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${mins}:00`;
  }
  return `${seconds}s`;
}

/**
 * Display name for movements — Title Case
 */
function displayName(name: string): string {
  return name.split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Categorize a movement for highlight color.
 */
type TileCategory = 'gold' | 'cyan' | 'neutral';

const STRENGTH_PATTERNS = [
  'deadlift', 'clean', 'jerk', 'snatch', 'squat', 'press', 'thruster',
  'swing', 'lunge', 'curl', 'extension', 'row', 'kettlebell', 'kb',
  'dumbbell', 'db', 'barbell', 'bb', 'goblet', 'wall ball', 'ball slam',
];

const CARDIO_PATTERNS = [
  'run', 'bike', 'ski', 'swim', 'burpee', 'double under', 'single under',
];

function categorizeMovement(mov: MovementTotal): TileCategory {
  const lower = mov.name.toLowerCase();
  if (mov.weight && mov.weight > 0) return 'gold';
  if (STRENGTH_PATTERNS.some(p => lower.includes(p))) return 'gold';
  if (mov.totalDistance && mov.totalDistance > 0) return 'cyan';
  if (mov.totalCalories && mov.totalCalories > 0) return 'cyan';
  if (CARDIO_PATTERNS.some(p => lower.includes(p))) return 'cyan';
  return 'neutral';
}

/**
 * Impact score for highlighting top movements.
 */
function impactScore(mov: MovementTotal): number {
  if (mov.weight && mov.weight > 0 && mov.totalReps) {
    return mov.totalReps * mov.weight;
  }
  if (mov.totalDistance && mov.totalDistance > 0) {
    return mov.totalDistance;
  }
  return mov.totalReps || 0;
}

/**
 * Build stat segments for a movement row.
 * Number+unit are glued into a single string (e.g. "40 reps", "@ 50kg", "200m").
 */
function buildStatSegments(movement: MovementTotal): { text: string }[] {
  const segments: { text: string }[] = [];

  // Reps
  if (movement.totalReps && movement.totalReps > 0) {
    segments.push({ text: `${movement.totalReps} reps` });
  }

  // Weight / progression
  if (movement.weightProgression && movement.weightProgression.length > 1) {
    const weights = movement.weightProgression;
    const unit = movement.unit === 'lb' ? 'lb' : 'kg';
    if (weights.every(w => w === weights[0])) {
      segments.push({ text: `@ ${weights[0]}${unit}` });
    } else {
      const deduped = weights.filter((w, i, arr) => i === 0 || w !== arr[i - 1]);
      if (deduped.length > 4) {
        segments.push({ text: `${Math.min(...deduped)}\u2013${Math.max(...deduped)}${unit}` });
      } else {
        segments.push({ text: `${deduped.join('\u2192')}${unit}` });
      }
    }
  } else if (movement.weight && movement.weight > 0) {
    const unit = movement.unit === 'lb' ? 'lb' : 'kg';
    if (movement.implementCount && movement.implementCount > 1) {
      const perImplement = parseFloat((movement.weight / movement.implementCount).toFixed(1));
      segments.push({ text: `@ ${movement.implementCount}x ${perImplement}${unit}` });
    } else {
      segments.push({ text: `@ ${movement.weight}${unit}` });
    }
  }

  // Distance
  if (movement.totalDistance && movement.totalDistance > 0) {
    if (movement.totalDistance >= 1000) {
      segments.push({ text: `${(movement.totalDistance / 1000).toFixed(1)}km` });
    } else {
      segments.push({ text: `${movement.totalDistance}m` });
    }
  }

  // Time
  if (movement.totalTime && movement.totalTime > 0) {
    segments.push({ text: formatTime(movement.totalTime) });
  }

  // Calories
  if (movement.totalCalories && movement.totalCalories > 0) {
    segments.push({ text: `${movement.totalCalories} cal` });
  }

  return segments;
}

// Icons
function EditIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function DeleteIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
    </svg>
  );
}

// Swipeable Movement Row Component
function MovementRow({
  movement,
  editable,
  onEdit,
  onDelete,
  highlighted,
  category,
}: {
  movement: MovementTotal;
  editable: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  highlighted: boolean;
  category: TileCategory;
}) {
  const x = useMotionValue(0);
  const deleteOpacity = useTransform(x, [-100, -50], [1, 0]);
  const editOpacity = useTransform(x, [50, 100], [0, 1]);
  const scale = useTransform(x, [-100, 0, 100], [0.95, 1, 0.95]);
  const [isDragging, setIsDragging] = useState(false);

  const handleDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    setIsDragging(false);
    const threshold = 80;

    if (info.offset.x < -threshold && onDelete) {
      animate(x, -150, { type: 'spring', stiffness: 300, damping: 30 });
      setTimeout(() => {
        if (navigator.vibrate) navigator.vibrate(20);
        onDelete();
      }, 150);
    } else if (info.offset.x > threshold && onEdit) {
      animate(x, 150, { type: 'spring', stiffness: 300, damping: 30 });
      setTimeout(() => {
        if (navigator.vibrate) navigator.vibrate(10);
        onEdit();
      }, 150);
    } else {
      animate(x, 0, { type: 'spring', stiffness: 400, damping: 30 });
    }
  };

  const handleTap = () => {
    if (!isDragging && editable && onEdit) {
      if (navigator.vibrate) navigator.vibrate(10);
      onEdit();
    }
  };

  const segments = buildStatSegments(movement);
  const highlightClass = highlighted ? styles[`highlighted_${category}`] : '';

  return (
    <div className={styles.swipeContainer}>
      {editable && (
        <>
          <motion.div className={styles.actionDelete} style={{ opacity: deleteOpacity }}>
            <DeleteIcon />
          </motion.div>
          <motion.div className={styles.actionEdit} style={{ opacity: editOpacity }}>
            <EditIcon />
          </motion.div>
        </>
      )}

      <motion.div
        className={`${styles.movementRow} ${highlightClass} ${editable ? styles.editable : ''}`}
        style={{ x, scale }}
        drag={editable ? 'x' : false}
        dragConstraints={{ left: -100, right: 100 }}
        dragElastic={0.1}
        onDragStart={() => setIsDragging(true)}
        onDragEnd={handleDragEnd}
        onClick={handleTap}
        whileTap={editable ? { scale: 0.98 } : undefined}
      >
        <span className={styles.movementName}>{displayName(movement.name)}</span>
        {segments.length > 0 && (
          <div className={styles.movementStats}>
            {segments.map((seg, i) => (
              <span key={i}>
                {i > 0 && <span className={styles.statSeparator}>{'\u00b7'} </span>}
                <span className={styles.statSegment}>
                  {seg.text}
                </span>
              </span>
            ))}
          </div>
        )}
        {movement.wasSubstituted && movement.originalMovement && (
          <span className={styles.subLabel}>
            {movement.substitutionType === 'easier'
              ? `Scaled from ${displayName(movement.originalMovement)}`
              : `Substituted from ${displayName(movement.originalMovement)}`}
          </span>
        )}
      </motion.div>
    </div>
  );
}

export function WorkloadBreakdown({
  breakdown,
  animationDelay = 0.65,
  editable = false,
  onEditMovement,
  onDeleteMovement,
}: WorkloadBreakdownProps) {
  if (!breakdown.movements || breakdown.movements.length === 0) {
    return null;
  }

  const staggerDelay = 0.08;
  const liquidEase: [number, number, number, number] = [0.16, 1, 0.3, 1];

  const isScaled = breakdown.movements.some(m => m.wasSubstituted && m.substitutionType === 'easier');

  // Compute which movements are "top 2" by impact score
  const highlightedNames = useMemo(() => {
    const scored = breakdown.movements.map(m => ({
      name: m.name,
      score: impactScore(m),
      category: categorizeMovement(m),
    }));
    scored.sort((a, b) => b.score - a.score);
    return new Set(scored.slice(0, 2).map(s => s.name));
  }, [breakdown.movements]);

  return (
    <motion.div
      className={styles.container}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: animationDelay }}
    >
      {isScaled && (
        <span className={styles.scaledBadge}>★ SCALED</span>
      )}

      <span className={styles.sectionTitle}>Movements</span>

      <div className={styles.list}>
        {breakdown.movements.map((movement, idx) => (
          <motion.div
            key={movement.name}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              delay: animationDelay + idx * staggerDelay,
              duration: 0.35,
              ease: liquidEase,
            }}
          >
            <MovementRow
              movement={movement}
              editable={editable}
              onEdit={() => onEditMovement?.(movement)}
              onDelete={() => onDeleteMovement?.(movement.name)}
              highlighted={highlightedNames.has(movement.name)}
              category={categorizeMovement(movement)}
            />
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
