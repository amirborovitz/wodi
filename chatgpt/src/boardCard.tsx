import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@modelcontextprotocol/ext-apps';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ChatChip, ChatQuestion, SlotAnswer } from '../../src/components/tellWodi/chatQuestions';
import { ChatPanelCard } from '../../src/components/tellWodi/ChatPanelCard';
import { ChatPickCard } from '../../src/components/tellWodi/ChatPickCard';
import chat from '../../src/components/tellWodi/TellWodiChat.module.css';
import styles from './boardCard.module.css';
import '../../src/styles/variables.css';
import '@fontsource/barlow/latin-400.css';
import '@fontsource/barlow/latin-600.css';
import '@fontsource/barlow/latin-700.css';
import '@fontsource/barlow/latin-800.css';
import '@fontsource/barlow-condensed/latin-700.css';
import '@fontsource/barlow-condensed/latin-800.css';
import '@fontsource/dm-mono/latin-400.css';

/**
 * Wodi's answer card inside ChatGPT. Every question Wodi still has, with the app's own controls —
 * the same ChatPanelCard / ChatPickCard / chips the app's chat shows, built from the same
 * ChatQuestion. A tap goes straight to Wodi (answer_board with card_answers), never through
 * ChatGPT's model: about half a second, not a model turn. Save and the poster happen here too.
 * No answer is built here — every one is the chip's, panelAnswer's or pickAnswer's.
 */

interface Turn {
  boardId: string;
  questions: ChatQuestion[];
  done: boolean;
}

interface Answered {
  question: string;
  said: string;
}

type Saved = { stage: 'saving' } | { stage: 'poster'; workoutId: string } | { stage: 'done'; workoutId: string; images: string[] };

const app = new App({ name: 'Wodi answer card', version: '1.0.0' }, {});

/** A board turn from read_board / answer_board: the full questions ride in _meta, the rest in structuredContent. */
function readTurn(result: CallToolResult): Turn | null {
  const data = (result.structuredContent ?? {}) as { board_id?: string; done?: boolean; error?: string };
  const meta = (result._meta ?? {}) as { board_id?: string; questions?: ChatQuestion[] };
  const boardId = meta.board_id ?? data.board_id;
  if (!boardId || result.isError) return null;
  return { boardId, questions: meta.questions ?? [], done: data.done === true };
}

function errorOf(result: CallToolResult): string | null {
  if (!result.isError) return null;
  const data = (result.structuredContent ?? {}) as { error?: string };
  return data.error ?? 'Wodi could not do that — try again.';
}

async function call(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
  return app.callServerTool({ name, arguments: args }) as Promise<CallToolResult>;
}

