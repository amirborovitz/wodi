/**
 * HandwrittenFace — Slab / Chalk / Flare poster skins.
 *
 * Single workout:   tap card to cycle skins.
 * Multi-part:       swipe left/right between exercises (one card per part),
 *                   tap to cycle skins. Page dots show position.
 */

import React, { useState, useRef, useMemo } from 'react';
import { motion, useMotionValue, animate as fmAnimate } from 'framer-motion';
import type { CelebrationFaceProps } from '../types';
import type { VibeKey } from './brand';
import { VIBE, VIBE_KEYS } from './brand';
import { buildPosterWod, buildPosterWodFromPage } from './posterData';
import { useFitScale } from './useFitScale';
import { SkinSlab } from './SkinSlab';
import { SkinChalk } from './SkinChalk';
import { SkinFlare } from './SkinFlare';
import { SkinStadium } from './SkinStadium';
import { SkinBlueprint } from './SkinBlueprint';
import { SkinPress } from './SkinPress';
import styles from './index.module.css';

// ─── Skin registry ─────────────────────────────────────────────────────────

const SKINS = [
  { id: 'slab',    name: 'Slab',    Comp: SkinSlab    },
  { id: 'chalk',   name: 'Chalk',   Comp: SkinChalk   },
  { id: 'flare',   name: 'Flare',   Comp: SkinFlare   },
  { id: 'stadium', name: 'Stadium', Comp: SkinStadium },
  { id: 'blueprint', name: 'Blueprint', Comp: SkinBlueprint },
  { id: 'press', name: 'Press', Comp: SkinPress },
] as const;

type SkinId = typeof SKINS[number]['id'];

// ─── Vibe derivation ───────────────────────────────────────────────────────

const INTENSITY_VIBE_MAP: Record<string, VibeKey> = {
  cooked: 'cooked', smoked: 'smoked', barely: 'wrecked', sent_it: 'sweaty',
  gassed: 'sweaty', held_on: 'wrecked', machine: 'chill', dark_place: 'cooked',
  solid: 'solid', easy_day: 'chill', survived: 'wrecked', dialed_in: 'solid',
};

function deriveVibe(data: CelebrationFaceProps['data']): VibeKey {
  const userVibe = data.exercises?.find((ex) => ex.intensity)?.intensity;
  if (userVibe && INTENSITY_VIBE_MAP[userVibe]) return INTENSITY_VIBE_MAP[userVibe];
  const ep = data.totalEP ?? 0;
  if (ep >= 250) return 'cooked';
  if (ep >= 160) return 'smoked';
  if (ep >= 80)  return 'sweaty';
  return 'solid';
}

// ─── Component ─────────────────────────────────────────────────────────────

