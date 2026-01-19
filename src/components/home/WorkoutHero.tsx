import { motion } from 'framer-motion';
import { Button } from '../ui';
import styles from './WorkoutHero.module.css';
import type { WorkoutType } from '../../types';

interface WorkoutHeroProps {
  workoutType?: WorkoutType;
  onTakePhoto: () => void;
  onUploadImage: () => void;
}

const meshColorMap: Record<WorkoutType, { c1: string; c2: string; c3: string }> = {
  for_time: {
    c1: 'var(--mesh-for-time-1)',
    c2: 'var(--mesh-for-time-2)',
    c3: 'var(--mesh-for-time-3)',
  },
  amrap: {
    c1: 'var(--mesh-amrap-1)',
    c2: 'var(--mesh-amrap-2)',
    c3: 'var(--mesh-amrap-3)',
  },
  emom: {
    c1: 'var(--mesh-emom-1)',
    c2: 'var(--mesh-emom-2)',
    c3: 'var(--mesh-emom-3)',
  },
  strength: {
    c1: 'var(--mesh-strength-1)',
    c2: 'var(--mesh-strength-2)',
    c3: 'var(--mesh-strength-3)',
  },
  metcon: {
    c1: 'var(--mesh-metcon-1)',
    c2: 'var(--mesh-metcon-2)',
    c3: 'var(--mesh-metcon-3)',
  },
  mixed: {
    c1: 'var(--mesh-mixed-1)',
    c2: 'var(--mesh-mixed-2)',
    c3: 'var(--mesh-mixed-3)',
  },
};

export function WorkoutHero({
  workoutType = 'metcon',
  onTakePhoto,
  onUploadImage,
}: WorkoutHeroProps) {
  const colors = meshColorMap[workoutType] || meshColorMap.metcon;

  return (
    <motion.div
      className={styles.hero}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, delay: 0.2 }}
    >
      {/* Mesh gradient background */}
      <div
        className={styles.meshBackground}
        style={
          {
            '--mesh-c1': colors.c1,
            '--mesh-c2': colors.c2,
            '--mesh-c3': colors.c3,
          } as React.CSSProperties
        }
      />

      {/* Glass overlay */}
      <div className={styles.glassOverlay} />

      {/* Content */}
      <div className={styles.content}>
        {/* Camera icon */}
        <motion.div
          className={styles.iconContainer}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, delay: 0.4 }}
        >
          <svg
            className={styles.cameraIcon}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path
              d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2v11z"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="12" cy="13" r="4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </motion.div>

        {/* Title */}
        <motion.h2
          className={styles.title}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          Log your WOD
        </motion.h2>

        {/* Subtitle */}
        <motion.p
          className={styles.subtitle}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          Snap a photo of your workout to get started
        </motion.p>

        {/* Buttons */}
        <motion.div
          className={styles.buttons}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
        >
          <Button variant="primary" size="lg" onClick={onTakePhoto}>
            Take Photo
          </Button>
          <Button variant="secondary" size="lg" onClick={onUploadImage}>
            Upload Image
          </Button>
        </motion.div>
      </div>
    </motion.div>
  );
}
