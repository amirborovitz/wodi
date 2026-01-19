import styles from './MiniRing.module.css';

interface MiniRingProps {
  percentage: number;
  value: string;
  label?: string;
  color?: string;
  glowColor?: string;
  size?: number;
  strokeWidth?: number;
}

/**
 * Static progress ring for share cards (no animation for html2canvas compatibility)
 */
export function MiniRing({
  percentage,
  value,
  label,
  color = 'var(--color-ring-intensity)',
  glowColor = 'var(--glow-intensity)',
  size = 120,
  strokeWidth = 10,
}: MiniRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (Math.min(percentage, 100) / 100) * circumference;

  return (
    <div className={styles.container} style={{ width: size }}>
      <div className={styles.ringWrapper} style={{ width: size, height: size }}>
        <svg
          className={styles.ring}
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
        >
          {/* Background ring */}
          <circle
            className={styles.background}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            strokeWidth={strokeWidth}
            fill="none"
          />

          {/* Progress ring */}
          <circle
            className={styles.progress}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            strokeWidth={strokeWidth}
            fill="none"
            stroke={color}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            style={{
              filter: `drop-shadow(0 0 8px ${glowColor})`,
            }}
          />
        </svg>

        {/* Center content */}
        <div className={styles.content}>
          <span className={styles.value}>{value}</span>
          {label && <span className={styles.label}>{label}</span>}
        </div>
      </div>
    </div>
  );
}
