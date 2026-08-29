/**
 * Upload path for athlete photos in the feed.
 *
 * A phone camera file is ~4MB and the feed is a scroll, so the original never
 * leaves the device — it is drawn into a canvas at a bounded size and
 * re-encoded before upload. The Storage rules cap size as a backstop for
 * anything that bypasses this path.
 *
 * TWO PHOTOS, ONE PIPE
 * A PosterPhoto is a polaroid the athlete sticks on their own poster: part of
 * the artifact, permanent, and it shows up on the Home thumbnail and the share
 * capture. A FeedPhoto is the shot behind ONE post: it exists for 24 hours,
 * belongs to the post rather than the workout, and posting the same workout
 * twice would mean two of them. They are different things with different
 * lifetimes, so they are different fields — but they compress and upload
 * identically, which is what `uploadImage` is.
 */

import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from '../firebase';
import type { PosterPhoto } from '../../types';
import type { FeedPhoto } from './types';

/** Longest edge, in px. Comfortably above either surface's render size. */
const MAX_EDGE = 1080;
const JPEG_QUALITY = 0.8;

/** Default placement of a freshly added poster polaroid: tucked lower-right. */
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
  // No mirroring here. A selfie is already the right way round by the time it
  // reaches this function, because SelfieCamera mirrors the preview and the
  // capture together — correcting it downstream is what made it unpredictable.
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
 * Downscales and uploads, returning the download URL plus the object path.
 * `path` is kept on every caller's result so cleanup can delete the object
 * later — neither a Firestore field delete nor a TTL removes the file.
 */
async function uploadImage(
  userId: string, file: File, prefix: string,
): Promise<{ url: string; path: string }> {
  const blob = await downscale(file);
  const path = `feedPhotos/${userId}/${prefix}${Date.now()}.jpg`;
  const objectRef = ref(storage, path);
  await uploadBytes(objectRef, blob, { contentType: 'image/jpeg' });
  return { url: await getDownloadURL(objectRef), path };
}

/** The polaroid stuck on a poster. Persists on the workout. */
export async function uploadPosterPhoto(userId: string, file: File): Promise<PosterPhoto> {
  return { ...(await uploadImage(userId, file, '')), ...DEFAULT_PLACEMENT };
}

/**
 * The photo behind one feed post. Uploaded at PUBLISH time, not at pick time —
 * an athlete who opens the post sheet, tries a photo and backs out must leave
 * nothing behind, so the sheet previews from a local object URL and this only
 * runs when they commit.
 *
 * `crop` and `posterOffset` ride along unchanged rather than being applied to
 * the pixels: they are layout decisions, and baking them in would throw away
 * the rest of the photo that the full-size view still shows.
 */
export async function uploadFeedPhoto(
  userId: string,
  file: File,
  options: { crop?: FeedPhoto['crop']; posterOffset?: FeedPhoto['posterOffset'] },
): Promise<FeedPhoto> {
  const uploaded = await uploadImage(userId, file, 'post-');
  return {
    ...uploaded,
    ...(options.crop ? { crop: options.crop } : {}),
    ...(options.posterOffset ? { posterOffset: options.posterOffset } : {}),
  };
}

export async function deleteStoredImage(path: string): Promise<void> {
  await deleteObject(ref(storage, path)).catch((err) => {
    console.error('Failed to delete stored image:', err);
  });
}
