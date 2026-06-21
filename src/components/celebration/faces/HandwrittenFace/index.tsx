/**
 * HandwrittenFace — Slab / Chalk / Flare poster skins.
 *
 * Single workout:   tap card to cycle skins.
 * Multi-part:       swipe left/right between exercises (one card per part),
 *                   tap to cycle skins. Page dots show position.
 */

import React, { useState, useRef, useMemo, useEffect } from 'react';
import { motion, AnimatePresence, useMotionValue, animate as fmAnimate } from 'framer-motion';
import type { CelebrationFaceProps } from '../types';
import type { VibeKey } from './brand';
import { VIBE, VIBE_KEYS } from './brand';
import { buildPosterWod, buildPosterWodFromPage } from './posterData';
import { useFitScale } from './useFitScale';
import { SKINS, guessVibe, resolvePosterVibe } from './skinRegistry';
import styles from './index.module.css';

// ─── Bottom bar icons ───────────────────────────────────────────────────────

function StyleIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FeltIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2.5s6 6.7 6 11a6 6 0 1 1-12 0c0-4.3 6-11 6-11Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Component ─────────────────────────────────────────────────────────────

export function HandwrittenFace({
  data, mode, onBack, onDone, onPosterCustomizationChange,
}: CelebrationFaceProps): React.JSX.Element {
  const [skinIdx, setSkinIdx]         = useState<number>(() => {
    const saved = SKINS.findIndex((s) => s.id === data.posterSkin);
    return saved >= 0 ? saved : 0;
  });
  const [vibe, setVibe]               = useState<VibeKey>(() => resolvePosterVibe(data) ?? guessVibe(data));
  const [vibeConfirmed, setVibeConfirmed] = useState<boolean>(() => resolvePosterVibe(data) != null);
  const [pulse, setPulse]             = useState<number>(0);
  const [showHint, setShowHint]       = useState<boolean>(true);
  const [carouselPage, setCarouselPage] = useState<number>(0);
  const [activePanel, setActivePanel] = useState<'style' | 'felt' | null>(null);
  const [skinScroll, setSkinScroll]   = useState<{ thumbPct: number; offsetPct: number }>({ thumbPct: 100, offsetPct: 0 });

  const carouselViewportRef = useRef<HTMLDivElement>(null);
  const skinChipRowRef    = useRef<HTMLDivElement>(null);
  const carouselX         = useMotionValue(0);
  const dragRef           = useRef<{ x: number; t: number } | null>(null);

  const workoutDate = mode === 'reward' ? new Date() : undefined;
  const isCarousel  = data.isCarousel && (data.carouselPageData?.length ?? 0) > 1;

  // Single-page wod (used when not a carousel, or as a fallback title)
  const singleWod = useMemo(
    () => buildPosterWod(data, workoutDate),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data],
  );

  // Per-page wods (carousel path)
  const pageWods = useMemo(
    () => isCarousel
      ? data.carouselPageData!.map((_, i) => buildPosterWodFromPage(data, i, workoutDate))
      : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, isCarousel],
  );

  const Skin = SKINS[skinIdx].Comp;
  const currentSkin = SKINS[skinIdx];
  const currentFelt = VIBE[vibe];
  const bottomBarStyle = { '--felt-color': currentFelt.color } as React.CSSProperties;

  const { containerRef: cardAreaRef, contentRef: cardContentRef, scale: cardScale } =
    useFitScale<HTMLDivElement, HTMLDivElement>([singleWod, skinIdx]);
  const { containerRef: carouselAreaRef, contentRef: carouselContentRef, scale: carouselScale } =
    useFitScale<HTMLDivElement, HTMLDivElement>([pageWods, skinIdx, carouselPage]);

  // ── Skin controls ──────────────────────────────────────────────────────

  const stepSkin = (direction: 1 | -1): void => {
    setSkinIdx((i) => {
      const next = (i + direction + SKINS.length) % SKINS.length;
      onPosterCustomizationChange?.({ posterSkin: SKINS[next].id });
      return next;
    });
    setPulse((p) => p + 1);
    setShowHint(false);
  };

  const stepSkinFromTap = (clientX: number, target: HTMLElement | null): void => {
    const rect = target?.getBoundingClientRect();
    const midpoint = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
    stepSkin(clientX < midpoint ? -1 : 1);
  };

  const pickSkin = (i: number): void => {
    setSkinIdx(i);
    setPulse((p) => p + 1);
    setShowHint(false);
    onPosterCustomizationChange?.({ posterSkin: SKINS[i].id });
  };

  // ── Bottom bar panel ───────────────────────────────────────────────────

  const measureSkinScroll = (): void => {
    const el = skinChipRowRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    const thumbPct = Math.min(100, (clientWidth / scrollWidth) * 100);
    const maxScroll = scrollWidth - clientWidth;
    const offsetPct = maxScroll > 0 ? (scrollLeft / maxScroll) * (100 - thumbPct) : 0;
    setSkinScroll({ thumbPct, offsetPct });
  };

  useEffect(() => {
    if (activePanel === 'style') measureSkinScroll();
  }, [activePanel]);

  const toggleStylePanel = (): void => setActivePanel((p) => (p === 'style' ? null : 'style'));
  const toggleFeltPanel = (): void => setActivePanel((p) => (p === 'felt' ? null : 'felt'));
  const toggleVibe = (nextVibe: VibeKey): void => {
    if (vibeConfirmed && nextVibe === vibe) {
      setVibeConfirmed(false);
      onPosterCustomizationChange?.({ posterVibe: null });
      return;
    }

    setVibe(nextVibe);
    setVibeConfirmed(true);
    onPosterCustomizationChange?.({ posterVibe: nextVibe });
  };

  // ── Carousel swipe ─────────────────────────────────────────────────────

  const snapToPage = (page: number): void => {
    const w = carouselViewportRef.current?.offsetWidth ?? 390;
    setCarouselPage(page);
    void fmAnimate(carouselX, -page * w, { type: 'spring', stiffness: 380, damping: 36 });
  };

  const handleTouchStart = (e: React.TouchEvent): void => {
    dragRef.current = { x: e.touches[0].clientX, t: Date.now() };
  };

  const handleTouchMove = (e: React.TouchEvent): void => {
    if (!dragRef.current) return;
    const n   = data.carouselPageData!.length;
    const w   = carouselViewportRef.current?.offsetWidth ?? 390;
    const dx  = e.touches[0].clientX - dragRef.current.x;
    const raw = -carouselPage * w + dx;
    const clamped = Math.max(-(n - 1) * w, Math.min(0, raw));
    carouselX.set(clamped + (raw - clamped) * 0.12);
  };

  const handleTouchEnd = (e: React.TouchEvent): void => {
    if (!dragRef.current) return;
    const dx  = e.changedTouches[0].clientX - dragRef.current.x;
    const dt  = Math.max(1, Date.now() - dragRef.current.t);
    const vel = (dx / dt) * 1000;
    dragRef.current = null;

    // Small movement = tap: left half previous style, right half next style.
    if (Math.abs(dx) < 8) {
      stepSkinFromTap(e.changedTouches[0].clientX, carouselViewportRef.current);
      return;
    }

    const n = data.carouselPageData!.length;
    if ((dx < -40 || vel < -300) && carouselPage < n - 1) snapToPage(carouselPage + 1);
    else if ((dx > 40 || vel > 300) && carouselPage > 0)  snapToPage(carouselPage - 1);
    else snapToPage(carouselPage);
  };

  // ─── Shared bottom bar ────────────────────────────────────────────────

  const bottomBar = (
    <div className={styles.bottomBar} style={bottomBarStyle}>
      <AnimatePresence initial={false}>
        {activePanel === 'style' && (
          <motion.div key="style-panel" className={styles.panel}
            initial={{ opacity: 0, y: 10, height: 0 }} animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: 10, height: 0 }} transition={{ duration: 0.2, ease: [0.2, 0.7, 0.3, 1] }}>
            <div ref={skinChipRowRef} className={styles.skinChipRow} onScroll={measureSkinScroll}>
              {SKINS.map((s, i) => (
                <button key={s.id} className={`${styles.skinChip} ${i === skinIdx ? styles.skinChipActive : ''}`}
                  onClick={(e) => { e.stopPropagation(); pickSkin(i); }}>
                  {s.name}
                </button>
              ))}
            </div>
            {skinScroll.thumbPct < 100 && (
              <div className={styles.scrollTrack}>
                <div className={styles.scrollThumb} style={{ width: `${skinScroll.thumbPct}%`, transform: `translateX(${skinScroll.offsetPct}%)` }} />
              </div>
            )}
          </motion.div>
        )}
        {activePanel === 'felt' && (
          <motion.div key="felt-panel" className={styles.panel}
            initial={{ opacity: 0, y: 10, height: 0 }} animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: 10, height: 0 }} transition={{ duration: 0.2, ease: [0.2, 0.7, 0.3, 1] }}>
            <div className={styles.feltChipRow}>
              {VIBE_KEYS.map((k) => (
                <button key={k} className={`${styles.feltChip} ${vibeConfirmed && k === vibe ? styles.feltChipActive : ''}`}
                  style={vibeConfirmed && k === vibe ? { background: VIBE[k].color } : undefined}
                  onClick={(e) => { e.stopPropagation(); toggleVibe(k); }}>
                  {VIBE[k].label}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className={styles.tabRow}>
        <button className={`${styles.tabBtn} ${activePanel === 'style' ? styles.tabBtnActive : ''}`}
          onClick={toggleStylePanel} aria-pressed={activePanel === 'style'} aria-label="Change poster style">
          <span className={styles.tabIcon}><StyleIcon /></span>
          <span className={styles.tabCopy}>
            <span className={styles.tabLabel}>Style</span>
            <span className={styles.tabValue}>{currentSkin.name}</span>
          </span>
        </button>
        <button className={`${styles.tabBtn} ${activePanel === 'felt' ? styles.tabBtnActive : ''}`}
          onClick={toggleFeltPanel} aria-pressed={activePanel === 'felt'} aria-label="Change how it felt">
          <span className={styles.tabIcon}><FeltIcon /></span>
          <span className={styles.tabCopy}>
            <span className={styles.tabLabel}>Felt</span>
            <span className={styles.tabValue}>{vibeConfirmed ? currentFelt.label : 'Pick one'}</span>
          </span>
        </button>
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────
  // RENDER — CAROUSEL PATH
  // ─────────────────────────────────────────────────────────────────────

  if (isCarousel && pageWods) {
    const pages = data.carouselPageData!;
    const navTitle = pages[carouselPage]?.exercise.name?.toUpperCase() ?? singleWod.type;

    return (
      <div className={styles.root}>
        <div className={styles.nav}>
          <button className={styles.navBack} onClick={onBack ?? onDone} aria-label="Back">←</button>
          <span className={styles.navTitle}>{navTitle}</span>
          <div className={styles.navSpacer} />
        </div>

        {/* Page dots */}
        <div className={styles.carouselDots}>
          {pages.map((_, i) => (
            <button key={i}
              className={`${styles.carouselDot} ${i === carouselPage ? styles.carouselDotActive : ''}`}
              onClick={() => snapToPage(i)}
              aria-label={`Part ${i + 1}`}
            />
          ))}
        </div>

        {/* Swipeable card deck */}
        <div
          ref={(el) => { carouselViewportRef.current = el; carouselAreaRef.current = el; }}
          className={`${styles.carouselViewport} ${activePanel ? styles.carouselViewportPanelOpen : ''}`}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <motion.div className={styles.carouselSlider} style={{ x: carouselX }}>
            {pageWods.map((pageWod, i) => (
              <div key={i} className={`${styles.carouselSlide} ${activePanel ? styles.carouselSlidePanelOpen : ''}`}>
                <div
                  key={`${pulse}-${i}`}
                  ref={i === carouselPage ? carouselContentRef : undefined}
                  style={{
                    width: '100%',
                    transformOrigin: 'center top',
                    transform: i === carouselPage ? `scale(${carouselScale})` : undefined,
                    animation: i === carouselPage ? 'flipIn 0.4s cubic-bezier(0.2,0.7,0.3,1)' : undefined,
                  }}
                >
                  <Skin wod={pageWod} vibe={vibeConfirmed ? vibe : null} />
                </div>
              </div>
            ))}
          </motion.div>
        </div>

        {bottomBar}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────
  // RENDER — SINGLE CARD PATH
  // ─────────────────────────────────────────────────────────────────────

  return (
    <div className={styles.root}>
      <div className={styles.nav}>
        <button className={styles.navBack} onClick={onBack ?? onDone} aria-label="Back">←</button>
        <span className={styles.navTitle}>{singleWod.title ?? singleWod.type}</span>
        <div className={styles.navSpacer} />
      </div>

      <div
        ref={cardAreaRef}
        className={`${styles.cardArea} ${activePanel ? styles.cardAreaPanelOpen : ''}`}
        onClick={(e) => stepSkinFromTap(e.clientX, e.currentTarget)}
        role="button"
        aria-label="Tap left for previous style, right for next style"
      >
        <div key={pulse} ref={cardContentRef} className={styles.cardWrapper} style={{ transform: `scale(${cardScale})` }}>
          <Skin wod={singleWod} vibe={vibeConfirmed ? vibe : null} />
        </div>
        {showHint && <div className={styles.tapHint}>Tap left/right to change style</div>}
      </div>

      {bottomBar}
    </div>
  );
}