export function HandwrittenFace({
  data, mode, onBack, onDone, onPosterCustomizationChange,
}: CelebrationFaceProps): React.JSX.Element {
  const [skinIdx, setSkinIdx]         = useState<number>(() => {
    const saved = SKINS.findIndex((s) => s.id === data.posterSkin);
    return saved >= 0 ? saved : 0;
  });
  const [vibe, setVibe]               = useState<VibeKey>(() => data.posterVibe ?? deriveVibe(data));
  const [pulse, setPulse]             = useState<number>(0);
  const [showHint, setShowHint]       = useState<boolean>(true);
  const [isPosterSharing, setSharing] = useState<boolean>(false);
  const [shareToast, setShareToast]   = useState<string | null>(null);
  const [carouselPage, setCarouselPage] = useState<number>(0);

  const posterFrameRef    = useRef<HTMLDivElement>(null);
  const carouselViewportRef = useRef<HTMLDivElement>(null);
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

  // ── Share handler ─────────────────────────────────────────────────────

  const showToast = (msg: string): void => {
    setShareToast(msg);
    window.setTimeout(() => setShareToast(null), 2600);
  };

  const handleShare = async (): Promise<void> => {
    if (isPosterSharing) return;
    setSharing(true);
    navigator.vibrate?.(8);
    try {
      const { elementToCanvas, canvasToBlob, isNativeShareSupported, downloadBlob } =
        await import('../../../../utils/shareUtils');
      const source = posterFrameRef.current;
      if (!source) throw new Error('Poster not ready');
      await document.fonts?.ready;
      const clone = source.cloneNode(true) as HTMLElement;
      clone.style.cssText = 'width:1080px;height:auto;max-width:none;position:relative;transform:none;box-sizing:border-box;';
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:-12000px;top:0;width:1080px;overflow:hidden;';
      host.appendChild(clone);
      document.body.appendChild(host);
      try {
        const canvas = await elementToCanvas(clone, { scale: 2 });
        const blob   = await canvasToBlob(canvas, 'png');
        const safe   = (data.rewardDisplayTitle || 'wodi').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 48) || 'wodi';
        const file   = new File([blob], `${safe}-${Date.now()}.png`, { type: 'image/png' });
        if (isNativeShareSupported()) {
          try { await navigator.share({ title: data.rewardDisplayTitle || 'Wodi', text: 'wodi.', files: [file] }); return; }
          catch (e) { if ((e as Error).name === 'AbortError') return; }
        }
        downloadBlob(blob, file.name);
        showToast('Image saved — open Instagram to share.');
      } finally { document.body.removeChild(host); }
    } catch (e) {
      console.error('Failed to export poster:', e);
      showToast('Could not create image. Screenshot still works.');
    } finally { setSharing(false); }
  };

  // ─── Shared bottom sheet ──────────────────────────────────────────────

  const bottomSheet = (
    <div className={styles.bottomSheet}>
      <div className={styles.switcherRow}>
        <span className={styles.switcherLabel}>STYLE</span>
        <div className={styles.switcherTrack}>
          {SKINS.map((s, i) => (
            <button key={s.id as SkinId} className={styles.switcherBtn}
              style={{ background: i === skinIdx ? '#f5c200' : 'transparent', color: i === skinIdx ? '#0b0c0e' : 'rgba(255,255,255,0.7)' }}
              onClick={(e) => { e.stopPropagation(); pickSkin(i); }}>
              {s.name}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.switcherRow}>
        <span className={styles.switcherLabel}>FELT</span>
        <div className={styles.vibeTrack}>
          {VIBE_KEYS.map((k) => (
            <button key={k} className={styles.vibeBtn}
              style={{ background: k === vibe ? VIBE[k].color : 'rgba(255,255,255,0.06)', border: k === vibe ? 'none' : '1px solid rgba(255,255,255,0.1)', color: k === vibe ? '#0a0c0f' : 'rgba(255,255,255,0.6)' }}
              onClick={(e) => { e.stopPropagation(); setVibe(k); onPosterCustomizationChange?.({ posterVibe: k }); }}>
              {VIBE[k].label}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.shareRow}>
        <button className={styles.shareBtn} onClick={handleShare} disabled={isPosterSharing} aria-label="Share to Story">
          {isPosterSharing ? <span className={styles.shareSpinner} /> : 'Share to Story'}
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
          className={styles.carouselViewport}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <motion.div className={styles.carouselSlider} style={{ x: carouselX }}>
            {pageWods.map((pageWod, i) => (
              <div key={i} className={styles.carouselSlide}>
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
                  <div ref={i === carouselPage ? posterFrameRef : undefined}>
                    <Skin wod={pageWod} vibe={vibe} />
                  </div>
                </div>
              </div>
            ))}
          </motion.div>
        </div>

        {bottomSheet}
        {shareToast && <div className={styles.toast} role="status">{shareToast}</div>}
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
        className={styles.cardArea}
        onClick={(e) => stepSkinFromTap(e.clientX, e.currentTarget)}
        role="button"
        aria-label="Tap left for previous style, right for next style"
      >
        <div key={pulse} ref={cardContentRef} className={styles.cardWrapper} style={{ transform: `scale(${cardScale})` }}>
          <div ref={posterFrameRef}>
            <Skin wod={singleWod} vibe={vibe} />
          </div>
        </div>
        {showHint && <div className={styles.tapHint}>Tap left/right to change style</div>}
      </div>

      {bottomSheet}
      {shareToast && <div className={styles.toast} role="status">{shareToast}</div>}
    </div>
  );
}
