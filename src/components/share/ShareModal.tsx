import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShareableCard } from './ShareableCard';
import { ShareableCardStory } from './ShareableCardStory';
import { Button } from '../ui';
import {
  shareWorkoutCard,
  isNativeShareSupported,
  elementToCanvas,
  canvasToBlob,
  downloadBlob,
  copyImageToClipboard,
} from '../../utils/shareUtils';
import styles from './ShareModal.module.css';
import type { Exercise, WorkoutType, WorkoutFormat, RingMetric, Achievement } from '../../types';

type ShareFormat = 'story' | 'standard';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  workoutData: {
    title: string;
    type: WorkoutType;
    format?: WorkoutFormat;
    duration: number;
    exercises: Exercise[];
    totalVolume: number;
    totalReps?: number;
    currentStreak?: number;
    prExercises?: string[];
  };
  rings?: RingMetric[];
  heroAchievement?: Achievement;
}

const formatOptions: { value: ShareFormat; label: string }[] = [
  { value: 'story', label: 'Story' },
  { value: 'standard', label: 'Standard' },
];

export function ShareModal({
  isOpen,
  onClose,
  workoutData,
  rings = [],
  heroAchievement,
}: ShareModalProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [selectedFormat, setSelectedFormat] = useState<ShareFormat>('story');
  const [isProcessing, setIsProcessing] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const showFeedback = (message: string, autoClose = false) => {
    setFeedbackMessage(message);
    if (autoClose) {
      setTimeout(() => {
        setFeedbackMessage(null);
        onClose();
      }, 1500);
    } else {
      setTimeout(() => setFeedbackMessage(null), 2500);
    }
  };

  const handleShare = async () => {
    if (!cardRef.current) return;

    setIsProcessing(true);
    setFeedbackMessage(null);

    try {
      const result = await shareWorkoutCard(
        cardRef.current,
        workoutData.title,
        { filename: `wodboard-${workoutData.title.toLowerCase().replace(/\s+/g, '-')}` }
      );

      if (result.success) {
        if (result.method === 'share') {
          showFeedback('Shared successfully!', true);
        } else {
          showFeedback('Image saved to downloads!', true);
        }
      } else {
        showFeedback('Failed to share. Please try again.');
      }
    } catch {
      showFeedback('Something went wrong.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = async () => {
    if (!cardRef.current) return;

    setIsProcessing(true);
    setFeedbackMessage(null);

    try {
      const canvas = await elementToCanvas(cardRef.current, { scale: 3 });
      const blob = await canvasToBlob(canvas, 'png');
      const filename = `wodboard-${workoutData.title.toLowerCase().replace(/\s+/g, '-')}.png`;
      downloadBlob(blob, filename);
      showFeedback('Image downloaded!');
    } catch {
      showFeedback('Download failed. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCopy = async () => {
    if (!cardRef.current) return;

    setIsProcessing(true);
    setFeedbackMessage(null);

    try {
      const canvas = await elementToCanvas(cardRef.current, { scale: 3 });
      const blob = await canvasToBlob(canvas, 'png');
      const success = await copyImageToClipboard(blob);

      if (success) {
        showFeedback('Copied to clipboard!');
      } else {
        showFeedback('Copy not supported on this device.');
      }
    } catch {
      showFeedback('Copy failed. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const supportsNativeShare = isNativeShareSupported();

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className={styles.overlay}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className={styles.modal}
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button className={styles.closeButton} onClick={onClose}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {/* Format selector */}
            <div className={styles.formatSelector}>
              {formatOptions.map((option) => (
                <button
                  key={option.value}
                  className={`${styles.formatButton} ${
                    selectedFormat === option.value ? styles.formatButtonActive : ''
                  }`}
                  onClick={() => setSelectedFormat(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {/* Card preview */}
            <div className={`${styles.cardWrapper} ${selectedFormat === 'story' ? styles.cardWrapperStory : ''}`}>
              {selectedFormat === 'story' ? (
                <ShareableCardStory
                  ref={cardRef}
                  title={workoutData.title}
                  type={workoutData.type}
                  format={workoutData.format}
                  date={new Date()}
                  duration={workoutData.duration}
                  exercises={workoutData.exercises}
                  totalVolume={workoutData.totalVolume}
                  totalReps={workoutData.totalReps}
                  rings={rings}
                  heroAchievement={heroAchievement}
                  prExercises={workoutData.prExercises}
                />
              ) : (
                <ShareableCard
                  ref={cardRef}
                  title={workoutData.title}
                  type={workoutData.type}
                  format={workoutData.format}
                  date={new Date()}
                  duration={workoutData.duration}
                  exercises={workoutData.exercises}
                  totalVolume={workoutData.totalVolume}
                  currentStreak={workoutData.currentStreak}
                  prExercises={workoutData.prExercises}
                />
              )}
            </div>

            {/* Feedback message */}
            {feedbackMessage && (
              <motion.div
                className={styles.result}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                {feedbackMessage}
              </motion.div>
            )}

            {/* Action buttons */}
            <div className={styles.actions}>
              {supportsNativeShare && (
                <Button
                  variant="primary"
                  size="lg"
                  fullWidth
                  onClick={handleShare}
                  loading={isProcessing}
                >
                  Share
                </Button>
              )}
              <div className={styles.secondaryActions}>
                <Button
                  variant="secondary"
                  size="md"
                  onClick={handleDownload}
                  disabled={isProcessing}
                >
                  Download
                </Button>
                <Button
                  variant="secondary"
                  size="md"
                  onClick={handleCopy}
                  disabled={isProcessing}
                >
                  Copy
                </Button>
              </div>
            </div>

            <p className={styles.hint}>
              {selectedFormat === 'story'
                ? 'Perfect for Instagram Stories'
                : 'Share your workout anywhere'}
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
