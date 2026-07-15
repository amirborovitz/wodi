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
import { buildPosterWod, buildPosterWodFromPage, getPrimaryCarouselPageIndex, formatIsoPosterDate } from './posterData';
import { useFitScale } from './useFitScale';
import { SKINS, guessVibe, resolvePosterVibe } from './skinRegistry';
import { CorrectionSheet } from '../../CorrectionSheet';
import { TextSticker } from './TextSticker';
import { DeleteActionSheet } from '../../../ui/DeleteActionSheet';
import type { PosterSticker, PosterVibeOffset } from '../../../../types';
import { shareWorkoutCard } from '../../../../utils/shareUtils';
import styles from './index.module.css';

// ─── Bottom bar icons ───────────────────────────────────────────────────────

function StyleIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FeltIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2c1 3-1 4-2 6-1 1.6-1 3 .2 4 .8.7.7-1 .5-2 2 1 3 2.6 3 4.4A4.7 4.7 0 0 1 12 22a4.7 4.7 0 0 1-4.7-4.7c0-3 2.2-4.6 2.5-7 .2 1.4 1 2.2 2 2.6-.7-2 .6-3.4 1.4-4.6C14.4 6 13.6 3.6 12 2z" />
    </svg>
  );
}

function DateIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M3 10h18" />
      <path d="M8 3v4M16 3v4" />
    </svg>
  );
}

function StickerIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 4h11l5 5v11H4z" />
      <path d="M15 4v5h5" />
    </svg>
  );
}

function FlagIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 3v18" />
      <path d="M5 4h11l-2 4 2 4H5" />
    </svg>
  );
}

function ShareIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  );
}

// ─── Date helpers ────────────────────────────────────────────────────────────

function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isoYesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return toIsoDate(d);
}

// ─── Text sticker (TEXT tab) ────────────────────────────────────────────────

const STICKER_MAX = 24;
// Default lands center-canvas, clear of both the header/title zone (top) and the
// hero result + FELT stamp + footer strip (bottom of every skin) — the one zone
// that's consistently open across all skins. The athlete drags it from there.
const STICKER_DEFAULT_POS = { x: 50, y: 46 };

// ─── Component ─────────────────────────────────────────────────────────────

