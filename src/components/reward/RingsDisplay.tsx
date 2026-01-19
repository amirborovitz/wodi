import { motion } from 'framer-motion';
import { ProgressRing } from './ProgressRing';
import styles from './RingsDisplay.module.css';
import type { RingMetric } from '../../types';

interface RingsDisplayProps {
  rings: RingMetric[];
  size?: number;
}

export function RingsDisplay({ rings, size = 100 }: RingsDisplayProps) {
  return (
    <motion.div
      className={styles.container}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      {rings.map((ring, index) => (
        <ProgressRing
          key={ring.id}
          metric={ring}
          size={size}
          delay={0.2 + index * 0.2}
        />
      ))}
    </motion.div>
  );
}
