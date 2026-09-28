import type { PlannedWorkout, ParsedWorkout } from '../../types';
import styles from './OnDeckCard.module.css';

interface OnDeckCardProps {
  planned: PlannedWorkout;
  onLog: (planned: PlannedWorkout) => void;
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
  // A named piece says its own name in the title above — no tag needed for it.
  if (wod.partnerWorkout || wod.teamSize && wod.teamSize > 1) parts.push('· partner');
  return parts.join(' ');
}

/** Wodi's last line in a waiting chat — the row previews the conversation, like a messaging app. */
function lastWodiLine(planned: PlannedWorkout): string {
  const lines = planned.chat?.messages ?? [];
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (lines[i].from === 'wodi' && lines[i].text) return lines[i].text!.replace(/s+/g, ' ');
  }
  return 'Waiting for you';
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

function ChatIcon(): React.JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 4h16v12H10l-5 4v-4H4z" fill="#f5c200" />
    </svg>
  );
}

/**
 * One board waiting for its result. A board kept by a Tell Wodi chat is the same row with the
 * conversation's face: a chat glyph, CHATTING, Wodi's last line, and CONTINUE — it reopens the chat,
 * never the form.
 */
export function OnDeckCard({ planned, onLog, onDelete }: OnDeckCardProps): React.JSX.Element {
  const title = getTitle(planned);
  const isChat = planned.chat != null;
  const subtitle = isChat
    ? lastWodiLine(planned)
    : planned.parsedWorkout ? buildSubtitle(planned.parsedWorkout) : '';

  return (
    <div className={styles.row}>
      <div className={styles.bookmarkWrap} aria-hidden="true">
        {isChat ? <ChatIcon /> : <BookmarkIcon />}
      </div>

      {/* Text */}
      <div className={styles.copy}>
        <div className={styles.titleLine}>
          <span className={styles.savedChip}>{isChat ? 'CHATTING' : 'SAVED'}</span>
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
          aria-label={isChat ? `Continue the chat about ${title}` : `Log ${title}`}
        >
          {isChat ? 'CONTINUE →' : 'LOG →'}
        </button>
      </div>
    </div>
  );
}
