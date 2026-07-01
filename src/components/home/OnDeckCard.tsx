import type { PlannedWorkout, ParsedWorkout } from '../../types';
import styles from './OnDeckCard.module.css';

interface OnDeckCardProps {
  planned: PlannedWorkout;
  onLog: (planned: PlannedWorkout) => void;
  onOpen?: (planned: PlannedWorkout) => void;
  onDelete?: (planned: PlannedWorkout) => void;
}

const FORMAT_LABELS: Record<string, string> = {
  for_time: 'FOR TIME',
  amrap: 'AMRAP',
  amrap_intervals: 'AMRAP',
  intervals: 'INTERVALS',
  emom: 'EMOM',
  strength: 'STRENGTH',
  tabata: 'TABATA',
};

function buildSubtitle(wod: ParsedWorkout): string {
  const parts: string[] = [];
  if (wod.timeCap && wod.timeCap > 0) parts.push(`${Math.round(wod.timeCap / 60)}-MIN`);
  const fmt = FORMAT_LABELS[wod.format ?? ''] ?? (wod.format ?? '').toUpperCase();
  if (fmt) parts.push(fmt);
  if (wod.benchmarkName) parts.push('· benchmark');
  else if (wod.partnerWorkout || wod.teamSize && wod.teamSize > 1) parts.push('· partner');
  return parts.join(' ');
}

function getTitle(planned: PlannedWorkout): string {
  const wod = planned.parsedWorkout;
  return wod?.title?.trim()
    || wod?.exercises?.find(e => e.name?.trim())?.name?.trim()
    || 'Workout';
}

function TrashIcon(): React.JSX.Element {
  return (
    <svg width="15" height="16" viewBox="0 0 15 16" fill="none" aria-hidden="true">
      <path d="M1.5 4h12M5.5 4V2.5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1V4m2 0v9a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1V4h10Z"
        stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BookmarkIcon(): React.JSX.Element {
  return (
    <svg width="16" height="20" viewBox="0 0 16 20" fill="none" aria-hidden="true">
      <path d="M2 2.5A1.5 1.5 0 0 1 3.5 1h9A1.5 1.5 0 0 1 14 2.5v15.25L8 14.5l-6 3.25V2.5Z"
        fill="#f5c200" />
    </svg>
  );
}

export function OnDeckCard({ planned, onLog, onDelete }: OnDeckCardProps): React.JSX.Element {
  const title = getTitle(planned);
  const subtitle = planned.parsedWorkout ? buildSubtitle(planned.parsedWorkout) : '';

  return (
    <div className={styles.row}>
      {/* Bookmark icon */}
      <div className={styles.bookmarkWrap} aria-hidden="true">
        <BookmarkIcon />
      </div>

      {/* Text */}
      <div className={styles.copy}>
        <div className={styles.titleLine}>
          <span className={styles.savedChip}>SAVED</span>
          <span className={styles.title}>{title}</span>
        </div>
        {subtitle && <div className={styles.subtitle}>{subtitle}</div>}
      </div>

      {/* Actions */}
      <div className={styles.actions}>
        {onDelete && (
          <button
            type="button"
            className={styles.deleteBtn}
            onClick={() => onDelete(planned)}
            aria-label={`Delete ${title}`}
          >
            <TrashIcon />
          </button>
        )}
        <button
          type="button"
          className={styles.logBtn}
          onClick={() => onLog(planned)}
          aria-label={`Log ${title}`}
        >
          LOG →
        </button>
      </div>
    </div>
  );
}
