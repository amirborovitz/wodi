/**
 * The full-size view of something a feed card only had room to show small.
 *
 * Portalled, and not only for stacking: a card can sit inside a bottom sheet or
 * inside the celebration screen's vertical swipe pager, and an overlay rendered
 * in that subtree hands every touch it receives to whatever is listening above
 * it. Leaving the subtree is what actually severs that.
 *
 * Closing is deliberately easy — the backdrop, the button and Escape all do it
 * — because there is nothing in here to lose.
 */

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import styles from './Lightbox.module.css';

interface LightboxProps {
  label: string;
  onClose: () => void;
  children: React.ReactNode;
}

export function Lightbox({ label, onClose, children }: LightboxProps): React.ReactElement {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose(); };
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return createPortal(
    <div className={styles.backdrop} role="dialog" aria-modal="true" aria-label={label} onClick={onClose}>
      <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
          <line x1="6" y1="6" x2="18" y2="18" />
          <line x1="18" y1="6" x2="6" y2="18" />
        </svg>
      </button>
      {/* Stops the backdrop's close from firing on the content itself —
          reading a poster often means tapping it. */}
      <div className={styles.content} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>,
    document.body,
  );
}
