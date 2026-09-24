/**
 * The workout, reduced to a card that can sit under a photo.
 *
 * WHY A POSTER SOMETIMES ISN'T THE ANSWER
 * A poster is a page. It wants the width of the screen and a column of reading
 * room, and when a photo leads the post there is neither — stacking a full
 * poster under a photo makes one post as tall as two and buries whichever of
 * them the athlete actually cared about. So a post with both shows the photo
 * and this: the same skin, the same wordmark, the result still the loudest
 * thing on it, at a tenth of the height. Tapping it opens the real poster.
 *
 * It is a REDUCTION, not a summary. Everything on it is already on the poster
 * — type, name, result, the session's own clock — and nothing is computed here.
 * The skin's colours come from the one registry the poster itself renders from,
 * so a Chalk workout arrives on cream in both places or in neither.
 */

import { getSkin } from '../celebration/faces/HandwrittenFace/skinRegistry';
import { formatTrained } from './feedFormat';
import type { PosterPayload } from '../celebration/faces/HandwrittenFace/posterPayload';
import type { FeedTrained } from '../../services/feed/types';
import styles from './WodTicket.module.css';

interface WodTicketProps {
  payload: PosterPayload;
  /** When the session happened. Absent only on a payload with no workout behind it. */
  trained: FeedTrained | undefined;
  now: number;
  /** Opens the full poster. */
  onOpen: () => void;
}

export function WodTicket({ payload, trained, now, onOpen }: WodTicketProps): React.ReactElement {
  const { ticket } = getSkin(payload.skin);
  const wod = payload.wods[0];
  // Several independently-timed blocks give several scores and no total — the
  // poster prints them side by side, so the ticket does too rather than picking
  // one of them to enlarge.
  const scores = wod.result.scores;

  return (
    <button
      type="button"
      className={styles.ticket}
      onClick={onOpen}
      style={{
        '--ticket-bg': ticket.bg,
        '--ticket-ink': ticket.ink,
        '--ticket-dim': ticket.dim,
        '--ticket-line': ticket.line,
        '--ticket-dot': ticket.dot,
      } as React.CSSProperties}
    >
      <span className={styles.body}>
        <span className={styles.identity}>
          <span className={styles.type}>{wod.type.toUpperCase()}</span>
          <span className={styles.title}>{wod.title ?? wod.format}</span>
          {trained && <span className={styles.trained}>{formatTrained(trained, now)}</span>}
        </span>

        {scores && scores.length > 0 ? (
          <span className={styles.scores}>
            {scores.map((score) => (
              <span key={score.label} className={styles.score}>
                <span className={styles.scoreLabel}>{score.label}</span>
                <span className={styles.scoreValue}>{score.value}{score.unit ?? ''}</span>
              </span>
            ))}
          </span>
        ) : (
          <span className={styles.result}>
            <span className={styles.resultLabel}>{wod.result.label}</span>
            <span className={styles.resultValue}>{wod.result.value}</span>
          </span>
        )}
      </span>

      <span className={styles.footer}>
        <span className={styles.hint}>tap for the poster</span>
        <span className={styles.wordmark}>wodi<span className={styles.dot}>.</span></span>
      </span>
    </button>
  );
}