export function HandwrittenFace({
  data, onBack, onDone, onPosterCustomizationChange, onCorrection,
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
  const [activePanel, setActivePanel] = useState<'style' | 'felt' | 'date' | 'sticker' | null>(null);
  const [skinScroll, setSkinScroll]   = useState<{ thumbPct: number; offsetPct: number }>({ thumbPct: 100, offsetPct: 0 });
  const [dateOverride, setDateOverride] = useState<string | null>(null);
  const [dateDraft, setDateDraft]     = useState<string>(() => data.sourceDate ?? toIsoDate(data.workoutDate));
  const [showCorrection, setShowCorrection] = useState<boolean>(false);
  const [sharing, setSharing]         = useState<boolean>(false);
  const [sticker, setSticker]         = useState<PosterSticker | null>(() => data.posterSticker ?? null);
  const [stickerDraft, setStickerDraft] = useState<string>(() => data.posterSticker?.text ?? '');
  const [vibeOffset, setVibeOffset]   = useState<PosterVibeOffset | null>(() => data.posterVibeOffset ?? null);
  const [pendingDelete, setPendingDelete] = useState<'text' | 'vibe' | null>(null);

  const carouselViewportRef = useRef<HTMLDivElement>(null);
  const skinChipRowRef    = useRef<HTMLDivElement>(null);
  const shareCardRef      = useRef<HTMLDivElement>(null);
  const carouselX         = useMotionValue(0);
  const dragRef           = useRef<{ x: number; t: number } | null>(null);

  const isCarousel  = data.isCarousel && (data.carouselPageData?.length ?? 0) > 1;

  // Single-page wod (used when not a carousel, or as a fallback title)
  const singleWod = useMemo(
    () => buildPosterWod(data),
    [data],
  );
  const primaryCarouselPage = useMemo(
    () => isCarousel ? getPrimaryCarouselPageIndex(data) : 0,
    [data, isCarousel],
  );

  // Per-page wods (carousel path). The first slide matches the summary poster
  // shown in home/history thumbnails, followed by the individual workout parts.
  const pageWods = useMemo(
    () => isCarousel
      ? [
          singleWod,
          ...data.carouselPageData!
            .map((_, i) => ({ i, wod: buildPosterWodFromPage(data, i) }))
            .filter((page) => page.i !== primaryCarouselPage)
            .map((page) => page.wod),
        ]
      : null,
    [data, isCarousel, primaryCarouselPage, singleWod],
  );

  const Skin = SKINS[skinIdx].Comp;
  const currentFelt = VIBE[vibe];

  const { containerRef: cardAreaRef, contentRef: cardContentRef, scale: cardScale } =
    useFitScale<HTMLDivElement, HTMLDivElement>([singleWod, skinIdx]);
  const { containerRef: carouselAreaRef, contentRef: carouselContentRef, scale: carouselScale } =
    useFitScale<HTMLDivElement, HTMLDivElement>([pageWods, skinIdx, carouselPage]);
  const cardNeedsFit = cardScale < 0.999;
  const carouselNeedsFit = carouselScale < 0.999;

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

  // ── Date override (persists to workout.sourceDate) ─────────────────────

  const displayDate = dateOverride ? formatIsoPosterDate(dateOverride) : null;

  const applyDate = (iso: string): void => {
    if (!formatIsoPosterDate(iso)) return;
    setDateOverride(iso);
    setDateDraft(iso);
    setPulse((p) => p + 1);
    onPosterCustomizationChange?.({ sourceDate: iso });
  };

  // ── Text sticker (persists to workout.posterSticker) ───────────────────

  const applySticker = (): void => {
    const text = stickerDraft.trim().slice(0, STICKER_MAX);
    if (!text) return;
    const next: PosterSticker = sticker
      ? { ...sticker, text }
      : { text, ...STICKER_DEFAULT_POS };
    setSticker(next);
    setPulse((p) => p + 1);
    setActivePanel(null);
    onPosterCustomizationChange?.({ posterSticker: next });
  };

  const removeSticker = (): void => {
    setSticker(null);
    setStickerDraft('');
    setPulse((p) => p + 1);
    onPosterCustomizationChange?.({ posterSticker: null });
  };

  // Live position while dragging — persisted only on release to avoid write spam.
  const moveSticker = (pos: { x: number; y: number }): void => {
    setSticker((s) => (s ? { ...s, ...pos } : s));
  };

  const dropSticker = (pos: { x: number; y: number }): void => {
    if (!sticker) return;
    const next = { ...sticker, ...pos };
    setSticker(next);
    onPosterCustomizationChange?.({ posterSticker: next });
  };

  // ── Vibe stamp drag (persists to workout.posterVibeOffset) ─────────────
  // A nudge on top of wherever each skin naturally places the stamp, not a
  // global anchor — see DraggableVibeStamp for why.

  const moveVibe = (next: PosterVibeOffset): void => setVibeOffset(next);

  const dropVibe = (next: PosterVibeOffset): void => {
    setVibeOffset(next);
    onPosterCustomizationChange?.({ posterVibeOffset: next });
  };

  const removeVibe = (): void => {
    setVibeConfirmed(false);
    setVibeOffset(null);
    onPosterCustomizationChange?.({ posterVibe: null, posterVibeOffset: null });
  };

  // ── Sticker deletion (long-press either sticker → confirm sheet) ───────

  const confirmDelete = (): void => {
    if (pendingDelete === 'text') removeSticker();
    if (pendingDelete === 'vibe') removeVibe();
    setPendingDelete(null);
  };

  // ── Share (native share sheet, download fallback) ──────────────────────

  const handleShare = async (): Promise<void> => {
    const el = shareCardRef.current;
    if (!el || sharing) return;
    const shareWod = isCarousel && pageWods ? pageWods[carouselPage] : singleWod;
    setSharing(true);
    try {
      await shareWorkoutCard(el, shareWod.title ?? shareWod.type);
    } finally {
      setSharing(false);
    }
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
  const toggleDatePanel = (): void => setActivePanel((p) => (p === 'date' ? null : 'date'));
  const toggleStickerPanel = (): void => setActivePanel((p) => (p === 'sticker' ? null : 'sticker'));
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
    const n   = pageWods?.length ?? 1;
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

    const n = pageWods?.length ?? 1;
    if ((dx < -40 || vel < -300) && carouselPage < n - 1) snapToPage(carouselPage + 1);
    else if ((dx > 40 || vel > 300) && carouselPage > 0)  snapToPage(carouselPage - 1);
    else snapToPage(carouselPage);
  };

  // ─── Shared bottom bar ────────────────────────────────────────────────

  const bottomBar = (
    <div className={styles.bottomBar}>
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
        {activePanel === 'date' && (
          <motion.div key="date-panel" className={styles.panel}
            initial={{ opacity: 0, y: 10, height: 0 }} animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: 10, height: 0 }} transition={{ duration: 0.2, ease: [0.2, 0.7, 0.3, 1] }}>
            <div className={styles.dateRow}>
              <button className={styles.dateQuickChip}
                onClick={(e) => { e.stopPropagation(); applyDate(isoYesterday()); setActivePanel(null); }}>
                Yesterday
              </button>
              <input
                type="date"
                className={styles.dateInput}
                value={dateDraft}
                onChange={(e) => setDateDraft(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                aria-label="Workout date"
              />
              <button className={styles.dateSetBtn} disabled={!dateDraft}
                onClick={(e) => { e.stopPropagation(); applyDate(dateDraft); setActivePanel(null); }}>
                Set
              </button>
            </div>
          </motion.div>
        )}
        {activePanel === 'sticker' && (
          <motion.div key="sticker-panel" className={styles.panel}
            initial={{ opacity: 0, y: 10, height: 0 }} animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: 10, height: 0 }} transition={{ duration: 0.2, ease: [0.2, 0.7, 0.3, 1] }}>
            <div className={styles.stickerRow}>
              <input
                type="text"
                className={styles.stickerInput}
                value={stickerDraft}
                maxLength={STICKER_MAX}
                placeholder="e.g. legs are jelly"
                onChange={(e) => setStickerDraft(e.target.value.slice(0, STICKER_MAX))}
                onClick={(e) => e.stopPropagation()}
                aria-label="Poster note text"
              />
              <button className={styles.dateSetBtn} disabled={!stickerDraft.trim()}
                onClick={(e) => { e.stopPropagation(); applySticker(); }}>
                {sticker ? 'Update' : 'Add'}
              </button>
            </div>
            <div className={styles.stickerMetaRow}>
              <span className={styles.stickerMeta}>{stickerDraft.length}/{STICKER_MAX} · drag it anywhere on the poster</span>
              {sticker && (
                <button className={styles.stickerRemoveBtn}
                  onClick={(e) => { e.stopPropagation(); removeSticker(); }}>
                  Remove
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Quiet flag-a-mistake control — deliberately small + dim, not a peer of the tabs */}
      {onCorrection && data.workoutId && (
        <div className={styles.flagRow}>
          <button className={styles.flagBtn} onClick={() => setShowCorrection(true)}>
            <FlagIcon />
            <span>AI got it wrong?</span>
          </button>
        </div>
      )}

      <div className={styles.tabRow}>
        <button className={`${styles.tabBtn} ${activePanel === 'style' ? styles.tabBtnActive : ''}`}
          onClick={toggleStylePanel} aria-pressed={activePanel === 'style'} aria-label="Change poster style">
          <StyleIcon />
          <span className={styles.tabLabel}>Style</span>
        </button>
        <button className={`${styles.tabBtn} ${activePanel === 'felt' ? styles.tabBtnActive : ''}`}
          onClick={toggleFeltPanel} aria-pressed={activePanel === 'felt'} aria-label="Change how it felt">
          <FeltIcon />
          <span className={styles.tabLabel}>Felt</span>
        </button>
        <button className={`${styles.tabBtn} ${activePanel === 'date' ? styles.tabBtnActive : ''}`}
          onClick={toggleDatePanel} aria-pressed={activePanel === 'date'} aria-label="Change workout date">
          <DateIcon />
          <span className={styles.tabLabel}>Date</span>
        </button>
        <button className={`${styles.tabBtn} ${activePanel === 'sticker' ? styles.tabBtnActive : ''}`}
          onClick={toggleStickerPanel} aria-pressed={activePanel === 'sticker'} aria-label="Add a note to the poster">
          <StickerIcon />
          <span className={styles.tabLabel}>Text</span>
        </button>
        <button className={styles.shareBtn} disabled={sharing}
          onClick={() => { void handleShare(); }} aria-label="Share poster">
          <ShareIcon />
          <span>Share</span>
        </button>
      </div>

      {showCorrection && onCorrection && (
        <CorrectionSheet onSubmit={onCorrection} onClose={() => setShowCorrection(false)} />
      )}
    </div>
  );

  // ─── Story background (behind nav / card / bottom bar) ────────────────

  const storyBg = (
    <div className={styles.storyBg} aria-hidden="true">
      <div className={styles.storyBgBase} />
      <div
        className={styles.storyBgGlow}
        style={{ background: `radial-gradient(78% 48% at 22% 16%, rgba(120, 150, 190, 0.26) 0%, transparent 60%), radial-gradient(72% 50% at 86% 90%, ${currentFelt.color}2a 0%, transparent 60%)` }}
      />
      <div className={styles.storyBgNoise} />
      <div className={styles.storyBgScrim} />
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────
  // RENDER — CAROUSEL PATH
  // ─────────────────────────────────────────────────────────────────────

  if (isCarousel && pageWods) {
    const navTitle = pageWods[carouselPage]?.title ?? pageWods[carouselPage]?.type ?? singleWod.type;
    const shownPageWods = displayDate ? pageWods.map((w) => ({ ...w, date: displayDate })) : pageWods;

    return (
      <div className={styles.root}>
        {storyBg}
        <div className={styles.nav}>
          <button className={styles.navBack} onClick={onBack ?? onDone} aria-label="Back">←</button>
          <span className={styles.navTitle}>{navTitle}</span>
          <div className={styles.navSpacer} />
        </div>

        {/* Page dots */}
        <div className={styles.carouselDots}>
          {pageWods.map((_, i) => (
            <button key={i}
              className={`${styles.carouselDot} ${i === carouselPage ? styles.carouselDotActive : ''}`}
              onClick={() => snapToPage(i)}
              aria-label={i === 0 ? 'Summary' : `Part ${i}`}
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
            {shownPageWods.map((pageWod, i) => (
              <div
                key={i}
                className={[
                  styles.carouselSlide,
                  activePanel ? styles.carouselSlidePanelOpen : '',
                  i === carouselPage && carouselNeedsFit ? styles.carouselSlideFitTop : '',
                ].filter(Boolean).join(' ')}
              >
                <div
                  key={`${pulse}-${i}`}
                  ref={i === carouselPage ? carouselContentRef : undefined}
                  className={i === carouselPage && carouselNeedsFit ? styles.cardWrapperFitTop : undefined}
                  style={{
                    width: '100%',
                    transformOrigin: 'center top',
                    transform: i === carouselPage ? `scale(${carouselScale})` : undefined,
                    animation: i === carouselPage ? 'flipIn 0.4s cubic-bezier(0.2,0.7,0.3,1)' : undefined,
                  }}
                >
                  <div ref={i === carouselPage ? shareCardRef : undefined} className={styles.stickerLayer}>
                    <Skin
                      wod={pageWod}
                      vibe={vibeConfirmed ? vibe : null}
                      vibeOffset={vibeOffset}
                      onVibeMove={i === carouselPage ? moveVibe : undefined}
                      onVibeDrop={i === carouselPage ? dropVibe : undefined}
                      onVibeLongPress={i === carouselPage ? () => setPendingDelete('vibe') : undefined}
                    />
                    {sticker && i === carouselPage && (
                      <TextSticker sticker={sticker} onMove={moveSticker} onDrop={dropSticker} onLongPress={() => setPendingDelete('text')} />
                    )}
                  </div>
                </div>
              </div>
            ))}
          </motion.div>
        </div>

        {bottomBar}

        <DeleteActionSheet
          title={pendingDelete === 'text' ? 'Remove this note?' : pendingDelete === 'vibe' ? 'Remove the felt stamp?' : null}
          deleteLabel="Remove"
          onDelete={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────
  // RENDER — SINGLE CARD PATH
  // ─────────────────────────────────────────────────────────────────────

  const shownWod = displayDate ? { ...singleWod, date: displayDate } : singleWod;

  return (
    <div className={styles.root}>
      {storyBg}
      <div className={styles.nav}>
        <button className={styles.navBack} onClick={onBack ?? onDone} aria-label="Back">←</button>
        <span className={styles.navTitle}>{singleWod.title ?? singleWod.type}</span>
        <div className={styles.navSpacer} />
      </div>

      <div
        ref={cardAreaRef}
        className={[
          styles.cardArea,
          activePanel ? styles.cardAreaPanelOpen : '',
          cardNeedsFit ? styles.cardAreaFitTop : '',
        ].filter(Boolean).join(' ')}
        onClick={(e) => stepSkinFromTap(e.clientX, e.currentTarget)}
        role="button"
        aria-label="Tap left for previous style, right for next style"
      >
        <div
          key={pulse}
          ref={cardContentRef}
          className={`${styles.cardWrapper} ${cardNeedsFit ? styles.cardWrapperFitTop : ''}`}
          style={{ transform: `scale(${cardScale})` }}
        >
          <div ref={shareCardRef} className={styles.stickerLayer}>
            <Skin
              wod={shownWod}
              vibe={vibeConfirmed ? vibe : null}
              vibeOffset={vibeOffset}
              onVibeMove={moveVibe}
              onVibeDrop={dropVibe}
              onVibeLongPress={() => setPendingDelete('vibe')}
            />
            {sticker && (
              <TextSticker sticker={sticker} onMove={moveSticker} onDrop={dropSticker} onLongPress={() => setPendingDelete('text')} />
            )}
          </div>
        </div>
        {showHint && <div className={styles.tapHint}>Tap left/right to change style</div>}
      </div>

      {bottomBar}

      <DeleteActionSheet
        title={pendingDelete === 'text' ? 'Remove this note?' : pendingDelete === 'vibe' ? 'Remove the felt stamp?' : null}
        deleteLabel="Remove"
        onDelete={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
