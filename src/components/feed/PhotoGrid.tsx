/**
 * The bottom of the composer: where the picture comes from.
 *
 * WHAT A BROWSER CAN AND CANNOT DO HERE
 * The design draws this as the device's camera roll, inline, newest first. The
 * web has no API for that — a page cannot enumerate the photo library, and no
 * amount of wanting changes it. What it does have is a file picker that opens
 * the OS library directly, and it accepts a multi-selection.
 *
 * So the grid is the roll the athlete hands it: tap Library once, pick the four
 * candidate shots, and they land here as thumbnails with the newest already
 * selected. From then on switching between them is one tap, which is the job
 * the roll was drawn to do. The two tiles that open the camera and the library
 * lead, because on the first visit the grid is otherwise empty and an empty
 * grid explains nothing.
 */

import type { PickedPhoto } from '../../hooks/useFeedComposer';
import styles from './PhotoGrid.module.css';

interface PhotoGridProps {
  photos: readonly PickedPhoto[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
  onOpenCamera: () => void;
  onOpenLibrary: () => void;
}

export function PhotoGrid({
  photos, selectedId, onSelect, onOpenCamera, onOpenLibrary,
}: PhotoGridProps): React.ReactElement {
  return (
    <section className={styles.section}>
      <h2 className={styles.title}>RECENTS</h2>
      <div className={styles.grid}>
        <button type="button" className={styles.source} onClick={onOpenCamera}>
          <CameraIcon />
          Camera
        </button>
        <button type="button" className={styles.source} onClick={onOpenLibrary}>
          <LibraryIcon />
          Library
        </button>
        {photos.map((photo) => (
          <button
            key={photo.id}
            type="button"
            className={`${styles.thumb} ${photo.id === selectedId ? styles.thumbSelected : ''}`}
            onClick={() => onSelect(photo.id)}
            aria-pressed={photo.id === selectedId}
            aria-label="Use this photo"
          >
            <img className={styles.thumbImage} src={photo.url} alt="" draggable={false} />
          </button>
        ))}
      </div>
    </section>
  );
}

function CameraIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8.5A2 2 0 0 1 5 6.5h2l1.2-2h7.6L17 6.5h2a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <circle cx="12" cy="12.5" r="3.4" />
    </svg>
  );
}

function LibraryIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M21 15l-5-4-4 3-3-2-6 5" />
    </svg>
  );
}
