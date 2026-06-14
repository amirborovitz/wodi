import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePRs } from '../hooks/usePRs';
import { getCanonicalLiftName } from '../data/exerciseDefinitions';
import type { PersonalRecord } from '../types';
import styles from './RecordsScreen.module.css';

interface RecordsScreenProps {
  onBack: () => void;
}

interface PRGroup {
  movement: string;
  best: PersonalRecord;
  history: PersonalRecord[]; // sorted newest first
}

function formatPRValue(pr: PersonalRecord): string {
  return `${pr.weight}kg`;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

function groupPRs(prs: PersonalRecord[]): PRGroup[] {
  const groups = new Map<string, PersonalRecord[]>();
  for (const pr of prs) {
    const key = getCanonicalLiftName(pr.movement).toLowerCase();
    const list = groups.get(key) ?? [];
    list.push(pr);
    groups.set(key, list);
  }

  const result: PRGroup[] = [];
  for (const [, list] of groups) {
    // Sort by date desc (newest first)
    const sorted = [...list].sort((a, b) => b.date.getTime() - a.date.getTime());
    // Best = highest weight
    const best = [...list].sort((a, b) => b.weight - a.weight)[0];
    result.push({ movement: getCanonicalLiftName(best.movement), best, history: sorted });
  }

  // Sort groups: most recent PR first
  return result.sort((a, b) => b.best.date.getTime() - a.best.date.getTime());
}

function BackIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className={styles.backIconSvg}>
      <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PRCard({ group, onTap }: { group: PRGroup; onTap: () => void }): React.ReactElement {
  return (
    <button type="button" className={styles.prCard} onClick={onTap}>
      <span className={styles.prMovement}>{group.movement}</span>
      <span className={styles.prBest}>{formatPRValue(group.best)}</span>
      <span className={styles.prDate}>{formatDate(group.best.date)}</span>
    </button>
  );
}

function DetailSheet({
  group,
  onClose,
}: {
  group: PRGroup;
  onClose: () => void;
}): React.ReactElement {
  return (
    <>
      <motion.button
        type="button"
        className={styles.backdrop}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        aria-label="Close"
      />
      <motion.div
        className={styles.sheet}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 380, damping: 36 }}
      >
        <div className={styles.sheetHandle} />
        <div className={styles.sheetHeader}>
          <div>
            <p className={styles.sheetEyebrow}>PERSONAL RECORD</p>
            <h2 className={styles.sheetTitle}>{group.movement}</h2>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className={styles.sheetBest}>
          <span className={styles.sheetBestLabel}>CURRENT BEST</span>
          <span className={styles.sheetBestValue}>{formatPRValue(group.best)}</span>
          <span className={styles.sheetBestDate}>{formatDate(group.best.date)}</span>
        </div>

        {group.history.length > 1 && (
          <>
            <p className={styles.sheetHistoryLabel}>HISTORY</p>
            <div className={styles.sheetHistoryList}>
              {group.history.map((pr) => (
                <div key={pr.id} className={styles.historyRow}>
                  <span className={styles.historyWeight}>{formatPRValue(pr)}</span>
                  <span className={styles.historyDate}>{formatDate(pr.date)}</span>
                  {pr.id === group.best.id && (
                    <span className={styles.historyBestChip}>BEST</span>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </motion.div>
    </>
  );
}

export function RecordsScreen({ onBack }: RecordsScreenProps): React.ReactElement {
  const { prs, loading } = usePRs();
  const [selectedGroup, setSelectedGroup] = useState<PRGroup | null>(null);

  const groups = useMemo(() => groupPRs(prs), [prs]);

  return (
    <div className={styles.screen}>
      {/* Header */}
      <motion.div
        className={styles.header}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22 }}
      >
        <button type="button" className={styles.backBtn} onClick={onBack} aria-label="Go back">
          <BackIcon />
        </button>
        <h1 className={styles.pageTitle}>Records</h1>
      </motion.div>

      {/* Content */}
      <div className={styles.content}>
        {loading ? (
          <div className={styles.skeletonGrid}>
            {[0, 1, 2, 3].map(i => (
              <div key={i} className={styles.skeleton} />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <motion.div
            className={styles.emptyState}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
          >
            <span className={styles.emptyIcon}>★</span>
            <p className={styles.emptyText}>
              Your records will appear here after your first PR. Keep grinding.
            </p>
          </motion.div>
        ) : (
          <motion.div
            className={styles.grid}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.08, duration: 0.3 }}
          >
            {groups.map((group, i) => (
              <motion.div
                key={group.movement}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.04 * i, duration: 0.24 }}
              >
                <PRCard group={group} onTap={() => setSelectedGroup(group)} />
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>

      <AnimatePresence>
        {selectedGroup && (
          <DetailSheet group={selectedGroup} onClose={() => setSelectedGroup(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}
