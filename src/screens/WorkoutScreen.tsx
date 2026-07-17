import { useState, useMemo, useRef, useEffect } from 'react';
import { motion, useMotionValue, animate as fmAnimate } from 'framer-motion';
import styles from './WorkoutScreen.module.css';
import type { RewardData } from '../types';
import { useCelebrationData } from '../hooks/useCelebrationData';
import { usePosterCustomization } from '../hooks/usePosterCustomization';
import { useWorkoutCorrection } from '../hooks/useWorkoutCorrection';
import { getFace, DEFAULT_FACE_ID } from '../components/celebration/faces/registry';
import {
  DEFAULT_CELEBRATION_STICKER_CONFIG,
  fetchCelebrationStickerConfig,
  type CelebrationStickerConfig,
} from '../services/celebrationStickerConfig';
import type { WorkoutWithStats } from '../hooks/useWorkouts';

// ============================================
// Props
// ============================================

interface WorkoutScreenProps {
  mode: 'reward' | 'detail';
  /** Direction the poster slides in from on mount (for swipe navigation) */
  enterFrom?: 'top' | 'bottom';

  // Reward mode
  rewardData?: RewardData;
  onDone?: () => void;
  onEdit?: () => void;

  // Detail mode
  workout?: WorkoutWithStats;
  onBack?: () => void;
  onEditWorkout?: () => void;

  // Detail-mode navigation
  /** Navigate to the previous workout in the sorted list (swipe down) */
  onPrevWorkout?: () => void;
  /** Navigate to the next workout in the sorted list (swipe up) */
  onNextWorkout?: () => void;
}

// ============================================
// Confetti (reward mode entrance)
// ============================================

const CONFETTI_COLORS = ['#00f2ff', '#ff00e5', '#ffd600', '#00ff88', '#ff6b6b', '#ffffff'];

interface ConfettiParticle {
  id: number;
  x: number;
  color: string;
  delay: number;
  duration: number;
  rotation: number;
  size: number;
}

function ConfettiBurst() {
  const particles = useMemo(() => {
    const items: ConfettiParticle[] = [];
    for (let i = 0; i < 50; i++) {
      items.push({
        id: i,
        x: Math.random() * 100,
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        delay: Math.random() * 0.3,
        duration: 1.5 + Math.random() * 1,
        rotation: Math.random() * 360,
        size: 4 + Math.random() * 6,
      });
    }
    return items;
  }, []);

  return (
    <div className={styles.confettiContainer}>
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className={styles.confettiParticle}
          style={{
            left: `${p.x}%`,
            backgroundColor: p.color,
            width: p.size,
            height: p.size * 0.4,
          }}
          initial={{ y: -20, opacity: 1, rotate: 0 }}
          animate={{
            y: ['0vh', '100vh'],
            opacity: [1, 1, 0],
            rotate: [0, p.rotation + 360],
            x: [0, (Math.random() - 0.5) * 100],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            ease: 'easeIn',
          }}
        />
      ))}
    </div>
  );
}

// ============================================
// WorkoutScreen — one visual artifact for reward + detail.
// All computation lives in useCelebrationData; this component only
// routes the data to the active celebration face and handles the
// detail-mode vertical swipe between adjacent workouts.
// ============================================

