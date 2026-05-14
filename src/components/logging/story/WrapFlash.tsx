import { useEffect } from 'react';
import { motion } from 'framer-motion';
import styles from './WrapFlash.module.css';

interface WrapFlashProps {
  ep: number;
  /** e.g. "Strength + AMRAP" */
  workoutLabel: string;
  onDone: () => void;
}

export function WrapFlash({ ep, workoutLabel, onDone }: WrapFlashProps) {
  useEffect(() => {
    const t = setTimeout(onDone, 1700);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <motion.div
      className={styles.container}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <motion.div
        className={styles.inner}
        initial={{ opacity: 0, y: 28 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      >
        <motion.p
          className={styles.hero}
          initial={{ opacity: 0, y: 24, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 0.16, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          +{Math.max(0, Math.round(ep))} EP
        </motion.p>
        {workoutLabel && <p className={styles.sub}>{workoutLabel}</p>}
      </motion.div>
    </motion.div>
  );
}
