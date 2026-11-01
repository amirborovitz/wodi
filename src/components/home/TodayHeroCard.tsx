import type React from 'react';
import { motion } from 'framer-motion';
import type { TodayHero, LastTimeMemory } from '../../hooks/useTodayHome';
import type { WorkoutWithStats } from '../../hooks/useWorkouts';
import { usePhotoPicker } from '../../hooks/usePhotoPicker';
import { UnfinishedPosterTile } from './UnfinishedPosterTile';
import { ChatPoster } from '../tellWodi/ChatPoster';
import { CameraIcon } from './CameraIcon';
import styles from './TodayHeroCard.module.css';

interface TodayHeroCardProps {
  hero: Exclude<TodayHero, { kind: 'welcome' }>;
  /** A board photo picked from the big card — the same as the docked camera: the chat, photo sent. */
  onPhoto: (file: File) => void;
  /** "No board? Type it in" — the chat. */
  onTellWodi: () => void;
  onOpenBoard: () => void;
  onOpenWorkout: (workout: WorkoutWithStats) => void;
  moreBoards: number;
  onOpenMoreBoards: () => void;
  onDidntDoBoard: () => void;
  boardPressHandlers: React.HTMLAttributes<HTMLButtonElement> & { draggable?: false };
}

/**
 * Today's one big card (wodi Today v6). Render-only — useTodayHome decides the state and every
 * number in it.
 */
export function TodayHeroCard(props: TodayHeroCardProps): React.ReactElement {
  const { hero } = props;
  if (hero.kind === 'logged') {
    return (
      <div className={`${styles.hero} ${styles.posterHero}`}>
        {hero.epBurst != null && (
          <motion.span
            className={styles.epBurst}
            initial={{ opacity: 0, y: 160, scale: 0.6 }}
            animate={{ opacity: [0, 1, 1, 0], y: [160, 40, 0, 0], scale: [0.6, 1.15, 1, 1] }}
            transition={{ duration: 2.6, times: [0, 0.25, 0.6, 1], delay: 0.5, ease: [0.2, 0.9, 0.3, 1] }}
            aria-label={`${hero.epBurst} EP`}
          >
            +{hero.epBurst} EP
          </motion.span>
        )}
        <ChatPoster workout={hero.workout} surface="today" onOpen={() => props.onOpenWorkout(hero.workout)} />
      </div>
    );
  }
  if (hero.kind === 'board') {
    const { lastTime } = hero;
    return (
      <div className={styles.hero}>
        <UnfinishedPosterTile
          poster={hero.poster}
          size="hero"
          onOpen={props.onOpenBoard}
          aside={lastTime && <LastTime memory={lastTime} onOpen={() => props.onOpenWorkout(lastTime.workout)} />}
          more={props.moreBoards}
          onOpenMore={props.onOpenMoreBoards}
          onDidntDoIt={props.onDidntDoBoard}
          pressHandlers={props.boardPressHandlers}
        />
        <button type="button" className={styles.primary} onClick={props.onOpenBoard}>{hero.poster.result.add}</button>
      </div>
    );
  }
  return <SnapCard onPhoto={props.onPhoto} onTellWodi={props.onTellWodi} />;
}

/**
 * Nothing logged today, no board waiting: one target. The whole frame opens the phone's picker —
 * camera, a photo or a screenshot, the phone offers all three. Yellow lives only on the shutter.
 */
function SnapCard({ onPhoto, onTellWodi }: { onPhoto: (file: File) => void; onTellWodi: () => void }): React.ReactElement {
  const picker = usePhotoPicker(onPhoto);
  return (
    <div className={styles.hero}>
      <button type="button" className={styles.viewfinder} onClick={picker.open}>
        <span className={`${styles.corner} ${styles.cornerA}`} aria-hidden="true" />
        <span className={`${styles.corner} ${styles.cornerB}`} aria-hidden="true" />
        <span className={`${styles.corner} ${styles.cornerC}`} aria-hidden="true" />
        <span className={`${styles.corner} ${styles.cornerD}`} aria-hidden="true" />
        <span className={styles.shutter} aria-hidden="true"><CameraIcon size={46} /></span>
        <span className={styles.snapTitle}>Snap today's board</span>
        <span className={styles.snapText}>A photo or a screenshot.<br />Wodi writes the poster.</span>
      </button>
      <input ref={picker.inputRef} type="file" accept="image/*" className={styles.hiddenInput} onChange={picker.onChange} />
      <button type="button" className={styles.alt} onClick={onTellWodi}>No board? <u>Type it in</u></button>
    </div>
  );
}

/** The same board, done before: a faded, tilted keepsake. Grey, no arrow, no "beat it". */
function LastTime({ memory, onOpen }: { memory: LastTimeMemory; onOpen: () => void }): React.ReactElement {
  const said = memory.result ? `${memory.when} · ${memory.result}` : memory.when;
  return (
    <button type="button" className={styles.lastTime} onClick={onOpen} aria-label={`Last time, ${said} — open that poster`}>
      <span className={styles.keepsake} aria-hidden="true">
        <span className={styles.keepsakeTitle}>{memory.title}</span>
        {memory.result && <span className={styles.keepsakeResult}>{memory.result}</span>}
        <span className={styles.keepsakeBar} />
      </span>
      <span className={styles.lastTimeText} aria-hidden="true">
        <strong>Last time</strong>
        <span>{said}</span>
      </span>
    </button>
  );
}