export function WorkoutScreen({
  mode,
  enterFrom,
  rewardData,
  onDone,
  onEdit,
  workout,
  onBack,
  onEditWorkout,
  onPrevWorkout,
  onNextWorkout,
}: WorkoutScreenProps) {
  // Vertical nav swipe (TikTok-style, detail mode only)
  const navDragY = useMotionValue(0);
  const navSwipeRef = useRef<{ startX: number; startY: number; startY0: number; time: number } | null>(null);
  const navExiting = useRef(false);

  // Entrance animation: slide in from top or bottom on mount
  useEffect(() => {
    if (!enterFrom) return;
    const startY = enterFrom === 'bottom' ? window.innerHeight : -window.innerHeight;
    navDragY.set(startY);
    fmAnimate(navDragY, 0, { type: 'spring', stiffness: 340, damping: 32, mass: 0.9 });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isReward = mode === 'reward';
  const [stickerConfig, setStickerConfig] = useState<CelebrationStickerConfig>(DEFAULT_CELEBRATION_STICKER_CONFIG);

  useEffect(() => {
    let mounted = true;
    fetchCelebrationStickerConfig().then((config) => {
      if (mounted) setStickerConfig(config);
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Face registry — no flip UI yet, users always get the default handwritten face.
  // Adding a new face: create src/components/celebration/faces/YourFace/
  // and add it to the registry. faceId state here will drive switching.
  const celebrationData = useCelebrationData(mode, rewardData, workout, stickerConfig);
  const [faceId] = useState(DEFAULT_FACE_ID);
  const { savePosterCustomization } = usePosterCustomization(celebrationData.workoutId);
  const { submitCorrection } = useWorkoutCorrection(celebrationData.workoutId);

  if (!isReward && !workout) return null;

  const FaceComponent = getFace(faceId).component;

  // Vertical prev/next swipe only exists in detail mode (reward has no adjacent workouts).
  const isDetail = !isReward;

  const handleNavTouchStart = (e: React.TouchEvent) => {
    if (!isDetail || navExiting.current) return;
    navSwipeRef.current = {
      startX: e.touches[0].clientX,
      startY: e.touches[0].clientY,
      startY0: navDragY.get(),
      time: Date.now(),
    };
  };

  const handleNavTouchMove = (e: React.TouchEvent) => {
    if (!navSwipeRef.current || navExiting.current) return;
    const dx = Math.abs(e.touches[0].clientX - navSwipeRef.current.startX);
    const dy = e.touches[0].clientY - navSwipeRef.current.startY;
    // If horizontal movement dominates, hand off to the carousel
    if (dx > Math.abs(dy) && dx > 10) {
      navSwipeRef.current = null;
      return;
    }
    // Rubber-band at edges when no adjacent workout exists
    const rawY = navSwipeRef.current.startY0 + dy;
    if ((!onPrevWorkout && rawY > 0) || (!onNextWorkout && rawY < 0)) {
      navDragY.set(rawY * 0.12);
    } else {
      navDragY.set(rawY);
    }
  };

  const handleNavTouchEnd = async (e: React.TouchEvent) => {
    if (!navSwipeRef.current || navExiting.current) return;
    const dy = e.changedTouches[0].clientY - navSwipeRef.current.startY;
    const dt = Math.max(1, Date.now() - navSwipeRef.current.time);
    const vel = (dy / dt) * 1000; // px/s
    navSwipeRef.current = null;

    const DIST = 75;
    const VEL = 420;
    const h = window.innerHeight;

    if ((dy < -DIST || vel < -VEL) && onNextWorkout) {
      navExiting.current = true;
      await fmAnimate(navDragY, -h, { duration: 0.22, ease: [0.4, 0, 1, 1] });
      onNextWorkout();
    } else if ((dy > DIST || vel > VEL) && onPrevWorkout) {
      navExiting.current = true;
      await fmAnimate(navDragY, h, { duration: 0.22, ease: [0.4, 0, 1, 1] });
      onPrevWorkout();
    } else {
      // Spring back
      fmAnimate(navDragY, 0, { type: 'spring', stiffness: 420, damping: 36 });
    }
  };

  const showNavArrows = isDetail && (onPrevWorkout !== undefined || onNextWorkout !== undefined);

  return (
    <div
      className={`${styles.container} ${styles.containerReward}`}
      onTouchStart={isDetail ? handleNavTouchStart : undefined}
      onTouchMove={isDetail ? handleNavTouchMove : undefined}
      onTouchEnd={isDetail ? handleNavTouchEnd : undefined}
    >
      {isReward && <ConfettiBurst />}
      <motion.div className={styles.navLayer} style={isDetail ? { y: navDragY } : undefined}>
        {showNavArrows && onPrevWorkout && (
          <div className={`${styles.navArrowHint} ${styles.navArrowHintTop}`} aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="18 15 12 9 6 15" />
            </svg>
          </div>
        )}
        <FaceComponent
          data={celebrationData}
          mode={mode}
          onBack={isReward ? onDone : onBack}
          onDone={onDone}
          onEdit={isReward ? onEdit : onEditWorkout}
          onPosterCustomizationChange={savePosterCustomization}
          onCorrection={submitCorrection}
        />
      </motion.div>
    </div>
  );
}
