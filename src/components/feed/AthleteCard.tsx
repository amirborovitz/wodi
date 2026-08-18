import { AnimatePresence, motion } from 'framer-motion';
import { Avatar } from './Avatar';
import { instagramUrl } from '../../utils/instagram';
import { useProfile } from '../../hooks/useProfiles';
import { UNKNOWN_ATHLETE } from './feedFormat';
import styles from './AthleteCard.module.css';

interface AthleteCardProps {
  /** Uid of the athlete to show. Null closes the card. */
  athleteId: string | null;
  onClose: () => void;
}

/**
 * One athlete's identity, opened by tapping them anywhere in the feed.
 *
 * Identity only — who they are and where they train. It carries no stats, no
 * history and no body metrics: those never leave /users, and cannot reach here
 * even by accident, because this renders a PublicProfile and that shape has no
 * field for them.
 *
 * It takes a uid rather than an identity object, which is what makes every
 * route in — the post header, a row in the reactions list — arrive at the same
 * card. Two frozen copies of the same athlete used to reach this component from
 * those two paths, and they disagreed.
 *
 * There is no viewer check. Tapping yourself opens your own card exactly as it
 * appears to everyone else, which makes it the one place to see what the feed
 * is actually publishing about you.
 */
export function AthleteCard({ athleteId, onClose }: AthleteCardProps): React.ReactElement {
  const athlete = useProfile(athleteId ?? undefined);
  const details: { label: string; value: string }[] = [
    ...(athlete?.gym ? [{ label: 'Box', value: athlete.gym }] : []),
    ...(athlete?.location ? [{ label: 'Location', value: athlete.location }] : []),
  ];

  return (
    <AnimatePresence>
      {athleteId && (
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
              <Avatar profile={athlete} size={88} />
              <h2 className={styles.name}>{athlete?.name ?? UNKNOWN_ATHLETE}</h2>
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

            {athlete?.instagram && (
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

            {details.length === 0 && !athlete?.instagram && (
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
