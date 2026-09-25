/**
 * "Attach a workout" — a rail, not a menu.
 *
 * Your recent sessions laid out as small cards in their own skins, newest
 * first. One tap attaches, another tap detaches. Nothing opens, nothing has to
 * be dismissed, and the whole set is visible while you decide — which is the
 * difference between choosing and being asked a question.
 *
 * Each card builds the poster it would attach rather than describing it from
 * the workout doc. That is why a card is its own component: a poster is built
 * by the celebration pipeline, which is a hook, so a rail of them is a rail of
 * components and never a loop. The consequence is worth the shape — the name,
 * the result and the colour on a card are the ones the poster itself will show,
 * so nothing here can describe a workout differently from the ticket it makes.
 */

import { getSkin } from '../celebration/faces/HandwrittenFace/skinRegistry';
import { trainedDay } from './feedFormat';
import { useComposerWod } from '../../hooks/useFeedComposer';
import type { ComposerWod } from '../../hooks/useFeedComposer';
import type { WorkoutWithStats } from '../../hooks/useWorkouts';
import styles from './WodRail.module.css';

interface WodRailProps {
  workouts: readonly WorkoutWithStats[];
  /** Still fetching — which is not the same as having nothing, and must not say so. */
  loading: boolean;
  attachedId: string | undefined;
  now: number;
  onToggle: (wod: ComposerWod) => void;
}

export function WodRail({ workouts, loading, attachedId, now, onToggle }: WodRailProps): React.ReactElement {
  return (
    <section>
      <div className={styles.heading}>
        <h2 className={styles.title}>Attach a workout</h2>
        {/* Said out loud, because the composer is photo-first and an athlete
            who has only ever posted from a poster will assume otherwise. */}
        <span className={styles.optional}>optional</span>
      </div>

      {loading ? (
        <p className={styles.note}>Finding your workouts…</p>
      ) : workouts.length === 0 ? (
        <p className={styles.note}>Nothing logged yet — the photo posts on its own.</p>
      ) : (
        <div className={styles.rail}>
          {workouts.map((workout) => (
            <WodCard
              key={workout.id}
              workout={workout}
              attached={workout.id === attachedId}
              now={now}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </section>
  );
}

interface WodCardProps {
  workout: WorkoutWithStats;
  attached: boolean;
  now: number;
  onToggle: (wod: ComposerWod) => void;
}

function WodCard({ workout, attached, now, onToggle }: WodCardProps): React.ReactElement | null {
  const wod = useComposerWod(workout);
  if (!wod) return null;

  const page = wod.payload.wods[0];
  const { ticket } = getSkin(wod.payload.skin);
  // A named WOD is called by its name; everything else is called what KIND of
  // training it was. Deliberately not `format` — that is a whole board line
  // ("PARTNER 16 ROUNDS FOR TIME (8 EACH)") and a 128px card can only ever show
  // the first two words of it, which is worse than saying "FOR TIME" honestly.
  // The day above and the result below are what tell two cards apart, and the
  // full line is on the ticket the moment one is attached.
  const name = page.title ?? page.type;

  return (
    <button
      type="button"
      className={`${styles.card} ${attached ? styles.cardAttached : ''}`}
      onClick={() => onToggle(wod)}
      aria-pressed={attached}
      aria-label={attached ? `Detach ${name}` : `Attach ${name}`}
      style={{
        '--card-bg': ticket.bg,
        '--card-ink': ticket.ink,
        '--card-dim': ticket.dim,
      } as React.CSSProperties}
    >
      <span className={styles.day}>{trainedDay(wod.trained, now)}</span>
      <span className={styles.name}>{name}</span>
      <span className={styles.result}>{page.result.value}</span>
      {attached && (
        <span className={styles.check} aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12l5 5 9-10" />
          </svg>
        </span>
      )}
    </button>
  );
}
