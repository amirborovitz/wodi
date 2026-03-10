import { motion } from 'framer-motion';
import type { BadgeInfo } from './types';
import styles from './AchievementBadge.module.css';

interface AchievementBadgeProps {
  badge: BadgeInfo;
  delay?: number;
}

export function AchievementBadge({ badge, delay = 0 }: AchievementBadgeProps) {
  return (
    <motion.span
      className={styles.badge}
      style={{
        '--badge-color': badge.color,
      } as React.CSSProperties}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      <span className={styles.icon}>{badge.icon}</span>
      <span className={styles.label}>{badge.label}</span>
    </motion.span>
  );
}
