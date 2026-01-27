import { motion } from 'framer-motion';
import styles from './TodaysWodCard.module.css';

interface TodaysWodCardProps {
  onScanBoard: () => void;
  onUploadImage?: () => void;
  onUsePastWorkout?: () => void;
}

export function TodaysWodCard({
  onScanBoard,
  onUploadImage,
  onUsePastWorkout,
}: TodaysWodCardProps) {
  return (
    <motion.div
      className={styles.card}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, duration: 0.4 }}
    >
      <div className={styles.header}>
        <h2 className={styles.title}>Log Your Workout</h2>
        <span className={styles.subtitle}>Choose how you want to capture it</span>
      </div>

      <div className={styles.actions}>
        {onUploadImage && (
          <motion.button
            className={styles.primaryButton}
            onClick={onUploadImage}
            whileTap={{ scale: 0.98 }}
          >
            <svg
              className={styles.buttonIcon}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span>Upload Screenshot</span>
          </motion.button>
        )}

        <motion.button
          className={styles.secondaryButton}
          onClick={onScanBoard}
          whileTap={{ scale: 0.98 }}
        >
          <svg
            className={styles.buttonIcon}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M3 9h18M9 21V9" />
          </svg>
          <span>Scan Board</span>
        </motion.button>

        {onUsePastWorkout && (
          <motion.button
            className={styles.secondaryButton}
            onClick={onUsePastWorkout}
            whileTap={{ scale: 0.98 }}
          >
            <svg
              className={styles.buttonIcon}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12 8v4l3 2" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="12" cy="12" r="9" />
            </svg>
            <span>Use Past Workout</span>
          </motion.button>
        )}
      </div>

      {/* Decorative glow */}
      <div className={styles.glow} />
    </motion.div>
  );
}
