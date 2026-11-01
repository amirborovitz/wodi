import type React from 'react';
import type { UnfinishedPoster } from './unfinishedPoster';
import thumb from './PosterThumbnail.module.css';
import styles from './UnfinishedPosterTile.module.css';

interface UnfinishedPosterTileProps {
  poster: UnfinishedPoster;
  onOpen: () => void;
  /** 'hero' is Today's big card: the same tile at full width, its button below it instead of a caption link. */
  size?: 'tile' | 'hero';
  /** Beside the blank — the old poster of the same board ("Last time"), on Today only. */
  aside?: React.ReactNode;
  /** Other boards saved for later — opens the list. Left out where only this board matters (the chat). */
  more?: number;
  onOpenMore?: () => void;
  /**
   * They never did it — clears the board. Offered on a tile that asks "Did you do it?" (see
   * UnfinishedPoster.asks); left out where the tile is a board being recognised (the chat).
   */
  onDidntDoIt?: () => void;
  /** Long-press handlers (delete), the same gesture as on a poster. */
  pressHandlers?: React.HTMLAttributes<HTMLButtonElement> & { draggable?: false };
}

/**
 * A saved board as the poster it will become: its workout filled in, its result a dashed blank.
 * Tapping it opens the board's chat at "How'd it go?". Two days on, the blank asks "Did you do
 * it?" — the tile is still the way to log it, and "Didn't do it" clears it. Render-only —
 * buildUnfinishedPoster decides every word.
 */
export function UnfinishedPosterTile({ poster, onOpen, size = 'tile', aside, more = 0, onOpenMore, onDidntDoIt, pressHandlers }: UnfinishedPosterTileProps): React.ReactElement {
  const asking = poster.asks && onDidntDoIt != null;
  const hero = size === 'hero';
  return (
    <div className={hero ? thumb.wrapperFull : thumb.wrapper}>
      <div className={hero ? `${styles.card} ${styles.cardHero}` : styles.card}>
        {/* The whole card opens the chat; "Didn't do it" and the old poster sit above it, their own buttons. */}
        <button
          type="button"
          className={styles.open}
          onClick={onOpen}
          aria-label={`Finish the ${poster.title} poster — add your result`}
          {...pressHandlers}
        />
        {poster.format && <span className={styles.format}>{poster.format}</span>}
        <span className={styles.title}>{poster.title}</span>
        <span className={styles.lines}>
          {poster.lines.map((line, i) => <span key={i} className={styles.line}>{line}</span>)}
          {poster.moreLines > 0 && <span className={styles.lineMore}>+{poster.moreLines} more</span>}
        </span>
        <span className={styles.resultRow}>
          {asking ? (
            <span className={styles.result}>
              <span className={styles.ask}>Did you do it?</span>
              <span className={styles.answers}>
                <span className={styles.logIt} aria-hidden="true">Log it</span>
                <button type="button" className={styles.didnt} onClick={onDidntDoIt}>Didn't do it</button>
              </span>
            </span>
          ) : (
            <span className={styles.result} aria-hidden="true">
              <span className={styles.resultLabel}>{poster.result.label}</span>
              <span className={styles.resultBlank}>{poster.result.blank}</span>
            </span>
          )}
          {aside}
        </span>
        <span className={styles.footer} aria-hidden="true">wodi<span className={styles.footerDot}>.</span></span>
      </div>

      <div className={styles.caption}>
        <span className={styles.saved}>{poster.savedLabel}</span>
        {more > 0 && onOpenMore ? (
          <button type="button" className={styles.more} onClick={onOpenMore}>+{more} saved</button>
        ) : (
          !asking && !hero && <span className={styles.add} aria-hidden="true">{poster.result.add} →</span>
        )}
      </div>
    </div>
  );
}
