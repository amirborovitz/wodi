import { motion } from 'framer-motion';
import { useCountUp } from '../../hooks/useCountUp';
import type { TeamImpactData } from './types';
import styles from './TeamImpactBar.module.css';

interface TeamImpactBarProps {
  data: TeamImpactData;
}

export function TeamImpactBar({ data }: TeamImpactBarProps) {
  const animatedPercent = useCountUp(data.personalPercent, { duration: 1000, delay: 600 });
  const animatedTotal = useCountUp(data.teamTotal, { duration: 1200, delay: 400 });

  return (
    <motion.div
      className={styles.container}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Team total bar */}
      <div className={styles.barSection}>
        <div className={styles.barHeader}>
          <span className={styles.barTitle}>TEAM TOTAL</span>
          <span className={styles.barValue}>
            {Math.round(animatedTotal).toLocaleString()} kg
          </span>
        </div>
        <div className={styles.barTrack}>
          <motion.div
            className={styles.barFill}
            initial={{ width: 0 }}
            animate={{ width: `${data.personalPercent}%` }}
            transition={{ duration: 1, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
          />
        </div>
      </div>

      {/* Personal impact circle */}
      <div className={styles.impactCircle}>
        <span className={styles.impactPercent}>{Math.round(animatedPercent)}%</span>
        <span className={styles.impactLabel}>YOUR IMPACT</span>
        <span className={styles.impactDetail}>
          +{data.personalVolume.toLocaleString()} kg
        </span>
      </div>
    </motion.div>
  );
}
