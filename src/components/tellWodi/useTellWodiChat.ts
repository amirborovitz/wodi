import { useCallback, useEffect, useRef, useState } from 'react';
import type { ParsedWorkout, PosterVibeKey, SavedChat } from '../../types';
import type { StoryExerciseResult } from '../logging/story/types';
import { readAthleteMessage, type ChatTurn } from '../../services/tellWodiReader';
import type { LastLoad } from '../../utils/lastLoadHistory';
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

/**
 * The Tell Wodi conversation: the athlete sends a board and words, Wodi fills the same per-block
 * results the forms fill, asks only what's still open, and hands the finished results to the same
 * save. Before the workout it offers the athlete's own last loads and parks the chat on Today until
 * they come back. This hook owns all of it; the chat screen only renders what it returns.
 */

export interface ChatChipView {
  label: string;
  answers?: SlotAnswer[];
  action?: 'forms' | 'done' | 'later';
}

export interface ChatMessage {
  id: string;
  from: 'wodi' | 'me';
  text?: string;
  imageUrl?: string;
  /** A photo was sent but isn't shown — a reopened chat keeps the fact, not the image. */
  hadPhoto?: boolean;
  chips?: ChatChipView[];
  /** A question whose chips were used, or which a later message answered — drawn dimmed. */
  answered?: boolean;
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
  /** Keep the conversation — called whenever it changes once there is a board. */
  onPersist: (chat: SavedChat, workout: ParsedWorkout) => void;
  /** Everything answered: save it exactly like the forms do. */
  onFinished: (results: StoryExerciseResult[], vibe: PosterVibeKey | null, chat: SavedChat) => void;
  /** Hand over to the form with everything answered so far already filled in. */
  onOpenForms: (results: StoryExerciseResult[]) => void;
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

const GREETING = "Hey. What'd you do today? Send me the board — a photo, or just tell me.";

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
      s.rx ? `board ${s.rx}` : null,
    ].filter(Boolean).join(' · '))
    .join('\n');
}

export function useTellWodiChat({
  readBoard, buildResults, lastLoads, onPersist, onFinished, onOpenForms,
}: UseTellWodiChatArgs): TellWodiChat {
  const [messages, setMessages] = useState<ChatMessage[]>([{ id: nextId(), from: 'wodi', text: GREETING, at: Date.now() }]);
  const [busy, setBusy] = useState<ChatBusy>(null);
  const [hasBoard, setHasBoard] = useState(false);

  // The conversation's working state. Refs, because every step is async and must read the latest
  // answers — a stale closure here would re-ask a question the athlete just answered.
  const workoutRef = useRef<ParsedWorkout | null>(null);
  const resultsRef = useRef<StoryExerciseResult[]>([]);
  const closedRef = useRef<Set<string>>(new Set());
  const vibeRef = useRef<PosterVibeKey | null>(null);
  const waitingRef = useRef(false);
  const messagesRef = useRef<ChatMessage[]>(messages);
  const callbacks = useRef({ readBoard, buildResults, lastLoads, onPersist, onFinished, onOpenForms });
  useEffect(() => { callbacks.current = { readBoard, buildResults, lastLoads, onPersist, onFinished, onOpenForms }; });

  const commit = useCallback((next: ChatMessage[]): void => {
    messagesRef.current = next;
    setMessages(next);
    if (workoutRef.current) callbacks.current.onPersist(toSavedChat(next, waitingRef.current), workoutRef.current);
  }, []);

  const push = useCallback((message: Omit<ChatMessage, 'id' | 'at'>): void => {
    commit([...messagesRef.current, { ...message, id: nextId(), at: Date.now() }]);
  }, [commit]);

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
    callbacks.current.onFinished(resultsRef.current, vibeRef.current, toSavedChat(messagesRef.current, false));
  };

  /** Ask the next open question, hand to the form, or finish. */
  const askNext = (prefix?: string): void => {
    waitingRef.current = false;
    const slots = openSlots(resultsRef.current, closedRef.current);
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

  /** Heading in: the athlete's own last loads against the board, then park the chat on Today. */
  const parkBeforeWorkout = (): void => {
    const suggestions = buildLoadSuggestions(resultsRef.current, callbacks.current.lastLoads);
    if (suggestions.length > 0) {
      push({ from: 'wodi', text: "Here's where you've been on the weights:" });
      push({ from: 'wodi', suggestions });
    }
    waitingRef.current = true;
    push({ from: 'wodi', text: "I'll keep this on Today. Come back after and tell me how it went." });
  };

  const readWords = async (text: string): Promise<void> => {
    const workout = workoutRef.current;
    if (!workout) return;
    const slots = openSlots(resultsRef.current, closedRef.current);
    const askedBefore = slots.find((s) => s.asked)?.id;
    setBusy('thinking');
    try {
      const reading = await readAthleteMessage({
        boardText: workout.rawText ?? '',
        slots,
        recent: recentTurns(),
        message: text,
      });
      settleQuestions();
      if (reading.beforeWorkout) {
        if (reading.reaction) push({ from: 'wodi', text: reading.reaction });
        parkBeforeWorkout();
        return;
      }
      if (reading.vibe) vibeRef.current = reading.vibe;
      const { applied, swaps } = applyAnswers(reading.answers, slots);
      if (reading.reaction) push({ from: 'wodi', text: reading.reaction });
      // A swap changes what the poster and the totals say, so it's said back — never silent.
      if (swaps.length > 0) push({ from: 'wodi', text: `Noted — ${swaps.join('; ')}.` });
      const stillOpen = askedBefore != null && !closedRef.current.has(askedBefore);
      askNext(applied === 0 && stillOpen && !reading.reaction ? "Didn't catch that." : undefined);
    } catch (err) {
      console.error('[TellWodi] reading failed', err);
      push({ from: 'wodi', text: 'My connection dropped for a sec — say that again?' });
    } finally {
      setBusy(null);
    }
  };

  const send = useCallback((raw: string, file?: File | null): void => {
    const text = raw.trim();
    if (!text && !file) return;
    push({ from: 'me', text: text || undefined, imageUrl: file ? URL.createObjectURL(file) : undefined });

    void (async () => {
      if (!workoutRef.current) {
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
  }, [push]);

  const tapChip = useCallback((messageId: string, chip: ChatChipView): void => {
    commit(messagesRef.current.map((m) => (m.id === messageId ? { ...m, answered: true } : m)));
    if (chip.action === 'forms') {
      callbacks.current.onOpenForms(resultsRef.current);
      return;
    }
    push({ from: 'me', text: chip.label });
    if (chip.action === 'later') {
      parkBeforeWorkout();
      return;
    }
    if (chip.action !== 'done') applyAnswers(chip.answers ?? [], openSlots(resultsRef.current, closedRef.current));
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
      answered: true,
      at: m.at,
    }));
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
