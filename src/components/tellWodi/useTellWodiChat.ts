import { useCallback, useEffect, useRef, useState } from 'react';
import type { ParsedWorkout, PosterVibeKey, SavedChat } from '../../types';
import type { StoryExerciseResult } from '../logging/story/types';
import { readAthleteMessage, type ChatTurn } from '../../services/tellWodiReader';
import type { AskWodiReply } from '../../services/wodiAgent/askWodi';
import type { SwapHabit } from '../../services/wodiAgent/athleteHabits';
import type { WodiNote } from '../../types';
import type { ThreadMessage } from '../../services/wodiAgent/threadItems';
import type { LastLoad, LoggedLoad } from '../../utils/lastLoadHistory';
import { adviseWeights } from '../../services/tellWodiCoach';
import {
  applyAnswer,
  chatCannotLog,
  isComplete,
  nextQuestion,
  openSlots,
  type ChatSlot,
  type SlotAnswer,
} from './chatQuestions';
import { buildLoadSuggestions, type LoadSuggestion } from './loadSuggestions';
import { routeMessage } from './chatRouting';

/**
 * The Tell Wodi conversation: the athlete sends a board and words, Wodi fills the same per-block
 * results the forms fill, asks only what's still open, and hands the finished results to the same
 * save. Before the workout it offers the athlete's own last loads and parks the chat on Today until
 * they come back. This hook owns all of it; the chat screen only renders what it returns.
 */

export interface ChatChipView {
  label: string;
  answers?: SlotAnswer[];
  action?: 'forms' | 'done' | 'later' | 'remember' | 'not-now';
  /** The note a 'remember' chip saves — exactly the words the athlete was shown. */
  note?: string;
}

export interface ChatMessage {
  id: string;
  from: 'wodi' | 'me';
  text?: string;
  imageUrl?: string;
  /** A photo was sent but isn't shown — a reopened chat keeps the fact, not the image. */
  hadPhoto?: boolean;
  /** The board photo once it's uploaded — what a reopened chat shows. `imageUrl` is the local preview. */
  savedImageUrl?: string;
  chips?: ChatChipView[];
  /** A question whose chips were used, or which a later message answered — drawn dimmed. */
  answered?: boolean;
  /** Wodi's newest message, the same as on Today: its one named value in yellow, its day a link. */
  headline?: ChatOpening;
  /** Workouts this answer quoted, drawn as their posters under it. */
  receipts?: string[];
  /** Last-time loads before a workout, drawn as one card. */
  suggestions?: LoadSuggestion[];
  at: number;
}

export type ChatBusy = 'reading-board' | 'thinking' | 'saving' | null;

interface UseTellWodiChatArgs {
  /** Reads the board with the same parse the forms use. */
  readBoard: (input: { file?: File; text?: string }) => Promise<ParsedWorkout>;
  /** Blank results for a parsed board, with no answer pre-filled. */
  buildResults: (workout: ParsedWorkout) => StoryExerciseResult[];
  /** The athlete's last logged load per movement (see lastLoadHistory). */
  lastLoads: ReadonlyMap<string, LastLoad>;
  /** Every lift they've logged at its latest load — what weight advice may reason from. */
  history: LoggedLoad[];
  athleteSex?: string;
  /** Keep the conversation — called whenever it changes once there is a board. */
  onPersist: (chat: SavedChat, workout: ParsedWorkout) => void;
  /** Everything answered: save it exactly like the forms do. */
  onFinished: (results: StoryExerciseResult[], vibe: PosterVibeKey | null, chat: SavedChat) => void;
  /** Hand over to the form with everything answered so far already filled in. */
  onOpenForms: (results: StoryExerciseResult[]) => void;
  /** A question about their own training, answered from their log — or handed back as a workout. */
  ask: (message: string, recent: ChatTurn[]) => Promise<AskWodiReply>;
  /** What they usually swap (athleteHabits) — offered as questions, never filled in. */
  habits: ReadonlyMap<string, SwapHabit>;
  /** What they've already asked Wodi to remember. */
  notes: readonly WodiNote[];
  /** Keep a note — only ever called from the athlete's own "Remember" tap. */
  onRemember: (text: string) => Promise<void>;
  /** Keep a board photo; resolves to where it's stored. */
  uploadPhoto: (file: File) => Promise<string>;
  /** Keep between-workouts messages in the ongoing thread (a question and its answer). */
  keepInThread: (messages: ThreadMessage[]) => void;
  /** Wodi's opening words — its newest message, the one on top of Today. */
  opening: ChatOpening;
}

