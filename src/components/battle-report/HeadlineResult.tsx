import { motion } from 'framer-motion';
import { useCountUp } from '../../hooks/useCountUp';
import type { HeadlineData } from './types';
import styles from './HeadlineResult.module.css';

interface HeadlineResultProps {
  headline: HeadlineData;
  epEarned: number;
}

export function HeadlineResult({ headline, epEarned }: HeadlineResultProps) {
  const animatedEP = useCountUp(epEarned, { duration: 1400, delay: 400 });

  return (
    <motion.div
      className={styles.container}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Format pill */}
      <span
        className={styles.formatPill}
        style={{ '--pill-accent': headline.accentColor } as React.CSSProperties}
      >
        {headline.formatLabel}
      </span>

      {/* Primary score */}
      <div className={styles.primaryRow}>
        <h1 className={styles.primaryValue}>{headline.primary}</h1>
        {headline.partialPill && (
          <motion.span
            className={styles.partialPill}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: 0.5 }}
          >
            {headline.partialPill}
          </motion.span>
        )}
      </div>

      {/* EP earned */}
      <motion.div
        className={styles.epRow}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3, duration: 0.4 }}
      >
        <span className={styles.epValue}>+{Math.round(animatedEP)}</span>
        <span className={styles.epLabel}>EP</span>
      </motion.div>
    </motion.div>
  );
}
