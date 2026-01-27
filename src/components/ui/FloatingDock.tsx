import { motion } from 'framer-motion';
import { LiquidOrbButton } from './LiquidOrbButton';
import styles from './FloatingDock.module.css';
import type { Screen } from '../../types';

type NavScreen = 'home' | 'history' | 'profile';

interface FloatingDockProps {
  currentScreen: Screen;
  onNavigate: (screen: NavScreen) => void;
  onAddWorkout: () => void;
}

const navItems: { id: NavScreen; label: string; icon: React.ReactNode }[] = [
  {
    id: 'home',
    label: 'Home',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M9 22V12h6v10" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'history',
    label: 'Workouts',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="16" y1="2" x2="16" y2="6" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="8" y1="2" x2="8" y2="6" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="3" y1="10" x2="21" y2="10" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'profile',
    label: 'Me',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="12" cy="7" r="4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

export function FloatingDock({ currentScreen, onNavigate, onAddWorkout }: FloatingDockProps) {
  // Map current screen to nav item (history/stats/settings all map to their respective nav)
  const getActiveNav = (): NavScreen | null => {
    if (currentScreen === 'home') return 'home';
    if (currentScreen === 'history') return 'history';
    if (currentScreen === 'profile' || currentScreen === 'stats' || currentScreen === 'settings') return 'profile';
    return null;
  };

  const activeNav = getActiveNav();

  return (
    <motion.nav
      className={styles.dock}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.2 }}
    >
      <div className={styles.dockInner}>
        {/* Left nav item (Home) */}
        <button
          className={`${styles.navButton} ${activeNav === 'home' ? styles.active : ''}`}
          onClick={() => onNavigate('home')}
          aria-label="Home"
        >
          <span className={styles.icon}>{navItems[0].icon}</span>
        </button>

        {/* Center: Liquid Orb */}
        <LiquidOrbButton onClick={onAddWorkout} />

        {/* Middle nav item (Workouts) */}
        <button
          className={`${styles.navButton} ${activeNav === 'history' ? styles.active : ''}`}
          onClick={() => onNavigate('history')}
          aria-label="Workouts"
        >
          <span className={styles.icon}>{navItems[1].icon}</span>
        </button>

        {/* Right nav item (Me) */}
        <button
          className={`${styles.navButton} ${activeNav === 'profile' ? styles.active : ''}`}
          onClick={() => onNavigate('profile')}
          aria-label="Me"
        >
          <span className={styles.icon}>{navItems[2].icon}</span>
        </button>
      </div>
    </motion.nav>
  );
}
