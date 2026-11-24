import type { BoardPreview } from './boardPreview';
import styles from './ChatBoardPreview.module.css';

interface ChatBoardPreviewProps {
  preview: BoardPreview;
}

/** The saved workout, written once as the board wrote it — seen before deciding what to do with it. */
export function ChatBoardPreview({ preview }: ChatBoardPreviewProps): React.ReactElement {
  return (
    <div className={styles.card}>
      <h3 className={styles.title}>{preview.title}</h3>
      {preview.parts.map((part, i) => (
        <section key={i} className={styles.part}>
          {part.name && <h4 className={styles.partName}>{part.name}</h4>}
          {part.text && <p className={styles.text}>{part.text}</p>}
        </section>
      ))}
    </div>
  );
}
