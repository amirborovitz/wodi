import { motion } from 'framer-motion';
import styles from './ProgressRing.module.css';
import type { RingMetric } from '../../types';

interface ProgressRingProps {
  metric: RingMetric;
  size?: number;
  strokeWidth?: number;
  delay?: number;
}

export function ProgressRing({
  metric,
  size = 100,
  strokeWidth = 8,
  delay = 0,
}: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (metric.percentage / 100) * circumference;

  return (
    <div className={styles.container} style={{ width: size }}>
      <div className={styles.ringWrapper} style={{ width: size, height: size }}>
        <svg
          className={styles.ring}
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
        >
          {/* Background ring */}
          <circle
            className={styles.background}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            strokeWidth={strokeWidth}
            fill="none"
          />

          {/* Animated progress ring */}
          <motion.circle
            className={styles.progress}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            strokeWidth={strokeWidth}
            fill="none"
            stroke={metric.color}
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset }}
            transition={{
              duration: 1.5,
              delay: delay,
              ease: [0.34, 1.56, 0.64, 1],
            }}
            style={{
              filter: `drop-shadow(0 0 8px ${metric.glowColor})`,
            }}
          />
        </svg>

        {/* Center content */}
        <motion.div
          className={styles.content}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: delay + 0.8 }}
        >
          <span className={styles.value}>{metric.value}</span>
          <span className={styles.unit}>{metric.unit}</span>
        </motion.div>
      </div>

      {/* Label below */}
      <motion.span
        className={styles.label}
        style={{ color: metric.color }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: delay + 1.2 }}
      >
        {metric.label}
      </motion.span>
    </div>
  );
}
