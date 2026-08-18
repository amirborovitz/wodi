/**
 * Upload path for the photo clipped to a poster.
 *
 * A phone camera file is ~4MB and the feed is a scroll, so the original never
 * leaves the device — it is drawn into a canvas at a bounded size and
 * re-encoded before upload. The Storage rules cap size as a backstop for
 * anything that bypasses this path.
 */

import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from '../firebase';
import type { PosterPhoto } from '../../types';

/** Longest edge, in px. Comfortably above the poster inset's render size. */
const MAX_EDGE = 1080;
const JPEG_QUALITY = 0.8;

/** Default placement of a freshly added photo: tucked into the lower-right. */
const DEFAULT_PLACEMENT = { x: 76, y: 74, rotation: -4 };

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image')); };
    img.src = url;
  });
}

async function downscale(file: File): Promise<Blob> {
  const img = await loadImage(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
  const width = Math.round(img.width * scale);
  const height = Math.round(img.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not process that image');
  ctx.drawImage(img, 0, 0, width, height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not process that image'))),
      'image/jpeg',
      JPEG_QUALITY,
    );
  });
}

/**
 * Downscales, uploads, and returns the poster-ready photo. `path` is kept on
 * the returned object so cleanup can delete the Storage object later — a
 * Firestore TTL on the post does not remove the file.
 */
export async function uploadPosterPhoto(userId: string, file: File): Promise<PosterPhoto> {
  const blob = await downscale(file);
  const path = `feedPhotos/${userId}/${Date.now()}.jpg`;
  const objectRef = ref(storage, path);
  await uploadBytes(objectRef, blob, { contentType: 'image/jpeg' });
  const url = await getDownloadURL(objectRef);
  return { url, path, ...DEFAULT_PLACEMENT };
}

export async function deletePosterPhoto(photo: PosterPhoto): Promise<void> {
  await deleteObject(ref(storage, photo.path)).catch((err) => {
    console.error('Failed to delete poster photo:', err);
  });
}
