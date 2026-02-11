import { motion } from 'framer-motion';
import styles from './ConcentricRings.module.css';

interface RingData {
  value: number;
  goal: number;
}

interface ConcentricRingsProps {
  sessions: RingData;   // Cyan - inner ring
  metcon: RingData;     // Magenta - middle ring
  volume: RingData;     // Yellow - outer ring
  size?: number;        // Container size in px (default: 280)
}

interface RingProps {
  percentage: number;
  radius: number;
  strokeWidth: number;
  color: string;
  glowColor: string;
  delay: number;
}

function Ring({ percentage, radius, strokeWidth, color, glowColor, delay }: RingProps) {
  const circumference = 2 * Math.PI * radius;
  const cappedPercentage = Math.min(percentage, 100);
  const strokeDashoffset = circumference - (cappedPercentage / 100) * circumference;
  const isGoalMet = percentage >= 100;

  // Liquid fill easing - smooth deceleration like fluid settling
  const liquidEase: [number, number, number, number] = [0.16, 1, 0.3, 1];

  return (
    <g className={isGoalMet ? styles.successPulse : ''}>
      {/* Background ring */}
      <circle
        cx="50%"
        cy="50%"
        r={radius}
        fill="none"
        stroke={`color-mix(in srgb, ${color} 24%, #0b0b0b)`}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      {/* Outer glow layer - soft ambient */}
      <motion.circle
        cx="50%"
        cy="50%"
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth + 12}
        strokeLinecap="round"
        strokeDasharray={circumference}
        initial={{ strokeDashoffset: circumference, opacity: 0 }}
        animate={{ strokeDashoffset, opacity: 0.15 }}
        transition={{ duration: 1.4, delay, ease: liquidEase }}
        style={{
          filter: 'blur(16px)',
          transform: 'rotate(-90deg)',
          transformOrigin: 'center',
        }}
      />
      {/* Inner glow layer - concentrated */}
      <motion.circle
        cx="50%"
        cy="50%"
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth + 4}
        strokeLinecap="round"
        strokeDasharray={circumference}
        initial={{ strokeDashoffset: circumference, opacity: 0 }}
        animate={{ strokeDashoffset, opacity: 0.5 }}
        transition={{ duration: 1.3, delay: delay + 0.05, ease: liquidEase }}
        style={{
          filter: 'blur(6px)',
          transform: 'rotate(-90deg)',
          transformOrigin: 'center',
        }}
      />
      {/* Main progress ring */}
      <motion.circle
        cx="50%"
        cy="50%"
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        initial={{ strokeDashoffset: circumference }}
        animate={{ strokeDashoffset }}
        transition={{ duration: 1.2, delay, ease: liquidEase }}
        style={{
          transform: 'rotate(-90deg)',
          transformOrigin: 'center',
          filter: isGoalMet ? `drop-shadow(${glowColor})` : 'none',
        }}
        className={isGoalMet ? styles.ringSuccess : ''}
      />
    </g>
  );
}

export function ConcentricRings({ sessions, metcon, volume, size = 280 }: ConcentricRingsProps) {
  const strokeWidth = 16;
  const gap = 22;
  const center = size / 2;

  // Calculate radii (outer to inner)
  const outerRadius = center - strokeWidth / 2 - 10;   // Volume (yellow)
  const middleRadius = outerRadius - gap;              // Metcon (magenta)
  const innerRadius = middleRadius - gap;              // Sessions (cyan)

  // Calculate percentages
  const volumePercent = (volume.value / volume.goal) * 100;
  const metconPercent = (metcon.value / metcon.goal) * 100;
  const sessionsPercent = (sessions.value / sessions.goal) * 100;

  return (
    <div className={styles.container} style={{ width: size, height: size }}>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className={styles.svg}
        width={size}
        height={size}
      >
        {/* Lift ring (outer - yellow) */}
        <Ring
          percentage={volumePercent}
          radius={outerRadius}
          strokeWidth={strokeWidth}
          color="var(--color-volume)"
          glowColor="0 0 20px var(--glow-volume)"
          delay={0}
        />

        {/* Move ring (middle - magenta) */}
        <Ring
          percentage={metconPercent}
          radius={middleRadius}
          strokeWidth={strokeWidth}
          color="var(--color-metcon)"
          glowColor="0 0 20px var(--glow-metcon)"
          delay={0.1}
        />

        {/* Show Up ring (inner - cyan) */}
        <Ring
          percentage={sessionsPercent}
          radius={innerRadius}
          strokeWidth={strokeWidth}
          color="var(--color-sessions)"
          glowColor="0 0 20px var(--glow-sessions)"
          delay={0.2}
        />
      </svg>

      {/* Center content */}
      <div className={styles.center}>
        <motion.span
          className={styles.centerValue}
          style={{ color: 'var(--color-sessions)' }}
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
        >
          {sessions.value}
        </motion.span>
      </div>

      {/* Legend */}
      <div className={styles.legend}>
        <div className={styles.legendItem}>
          <span className={styles.legendDot} style={{ background: 'var(--color-volume)' }} />
          <span className={styles.legendText}>
            Lift {'\u00b7'} {formatNumber(volume.value, 'kg')} / {formatNumber(volume.goal, 'kg')} {volume.goal >= 1000 ? 'tons' : 'kg'}
          </span>
        </div>
        <div className={styles.legendItem}>
          <span className={styles.legendDot} style={{ background: 'var(--color-metcon)' }} />
          <span className={styles.legendText}>
            Move {'\u00b7'} {metcon.value} / {metcon.goal} min
          </span>
        </div>
        <div className={styles.legendItem}>
          <span className={styles.legendDot} style={{ background: 'var(--color-sessions)' }} />
          <span className={styles.legendText}>
            Show Up {'\u00b7'} {sessions.value} / {sessions.goal}
          </span>
        </div>
      </div>
    </div>
  );
}

function formatNumber(value: number, unit: string): string {
  if (unit === 'kg' && value >= 1000) {
    return (value / 1000).toFixed(1);
  }
  return value.toLocaleString();
}
