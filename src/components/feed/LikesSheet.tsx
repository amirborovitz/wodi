import { AnimatePresence, motion } from 'framer-motion';
import { AuthorLine } from './AuthorLine';
import { useProfiles } from '../../hooks/useProfiles';
import styles from './LikesSheet.module.css';

interface LikesSheetProps {
  /** Reactor uids. Null closes the sheet. */
  people: string[] | null;
  onOpenAthlete: (userId: string) => void;
  onClose: () => void;
}

/**
 * Who reacted. Each row opens that athlete's card, the viewer's own included.
 *
 * The card is identity only, which is the most a no-follow feed can honestly
 * offer: there is no history to browse, because an athlete's whole public
 * surface is whatever of theirs is still inside the 24h window. The Instagram
 * link is the one way out of that window, which is why it appears on the row
 * and again, at full width, on the card.
 */
export function LikesSheet({ people, onOpenAthlete, onClose }: LikesSheetProps): React.ReactElement {
  const profiles = useProfiles(people ?? []);

  return (
    <AnimatePresence>
      {people && (
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
            <div className={styles.header}>
              <span className={styles.headerRule} />
              <span className={styles.headerTitle}>Reactions</span>
              <span className={styles.headerCount}>{people.length}</span>
            </div>
            <div className={styles.list}>
              {people.map((id) => (
                <div key={id} className={styles.row}>
                  <AuthorLine profile={profiles.get(id)} size="row" onOpen={() => onOpenAthlete(id)} />
                </div>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
