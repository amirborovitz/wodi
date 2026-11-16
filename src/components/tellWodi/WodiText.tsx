import { headlineSegments, voiceSegments, type VoiceSegment } from '../../services/wodiAgent/wodiVoice';
import { parseMarkup } from '../../services/wodiAgent/wodiMarkup';
import styles from './WodiText.module.css';

interface WodiTextProps {
  text: string;
  /**
   * Wodi's headline message: only this named value is set — yellow and condensed. Omitted, it's a
   * thread answer: every measured value condensed, none yellow.
   */
  highlight?: string | null;
  /** Words that open something — "30 Jun" opens that day's poster. */
  link?: { text: string; onOpen: () => void };
}

/** Plain stretches split around the link's words, so it can be its own tap target. */
function withLink(segments: VoiceSegment[], linkText: string | undefined): (VoiceSegment & { link?: boolean })[] {
  if (!linkText) return segments;
  let done = false;
  return segments.flatMap((s) => {
    const at = done || s.number ? -1 : s.text.indexOf(linkText);
    if (at < 0) return [s];
    done = true;
    return [
      { ...s, text: s.text.slice(0, at) },
      { ...s, text: linkText, link: true },
      { ...s, text: s.text.slice(at + linkText.length) },
    ].filter((p) => p.text);
  });
}

/** A stretch of an answer, its numbers set like a training log. */
function Voice({ text }: { text: string }) {
  return (
    <>
      {voiceSegments(text).map((segment, i) => (
        segment.number
          ? <span key={i} className={styles.number}>{segment.text}</span>
          : <span key={i}>{segment.text}</span>
      ))}
    </>
  );
}

/**
 * Wodi's words with its numbers set like a training log (see wodiVoice). An answer may carry
 * **bold** and "- " list lines (wodiMarkup); the headline is one plain line with its key value.
 */
export function WodiText({ text, highlight, link }: WodiTextProps) {
  if (highlight === undefined) {
    return (
      <>
        {parseMarkup(text).map((line, i) => (
          <span key={i} className={line.runs.length === 0 ? styles.gap : line.item ? styles.item : styles.line}>
            {line.runs.map((run, j) => (
              run.bold
                ? <strong key={j} className={styles.bold}><Voice text={run.text} /></strong>
                : <Voice key={j} text={run.text} />
            ))}
          </span>
        ))}
      </>
    );
  }
  const segments = headlineSegments(text, highlight);
  return (
    <>
      {withLink(segments, link?.text).map((segment, i) => {
        if (segment.link && link) {
          return (
            <button key={i} type="button" className={styles.link} onClick={link.onOpen}>
              {segment.text}
            </button>
          );
        }
        return segment.number
          ? <span key={i} className={segment.key ? styles.key : styles.number}>{segment.text}</span>
          : <span key={i}>{segment.text}</span>;
      })}
    </>
  );
}
