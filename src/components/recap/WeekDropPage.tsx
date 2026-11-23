import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { fB } from '../celebration/faces/HandwrittenFace/brand';
import { elementToCanvas, canvasToBlob, shareImage, downloadBlob } from '../../utils/shareUtils';
import { track } from '../../services/analytics';
import { useWeekPosterData } from '../../hooks/useWeekPosterData';
import { useFavoriteSkin } from '../../hooks/useFavoriteSkin';
import { useSwipeDeck } from '../../hooks/useSwipeDeck';
import type { RecapData } from '../../hooks/useRecapData';
import { WEEK_POSTER_WIDTH, WEEK_POSTER_HEIGHT } from './week/WeekPosterParts';
import { weekSkinFor } from './week/weekSkinRegistry';
import type { WeekPage } from './week/types';
import styles from './WeekDropPage.module.css';

interface WeekDropPageProps {
  data: RecapData;
  onClose: () => void;
}

/** Resolves once the browser has painted the render that is currently pending. */
function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

/** Space between the two posters while one is dragged over the other, in screen px. */
const PAGE_GAP = 16;

const PAGE_NAME: Record<WeekPage, string> = { week: 'The week', body: 'What you worked' };

/**
 * The week, as posters.
 *
 * Deliberately not a short Wrapped: no card deck of stats, no goals, no comparison to
 * the week before. Two posters at most — the week, and the body it worked — swiped like
 * a WOD poster's parts, in the athlete's own poster style. Nothing to pick here: it
 * arrives finished, and the one action is Share.
 *
 * The 1080×1920 canvas is authoritative and never re-flows for the phone: the stage
 * scales it down to fit, which is also why the share export is a true story frame.
 */
export function WeekDropPage({ data, onClose }: WeekDropPageProps): React.JSX.Element {
  const week = useWeekPosterData(data);
  const { Comp: Skin } = weekSkinFor(useFavoriteSkin().order);
  const pages: WeekPage[] = week.body ? ['week', 'body'] : ['week'];

  const stageRef = useRef<HTMLDivElement | null>(null);
  const posterRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [scale, setScale] = useState(0);
  const [sharing, setSharing] = useState(false);

  const frameWidth = WEEK_POSTER_WIDTH * scale;
  const deck = useSwipeDeck(pages.length, frameWidth + PAGE_GAP);
  const { x, page, goTo } = deck;

  // The poster is a fixed canvas, so fitting it is one number: whatever fraction of
  // the stage it can occupy without either axis overflowing.
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const measure = (): void => {
      const { width, height } = stage.getBoundingClientRect();
      if (width > 0 && height > 0) {
        setScale(Math.min(width / WEEK_POSTER_WIDTH, height / WEEK_POSTER_HEIGHT));
      }
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(stage);
    return () => ro.disconnect();
  }, []);

  // A resize changes the distance between pages; keep the current one in place.
  useEffect(() => {
    x.set(-page * (frameWidth + PAGE_GAP));
  }, [frameWidth, page, x]);

  const handleShare = async (): Promise<void> => {
    const poster = posterRefs.current[page];
    if (!poster || sharing) return;
    // `sharing` also drops the fit-scale off the live page, so html2canvas measures the
    // canvas at its own 1080×1920 rather than at whatever fraction the phone shows.
    // It has to be state and not a DOM poke: the re-render this triggers would put
    // the transform straight back mid-capture.
    setSharing(true);
    try {
      await nextPaint();
      const canvas = await elementToCanvas(poster, {
        scale: 1,
        width: WEEK_POSTER_WIDTH,
        height: WEEK_POSTER_HEIGHT,
      });
      const blob = await canvasToBlob(canvas, 'png');
      const body = pages[page] === 'body';
      const shared = await shareImage(blob, `wodi ${data.period.toLowerCase()}${body ? ' worked' : ''}`);
      if (!shared) downloadBlob(blob, `wodi-${data.id}${body ? '-worked' : ''}.png`);
      track('poster_shared', { poster: body ? 'week_body' : 'week', method: shared ? 'share_sheet' : 'download' });
    } catch (err) {
      console.error('[WeekDrop] share failed:', err);
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className={styles.root}>
      {/* Chrome above the poster, on the dark page — never over the artifact's own corner. */}
      <div className={styles.topBar}>
        <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close week recap">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
            <line x1="6" y1="6" x2="18" y2="18" />
            <line x1="18" y1="6" x2="6" y2="18" />
          </svg>
        </button>
      </div>

      <div className={styles.stage} ref={stageRef}>
        <div
          className={styles.frame}
          {...deck.handlers}
          style={{
            width: frameWidth,
            height: WEEK_POSTER_HEIGHT * scale,
            borderRadius: Math.round(26 * scale),
            visibility: scale > 0 ? 'visible' : 'hidden',
          }}
        >
          <motion.div className={styles.slider} style={{ x, gap: PAGE_GAP }}>
            {pages.map((p, i) => (
              <div
                key={p}
                className={styles.page}
                style={{ width: frameWidth, height: WEEK_POSTER_HEIGHT * scale, borderRadius: Math.round(26 * scale) }}
                aria-hidden={i !== page}
              >
                <div
                  className={styles.layer}
                  style={{ transform: sharing && i === page ? 'none' : `scale(${scale})` }}
                >
                  <div ref={(el) => { posterRefs.current[i] = el; }}>
                    <Skin week={week} page={p} />
                  </div>
                </div>
              </div>
            ))}
          </motion.div>
        </div>
      </div>

      {pages.length > 1 && (
        <div className={styles.pager} role="tablist" aria-label="Week posters">
          {pages.map((p, i) => (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={i === page}
              aria-label={PAGE_NAME[p]}
              className={styles.pagerHit}
              onClick={() => goTo(i)}
            >
              <span className={`${styles.pagerMark} ${i === page ? styles.pagerMarkActive : ''}`} />
            </button>
          ))}
        </div>
      )}


      <div className={styles.shareBar}>
        <button
          type="button"
          className={styles.shareBtn}
          style={{ fontFamily: fB }}
          onClick={handleShare}
          disabled={sharing}
        >
          {sharing ? (
            'Preparing...'
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                <polyline points="16 6 12 2 8 6" />
                <line x1="12" y1="2" x2="12" y2="15" />
              </svg>
              {pages[page] === 'body' ? 'Share what I worked' : 'Share my week'}
            </>
          )}
        </button>
      </div>
    </div>
  );
}
