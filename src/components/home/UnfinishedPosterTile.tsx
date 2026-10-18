import type React from 'react';
import type { UnfinishedPoster } from './unfinishedPoster';
import thumb from './PosterThumbnail.module.css';
import styles from './UnfinishedPosterTile.module.css';

interface UnfinishedPosterTileProps {
  poster: UnfinishedPoster;
  onOpen: () => void;
  /** Other boards saved for later — opens the list. Left out where only this board matters (the chat). */
  more?: number;
  onOpenMore?: () => void;
  /** Long-press handlers (delete), the same gesture as on a poster. */
  pressHandlers?: React.HTMLAttributes<HTMLButtonElement> & { draggable?: false };
}

/**
 * The first tile on Today's rail while a board waits: its workout filled in, its result a dashed
 * blank. Tapping it opens the board's chat at "How'd it go?". Render-only — buildUnfinishedPoster
 * decides every word.
 */
export function UnfinishedPosterTile({ poster, onOpen, more = 0, onOpenMore, pressHandlers }: UnfinishedPosterTileProps): React.ReactElement {
  return (
    <div className={thumb.wrapper}>
      <button
        type="button"
        className={styles.card}
        onClick={onOpen}
        aria-label={`Finish the ${poster.title} poster — add your result`}
        {...pressHandlers}
      >
        {poster.format && <span className={styles.format}>{poster.format}</span>}
        <span className={styles.title}>{poster.title}</span>
        <span className={styles.lines}>
          {poster.lines.map((line, i) => <span key={i} className={styles.line}>{line}</span>)}
          {poster.moreLines > 0 && <span className={styles.lineMore}>+{poster.moreLines} more</span>}
        </span>
        <span className={styles.result} aria-hidden="true">
          <span className={styles.resultLabel}>{poster.result.label}</span>
          <span className={styles.resultBlank}>{poster.result.blank}</span>
        </span>
        <span className={styles.footer} aria-hidden="true">wodi<span className={styles.footerDot}>.</span></span>
      </button>

      <div className={styles.caption}>
        <span className={styles.saved}>{poster.savedLabel}</span>
        {more > 0 && onOpenMore ? (
          <button type="button" className={styles.more} onClick={onOpenMore}>+{more} saved</button>
        ) : (
          <span className={styles.add} aria-hidden="true">{poster.result.add} →</span>
        )}
      </div>
    </div>
  );
}