function BoardCard(): React.ReactElement {
  const [turn, setTurn] = useState<Turn | null>(null);
  const [answered, setAnswered] = useState<Answered[]>([]);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [followUp, setFollowUp] = useState<ChatQuestion | null>(null);
  const [dockHost, setDockHost] = useState<HTMLDivElement | null>(null);
  const requestId = useRef(crypto.randomUUID());

  useEffect(() => {
    app.ontoolresult = (result) => {
      const next = readTurn(result as CallToolResult);
      if (next) { setTurn(next); setActive(0); }
    };
    void app.connect();
  }, []);

  if (!turn) return <div className={styles.card}><p className={styles.dim}>Wodi is reading the board…</p></div>;

  const question = followUp ?? turn.questions[active] ?? null;

  const send = async (asked: ChatQuestion, said: string, answers: SlotAnswer[]): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const result = await call('answer_board', { board_id: turn.boardId, card_answers: answers });
      const problem = errorOf(result);
      const next = readTurn(result);
      if (problem || !next) { setError(problem ?? 'Wodi could not take that answer — try again.'); return; }
      setAnswered((now) => [...now, { question: asked.text, said }]);
      setFollowUp(null);
      setTurn(next);
      setActive(0);
    } catch {
      setError('The connection dropped — tap it again.');
    } finally {
      setBusy(false);
    }
  };

  const tapChip = (asked: ChatQuestion, chip: ChatChip): void => {
    // "Something else" asks its own follow-up first; the answer comes from that.
    if (chip.then) { setFollowUp(chip.then); return; }
    void send(asked, chip.label, chip.answers);
  };

  const save = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    setSaved({ stage: 'saving' });
    try {
      const stored = await call('save_board', { board_id: turn.boardId, request_id: requestId.current });
      const workoutId = (stored.structuredContent as { workout_id?: string } | undefined)?.workout_id;
      if (stored.isError || !workoutId) { setSaved(null); setError(errorOf(stored) ?? 'Wodi could not save it — try again.'); return; }
      setSaved({ stage: 'poster', workoutId });
      await app.updateModelContext({ content: [{ type: 'text', text: `The athlete saved this workout in Wodi with its answer card (workout_id ${workoutId}). Answers: ${answered.map((a) => `${a.question} → ${a.said}`).join('; ')}.` }] });
      const made = await call('generate_poster', { workout_id: workoutId, skin: 'sun' });
      const posterId = (made.structuredContent as { poster_id?: string } | undefined)?.poster_id;
      const shown = posterId ? await call('get_poster', { poster_id: posterId }) : null;
      const images = ((shown?._meta as { images?: string[] } | undefined)?.images ?? []).filter((src) => src.startsWith('data:image/png;base64,'));
      setSaved({ stage: 'done', workoutId, images });
      await app.sendMessage({ role: 'user', content: [{ type: 'text', text: 'I saved my workout in Wodi.' }] });
    } catch {
      setError('The connection dropped — tap Save again.');
      setSaved(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.card}>
      <p className={styles.brand}>wodi</p>

      {answered.length > 0 && (
        <ul className={styles.rows}>
          {answered.map((a, i) => (
            <li key={`a${i}`} className={styles.rowDone}>
              <span className={styles.rowTitle}>{a.question}</span>
              <span className={styles.rowValue}>{a.said}</span>
            </li>
          ))}
        </ul>
      )}

      {!turn.done && turn.questions.length > 1 && (
        <ul className={styles.rows}>
          {turn.questions.map((q, i) => (
            <li key={`q${i}`}>
              <button type="button" className={i === active && !followUp ? styles.rowActive : styles.row} disabled={busy} onClick={() => { setFollowUp(null); setActive(i); }}>
                <span className={styles.rowTitle}>{q.text}</span>
                <span className={styles.rowEmpty}>—</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {!turn.done && question && (
        <section className={styles.ask} key={`${answered.length}:${active}:${followUp ? 'f' : ''}`}>
          <p className={styles.question}>{question.text}</p>
          {question.hint && <p className={styles.dim}>{question.hint}</p>}
          {question.pick && <ChatPickCard pick={question.pick} disabled={busy} onAnswer={(chip) => { tapChip(question, chip); }} />}
          {question.panel && (
            <ChatPanelCard
              panel={question.panel}
              disabled={busy}
              dockHost={dockHost}
              dockHidden={false}
              onSubmit={(label, answers) => { void send(question, label, answers); }}
            />
          )}
          {question.chips.length > 0 && (
            <div className={chat.chips}>
              {question.chips.map((chip) => (
                <button key={chip.label} type="button" className={chip.label === 'Skip' ? chat.chipSkip : chat.chip} disabled={busy} onClick={() => { tapChip(question, chip); }}>
                  {chip.label}
                </button>
              ))}
            </div>
          )}
          {!question.panel && !question.pick && question.chips.length === 0 && (
            <p className={styles.dim}>Type your answer in the chat — Wodi will take it from there.</p>
          )}
          <div ref={setDockHost} className={styles.dock} />
          {question.placeholder && <p className={styles.dim}>{question.placeholder} — in the chat.</p>}
        </section>
      )}

      {error && <p className={styles.error} role="alert">{error}</p>}

      {turn.done && !saved && (
        <button type="button" className={styles.save} disabled={busy} onClick={() => { void save(); }}>
          Save workout
        </button>
      )}
      {saved?.stage === 'saving' && <p className={styles.dim}>Saving…</p>}
      {saved?.stage === 'poster' && <p className={styles.dim}>Saved. Making your poster…</p>}
      {saved?.stage === 'done' && (
        <div className={styles.posters}>
          <p className={styles.savedLine}>Saved to Wodi.</p>
          {saved.images.map((src, i) => <img key={i} src={src} alt={`Your Wodi poster, page ${i + 1}`} className={styles.poster} />)}
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<BoardCard />);