/** Wodi's newest message as the chat opens on it — the same object Today shows. */
export interface ChatOpening {
  text: string;
  highlight: string | null;
  /** The day it's about ("30 Jun") and the poster that day opens. */
  link: { label: string; workoutId: string } | null;
}

export interface TellWodiChat {
  messages: ChatMessage[];
  busy: ChatBusy;
  send: (text: string, file?: File | null) => void;
  tapChip: (messageId: string, chip: ChatChipView) => void;
  /** Reopen a kept conversation on its board. */
  resume: (workout: ParsedWorkout, chat: SavedChat) => void;
  /** True once there is a board — the form can take over from here. */
  canOpenForms: boolean;
  openForms: () => void;
}


let messageSeq = 0;
const nextId = (): string => `m${Date.now()}-${messageSeq++}`;

function toSavedChat(messages: ChatMessage[], waitingForWorkout: boolean): SavedChat {
  return {
    waitingForWorkout,
    messages: messages
      .filter((m) => m.text || m.imageUrl || m.hadPhoto || m.suggestions)
      .map((m) => ({
        from: m.from,
        // A suggestion card is kept as its words, so the transcript reads back complete.
        ...(m.text ? { text: m.text } : m.suggestions ? { text: suggestionsAsText(m.suggestions) } : {}),
        ...(m.imageUrl || m.hadPhoto ? { hadPhoto: true } : {}),
        ...(m.savedImageUrl ? { imageUrl: m.savedImageUrl } : {}),
        at: m.at,
      })),
  };
}

/** "Echo Bike instead of Run, 600m a round" — what a swap will save, in words. */
function describeSwap(sub: NonNullable<StoryExerciseResult['movementResults']>[number]['substitution']): string {
  if (!sub) return '';
  const unit = sub.targetUnit === 'distance' ? 'm' : sub.targetUnit === 'calories' ? ' cal' : '';
  const amount = sub.adjustedValue != null ? `, ${sub.adjustedValue}${unit}${sub.targetUnit === 'reps' ? ' reps' : ''} the first time` : '';
  return `${sub.selectedName} instead of ${sub.originalName}${amount}`;
}

function suggestionsAsText(suggestions: LoadSuggestion[]): string {
  return suggestions
    .map((s) => [
      s.movement,
      s.last ? `last time ${s.last.load} (${s.last.date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })})` : null,
      ...s.related.map((r) => `${r.movement} ${r.load} (${r.date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })})`),
      s.rx ? `board ${s.rx}` : null,
    ].filter(Boolean).join(' · '))
    .join('\n');
}

