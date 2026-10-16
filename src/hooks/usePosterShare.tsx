import { useRef, useState } from 'react';
import type { ActionMenuItem } from '../components/ui/ActionMenuSheet';
import { captureBlob, downloadBlob, isNativeShareSupported, shareImage } from '../utils/shareUtils';
import { track } from '../services/analytics';

export interface PosterShare {
  /** The share sheet's title while it's open ("Preparing image…"); null when it's closed. */
  title: string | null;
  /** Open the sheet and start turning this poster into an image. */
  open: (poster: HTMLElement | null) => void;
  close: () => void;
  /** "Share image…" where the browser can share files, and "Save image". */
  items: ActionMenuItem[];
}

/**
 * Sharing a poster — the one way it's done, on the poster screen and in the chat alike.
 *
 * Capture cannot sit between the tap and `navigator.share`: html2canvas takes long enough that
 * Safari drops the transient activation and refuses the share, which is why the old one-tap
 * version fell through to a download on iOS. Opening the sheet starts the capture; the tap that
 * shares is a fresh gesture on an image that is already in hand.
 */
export function usePosterShare(name: () => string): PosterShare {
  const [isOpen, setIsOpen] = useState(false);
  const [state, setState] = useState<'preparing' | 'ready' | 'failed'>('preparing');
  const blobRef = useRef<Blob | null>(null);

  const open = (poster: HTMLElement | null): void => {
    if (!poster) return;
    blobRef.current = null;
    setState('preparing');
    setIsOpen(true);
    void captureBlob(poster)
      .then((blob) => { blobRef.current = blob; setState('ready'); })
      .catch((err) => { console.error('Failed to render poster:', err); setState('failed'); });
  };

  const shareToApps = (): void => {
    const blob = blobRef.current;
    if (!blob) return;
    void shareImage(blob, name()).then((shared) => {
      // Every non-iOS desktop browser and Chrome on iOS refuse file shares, so a
      // decline that isn't a cancel still has to leave the athlete with the image.
      if (!shared) downloadBlob(blob, `${name()}.png`);
      track('poster_shared', { poster: 'workout', method: shared ? 'share_sheet' : 'download' });
    });
  };

  const saveImage = (): void => {
    const blob = blobRef.current;
    if (!blob) return;
    downloadBlob(blob, `${name()}.png`);
    track('poster_shared', { poster: 'workout', method: 'download' });
  };

  return {
    title: !isOpen ? null
      : state === 'failed' ? "Couldn't render this poster"
      : state === 'preparing' ? 'Preparing image…'
      : 'Share this poster',
    open,
    close: () => setIsOpen(false),
    items: [
      ...(isNativeShareSupported()
        ? [{ label: 'Share image…', icon: <ShareIcon />, onClick: shareToApps, disabled: state !== 'ready' }]
        : []),
      { label: 'Save image', icon: <DownloadIcon />, onClick: saveImage, disabled: state !== 'ready' },
    ],
  };
}

export function ShareIcon(): React.JSX.Element {
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
