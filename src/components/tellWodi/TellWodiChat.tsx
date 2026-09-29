import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { TellWodiChat as TellWodiChatState } from './useTellWodiChat';
import { useChatViewport } from './useChatViewport';
import styles from './TellWodiChat.module.css';

interface TellWodiChatProps {
  chat: TellWodiChatState;
  onBack: () => void;
}

/**
 * The Tell Wodi screen: a message thread and a composer. Renders what useTellWodiChat returns and
 * nothing more — every decision about what to ask lives in the hook.
 */
export function TellWodiChat({ chat, onBack }: TellWodiChatProps) {
  const [draft, setDraft] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const { messages, busy, send, tapChip, canOpenForms, openForms } = chat;
  // Every change that adds height to the thread: a message, a chip row going away, "typing…".
  const { threadRef, contentRef, onThreadScroll, pinToEnd, screenStyle } = useChatViewport(
    `${messages.length}:${messages.filter((m) => m.answered).length}:${busy}`,
  );

  const canSend = (draft.trim().length > 0 || photo != null) && busy !== 'saving';
  const submit = (): void => {
    if (!canSend) return;
    send(draft, photo);
    // Your own message always brings you back to the bottom, even if you'd scrolled up.
    pinToEnd();
    setDraft('');
    setPhoto(null);
  };

  const typingLabel = busy === 'reading-board' ? 'Reading the board…' : busy === 'thinking' ? null : undefined;

  return (
    <div className={styles.screen} style={screenStyle}>
      <header className={styles.header}>
        <button type="button" className={styles.back} onClick={onBack} aria-label="Back">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 className={styles.title}>Tell Wodi<span className={styles.titleDot}>.</span></h1>
        {canOpenForms && busy !== 'saving' && (
          <button type="button" className={styles.formsLink} onClick={openForms}>
            Use the form
          </button>
        )}
      </header>

      <div className={styles.thread} ref={threadRef} onScroll={onThreadScroll}>
        <div className={styles.threadContent} ref={contentRef}>
        <AnimatePresence initial={false}>
          {messages.map((message) => (
            <motion.div
              key={message.id}
              className={message.from === 'me' ? styles.rowMe : styles.rowWodi}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18 }}
            >
              <div
                className={[
                  message.from === 'me' ? styles.bubbleMe : styles.bubbleWodi,
                  message.answered ? styles.bubbleAnswered : '',
                ].join(' ')}
              >
                {message.imageUrl && <img className={styles.photo} src={message.imageUrl} alt="Workout board" />}
                {!message.imageUrl && message.hadPhoto && <p className={styles.photoNote}>Board photo</p>}
                {message.text && <p className={styles.text}>{message.text}</p>}
                {message.suggestions && (
                  <ul className={styles.suggestions}>
                    {message.suggestions.map((s) => (
                      <li key={s.movement} className={styles.suggestion}>
                        <span className={styles.suggestionName}>{s.movement}</span>
                        {s.last && (
                          <span className={styles.suggestionLine}>
                            Last time: {s.last.load} ({s.last.date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })})
                          </span>
                        )}
                        {s.related.map((r) => (
                          <span key={r.movement} className={styles.suggestionLine}>
                            {r.movement}: {r.load} ({r.date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })})
                          </span>
                        ))}
                        {!s.last && s.related.length === 0 && (
                          <span className={styles.suggestionLine}>Not logged yet</span>
                        )}
                        {s.rx && <span className={styles.suggestionLine}>Board says: {s.rx}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {message.chips && !message.answered && (
                <div className={styles.chips}>
                  {message.chips.map((chip) => (
                    <motion.button
                      key={chip.label}
                      type="button"
                      className={chip.label === 'Skip' ? styles.chipSkip : styles.chip}
                      whileTap={{ scale: 0.97 }}
                      disabled={busy != null}
                      onClick={() => { tapChip(message.id, chip); pinToEnd(); }}
                    >
                      {chip.label}
                    </motion.button>
                  ))}
                </div>
              )}
            </motion.div>
          ))}
          {(busy === 'reading-board' || busy === 'thinking') && (
            <motion.div key="typing" className={styles.rowWodi} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className={styles.bubbleWodi} aria-live="polite">
                {typingLabel ? (
                  <p className={styles.text}>{typingLabel}</p>
                ) : (
                  <span className={styles.typing} aria-label="Wodi is typing">
                    <span /><span /><span />
                  </span>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        </div>
      </div>

      <footer className={styles.composer}>
        {photo && (
          <div className={styles.attachment}>
            <span className={styles.attachmentName}>Board photo attached</span>
            <button type="button" className={styles.attachmentRemove} onClick={() => setPhoto(null)} aria-label="Remove photo">×</button>
          </div>
        )}
        <div className={styles.composerRow}>
          <button
            type="button"
            className={styles.iconButton}
            onClick={() => photoInputRef.current?.click()}
            aria-label="Add a photo of the board"
            disabled={busy === 'saving'}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4 8h3l2-2.5h6L17 8h3v11H4z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
              <circle cx="12" cy="13" r="3.5" stroke="currentColor" strokeWidth="1.8" />
            </svg>
          </button>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            className={styles.hiddenInput}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) setPhoto(file);
              e.target.value = '';
            }}
          />
          <textarea
            className={styles.input}
            rows={1}
            placeholder="Message Wodi…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
          />
          <motion.button
            type="button"
            className={canSend ? styles.sendActive : styles.send}
            onClick={submit}
            disabled={!canSend}
            whileTap={{ scale: 0.94 }}
            aria-label="Send"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M5 12h13M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </motion.button>
        </div>
      </footer>
    </div>
  );
}
