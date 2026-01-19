import { motion } from 'framer-motion';
import styles from './PowerCell.module.css';

interface PowerCellProps {
  label: string;
  value: number;
  goal: number;
  unit: string;
  color: string;
  icon?: React.ReactNode;
}

export function PowerCell({ label, value, goal, unit, color, icon }: PowerCellProps) {
  const percentage = Math.min((value / goal) * 100, 100);
  const rawPercentage = (value / goal) * 100;
  const isOverload = rawPercentage > 100;

  const formatValue = (val: number): string => {
    if (val >= 10000) {
      return `${(val / 1000).toFixed(1)}k`;
    }
    if (val >= 1000) {
      return `${(val / 1000).toFixed(1)}k`;
    }
    return val.toFixed(0);
  };

  return (
    <motion.div
      className={`${styles.cell} ${isOverload ? styles.overload : ''}`}
      style={{ '--cell-color': color } as React.CSSProperties}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      {/* Tank container */}
      <div className={styles.tank}>
        {/* Background glow */}
        <div className={styles.tankGlow} />

        {/* Glass tank */}
        <div className={styles.tankGlass}>
          {/* Liquid fill */}
          <motion.div
            className={styles.liquid}
            initial={{ height: 0 }}
            animate={{ height: `${percentage}%` }}
            transition={{ duration: 1, ease: 'easeOut', delay: 0.2 }}
          >
            {/* Liquid surface wave */}
            <div className={styles.liquidSurface} />

            {/* Bubbles */}
            <div className={styles.bubbles}>
              <div className={styles.bubble} style={{ left: '20%', animationDelay: '0s' }} />
              <div className={styles.bubble} style={{ left: '50%', animationDelay: '0.5s' }} />
              <div className={styles.bubble} style={{ left: '75%', animationDelay: '1s' }} />
            </div>
          </motion.div>

          {/* Tank marks */}
          <div className={styles.marks}>
            <div className={styles.mark} style={{ bottom: '25%' }} />
            <div className={styles.mark} style={{ bottom: '50%' }} />
            <div className={styles.mark} style={{ bottom: '75%' }} />
          </div>
        </div>

        {/* Overload sparks */}
        {isOverload && (
          <div className={styles.sparks}>
            <div className={styles.spark} />
            <div className={styles.spark} />
            <div className={styles.spark} />
          </div>
        )}
      </div>

      {/* Info section */}
      <div className={styles.info}>
        {/* Icon */}
        {icon && <div className={styles.icon}>{icon}</div>}

        {/* Label */}
        <div className={styles.label}>{label}</div>

        {/* Value */}
        <div className={styles.value}>
          {formatValue(value)}
          <span className={styles.unit}>{unit}</span>
        </div>

        {/* Percentage */}
        <div className={styles.percentage}>
          {isOverload ? (
            <span className={styles.overloadBadge}>OVERLOAD</span>
          ) : (
            `${Math.round(rawPercentage)}%`
          )}
        </div>
      </div>
    </motion.div>
  );
}
