import { headlineSegments, voiceSegments, type VoiceSegment } from '../../services/wodiAgent/wodiVoice';
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

/** Wodi's words with its numbers set like a training log (see wodiVoice). */
export function WodiText({ text, highlight, link }: WodiTextProps) {
  const segments = highlight === undefined ? voiceSegments(text) : headlineSegments(text, highlight);
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
