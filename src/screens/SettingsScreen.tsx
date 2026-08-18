import { useState } from 'react';
import { motion } from 'framer-motion';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import type { User } from '../types';
import styles from './SettingsScreen.module.css';

interface SettingsScreenProps {
  onBack: () => void;
  onNavigateToProfile: () => void;
  onSignOut: () => void;
  user: User | null;
}

/**
 * Account-level settings.
 *
 * Deliberately almost empty. Profile used to live two rows deep in here; it is
 * now one tap from Me, and this screen keeps a row to it only for people who
 * still come looking. Nothing is listed that the app cannot actually do — no
 * units toggle, no notification switch, no version row that goes nowhere.
 */
export function SettingsScreen({
  onBack,
  onNavigateToProfile,
  onSignOut,
  user,
}: SettingsScreenProps): React.JSX.Element {
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);

  return (
    <motion.div
      className={styles.container}
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -50 }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
    >
      <header className={styles.header}>
        <button type="button" className={styles.circleButton} onClick={onBack} aria-label="Back">
          <ChevronLeftIcon />
        </button>
        <h1 className={styles.title}>Settings</h1>
        <span className={styles.headerSpacer} />
      </header>

      <div className={styles.rows}>
        <button type="button" className={styles.row} onClick={onNavigateToProfile}>
          <span className={styles.rowIcon}><EditIcon /></span>
          <span className={styles.rowText}>
            <span className={styles.rowLabel}>Profile</span>
            {user?.displayName && <span className={styles.rowSub}>{user.displayName}</span>}
          </span>
          <span className={styles.rowChevron}>›</span>
        </button>

        <button
          type="button"
          className={`${styles.row} ${styles.rowDanger}`}
          onClick={() => setShowSignOutConfirm(true)}
        >
          <span className={`${styles.rowIcon} ${styles.rowIconDanger}`}><SignOutIcon /></span>
          <span className={styles.rowText}>
            <span className={styles.rowLabel}>Log out</span>
          </span>
          <span className={styles.rowChevron}>›</span>
        </button>
      </div>

      <ConfirmDialog
        open={showSignOutConfirm}
        title="Log out"
        message="Are you sure you want to log out of your account?"
        confirmText="Log out"
        cancelText="Cancel"
        destructive
        onConfirm={() => { setShowSignOutConfirm(false); onSignOut(); }}
        onCancel={() => setShowSignOutConfirm(false)}
      />
    </motion.div>
  );
}

function ChevronLeftIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function EditIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
    </svg>
  );
}

function SignOutIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}
