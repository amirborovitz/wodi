import { motion } from 'framer-motion';
import { Button, Card } from '../ui';
import { MovementEditorBundle } from './MovementEditorBundle';
import type { WizardShellProps } from './types';
import styles from './WizardShell.module.css';

const BackIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function getProgressPhase(pct: number): string {
  if (pct >= 80) return styles.progressFillLate;
  if (pct >= 45) return styles.progressFillMid;
  return styles.progressFillEarly;
}

export function WizardShell({
  motionKey,
  title,
  showTitle = true,
  progress,
  exerciseName,
  exercisePrescription,
  showPrescription = true,
  movementEditor,
  modeSelector,
  nav,
  onMobileNextInput,
  children,
}: WizardShellProps) {
  const pct = progress ? (progress.current / progress.total) * 100 : 0;

  return (
    <motion.div
      className={styles.wizardContainer}
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      key={motionKey}
    >
      {/* Workout title */}
      {title && showTitle && (
        <h2 className={styles.workoutTitle}>{title}</h2>
      )}

      {/* Progress bar */}
      {progress && (
        <div className={styles.progressBar}>
          <div className={styles.progressText}>{progress.label}</div>
          <div className={styles.progressTrack}>
            <div
              className={`${styles.progressFill} ${getProgressPhase(pct)}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {/* Exercise card */}
      <Card
        padding="none"
        className={styles.exerciseCard}
        data-mobile-input-scope
        onKeyDown={onMobileNextInput}
      >
        <div className={styles.exerciseHeader}>
          <h2 className={styles.exerciseName}>{exerciseName}</h2>
          {showPrescription && exercisePrescription && (
            <p className={styles.exercisePrescriptionLarge}>{exercisePrescription}</p>
          )}
        </div>

        {/* Mode selector */}
        {modeSelector?.show && (
          <div className={styles.modeSelectorContainer}>
            <label className={styles.modeSelectorLabel}>
              Logging mode {modeSelector.isLoading && <span className={styles.loadingIndicator}>(AI thinking...)</span>}
            </label>
            <select
              value={modeSelector.value}
              onChange={(e) => modeSelector.onChange(e.target.value as Parameters<typeof modeSelector.onChange>[0])}
              className={styles.modeSelector}
            >
              {modeSelector.options.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            {modeSelector.guidance?.explanation && (
              <p className={styles.modeSelectorHint}>{modeSelector.guidance.explanation}</p>
            )}
          </div>
        )}

        {/* Movement editor */}
        {movementEditor && (
          <MovementEditorBundle {...movementEditor} />
        )}

        {/* Type-specific inputs */}
        {children}
      </Card>

      {/* Navigation */}
      <div className={styles.wizardActions}>
        <Button
          variant="secondary"
          onClick={nav.onBack}
          size="lg"
          icon={<BackIcon />}
          className={styles.secondaryCta}
        >
          Back
        </Button>
        <Button
          onClick={nav.onNext}
          size="lg"
          disabled={nav.nextDisabled}
          variant={nav.nextVariant}
          className={`${nav.isFinish ? styles.saveButton : ''} ${styles.primaryCta}`}
        >
          {nav.nextLabel}
        </Button>
      </div>
    </motion.div>
  );
}
