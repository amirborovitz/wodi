import { motion } from 'framer-motion';
import type { HTMLMotionProps } from 'framer-motion';
import styles from './Card.module.css';

interface CardProps extends HTMLMotionProps<'div'> {
  variant?: 'default' | 'elevated' | 'outlined';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  interactive?: boolean;
  children: React.ReactNode;
}

export function Card({
  variant = 'default',
  padding = 'md',
  interactive = false,
  children,
  className = '',
  ...props
}: CardProps) {
  return (
    <motion.div
      className={`${styles.card} ${styles[variant]} ${styles[`padding-${padding}`]} ${interactive ? styles.interactive : ''} ${className}`}
      whileTap={interactive ? { scale: 0.98 } : undefined}
      {...props}
    >
      {children}
    </motion.div>
  );
}
