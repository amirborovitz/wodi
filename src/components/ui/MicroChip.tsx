import styles from './MicroChip.module.css';

interface MicroChipProps {
  icon?: React.ReactNode;
  label: string;
  color?: string;
  glow?: boolean;
}

export function MicroChip({ icon, label, color, glow = false }: MicroChipProps) {
  return (
    <span
      className={`${styles.chip} ${glow ? styles.glow : ''}`}
      style={{ '--chip-color': color } as React.CSSProperties}
    >
      {icon && <span className={styles.icon}>{icon}</span>}
      <span className={styles.label}>{label}</span>
    </span>
  );
}
