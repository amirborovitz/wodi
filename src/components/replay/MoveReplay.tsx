import { AnimatePresence, motion } from 'framer-motion';
import { STAGE } from './figure/skeleton';
import type { ReplayScript } from './replayScript';
import { useMoveReplay } from './useMoveReplay';
import type { ReplayOutcome } from './useMoveReplay';
import styles from './MoveReplay.module.css';

interface MoveReplayProps {
  script: ReplayScript;
  onDone: (outcome: ReplayOutcome) => void;
}

/**
 * The poster's intro: an athlete performs each line of the board, the result counts up, and the
 * card gives way to the poster underneath. Sits exactly over the poster's own box (the parent
 * positions it), and any tap goes straight to the poster.
 */
export function MoveReplay({ script, onDone }: MoveReplayProps): React.ReactElement {
  const { stageRef, beat, beatIndex, heroText, skip } = useMoveReplay(script, onDone);

  return (
    <motion.div
      className={styles.replay}
      role="button"
      tabIndex={0}
      aria-label="Replay of the workout. Tap to skip to the poster"
      onClick={(e) => { e.stopPropagation(); skip(); }}
      // A touch on the replay is the replay's — it must not also swipe the deck behind it.
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') { e.preventDefault(); skip(); } }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.04, transition: { duration: 0.3, ease: [0.4, 0, 0.2, 1] } }}
      transition={{ duration: 0.2 }}
    >
      <div className={styles.head}>
        <span className={styles.eyebrow}>{script.eyebrow}</span>
        {script.title && <span className={styles.title}>{script.title}</span>}
      </div>

      <svg className={styles.stage} viewBox={`0 0 ${STAGE.width} ${STAGE.height}`} aria-hidden="true">
        <g ref={stageRef} />
      </svg>

      <div className={styles.caption} style={{ '--line-size': `${script.lineSize}cqw` } as React.CSSProperties} aria-live="polite">
        <AnimatePresence mode="popLayout" initial={false}>
          {heroText !== null && script.hero ? (
            <motion.div
              key="hero"
              className={styles.hero}
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, ease: [0.34, 1.56, 0.64, 1] }}
            >
              <span className={styles.heroLabel}>{script.hero.label}</span>
              <span className={styles.heroValue}>{heroText}</span>
            </motion.div>
          ) : beat ? (
            <motion.div
              key={beatIndex}
              className={styles.line}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -14 }}
              transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            >
              <span className={styles.lineText}>{beat.text}</span>
              {beat.detail && <span className={styles.lineDetail}>{beat.detail}</span>}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <div className={styles.foot}>
        <div className={styles.dots} aria-hidden="true">
          {script.beats.map((line, i) => (
            <span key={`${line.text}-${i}`} className={i <= beatIndex || heroText !== null ? styles.dotOn : styles.dot} />
          ))}
        </div>
        <span className={styles.wordmark}>wodi<span className={styles.wordmarkDot}>.</span></span>
      </div>
    </motion.div>
  );
}
