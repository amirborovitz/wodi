import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { fB } from '../celebration/faces/HandwrittenFace/brand';
import { elementToCanvas, canvasToBlob, shareImage, downloadBlob } from '../../utils/shareUtils';
import { useWeekPosterData } from '../../hooks/useWeekPosterData';
import type { RecapData } from '../../hooks/useRecapData';
import { WEEK_POSTER_WIDTH, WEEK_POSTER_HEIGHT } from './week/WeekPosterParts';
import {
  WEEK_SKINS,
  loadWeekSkinIndex,
  saveWeekSkinIndex,
  hasFlippedWeekSkin,
  markWeekSkinFlipped,
} from './week/weekSkinRegistry';
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

/** How long the outgoing skin stays mounted under the incoming one. Matches .flipIn. */
const CROSSFADE_MS = 300;

/**
 * The week, as a poster.
 *
 * Deliberately not a short Wrapped: no card deck, no goals, no comparison to the
 * week before. It is the same object as a WOD poster — one 9:16 artifact, the same
 * skins, the same tap-to-flip gesture — because a week worth sharing should not
 * arrive looking like a different app's report screen.
 *
 * The 1080×1920 canvas is authoritative and never re-flows for the phone: the stage
 * scales it down to fit, which is also why the share export is a true story frame.
 */
export function WeekDropPage({ data, onClose }: WeekDropPageProps): React.JSX.Element {
  const week = useWeekPosterData(data);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const posterRef = useRef<HTMLDivElement | null>(null);
  const chipRowRef = useRef<HTMLDivElement | null>(null);

  const [scale, setScale] = useState(0);
  const [sharing, setSharing] = useState(false);
  const [idx, setIdx] = useState<number>(loadWeekSkinIndex);
  // The outgoing skin, cross-faded under the incoming one. Without it, a flip from
  // Chalk to Slab shows a frame of bare background between two light surfaces.
  const [prev, setPrev] = useState<number | null>(null);
  const [flipCount, setFlipCount] = useState(0);
  const [showHint, setShowHint] = useState(() => !hasFlippedWeekSkin());

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

  useEffect(() => {
    if (prev === null) return;
    const t = window.setTimeout(() => setPrev(null), CROSSFADE_MS);
    return () => window.clearTimeout(t);
  }, [prev, flipCount]);

  const goToSkin = (next: number): void => {
    if (next === idx) return;
    setPrev(idx);
    setIdx(next);
    setFlipCount((n) => n + 1);
    saveWeekSkinIndex(next);
    if (showHint) {
      setShowHint(false);
      markWeekSkinFlipped();
    }
  };

  const flip = (): void => goToSkin((idx + 1) % WEEK_SKINS.length);

  // Keep the active chip in view when the poster is flipped by tapping it — the
  // chip row is the only thing that says which surface you're now on.
  useEffect(() => {
    chipRowRef.current?.children[idx]?.scrollIntoView({
      block: 'nearest',
      inline: 'center',
      behavior: flipCount === 0 ? 'auto' : 'smooth',
    });
    // flipCount only picks the animation — idx is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  const handleShare = async (): Promise<void> => {
    const poster = posterRef.current;
    if (!poster || sharing) return;
    // `sharing` also drops the fit-scale off the layer, so html2canvas measures the
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
      const shared = await shareImage(blob, `wodi ${data.period.toLowerCase()}`);
      if (!shared) downloadBlob(blob, `wodi-${data.id}.png`);
    } catch (err) {
      console.error('[WeekDrop] share failed:', err);
    } finally {
      setSharing(false);
    }
  };

  const Skin = WEEK_SKINS[idx].Comp;
  const Prev = prev !== null ? WEEK_SKINS[prev].Comp : null;

  return (
    <div className={styles.root}>
      <div className={styles.stage} ref={stageRef}>
        {/* Tap to flip — the same gesture, on the same artifact, as the WOD poster. */}
        <div
          className={styles.frame}
          onClick={flip}
          style={{
            width: WEEK_POSTER_WIDTH * scale,
            height: WEEK_POSTER_HEIGHT * scale,
            borderRadius: Math.round(26 * scale),
            visibility: scale > 0 ? 'visible' : 'hidden',
          }}
        >
          {Prev && (
            <div className={styles.layer} style={{ transform: `scale(${scale})` }}>
              <Prev week={week} />
            </div>
          )}
          <div
            key={flipCount}
            className={`${styles.layer} ${styles.layerLive}`}
            style={{ transform: sharing ? 'none' : `scale(${scale})` }}
          >
            <div ref={posterRef}>
              <Skin week={week} />
            </div>
          </div>
        </div>
      </div>

      <div className={styles.skinLabel} style={{ fontFamily: fB }}>
        <span className={styles.skinName}>{WEEK_SKINS[idx].name}</span>
        {showHint && <span className={styles.hint}>tap the poster to flip</span>}
      </div>

      <div className={styles.chipRow} ref={chipRowRef}>
        {WEEK_SKINS.map((s, i) => (
          <button
            key={s.id}
            type="button"
            className={`${styles.chip} ${i === idx ? styles.chipActive : ''}`}
            onClick={() => goToSkin(i)}
          >
            {s.name}
          </button>
        ))}
      </div>

      <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close week recap">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
          <line x1="6" y1="6" x2="18" y2="18" />
          <line x1="18" y1="6" x2="6" y2="18" />
        </svg>
      </button>

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
              Share my week
            </>
          )}
        </button>
      </div>
    </div>
  );
}
