import { AnimatePresence, motion } from 'framer-motion';
import { Avatar } from './Avatar';
import { instagramUrl } from '../../utils/instagram';
import type { FeedAuthor } from '../../services/feed/types';
import styles from './AthleteCard.module.css';

interface AthleteCardProps {
  /** Null closes the card. */
  athlete: FeedAuthor | null;
  onClose: () => void;
}

/**
 * One athlete's identity, opened by tapping them anywhere in the feed.
 *
 * Identity only — who they are and where they train. It carries no stats, no
 * history and no body metrics: age, weight and sex never leave the user doc,
 * and cannot reach here even by accident, because FeedAuthor is the only shape
 * this component accepts and it has no field for them.
 *
 * There is no viewer check. Tapping yourself opens your own card exactly as it
 * appears to everyone else, which makes it the one place to see what the feed
 * is actually publishing about you.
 */
export function AthleteCard({ athlete, onClose }: AthleteCardProps): React.ReactElement {
  const details: { label: string; value: string }[] = athlete
    ? [
        ...(athlete.gym ? [{ label: 'Box', value: athlete.gym }] : []),
        ...(athlete.location ? [{ label: 'Location', value: athlete.location }] : []),
      ]
    : [];

  return (
    <AnimatePresence>
      {athlete && (
        <>
          <motion.div
            className={styles.backdrop}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <motion.div
            className={styles.sheet}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 420, damping: 38 }}
          >
            <span className={styles.grabber} />

            <div className={styles.identity}>
              <Avatar name={athlete.name} size={88} photoUrl={athlete.photoUrl} />
              <h2 className={styles.name}>{athlete.name}</h2>
            </div>

            {details.length > 0 && (
              <dl className={styles.details}>
                {details.map(({ label, value }) => (
                  <div key={label} className={styles.detail}>
                    <dt className={styles.detailLabel}>{label}</dt>
                    <dd className={styles.detailValue}>{value}</dd>
                  </div>
                ))}
              </dl>
            )}

            {athlete.instagram && (
              <a
                className={styles.instagram}
                href={instagramUrl(athlete.instagram)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <InstagramIcon />
                <span className={styles.handle}>@{athlete.instagram}</span>
                <svg className={styles.out} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M7 17L17 7M9 7h8v8" />
                </svg>
              </a>
            )}

            {details.length === 0 && !athlete.instagram && (
              <p className={styles.bare}>No details shared yet</p>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function InstagramIcon(): React.ReactElement {
  return (
    <svg className={styles.instagramIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="5.4" />
      <circle cx="12" cy="12" r="4.1" />
      <circle cx="17.4" cy="6.6" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}
