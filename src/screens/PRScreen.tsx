import { motion } from 'framer-motion';
import { usePRs } from '../hooks/usePRs';
import { Button } from '../components/ui';
import styles from './PRScreen.module.css';

interface PRScreenProps {
  onBack: () => void;
  onSelectWorkout?: (workoutId: string) => void;
}

const BackIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const TrophyIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M4 22h16" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatWeight(kg: number): string {
  return `${kg} kg`;
}

export function PRScreen({ onBack, onSelectWorkout }: PRScreenProps) {
  const { prs, loading, error } = usePRs();

  // Get most recent PR date
  const mostRecentPR = prs.length > 0 ? prs[0] : null;

  // Group PRs by movement for display (show best per movement)
  const prsByMovement = prs.reduce((acc, pr) => {
    if (!acc[pr.movement] || pr.weight > acc[pr.movement].weight) {
      acc[pr.movement] = pr;
    }
    return acc;
  }, {} as Record<string, typeof prs[0]>);

  const uniquePRs = Object.values(prsByMovement).sort((a, b) => b.weight - a.weight);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <Button variant="ghost" size="sm" onClick={onBack} icon={<BackIcon />} className={styles.backButton}>
          Back
        </Button>
        <h1 className={styles.headerTitle}>Personal Records</h1>
        <div className={styles.headerSpacer} />
      </header>

      {/* Summary Card */}
      <motion.div
        className={styles.summaryCard}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className={styles.summaryIcon}>
          <TrophyIcon />
        </div>
        <div className={styles.summaryStats}>
          <div className={styles.summaryStat}>
            <span className={styles.summaryValue}>{prs.length}</span>
            <span className={styles.summaryLabel}>Total PRs</span>
          </div>
          {mostRecentPR && (
            <div className={styles.summaryStat}>
              <span className={styles.summaryValue}>{formatDate(mostRecentPR.date)}</span>
              <span className={styles.summaryLabel}>Most Recent</span>
            </div>
          )}
        </div>
      </motion.div>

      {/* PR List */}
      <div className={styles.prList}>
        {loading ? (
          <div className={styles.loadingState}>
            <span className={styles.loadingText}>Loading PRs...</span>
          </div>
        ) : error ? (
          <div className={styles.errorState}>
            <span className={styles.errorText}>Failed to load PRs</span>
          </div>
        ) : uniquePRs.length === 0 ? (
          <motion.div
            className={styles.emptyState}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            <div className={styles.emptyIcon}>
              <TrophyIcon />
            </div>
            <p className={styles.emptyTitle}>No PRs Yet</p>
            <p className={styles.emptyText}>
              Start logging workouts to track your personal records!
            </p>
          </motion.div>
        ) : (
          uniquePRs.map((pr, index) => (
            <motion.button
              key={pr.id}
              className={styles.prCard}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + index * 0.05, duration: 0.3 }}
              onClick={() => onSelectWorkout?.(pr.workoutId)}
              disabled={!onSelectWorkout}
            >
              <div className={styles.prRank}>
                <span className={styles.rankNumber}>{index + 1}</span>
              </div>
              <div className={styles.prInfo}>
                <span className={styles.prMovement}>{pr.movement}</span>
                <span className={styles.prDate}>{formatDate(pr.date)}</span>
              </div>
              <div className={styles.prWeight}>
                <span className={styles.weightValue}>{formatWeight(pr.weight)}</span>
              </div>
            </motion.button>
          ))
        )}
      </div>
    </div>
  );
}
