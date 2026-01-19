import { motion } from 'framer-motion';
import styles from './StatsTile.module.css';

interface StatsTileProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  sparklineData?: number[];
  accentColor?: string;
  delay?: number;
}

function MiniSparkline({ data, color }: { data: number[]; color: string }) {
  if (!data || data.length < 2) return null;

  const width = 60;
  const height = 24;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;

  const points = data
    .map((val, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((val - min) / range) * (height - 4) - 2;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg
      className={styles.sparkline}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
    >
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

export function StatsTile({
  label,
  value,
  icon,
  sparklineData,
  accentColor = 'var(--neon-cyan)',
  delay = 0,
}: StatsTileProps) {
  // Calculate font weight based on value (higher = bolder)
  const fontWeight = Math.min(400 + Math.floor(value / 5) * 100, 900);

  return (
    <motion.div
      className={styles.tile}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      style={{ '--accent-color': accentColor } as React.CSSProperties}
    >
      {/* Background sparkline */}
      {sparklineData && sparklineData.length > 1 && (
        <div className={styles.sparklineContainer}>
          <MiniSparkline data={sparklineData} color={accentColor} />
        </div>
      )}

      {/* Icon */}
      <div className={styles.iconWrapper}>{icon}</div>

      {/* Value */}
      <motion.span
        className={styles.value}
        style={{ fontWeight, fontVariationSettings: `"wght" ${fontWeight}` }}
        initial={{ scale: 0.8 }}
        animate={{ scale: 1 }}
        transition={{ duration: 0.3, delay: delay + 0.2 }}
      >
        {value}
      </motion.span>

      {/* Label */}
      <span className={styles.label}>{label}</span>
    </motion.div>
  );
}
