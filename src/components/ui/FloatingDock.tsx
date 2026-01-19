import { motion } from 'framer-motion';
import { LiquidOrbButton } from './LiquidOrbButton';
import styles from './FloatingDock.module.css';
import type { Screen } from '../../types';

type NavScreen = 'home' | 'history' | 'stats';

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
    label: 'History',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M12 6v6l4 2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'stats',
    label: 'Stats',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M18 20V10M12 20V4M6 20v-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

export function FloatingDock({ currentScreen, onNavigate, onAddWorkout }: FloatingDockProps) {
  return (
    <motion.nav
      className={styles.dock}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.2 }}
    >
      <div className={styles.dockInner}>
        {/* Left nav items */}
        {navItems.slice(0, 2).map((item) => (
          <button
            key={item.id}
            className={`${styles.navButton} ${currentScreen === item.id ? styles.active : ''}`}
            onClick={() => onNavigate(item.id)}
            aria-label={item.label}
          >
            <span className={styles.icon}>{item.icon}</span>
          </button>
        ))}

        {/* Center: Liquid Orb */}
        <LiquidOrbButton onClick={onAddWorkout} />

        {/* Right nav item */}
        {navItems.slice(2).map((item) => (
          <button
            key={item.id}
            className={`${styles.navButton} ${currentScreen === item.id ? styles.active : ''}`}
            onClick={() => onNavigate(item.id)}
            aria-label={item.label}
          >
            <span className={styles.icon}>{item.icon}</span>
          </button>
        ))}
      </div>
    </motion.nav>
  );
}
