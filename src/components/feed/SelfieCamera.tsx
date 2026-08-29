/**
 * Wodi's own camera.
 *
 * WHY NOT THE OS CAMERA
 * `<input capture="user">` hands the shot to the operating system, and whether
 * the file comes back mirrored is a device setting a web page cannot read
 * (iOS: Camera → Mirror Front Camera). That made "what I saw is what I posted"
 * unanswerable — inferring it from which input fired was tried and was wrong,
 * and so was every default. There is no amount of guessing that fixes an
 * unreadable setting.
 *
 * Here the whole path is ours: the live preview is mirrored (which is what a
 * selfie camera must do — a preview that isn't a mirror is unusable to frame
 * with), and the capture applies THE SAME mirror to the canvas. The pixels that
 * get saved are the pixels that were on screen, by construction rather than by
 * correction. This is also why BeReal and Locket never disagree with themselves:
 * neither hands you off to the system camera.
 *
 * The OS picker stays as the fallback for anything without a usable camera —
 * desktop, a denied permission, an old browser.
 */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './SelfieCamera.module.css';

/** Long edge requested from the camera. Matches the upload's own bound. */
const IDEAL_EDGE = 1080;
const JPEG_QUALITY = 0.9;

type Status = 'starting' | 'live' | 'denied';

interface SelfieCameraProps {
  onCapture: (file: File) => void;
  /** Fall back to the OS picker — offered whenever the camera won't start. */
  onUseLibrary: () => void;
  onCancel: () => void;
}

export function SelfieCamera({ onCapture, onUseLibrary, onCancel }: SelfieCameraProps): React.ReactElement {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<Status>('starting');
  const [facing, setFacing] = useState<'user' | 'environment'>('user');

  // One effect per stream: switching camera tears the old one down first. A
  // MediaStream that outlives its component holds the camera light on, so the
  // cleanup is not optional.
  useEffect(() => {
    let cancelled = false;

    async function start(): Promise<void> {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: IDEAL_EDGE }, height: { ideal: IDEAL_EDGE } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setStatus('live');
      } catch (err) {
        console.error('Camera unavailable:', err);
        if (!cancelled) setStatus('denied');
      }
    }

    void start();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [facing]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  // The front camera is mirrored on screen AND on the canvas. Doing it in both
  // places with the same flag is the entire guarantee this component makes.
  const mirrored = facing === 'user';

  const capture = (): void => {
    const video = videoRef.current;
    if (!video || status !== 'live') return;

    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) return;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (mirrored) {
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, width, height);

    canvas.toBlob((blob) => {
      if (!blob) return;
      onCapture(new File([blob], `wodi-${Date.now()}.jpg`, { type: 'image/jpeg' }));
    }, 'image/jpeg', JPEG_QUALITY);
  };

  return createPortal(
    <div className={styles.camera} role="dialog" aria-modal="true" aria-label="Camera">
      <video
        ref={videoRef}
        className={`${styles.video} ${mirrored ? styles.videoMirrored : ''}`}
        autoPlay
        playsInline
        muted
      />

      {status === 'starting' && <p className={styles.notice}>Starting camera…</p>}

      {status === 'denied' && (
        <div className={styles.denied}>
          <p className={styles.deniedText}>
            Wodi can&apos;t reach the camera. Allow camera access in your browser settings,
            or pick a photo you already have.
          </p>
          <button type="button" className={styles.deniedBtn} onClick={onUseLibrary}>
            Choose from library
          </button>
        </div>
      )}

      <div className={styles.controls}>
        <button type="button" className={styles.side} onClick={onCancel} aria-label="Close camera">
          Cancel
        </button>

        <button
          type="button"
          className={styles.shutter}
          onClick={capture}
          disabled={status !== 'live'}
          aria-label="Take photo"
        >
          <span className={styles.shutterInner} />
        </button>

        <button
          type="button"
          className={styles.side}
          onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))}
          disabled={status !== 'live'}
          aria-label="Switch camera"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 3l3 3-3 3" />
            <path d="M20 6H9a5 5 0 0 0-5 5" />
            <path d="M7 21l-3-3 3-3" />
            <path d="M4 18h11a5 5 0 0 0 5-5" />
          </svg>
        </button>
      </div>
    </div>,
    document.body,
  );
}
