/**
 * Step one: which photo.
 *
 * WHAT A BROWSER CAN AND CANNOT DO HERE
 * The design draws this as the device's camera roll, inline, newest first —
 * and it draws a second state for when the app has no access to that roll:
 * "Start with a photo", with a Camera button and a Library button.
 *
 * On the web that second state is not an edge case, it is the starting
 * position. A page cannot enumerate the photo library; no API exists, on any
 * browser. So this screen opens on exactly the screen the design already drew
 * for that situation, and the grid below fills with whatever the athlete hands
 * over — tap Library once, multi-select four candidate shots, and from then on
 * the roll behaves as designed: newest already selected, one tap to switch.
 *
 * Which is why there is one component and not two: "no roll yet" and "no access
 * to the roll" are the same screen with the same two ways out of it, and the
 * design is what says so.
 *
 * The preview shows the whole frame on black rather than the 4:5 crop. This
 * step is choosing WHICH photo; the next one shows how it will actually land.
 */

import { BarbellIcon, CameraIcon, CloseIcon, ComposerHeader, LibraryIcon } from './ComposerHeader';
import type { UseFeedComposerResult } from '../../hooks/useFeedComposer';
import styles from './ComposerPick.module.css';

interface ComposerPickProps {
  draft: UseFeedComposerResult;
  onClose: () => void;
  onNext: () => void;
  onOpenCamera: () => void;
  onOpenLibrary: () => void;
}

export function ComposerPick({
  draft, onClose, onNext, onOpenCamera, onOpenLibrary,
}: ComposerPickProps): React.ReactElement {
  const lead = draft.wod?.payload.wods[0];

  return (
    <>
      <ComposerHeader
        onLead={onClose}
        leadLabel="Close"
        lead={<CloseIcon />}
        action="Next"
        actionEnabled={draft.canPost}
        onAction={onNext}
      />

      {draft.photos.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>Start with a photo</p>
          <div className={styles.emptyButtons}>
            <button type="button" className={`${styles.emptyButton} ${styles.emptyPrimary}`} onClick={onOpenCamera}>
              <CameraIcon />
              Camera
            </button>
            <button type="button" className={styles.emptyButton} onClick={onOpenLibrary}>
              <LibraryIcon />
              Library
            </button>
          </div>
          {/* The workout is already on the draft when Share brought us here, and
              this screen otherwise shows no sign of it. */}
          {lead && (
            <p className={styles.emptyAttached}>
              {lead.title ?? lead.type} · {lead.result.value} is attached
            </p>
          )}
        </div>
      ) : (
        <>
          <div className={styles.preview}>
            {draft.photo && <img className={styles.previewImage} src={draft.photo.url} alt="" draggable={false} />}
            {lead && (
              <span className={styles.attached}>
                <span className={styles.attachedIcon}><BarbellIcon /></span>
                {lead.title ?? lead.type} · {lead.result.value} attached
              </span>
            )}
          </div>

          <div className={styles.rollHeader}>
            <span className={styles.rollTitle}>Recents</span>
            <button type="button" className={styles.rollButton} onClick={onOpenLibrary} aria-label="Add from library">
              <LibraryIcon />
            </button>
            <button
              type="button"
              className={`${styles.rollButton} ${styles.rollCamera}`}
              onClick={onOpenCamera}
              aria-label="Take a photo"
            >
              <CameraIcon />
            </button>
          </div>

          <div className={styles.rollScroll}>
            <div className={styles.grid}>
              {draft.photos.map((photo) => {
                const selected = photo.id === draft.photo?.id;
                return (
                  <button
                    key={photo.id}
                    type="button"
                    className={`${styles.thumb} ${selected ? styles.thumbSelected : ''}`}
                    onClick={() => draft.selectPhoto(photo.id)}
                    aria-pressed={selected}
                    aria-label="Use this photo"
                  >
                    <img className={styles.thumbImage} src={photo.url} alt="" draggable={false} />
                    {selected && (
                      <span className={styles.check} aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M5 12l5 5 9-10" />
                        </svg>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </>
  );
}
