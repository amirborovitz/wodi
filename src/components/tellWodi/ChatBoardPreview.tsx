import type { BoardPreview } from './boardPreview';
import styles from './ChatBoardPreview.module.css';

interface ChatBoardPreviewProps {
  preview: BoardPreview;
}

/** The saved workout in full, shown when its chat reopens — seen before deciding what to do with it. */
export function ChatBoardPreview({ preview }: ChatBoardPreviewProps): React.ReactElement {
  return (
    <div className={styles.card}>
      {preview.format && <span className={styles.format}>{preview.format}</span>}
      <h3 className={styles.title}>{preview.title}</h3>
      {preview.parts.map((part, i) => (
        <section key={i} className={styles.part}>
          {part.name && <h4 className={styles.partName}>{part.name}</h4>}
          {part.prescription && <p className={styles.prescription}>{part.prescription}</p>}
          {part.lines.length > 0 && (
            <ul className={styles.lines}>
              {part.lines.map((line, li) => (
                <li key={li} className={styles.line}>
                  {line.role && <span className={styles.role}>{line.role === 'buy_in' ? 'BUY-IN' : 'CASH-OUT'}</span>}
                  {line.qty && <span className={styles.qty}>{line.qty}</span>}
                  <span className={styles.name}>{line.name}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
