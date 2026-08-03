import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRecords, type RecordEntry } from '../hooks/useRecords';
import styles from './RecordsScreen.module.css';

interface RecordsScreenProps {
  onBack: () => void;
}

/** A record set inside this window still reads as news. */
const FRESH_PR_DAYS = 30;

function formatMonth(date: Date): string {
  return date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

function isFresh(date: Date): boolean {
  return Date.now() - date.getTime() < FRESH_PR_DAYS * 24 * 60 * 60 * 1000;
}

function ChevronLeftIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function StarIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={styles.starIcon}>
      <path d="M12 2l2.9 6.6 7.1.7-5.4 4.7 1.7 7-6.3-3.8-6.3 3.8 1.7-7L2 9.3l7.1-.7z" />
    </svg>
  );
}

/**
 * The progression line. Plotted on its own min/max so the shape of THIS record's climb
 * fills the box — the axis is deliberately unlabelled, it reads as movement, not as a
 * number to measure off. A benchmark's series descends (a faster clock), which draws the
 * same "up and to the right" improvement once the y-axis is flipped for it.
 */
function Sparkline({
  trend,
  higherIsBetter,
  width,
  height,
  className,
}: {
  trend: number[];
  higherIsBetter: boolean;
  width: number;
  height: number;
  className?: string;
}): React.ReactElement | null {
  if (trend.length < 2) return null;

  const min = Math.min(...trend);
  const max = Math.max(...trend);
  const span = max - min || 1;
  const pad = 2;
  const usable = height - pad * 2;

  const points = trend.map((value, i) => {
    const ratio = (value - min) / span;
    const level = higherIsBetter ? ratio : 1 - ratio;
    return [(i / (trend.length - 1)) * width, pad + (1 - level) * usable] as const;
  });
  const path = points
    .map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(' ');
  const [lastX, lastY] = points[points.length - 1];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={className}
      aria-hidden="true"
    >
      <path d={path} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r="2.6" fill="currentColor" />
    </svg>
  );
}

function HeroCard({ entry, onTap }: { entry: RecordEntry; onTap: () => void }): React.ReactElement {
  return (
    <button type="button" className={styles.heroCard} onClick={onTap}>
      <span className={styles.heroGlow} aria-hidden="true" />
      <span className={styles.heroBadge}>
        <StarIcon />
        {isFresh(entry.achievedAt) ? 'New PR' : 'Latest PR'}
      </span>
      {entry.kind === 'benchmark' && <span className={styles.heroEyebrow}>Benchmark</span>}
      <span className={styles.heroMovement}>{entry.movement}</span>
      <span className={styles.heroValueRow}>
        <span className={styles.heroValue}>{entry.value}</span>
        <Sparkline
          trend={entry.trend}
          higherIsBetter={entry.higherIsBetter}
          width={90}
          height={34}
          className={styles.heroSpark}
        />
      </span>
      <span className={styles.heroMonth}>{formatMonth(entry.achievedAt)}</span>
    </button>
  );
}

function RecordCard({ entry, onTap }: { entry: RecordEntry; onTap: () => void }): React.ReactElement {
  return (
    <button type="button" className={styles.recordCard} onClick={onTap}>
      {entry.kind === 'benchmark' && <span className={styles.cardEyebrow}>Benchmark</span>}
      <span className={styles.cardMovement}>{entry.movement}</span>
      <span className={styles.cardValueRow}>
        <span className={styles.cardValue}>{entry.value}</span>
        <Sparkline
          trend={entry.trend}
          higherIsBetter={entry.higherIsBetter}
          width={46}
          height={18}
          className={styles.cardSpark}
        />
      </span>
      <span className={styles.cardMonth}>{formatMonth(entry.achievedAt)}</span>
    </button>
  );
}

function RecordSection({
  label,
  entries,
  onSelect,
}: {
  label: string;
  entries: RecordEntry[];
  onSelect: (entry: RecordEntry) => void;
}): React.ReactElement | null {
  if (entries.length === 0) return null;

  return (
    <>
      <h2 className={styles.sectionLabel}>{label}</h2>
      <div className={styles.grid}>
        {entries.map((entry, i) => (
          <motion.div
            key={entry.id}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(0.03 * i, 0.24), duration: 0.24 }}
          >
            <RecordCard entry={entry} onTap={() => onSelect(entry)} />
          </motion.div>
        ))}
      </div>
    </>
  );
}

function DetailSheet({ entry, onClose }: { entry: RecordEntry; onClose: () => void }): React.ReactElement {
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
            <p className={styles.sheetEyebrow}>
              {entry.kind === 'benchmark' ? 'BENCHMARK' : 'PERSONAL RECORD'}
            </p>
            <h2 className={styles.sheetTitle}>{entry.movement}</h2>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className={styles.sheetBest}>
          <span className={styles.sheetBestLabel}>CURRENT BEST</span>
          <div className={styles.sheetBestRow}>
            <span className={styles.sheetBestValue}>{entry.value}</span>
            <Sparkline
              trend={entry.trend}
              higherIsBetter={entry.higherIsBetter}
              width={110}
              height={40}
              className={styles.sheetSpark}
            />
          </div>
          <span className={styles.sheetBestDate}>{formatMonth(entry.achievedAt)}</span>
        </div>

        {entry.history.length > 1 && (
          <>
            <p className={styles.sheetHistoryLabel}>HISTORY</p>
            <div className={styles.sheetHistoryList}>
              {entry.history.map((attempt) => (
                <div key={attempt.id} className={styles.historyRow}>
                  <span className={styles.historyValue}>{attempt.value}</span>
                  <span className={styles.historyDate}>{formatMonth(attempt.date)}</span>
                  {attempt.isBest && <span className={styles.historyBestChip}>BEST</span>}
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
  const { hero, lifts, benchmarks, total, loading } = useRecords();
  const [selected, setSelected] = useState<RecordEntry | null>(null);

  return (
    <div className={styles.screen}>
      <motion.div
        className={styles.header}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22 }}
      >
        <button type="button" className={styles.backBtn} onClick={onBack} aria-label="Go back">
          <ChevronLeftIcon />
        </button>
        <div>
          <h1 className={styles.pageTitle}>RECORDS</h1>
          <p className={styles.pageSubtitle}>
            {loading ? 'Loading…' : `${total} personal best${total === 1 ? '' : 's'}`}
          </p>
        </div>
      </motion.div>

      {loading ? (
        <div className={styles.content}>
          <div className={styles.heroSkeleton} />
          <div className={styles.grid}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className={styles.skeleton} />
            ))}
          </div>
        </div>
      ) : !hero ? (
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
        <div className={styles.content}>
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28 }}
          >
            <HeroCard entry={hero} onTap={() => setSelected(hero)} />
          </motion.div>
          <RecordSection label="Lifts" entries={lifts} onSelect={setSelected} />
          <RecordSection label="Benchmarks" entries={benchmarks} onSelect={setSelected} />
        </div>
      )}

      <AnimatePresence>
        {selected && <DetailSheet entry={selected} onClose={() => setSelected(null)} />}
      </AnimatePresence>
    </div>
  );
}