export function useTellWodiChat({
  readBoard, buildResults, lastLoads, history, athleteSex, onPersist, onFinished, onOpenForms, ask, habits, notes, onRemember, uploadPhoto, keepInThread, opening,
}: UseTellWodiChatArgs): TellWodiChat {
  const [messages, setMessages] = useState<ChatMessage[]>([{ id: nextId(), from: 'wodi', text: opening.text, headline: opening, at: Date.now() }]);
  const [busy, setBusy] = useState<ChatBusy>(null);
  const [hasBoard, setHasBoard] = useState(false);

  // The conversation's working state. Refs, because every step is async and must read the latest
  // answers — a stale closure here would re-ask a question the athlete just answered.
  const workoutRef = useRef<ParsedWorkout | null>(null);
  const resultsRef = useRef<StoryExerciseResult[]>([]);
  const closedRef = useRef<Set<string>>(new Set());
  const vibeRef = useRef<PosterVibeKey | null>(null);
  const waitingRef = useRef(false);
  // Where this workout's own conversation starts. Everything before it — the greeting, questions
  // about training — belongs to the ongoing thread, not to the poster this board becomes.
  const boardStartRef = useRef(0);
  const messagesRef = useRef<ChatMessage[]>(messages);
  const callbacks = useRef({ readBoard, buildResults, lastLoads, history, athleteSex, onPersist, onFinished, onOpenForms, ask, habits, notes, onRemember, uploadPhoto, keepInThread });
  useEffect(() => { callbacks.current = { readBoard, buildResults, lastLoads, history, athleteSex, onPersist, onFinished, onOpenForms, ask, habits, notes, onRemember, uploadPhoto, keepInThread }; });

  // The opening is computed from the log, which loads after the chat opens: until the athlete has
  // said anything, it follows the newest words rather than freezing on the first render's.
  useEffect(() => {
    const [only, ...rest] = messagesRef.current;
    if (rest.length > 0 || !only?.headline || only.headline === opening) return;
    const next = [{ ...only, text: opening.text, headline: opening }];
    messagesRef.current = next;
    setMessages(next);
  }, [opening]);

  const commit = useCallback((next: ChatMessage[]): void => {
    messagesRef.current = next;
    setMessages(next);
    if (workoutRef.current) callbacks.current.onPersist(toSavedChat(next.slice(boardStartRef.current), waitingRef.current), workoutRef.current);
  }, []);

  const push = useCallback((message: Omit<ChatMessage, 'id' | 'at'>): ChatMessage => {
    const full: ChatMessage = { ...message, id: nextId(), at: Date.now() };
    commit([...messagesRef.current, full]);
    return full;
  }, [commit]);

  /** Kept in the ongoing thread only while there's no board — after that it's the workout's chat. */
  const keepIfBetweenWorkouts = (...said: (ChatMessage | null)[]): void => {
    if (workoutRef.current) return;
    callbacks.current.keepInThread(said.flatMap((m) => (m?.text ? [{
      id: m.id, from: m.from, text: m.text, at: m.at, ...(m.receipts?.length ? { workoutIds: m.receipts } : {}),
    }] : [])));
  };

  /** Dims every open question — the athlete has answered past them. */
  const settleQuestions = (): void => {
    commit(messagesRef.current.map((m) => (m.chips && !m.answered ? { ...m, answered: true } : m)));
  };

  const recentTurns = (): ChatTurn[] => messagesRef.current
    .filter((m) => m.text)
    .slice(-8)
    .map((m) => ({ from: m.from, text: m.text! }));

  /** Applies answers; returns how many landed, and a line per swap so Wodi can say it back. */
  const applyAnswers = (answers: SlotAnswer[], slots: ChatSlot[]): { applied: number; swaps: string[] } => {
    let applied = 0;
    const swaps: string[] = [];
    for (const answer of answers) {
      const slot = slots.find((s) => s.id === answer.id);
      if (!slot) continue;
      const outcome = applyAnswer(resultsRef.current, slot, answer);
      resultsRef.current = outcome.results;
      if (!outcome.closed) continue;
      closedRef.current = new Set(closedRef.current).add(slot.id);
      applied += 1;
      if (slot.kind === 'swap') {
        const swapped = resultsRef.current
          .find((r) => r.exerciseIndex === slot.exerciseIndex)
          ?.movementResults?.find((mr) => mr.movement.name === slot.movementNames?.[0] && mr.substitution);
        const sub = swapped?.substitution;
        if (sub) swaps.push(describeSwap(sub));
      }
    }
    return { applied, swaps };
  };

  const finish = (): void => {
    waitingRef.current = false;
    push({ from: 'wodi', text: "That's everything. Making your poster…" });
    setBusy('saving');
    callbacks.current.onFinished(resultsRef.current, vibeRef.current, toSavedChat(messagesRef.current.slice(boardStartRef.current), false));
  };

  /** Ask the next open question, hand to the form, or finish. */
  const askNext = (prefix?: string): void => {
    waitingRef.current = false;
    const slots = openSlots(resultsRef.current, closedRef.current, callbacks.current.habits);
    const question = nextQuestion(slots, resultsRef.current);
    if (question) {
      push({
        from: 'wodi',
        text: prefix ? `${prefix} ${question.text}` : question.text,
        chips: question.chips.map((c) => ({ label: c.label, answers: c.answers })),
      });
      return;
    }
    if (isComplete(slots) && resultsRef.current.some(chatCannotLog)) {
      push({
        from: 'wodi',
        text: 'One part of this board is easier to log on the form — I\'ll bring over everything you told me.',
        chips: [{ label: 'Open the form', action: 'forms' }],
      });
      return;
    }
    finish();
  };

  /**
   * Heading in: the athlete's own history against the board, Wodi's actual weight advice built on
   * it, then the chat parks on Today until they're back.
   */
  const parkBeforeWorkout = async (question: string): Promise<void> => {
    const { lastLoads: last, history: logged, athleteSex: sex } = callbacks.current;
    const suggestions = buildLoadSuggestions(resultsRef.current, last, logged);
    if (suggestions.length > 0) {
      push({ from: 'wodi', text: "Here's where you've been on the weights:" });
      push({ from: 'wodi', suggestions });
      setBusy('thinking');
      try {
        const advice = await adviseWeights({
          boardText: workoutRef.current?.rawText ?? '',
          question,
          sex,
          movements: suggestions,
          history: logged,
          notes: callbacks.current.notes,
        });
        if (advice) push({ from: 'wodi', text: advice });
      } catch (err) {
        console.error('[TellWodi] weight advice failed', err);
      } finally {
        setBusy(null);
      }
    }
    waitingRef.current = true;
    push({ from: 'wodi', text: "I'll keep this on Today. Come back after and tell me how it went." });
  };

  const readWords = async (text: string): Promise<void> => {
    const workout = workoutRef.current;
    if (!workout) return;
    const slots = openSlots(resultsRef.current, closedRef.current, callbacks.current.habits);
    const askedBefore = slots.find((s) => s.asked)?.id;
    setBusy('thinking');
    try {
      const reading = await readAthleteMessage({
        boardText: workout.rawText ?? '',
        slots,
        recent: recentTurns(),
        message: text,
        notes: callbacks.current.notes,
      });
      settleQuestions();
      if (reading.beforeWorkout) {
        // The advice is the answer; a "good luck" line before it is noise.
        offerToRemember(reading.remember);
        await parkBeforeWorkout(text);
        return;
      }
      if (reading.vibe) vibeRef.current = reading.vibe;
      const { applied, swaps } = applyAnswers(reading.answers, slots);
      if (reading.reaction) push({ from: 'wodi', text: reading.reaction });
      // A swap changes what the poster and the totals say, so it's said back — never silent.
      if (swaps.length > 0) push({ from: 'wodi', text: `Noted — ${swaps.join('; ')}.` });
      offerToRemember(reading.remember);
      const stillOpen = askedBefore != null && !closedRef.current.has(askedBefore);
      askNext(applied === 0 && stillOpen && !reading.reaction ? "Didn't catch that." : undefined);
    } catch (err) {
      console.error('[TellWodi] reading failed', err);
      push({ from: 'wodi', text: 'My connection dropped for a sec — say that again?' });
    } finally {
      setBusy(null);
    }
  };

  /** Something lasting they said — offered, never kept without their tap. */
  const offerToRemember = (note: string | null): ChatMessage | null => {
    if (!note) return null;
    return push({
      from: 'wodi',
      text: `Want me to remember that? "${note}"`,
      chips: [{ label: 'Remember', action: 'remember', note }, { label: 'Not now', action: 'not-now' }],
    });
  };

  /**
   * Words before any board: a question about their training gets its answer here; a workout
   * returns false and goes on to the board reader. True means the message has been dealt with.
   */
  const answerQuestion = async (text: string, sent: ChatMessage): Promise<boolean> => {
    setBusy('thinking');
    try {
      // The message itself was just pushed; Ask Wodi takes it separately from the history.
      const reply = await callbacks.current.ask(text, recentTurns().slice(0, -1));
      if (reply.kind === 'log') return false;
      const answer = push({
        from: 'wodi',
        text: reply.text || "I couldn't find that in your log.",
        ...(reply.receipts.length ? { receipts: reply.receipts } : {}),
      });
      keepIfBetweenWorkouts(sent, answer, offerToRemember(reply.proposedNote));
      return true;
    } catch (err) {
      console.error('[TellWodi] ask failed', err);
      push({ from: 'wodi', text: 'My connection dropped for a sec — say that again?' });
      return true;
    } finally {
      setBusy(null);
    }
  };

  const send = useCallback((raw: string, file?: File | null): void => {
    const text = raw.trim();
    if (!text && !file) return;
    const sent: ChatMessage = {
      id: nextId(), from: 'me', text: text || undefined, imageUrl: file ? URL.createObjectURL(file) : undefined, at: Date.now(),
    };
    const sentId = sent.id;
    commit([...messagesRef.current, sent]);
    // The photo is kept alongside the board read, so coming back to this chat shows the board. A
    // failed upload costs only that: the chat carries on and remembers there was a photo.
    if (file) {
      callbacks.current.uploadPhoto(file)
        .then((url) => commit(messagesRef.current.map((m) => (m.id === sentId ? { ...m, savedImageUrl: url } : m))))
        .catch((err: unknown) => console.error('[TellWodi] could not keep the board photo', err));
    }

    void (async () => {
      let route = routeMessage({ hasBoard: !!workoutRef.current, hasFile: !!file });
      if (route === 'ask-wodi') {
        if (await answerQuestion(text, sent)) return;
        route = 'read-board';   // it was a workout, not a question
      }
      if (route === 'read-board') {
        // This message starts the workout's own chat.
        boardStartRef.current = Math.max(0, messagesRef.current.findIndex((m) => m.id === sentId));
        setBusy('reading-board');
        try {
          // A photo is the board. Words alone are the board AND the results in one breath —
          // the same text parse the forms' "Say it or type it" uses.
          const workout = await callbacks.current.readBoard(file ? { file } : { text });
          workoutRef.current = workout;
          resultsRef.current = callbacks.current.buildResults(workout);
          setHasBoard(true);
        } catch (err) {
          console.error('[TellWodi] board read failed', err);
          push({ from: 'wodi', text: "I couldn't read that board. Try another photo, or type the workout out." });
          setBusy(null);
          return;
        }
        setBusy(null);
        const title = workoutRef.current.title?.trim();
        if (!text) {
          // Just the board — it could be before class or after. Ask rather than assume.
          push({
            from: 'wodi',
            text: `${title ? `Got it — ${title}.` : 'Got the board.'} Done it already, or heading in?`,
            chips: [
              { label: 'Done — log it', action: 'done' },
              { label: 'Doing it later', action: 'later' },
            ],
          });
          return;
        }
      }
      await readWords(text);
    })();
    // The helpers read refs only, so the callback never goes stale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commit, push]);

  const tapChip = useCallback((messageId: string, chip: ChatChipView): void => {
    commit(messagesRef.current.map((m) => (m.id === messageId ? { ...m, answered: true } : m)));
    if (chip.action === 'forms') {
      callbacks.current.onOpenForms(resultsRef.current);
      return;
    }
    // A note is its own little exchange: it never moves the workout's questions along.
    if (chip.action === 'not-now') return;
    if (chip.action === 'remember' && chip.note) {
      const note = chip.note;
      void callbacks.current.onRemember(note)
        .then(() => keepIfBetweenWorkouts(push({ from: 'wodi', text: "Got it — I'll remember. It's under Me if you want to change it." })))
        .catch((err: unknown) => {
          console.error('[TellWodi] could not keep the note', err);
          push({ from: 'wodi', text: "Couldn't save that one — try again in a bit." });
        });
      return;
    }
    push({ from: 'me', text: chip.label });
    if (chip.action === 'later') {
      void parkBeforeWorkout('');
      return;
    }
    if (chip.action !== 'done') applyAnswers(chip.answers ?? [], openSlots(resultsRef.current, closedRef.current, callbacks.current.habits));
    askNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commit, push]);

  const resume = useCallback((workout: ParsedWorkout, chat: SavedChat): void => {
    workoutRef.current = workout;
    resultsRef.current = callbacks.current.buildResults(workout);
    closedRef.current = new Set();
    waitingRef.current = chat.waitingForWorkout;
    setHasBoard(true);
    const kept: ChatMessage[] = chat.messages.map((m) => ({
      id: nextId(),
      from: m.from,
      ...(m.text ? { text: m.text } : {}),
      ...(m.hadPhoto ? { hadPhoto: true } : {}),
      ...(m.imageUrl ? { imageUrl: m.imageUrl, savedImageUrl: m.imageUrl } : {}),
      answered: true,
      at: m.at,
    }));
    boardStartRef.current = 0;
    messagesRef.current = kept;
    setMessages(kept);
    // Answers aren't kept on a waiting board (see SavedChat), so everything still open is asked.
    askNext(chat.waitingForWorkout ? "Welcome back — how'd it go?" : 'Picking up where we left off.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openForms = useCallback((): void => {
    callbacks.current.onOpenForms(resultsRef.current);
  }, []);

  return { messages, busy, send, tapChip, resume, canOpenForms: hasBoard, openForms };
}
