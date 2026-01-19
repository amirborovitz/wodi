import { forwardRef } from 'react';
import { motion } from 'framer-motion';
import type { HTMLMotionProps } from 'framer-motion';
import styles from './GlassCard.module.css';

interface GlassCardProps extends HTMLMotionProps<'div'> {
  variant?: 'default' | 'highlighted' | 'solid';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  glow?: boolean;
  glowColor?: string;
  interactive?: boolean;
}

export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  function GlassCard(
    {
      children,
      variant = 'default',
      padding = 'md',
      glow = false,
      glowColor,
      interactive = false,
      className = '',
      style,
      ...props
    },
    ref
  ) {
    const classes = [
      styles.card,
      styles[variant],
      styles[`padding-${padding}`],
      glow && styles.glow,
      interactive && styles.interactive,
      className,
    ]
      .filter(Boolean)
      .join(' ');

    const customStyle = glowColor
      ? { ...style, '--glow-color': glowColor } as React.CSSProperties
      : style;

    return (
      <motion.div
        ref={ref}
        className={classes}
        style={customStyle}
        whileTap={interactive ? { scale: 0.98 } : undefined}
        {...props}
      >
        {children}
      </motion.div>
    );
  }
);
