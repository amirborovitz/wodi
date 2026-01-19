import { motion } from 'framer-motion';
import styles from './HeroCard.module.css';
import type { Achievement, AchievementIcon } from '../../types';

interface HeroCardProps {
  achievement: Achievement;
  delay?: number;
}

const icons: Record<AchievementIcon, string> = {
  trophy: '\uD83C\uDFC6',
  fire: '\uD83D\uDD25',
  star: '\u2B50',
  medal: '\uD83C\uDFC5',
  crown: '\uD83D\uDC51',
};

export function HeroCard({ achievement, delay = 1.8 }: HeroCardProps) {
  const icon = icons[achievement.icon];

  return (
    <motion.div
      className={styles.heroCard}
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        duration: 0.6,
        delay,
        ease: [0.16, 1, 0.3, 1],
      }}
    >
      <div className={styles.shimmer} />
      <div className={styles.content}>
        <span className={styles.icon}>{icon}</span>
        <div className={styles.text}>
          <h3 className={styles.title}>{achievement.title}</h3>
          <p className={styles.subtitle}>{achievement.subtitle}</p>
        </div>
      </div>
    </motion.div>
  );
}
