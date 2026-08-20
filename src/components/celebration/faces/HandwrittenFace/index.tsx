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
import { buildPosterWod, buildPosterWodPages, getPrimaryCarouselPageIndex, formatIsoPosterDate } from './posterData';
import { useFitScale } from './useFitScale';
import { SKINS, guessVibe, resolvePosterVibe } from './skinRegistry';
import { CorrectionSheet } from '../../CorrectionSheet';
import { TextSticker } from './TextSticker';
import { PosterPhotoInset } from './PosterPhotoInset';
import { DeleteActionSheet } from '../../../ui/DeleteActionSheet';
import { ActionMenuSheet, type ActionMenuItem } from '../../../ui/ActionMenuSheet';
import { ConfirmDialog } from '../../../ui/ConfirmDialog';
import { PRLift } from '../../PRLift';
import type { PosterPhoto, PosterSticker, PosterVibeOffset } from '../../../../types';
import type { PosterPayload } from './posterPayload';
import { usePostToFeed } from '../../../../hooks/usePostToFeed';
import { usePosterPhotoUpload } from '../../../../hooks/usePosterPhotoUpload';
import { captureBlob, downloadBlob, isNativeShareSupported, shareImage } from '../../../../utils/shareUtils';
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

function PencilIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}

function MoreIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="1.9" />
      <circle cx="12" cy="12" r="1.9" />
      <circle cx="19" cy="12" r="1.9" />
    </svg>
  );
}

function PhotoIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <circle cx="9" cy="10" r="1.9" />
      <path d="M21 15l-5-4-4 3-3-2-6 5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FeedIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12h3.5L9 5l4 14 2.5-7H21" />
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

function DownloadIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
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
  data, onBack, onDone, onEdit, onPosterCustomizationChange, onCorrection,
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
  const [activePanel, setActivePanel] = useState<'style' | 'felt' | 'date' | 'sticker' | 'photo' | null>(null);
  const [skinScroll, setSkinScroll]   = useState<{ thumbPct: number; offsetPct: number }>({ thumbPct: 100, offsetPct: 0 });
  const [dateOverride, setDateOverride] = useState<string | null>(null);
  const [dateDraft, setDateDraft]     = useState<string>(() => data.sourceDate ?? toIsoDate(data.workoutDate));
  const [showCorrection, setShowCorrection] = useState<boolean>(false);
  const [showMenu, setShowMenu]       = useState<boolean>(false);
  const [showShare, setShowShare]     = useState<boolean>(false);
  const [shareState, setShareState]   = useState<'preparing' | 'ready' | 'failed'>('preparing');
  const [sticker, setSticker]         = useState<PosterSticker | null>(() => data.posterSticker ?? null);
  const [stickerDraft, setStickerDraft] = useState<string>(() => data.posterSticker?.text ?? '');
  const [vibeOffset, setVibeOffset]   = useState<PosterVibeOffset | null>(() => data.posterVibeOffset ?? null);
  const [photo, setPhoto]             = useState<PosterPhoto | null>(() => data.posterPhoto ?? null);
  const [pendingDelete, setPendingDelete] = useState<'text' | 'vibe' | 'photo' | null>(null);
  const [confirmPost, setConfirmPost]  = useState<boolean>(false);

  const photoUpload = usePosterPhotoUpload();
  const feedPost = usePostToFeed();

  const carouselViewportRef = useRef<HTMLDivElement>(null);
  const skinChipRowRef    = useRef<HTMLDivElement>(null);
  const shareCardRef      = useRef<HTMLDivElement>(null);
  const shareBlob         = useRef<Blob | null>(null);
  const carouselX         = useMotionValue(0);
  const dragRef           = useRef<{ x: number; t: number } | null>(null);

  const isCarousel  = data.isCarousel && (data.carouselPageData?.length ?? 0) > 1;

  // Per-page wods (carousel path). The first slide matches the summary poster
  // shown in home/history thumbnails, followed by the individual workout parts.
  const pageWods = useMemo(
    () => isCarousel ? buildPosterWodPages(data) : null,
    [data, isCarousel],
  );
  const primaryCarouselPage = useMemo(
    () => isCarousel ? getPrimaryCarouselPageIndex(data) : 0,
    [data, isCarousel],
  );

  // Single-page wod (used when not a carousel, or as a fallback title). On the
  // carousel path it IS the lead page, so the two can't drift.
  const singleWod = useMemo(
    () => pageWods?.[0] ?? buildPosterWod(data),
    [pageWods, data],
  );

  // Slide that holds the PR's part. `pageWods` puts the summary (= the primary page) at
  // slide 0 and drops that page from the tail, so the tail index has to skip it.
  const prSlideIndex = useMemo((): number | null => {
    const pageIndex = data.prCelebration?.pageIndex;
    if (pageIndex == null || !isCarousel) return null;
    if (pageIndex === primaryCarouselPage) return 0;
    let slide = 1;
    for (let i = 0; i < pageIndex; i++) if (i !== primaryCarouselPage) slide++;
    return slide;
  }, [data.prCelebration?.pageIndex, isCarousel, primaryCarouselPage]);

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

  // ── Poster photo (persists to workout.posterPhoto) ─────────────────────
  // Handled as a sticker, not as media: it lives in the poster tree, so the
  // share capture and every thumbnail pick it up with no extra wiring.

  const choosePhoto = (file: File): void => {
    photoUpload.choose(file, photo, (next) => {
      setPhoto(next);
      setPulse((p) => p + 1);
      onPosterCustomizationChange?.({ posterPhoto: next });
    });
  };

  const removePhoto = (): void => {
    if (photo) photoUpload.discard(photo);
    setPhoto(null);
    setPulse((p) => p + 1);
    onPosterCustomizationChange?.({ posterPhoto: null });
  };

  const movePhoto = (pos: { x: number; y: number }): void => {
    setPhoto((p) => (p ? { ...p, ...pos } : p));
  };

  const dropPhoto = (pos: { x: number; y: number }): void => {
    if (!photo) return;
    const next = { ...photo, ...pos };
    setPhoto(next);
    onPosterCustomizationChange?.({ posterPhoto: next });
  };

  // ── Sticker deletion (long-press any sticker → confirm sheet) ──────────

  const confirmDelete = (): void => {
    if (pendingDelete === 'text') removeSticker();
    if (pendingDelete === 'vibe') removeVibe();
    if (pendingDelete === 'photo') removePhoto();
    setPendingDelete(null);
  };

  // ── Post to feed ───────────────────────────────────────────────────────
  // Publishing is global and irreversible-ish, so it lives in the overflow menu
  // rather than beside Share: a mis-tap next to the most-tapped button would
  // put a poster in front of everyone. The explainer dialog runs in front of the
  // athlete's FIRST post only — after that the sheet row publishes straight away.

  const publish = (): void => {
    setConfirmPost(false);
    // The whole session goes out — posting from the strength page used to publish
    // the strength page alone, so the feed showed a fraction of the day. But the
    // card on screen LEADS the deck: swiping to a part before tapping Post is the
    // athlete saying "this is the bit I'm proud of", and the sticker/photo ride
    // that same card in the editor. Never swiping leaves the metcon in front,
    // since that's where pageWods already starts.
    const pages = pageWods ?? [singleWod];
    const lead = pageWods ? carouselPage : 0;
    const posted = [pages[lead], ...pages.filter((_, i) => i !== lead)];
    const payload: PosterPayload = {
      wods: displayDate ? posted.map((w) => ({ ...w, date: displayDate })) : posted,
      skin: SKINS[skinIdx].id,
      vibe: vibeConfirmed ? vibe : null,
      ...(vibeOffset ? { vibeOffset } : {}),
      ...(sticker ? { sticker } : {}),
      ...(photo ? { photo } : {}),
    };
    feedPost.post(payload, data.prCelebration != null);
  };

  // ── Share (destination sheet, then a prepared image) ───────────────────
  // Capture cannot sit between the tap and `navigator.share`: html2canvas takes
  // long enough that Safari drops the transient activation and refuses the share,
  // which is why the old one-tap version fell through to a download on iOS.
  // Opening the sheet starts the capture; the tap that shares is a fresh gesture
  // on an image that is already in hand.

  const openShare = (): void => {
    const el = shareCardRef.current;
    if (!el) return;
    shareBlob.current = null;
    setShareState('preparing');
    setShowShare(true);
    void captureBlob(el)
      .then((blob) => { shareBlob.current = blob; setShareState('ready'); })
      .catch((err) => { console.error('Failed to render poster:', err); setShareState('failed'); });
  };

  const shareTitle = (): string => {
    const shareWod = isCarousel && pageWods ? pageWods[carouselPage] : singleWod;
    return shareWod.title ?? shareWod.type;
  };

  const shareToApps = (): void => {
    const blob = shareBlob.current;
    if (!blob) return;
    void shareImage(blob, shareTitle()).then((shared) => {
      // Every non-iOS desktop browser and Chrome on iOS refuse file shares, so a
      // decline that isn't a cancel still has to leave the athlete with the image.
      if (!shared) downloadBlob(blob, `${shareTitle()}.png`);
    });
  };

  const saveImage = (): void => {
    const blob = shareBlob.current;
    if (blob) downloadBlob(blob, `${shareTitle()}.png`);
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

  useEffect(() => {
    if (!feedPost.notice) return;
    const timer = setTimeout(feedPost.clearNotice, 2600);
    return () => clearTimeout(timer);
  }, [feedPost.notice, feedPost.clearNotice]);

  const toggleStylePanel = (): void => setActivePanel((p) => (p === 'style' ? null : 'style'));
  const toggleFeltPanel = (): void => setActivePanel((p) => (p === 'felt' ? null : 'felt'));
  const toggleDatePanel = (): void => setActivePanel((p) => (p === 'date' ? null : 'date'));
  const toggleStickerPanel = (): void => setActivePanel((p) => (p === 'sticker' ? null : 'sticker'));
  const togglePhotoPanel = (): void => setActivePanel((p) => (p === 'photo' ? null : 'photo'));
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
        {activePanel === 'photo' && (
          <motion.div key="photo-panel" className={styles.panel}
            initial={{ opacity: 0, y: 10, height: 0 }} animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: 10, height: 0 }} transition={{ duration: 0.2, ease: [0.2, 0.7, 0.3, 1] }}>
            <div className={styles.stickerRow}>
              <label className={styles.photoPickBtn}>
                {photoUpload.busy ? 'Adding…' : photo ? 'Replace photo' : 'Add photo'}
                <input
                  type="file"
                  accept="image/*"
                  className={styles.photoInput}
                  disabled={photoUpload.busy}
                  onClick={(e) => { e.stopPropagation(); (e.target as HTMLInputElement).value = ''; }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) choosePhoto(file);
                  }}
                />
              </label>
              {photo && (
                <button className={styles.photoRemoveBtn}
                  disabled={photoUpload.busy}
                  onClick={(e) => { e.stopPropagation(); removePhoto(); }}>
                  Remove
                </button>
              )}
            </div>
            <div className={styles.stickerMetaRow}>
              <span className={styles.stickerMeta}>
                {photoUpload.error ?? 'Drag it anywhere on the poster'}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
        <button className={`${styles.tabBtn} ${activePanel === 'photo' ? styles.tabBtnActive : ''}`}
          onClick={togglePhotoPanel} aria-pressed={activePanel === 'photo'} aria-label="Add a photo to the poster">
          <PhotoIcon />
          <span className={styles.tabLabel}>Photo</span>
        </button>
        <button className={styles.shareBtn}
          onClick={openShare} aria-label="Share poster" aria-haspopup="menu">
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

  // ─── Share sheet ("Share", bottom bar) ────────────────────────────────
  // Wodi's own feed is the first destination, not one buried behind a "⋯": the
  // proudest screen in the app should not spend its loudest button exporting to
  // someone else's. The sheet itself, not obscurity, is what stops a mis-tap —
  // the dialog behind this row is a one-time explainer, not a per-post gate.
  // A test log is excluded from every count, so it has no business in a public feed.

  const canPostToFeed = feedPost.canPost && !data.isTest;

  // Labels stay fixed and the header carries the capture state: the sheet keys rows
  // by label, so a label that changes with state would collide across rows.
  const shareItems: ActionMenuItem[] = [
    ...(canPostToFeed
      ? [{ label: 'Post to Wodi feed', icon: <FeedIcon />, onClick: () => (feedPost.needsConfirm ? setConfirmPost(true) : publish()) }]
      : []),
    ...(isNativeShareSupported()
      ? [{ label: 'Share image…', icon: <ShareIcon />, onClick: shareToApps, disabled: shareState !== 'ready' }]
      : []),
    { label: 'Save image', icon: <DownloadIcon />, onClick: saveImage, disabled: shareState !== 'ready' },
  ];

  const shareSheet = (
    <ActionMenuSheet
      title={showShare
        ? shareState === 'failed' ? "Couldn't render this poster"
          : shareState === 'preparing' ? 'Preparing image…'
          : 'Share this poster'
        : null}
      items={shareItems}
      onClose={() => setShowShare(false)}
    />
  );

  // ─── Overflow menu ("⋯", top right) ───────────────────────────────────
  // Everything that isn't the poster's look. The style/felt/date/text/photo tabs stay on the
  // bottom bar because those ARE the poster; these are "this log is wrong" — one fixable by the
  // athlete, one only reportable.

  const menuItems: ActionMenuItem[] = [
    ...(onEdit ? [{ label: 'Edit workout', icon: <PencilIcon />, onClick: onEdit }] : []),
    ...(onCorrection && data.workoutId
      ? [{ label: 'AI got it wrong?', icon: <FlagIcon />, quiet: true, onClick: () => setShowCorrection(true) }]
      : []),
  ];

  const navRight = menuItems.length > 0 ? (
    <button className={styles.navMore} onClick={() => setShowMenu(true)} aria-label="More options" aria-haspopup="menu">
      <MoreIcon />
    </button>
  ) : (
    <div className={styles.navSpacer} />
  );

  const menuSheet = (
    <ActionMenuSheet
      title={showMenu ? (singleWod.title ?? singleWod.type) : null}
      items={menuItems}
      onClose={() => setShowMenu(false)}
    />
  );

  // ─── Feed overlays (shared by both render paths) ──────────────────────

  const feedOverlays = (
    <>
      <ConfirmDialog
        open={confirmPost}
        title="Post to Feed?"
        message="Anyone on Wodi can see your whole workout for the next 24 hours, then it disappears. The feed gets a copy — editing this workout later won't change what's posted."
        confirmText={feedPost.posting ? 'Posting…' : 'Post'}
        onConfirm={publish}
        onCancel={() => setConfirmPost(false)}
      />
      {feedPost.notice && (
        <div className={styles.feedNotice} role="status">{feedPost.notice}</div>
      )}
    </>
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
          {navRight}
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
                    {photo && i === carouselPage && (
                      <PosterPhotoInset photo={photo} onMove={movePhoto} onDrop={dropPhoto} onLongPress={() => setPendingDelete('photo')} />
                    )}
                  </div>
                </div>
              </div>
            ))}
          </motion.div>
        </div>

        {bottomBar}

        {data.prCelebration && (
          <PRLift
            pr={data.prCelebration}
            onNavigate={
              prSlideIndex != null && prSlideIndex !== carouselPage
                ? () => snapToPage(prSlideIndex)
                : undefined
            }
          />
        )}

        {menuSheet}
        {shareSheet}

        <DeleteActionSheet
          title={pendingDelete === 'text' ? 'Remove this note?' : pendingDelete === 'vibe' ? 'Remove the felt stamp?' : pendingDelete === 'photo' ? 'Remove this photo?' : null}
          deleteLabel="Remove"
          onDelete={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />

        {feedOverlays}
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
        {navRight}
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
            {photo && (
              <PosterPhotoInset photo={photo} onMove={movePhoto} onDrop={dropPhoto} onLongPress={() => setPendingDelete('photo')} />
            )}
          </div>
        </div>
        {showHint && <div className={styles.tapHint}>Tap left/right to change style</div>}
      </div>

      {bottomBar}

      {data.prCelebration && <PRLift pr={data.prCelebration} />}

      {menuSheet}
      {shareSheet}

      <DeleteActionSheet
        title={pendingDelete === 'text' ? 'Remove this note?' : pendingDelete === 'vibe' ? 'Remove the felt stamp?' : pendingDelete === 'photo' ? 'Remove this photo?' : null}
        deleteLabel="Remove"
        onDelete={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />

      {feedOverlays}
    </div>
  );
}
