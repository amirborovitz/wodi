/**
 * Drag-to-pan and pinch-to-zoom for a photo inside a fixed frame.
 *
 * The gesture math lives here rather than in StoryFrame because StoryFrame's
 * job is to render a composition — it should not also be a gesture recogniser.
 * The handlers this returns are spread straight onto the frame element, which
 * is why nothing here needs a ref: every handler reads the frame's box off
 * `event.currentTarget`, so the hook never has to be told how big the frame is.
 *
 * Panning is bounded by what actually overhangs. A 4:3 photo in a 9:16 frame is
 * already cropped hard on the sides at scale 1, so it can pan horizontally
 * straight away; the same photo has no vertical slack until it is zoomed. That
 * is why the bound is computed from the image's real dimensions instead of
 * being a fixed percentage — a fixed one would either lock a photo that has
 * room or let one slide off into a blank edge.
 */

import { useCallback, useRef, useState } from 'react';
import { DEFAULT_CROP, MAX_PHOTO_SCALE } from '../services/feed/types';
import type { PhotoCrop } from '../services/feed/types';

interface Size {
  width: number;
  height: number;
}

interface Gesture {
  /** Pointer positions when the gesture started, by pointer id. */
  from: PhotoCrop;
  /** Midpoint of the touching pointers at gesture start, in px. */
  midX: number;
  midY: number;
  /** Distance between two pointers at start. Zero for a one-finger pan. */
  spread: number;
}

export interface CropHandlers {
  onPointerDown: (e: React.PointerEvent<HTMLElement>) => void;
  onPointerMove: (e: React.PointerEvent<HTMLElement>) => void;
  onPointerUp: (e: React.PointerEvent<HTMLElement>) => void;
  onPointerCancel: (e: React.PointerEvent<HTMLElement>) => void;
}

interface UsePhotoCropResult {
  crop: PhotoCrop;
  handlers: CropHandlers;
  /** Call with the image's intrinsic size once it loads. */
  setNatural: (width: number, height: number) => void;
  /** Back to dead centre at cover scale — used when the photo is replaced. */
  reset: () => void;
}

/**
 * Clamps a crop to the photo's actual overhang. `cover` is the scale at which
 * the photo exactly fills the frame, which is the baseline every crop is
 * relative to.
 */
function clampCrop(crop: PhotoCrop, frame: Size, natural: Size): PhotoCrop {
  const scale = Math.max(1, Math.min(MAX_PHOTO_SCALE, crop.scale));
  const cover = Math.max(frame.width / natural.width, frame.height / natural.height);
  const shownWidth = natural.width * cover * scale;
  const shownHeight = natural.height * cover * scale;

  const maxX = Math.max(0, (shownWidth - frame.width) / 2) / frame.width * 100;
  const maxY = Math.max(0, (shownHeight - frame.height) / 2) / frame.height * 100;

  return {
    scale,
    x: Math.max(-maxX, Math.min(maxX, crop.x)),
    y: Math.max(-maxY, Math.min(maxY, crop.y)),
  };
}

function midpoint(points: { x: number; y: number }[]): { x: number; y: number } {
  const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
  return { x: sum.x / points.length, y: sum.y / points.length };
}

function spreadOf(points: { x: number; y: number }[]): number {
  if (points.length < 2) return 0;
  return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
}

export function usePhotoCrop(): UsePhotoCropResult {
  const [crop, setCrop] = useState<PhotoCrop>(DEFAULT_CROP);
  const natural = useRef<Size | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<Gesture | null>(null);
  const live = useRef<PhotoCrop>(DEFAULT_CROP);

  /** Re-reads the gesture baseline. Called whenever a finger lands or lifts, so
   *  going from one finger to two (or back) continues smoothly instead of
   *  snapping — the crop so far becomes the new starting point. */
  const rebase = useCallback((): void => {
    const points = [...pointers.current.values()];
    if (points.length === 0) { gesture.current = null; return; }
    const mid = midpoint(points);
    gesture.current = { from: live.current, midX: mid.x, midY: mid.y, spread: spreadOf(points) };
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLElement>): void => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    rebase();
  }, [rebase]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLElement>): void => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    const start = gesture.current;
    const size = natural.current;
    if (!start || !size) return;

    const frame = e.currentTarget.getBoundingClientRect();
    const points = [...pointers.current.values()];
    const mid = midpoint(points);
    const spread = spreadOf(points);

    // Two fingers scale about their midpoint; one finger just drags. A pinch
    // that also travels does both, which is what makes it feel like the photo
    // is being handled rather than adjusted.
    const zoom = start.spread > 0 && spread > 0 ? spread / start.spread : 1;

    const next = clampCrop({
      scale: start.from.scale * zoom,
      x: start.from.x + ((mid.x - start.midX) / frame.width) * 100,
      y: start.from.y + ((mid.y - start.midY) / frame.height) * 100,
    }, frame, size);

    live.current = next;
    setCrop(next);
  }, []);

  const endPointer = useCallback((e: React.PointerEvent<HTMLElement>): void => {
    pointers.current.delete(e.pointerId);
    rebase();
  }, [rebase]);

  const setNatural = useCallback((width: number, height: number): void => {
    natural.current = { width, height };
  }, []);

  const reset = useCallback((): void => {
    pointers.current.clear();
    gesture.current = null;
    natural.current = null;
    live.current = DEFAULT_CROP;
    setCrop(DEFAULT_CROP);
  }, []);

  return {
    crop,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endPointer,
      onPointerCancel: endPointer,
    },
    setNatural,
    reset,
  };
}
