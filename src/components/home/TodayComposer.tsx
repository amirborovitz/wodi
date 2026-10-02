import { useRef } from 'react';
import type React from 'react';
import styles from './TodayComposer.module.css';

interface TodayComposerProps {
  /** The bar itself: open the Wodi thread. */
  onTellWodi: () => void;
  /** The camera, or a board from the gallery: open the thread with this photo already sent. */
  onPhoto: (file: File) => void;
}

/**
 * Today's one way in, docked flush on top of the nav (one surface, not two floating pills).
 * The same row as the thread's composer: "+" for a board already in the gallery, the bar, and
 * the yellow camera — the one primary action. The bar opens the thread; typing happens there.
 * Saving a board for later needs no button: leaving the thread keeps it.
 */
export function TodayComposer({ onTellWodi, onPhoto }: TodayComposerProps): React.ReactElement {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const sendPicked = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) onPhoto(file);
  };
  return (
    <div className={styles.row}>
      <button type="button" className={styles.plus} onClick={() => galleryRef.current?.click()} aria-label="Send Wodi a board from your photos">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M9 2v14M2 9h14" />
        </svg>
      </button>
      <button type="button" className={styles.bar} onClick={onTellWodi}>Tell Wodi…</button>
      <button type="button" className={styles.camera} onClick={() => cameraRef.current?.click()} aria-label="Send Wodi a photo of the board">
        <svg width="22" height="20" viewBox="0 0 22 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 6h4l2-3h6l2 3h4v12H2z" />
          <circle cx="11" cy="11.5" r="3.5" />
        </svg>
      </button>
      <input ref={galleryRef} type="file" accept="image/*" className={styles.hiddenInput} onChange={sendPicked} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className={styles.hiddenInput} onChange={sendPicked} />
    </div>
  );
}
