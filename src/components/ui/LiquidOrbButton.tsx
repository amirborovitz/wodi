import { motion } from 'framer-motion';
import styles from './LiquidOrbButton.module.css';

interface LiquidOrbButtonProps {
  onClick: () => void;
}

export function LiquidOrbButton({ onClick }: LiquidOrbButtonProps) {
  return (
    <motion.button
      className={styles.orb}
      onClick={onClick}
      whileTap={{ scale: 0.9 }}
      whileHover={{ scale: 1.05 }}
      aria-label="Add workout"
    >
      {/* Rotating gradient ring */}
      <div className={styles.gradientRing} />

      {/* Pulsing glow layers */}
      <div className={styles.pulseLayer1} />
      <div className={styles.pulseLayer2} />

      {/* Inner glass surface */}
      <div className={styles.innerSurface}>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
      </div>
    </motion.button>
  );
}
