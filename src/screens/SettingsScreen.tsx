import { useState } from 'react';
import { motion } from 'framer-motion';
import { SettingsList } from '../components/settings/SettingsList';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import type { SettingsSection } from '../components/settings/SettingsList';
import type { User } from '../types';
import styles from './SettingsScreen.module.css';

interface SettingsScreenProps {
  onBack: () => void;
  onNavigateToProfile: () => void;
  onNavigateToGoals: () => void;
  onSignOut: () => void;
  user: User | null;
}

export function SettingsScreen({
  onBack,
  onNavigateToProfile,
  onNavigateToGoals,
  onSignOut,
  user,
}: SettingsScreenProps) {
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);

  const handleSignOut = () => {
    setShowSignOutConfirm(false);
    onSignOut();
  };

  const sections: SettingsSection[] = [
    {
      title: 'Account',
      items: [
        {
          id: 'profile',
          label: 'Profile',
          icon: <ProfileIcon />,
          value: user?.displayName || 'Set up profile',
          type: 'navigation',
          onPress: onNavigateToProfile,
        },
        {
          id: 'goals',
          label: 'Training Goals',
          icon: <GoalsIcon />,
          value: `${user?.goals?.streakGoal || 5} days/week`,
          type: 'navigation',
          onPress: onNavigateToGoals,
        },
      ],
    },
    {
      title: 'About',
      items: [
        {
          id: 'version',
          label: 'App Version',
          icon: <InfoIcon />,
          value: '1.0.0',
          type: 'navigation',
          onPress: () => {},
        },
      ],
    },
    {
      items: [
        {
          id: 'signout',
          label: 'Sign Out',
          icon: <SignOutIcon />,
          type: 'destructive',
          onPress: () => setShowSignOutConfirm(true),
        },
      ],
    },
  ];

  return (
    <motion.div
      className={styles.container}
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -50 }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
    >
      <header className={styles.header}>
        <button className={styles.backButton} onClick={onBack}>
          <BackIcon />
        </button>
        <h1 className={styles.title}>Settings</h1>
        <div className={styles.headerSpacer} />
      </header>

      <div className={styles.content}>
        <SettingsList sections={sections} />
      </div>

      <ConfirmDialog
        open={showSignOutConfirm}
        title="Sign Out"
        message="Are you sure you want to sign out of your account?"
        confirmText="Sign Out"
        cancelText="Cancel"
        destructive
        onConfirm={handleSignOut}
        onCancel={() => setShowSignOutConfirm(false)}
      />
    </motion.div>
  );
}

function BackIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function ProfileIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function GoalsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

function SignOutIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}
