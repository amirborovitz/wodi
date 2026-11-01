import type React from 'react';
import { usePhotoPicker } from '../../hooks/usePhotoPicker';
import styles from './TodayComposer.module.css';

interface TodayComposerProps {
  /** The bar itself: open the Wodi thread. */
  onTellWodi: () => void;
  /** The camera, or "+" — a board from the photos: open the thread with this photo already sent. */
  onPhoto: (file: File) => void;
  /** The bar's words — Today names a waiting board here ("Ask Wodi about FRAN…"). */
  placeholder?: string;
}

/**
 * Today's one way in, docked flush on top of the nav (one surface, not two floating pills).
 * The same row as the thread's composer, and the same "+": a board from your photos, straight
 * from the phone's picker. The bar opens the thread; typing happens there. The yellow camera is
 * the one primary action. Saving a board for later needs no button: the chat asks.
 */
export function TodayComposer({ onTellWodi, onPhoto, placeholder = 'Message Wodi…' }: TodayComposerProps): React.ReactElement {
  const gallery = usePhotoPicker(onPhoto);
  const camera = usePhotoPicker(onPhoto);
  return (
    <div className={styles.row}>
      <button type="button" className={styles.plus} onClick={gallery.open} aria-label="Send Wodi a board from your photos">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M9 2v14M2 9h14" />
        </svg>
      </button>
      <button type="button" className={styles.bar} onClick={onTellWodi}>{placeholder}</button>
      <button type="button" className={styles.camera} onClick={camera.open} aria-label="Send Wodi a photo of the board">
        <svg width="22" height="20" viewBox="0 0 22 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 6h4l2-3h6l2 3h4v12H2z" />
          <circle cx="11" cy="11.5" r="3.5" />
        </svg>
      </button>
      <input ref={gallery.inputRef} type="file" accept="image/*" className={styles.hiddenInput} onChange={gallery.onChange} />
      <input ref={camera.inputRef} type="file" accept="image/*" capture="environment" className={styles.hiddenInput} onChange={camera.onChange} />
    </div>
  );
}
