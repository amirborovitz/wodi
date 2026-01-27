import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { WorkloadBreakdown as WorkloadBreakdownType, MovementTotal } from '../../types';
import styles from './WorkloadBreakdown.module.css';

interface WorkloadBreakdownProps {
  breakdown: WorkloadBreakdownType;
  showTotals?: boolean;
  animationDelay?: number;
}

/**
 * Format the value for display
 */
function formatValue(movement: MovementTotal): string {
  if (movement.totalDistance && movement.totalDistance > 0) {
    // Convert to km if over 1000m
    if (movement.totalDistance >= 1000) {
      return `${(movement.totalDistance / 1000).toFixed(1)}km`;
    }
    return `${movement.totalDistance}m`;
  }

  if (movement.totalCalories && movement.totalCalories > 0) {
    return `${movement.totalCalories} cal`;
  }

  if (movement.totalReps && movement.totalReps > 0) {
    return movement.totalReps.toString();
  }

  return '0';
}

/**
 * Format volume for display
 */
function formatVolume(kg: number): string {
  if (kg >= 1000) {
    return `${(kg / 1000).toFixed(3)}t`;
  }
  return `${Math.round(kg).toLocaleString()} kg`;
}

/**
 * Get shortened movement name for display
 */
function shortenName(name: string): string {
  // Common abbreviations
  const abbreviations: Record<string, string> = {
    'handstand push-up': 'HSPU',
    'handstand pushup': 'HSPU',
    'toes to bar': 'T2B',
    'knees to elbow': 'K2E',
    'chest to bar pull-up': 'C2B',
    'chest to bar pullup': 'C2B',
    'double under': 'DU',
    'single under': 'SU',
    'air squat': 'Air Squat',
    'push-up': 'Push-up',
    'pushup': 'Push-up',
    'pull-up': 'Pull-up',
    'pullup': 'Pull-up',
    'kettlebell swing': 'KB Swing',
    'russian kettlebell swing': 'RKB Swing',
    'american kettlebell swing': 'AKB Swing',
    'hang power clean': 'HPC',
    'power clean': 'PC',
    'squat clean': 'Squat Clean',
    'clean and jerk': 'C&J',
    'power snatch': 'P. Snatch',
    'squat snatch': 'Sq. Snatch',
    'overhead squat': 'OHS',
    'front squat': 'Front Squat',
    'back squat': 'Back Squat',
    'shoulder to overhead': 'S2OH',
  };

  const lowerName = name.toLowerCase();
  if (abbreviations[lowerName]) {
    return abbreviations[lowerName];
  }

  // Capitalize first letter of each word
  return name.split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export function WorkloadBreakdown({
  breakdown,
  showTotals = false,
  animationDelay = 0.65,
}: WorkloadBreakdownProps) {
  if (!breakdown.movements || breakdown.movements.length === 0) {
    return null;
  }
  const gridRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(1);
  const tileVariants = {
    hidden: { opacity: 0, y: 10, scale: 0.98 },
    visible: (rowIndex: number) => ({
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        delay: animationDelay + rowIndex * 0.05,
        duration: 0.3,
        ease: [0.16, 1, 0.3, 1] as const,
      },
    }),
  };

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid || typeof ResizeObserver === 'undefined') return;

    const minTileWidth = 100;
    const gap = 8;
    const updateColumns = () => {
      const width = grid.getBoundingClientRect().width;
      const nextColumns = Math.max(1, Math.floor((width + gap) / (minTileWidth + gap)));
      setColumns(nextColumns);
    };

    updateColumns();
    const observer = new ResizeObserver(updateColumns);
    observer.observe(grid);
    return () => observer.disconnect();
  }, []);

  return (
    <motion.div
      className={styles.container}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: animationDelay }}
    >
      <span className={styles.sectionTitle}>Workload Breakdown</span>

      <div className={styles.grid} ref={gridRef}>
        {breakdown.movements.map((movement, idx) => (
          <motion.div
            key={movement.name}
            className={`${styles.tile} ${styles[movement.color || 'magenta']}`}
            custom={Math.floor(idx / columns)}
            variants={tileVariants}
            initial="hidden"
            animate="visible"
          >
            <span className={styles.value}>{formatValue(movement)}</span>
            <span className={styles.name}>{shortenName(movement.name)}</span>
            {movement.weight && movement.weight > 0 && (
              <span className={styles.weight}>
                @ {movement.weight}{movement.unit === 'lb' ? 'lb' : 'kg'}
              </span>
            )}
          </motion.div>
        ))}
      </div>

      {showTotals && (breakdown.grandTotalReps > 0 || breakdown.grandTotalVolume > 0) && (
        <div className={styles.totals}>
          {breakdown.grandTotalReps > 0 && (
            <div className={styles.totalItem}>
              <span className={styles.totalValue}>{breakdown.grandTotalReps}</span>
              <span className={styles.totalLabel}>Total Reps</span>
            </div>
          )}
          {breakdown.grandTotalVolume > 0 && (
            <div className={styles.totalItem}>
              <span className={styles.totalValue}>{formatVolume(breakdown.grandTotalVolume)}</span>
              <span className={styles.totalLabel}>Volume</span>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
