import { useCallback, useEffect, useRef, useState } from 'react';
import type { ParsedWorkout, PlannedWorkout, PosterVibeKey, SavedChat } from '../../types';
import type { StoryExerciseResult } from '../logging/story/types';
import { readAthleteMessage, type ChatTurn } from '../../services/tellWodiReader';
import type { AskFn } from './useAskWodi';
import type { SwapHabit } from '../../services/wodiAgent/athleteHabits';
import type { WodiNote } from '../../types';
import type { ThreadMessage } from '../../services/wodiAgent/threadItems';
import type { LastLoad, LoggedLoad } from '../../utils/lastLoadHistory';
import {
  applyAnswer,
  chatCannotLog,
  clarifySlots,
  describeAnswer,
  isComplete,
  nextQuestion,
  openSlots,
  readAnswerLocally,
  type ChatPanel,
  type ChatQuestion,
  type ChatSlot,
  type SlotAnswer,
} from './chatQuestions';
import { answerUncertainty, uncertaintyValue } from '../../services/parseUncertainty';
import { buildLoadSuggestions, type LoadSuggestion } from './loadSuggestions';
import { routeMessage } from './chatRouting';

/**
 * The Tell Wodi conversation: the athlete sends a board and words, Wodi fills the same per-block
 * results the forms fill, asks only what's still open, and hands the finished results to the same
 * save. Before the workout it offers the athlete's own last loads and parks the chat on Today until
 * they come back. This hook owns all of it; the chat screen only renders what it returns.
 */

/** How the athlete got from the chat to the standard logging screen — measured (analytics.ts). */
export type FormHandoff = 'typed' | 'chip' | 'wodi_handoff';

export interface ChatChipView {
  label: string;
  answers?: SlotAnswer[];
  action?: 'forms' | 'done' | 'later' | 'remember' | 'not-now';
  /** A 'forms' chip: which offer of the standard screen this is. */
  handoff?: FormHandoff;
  /** The note a 'remember' chip saves — exactly the words the athlete was shown. */
  note?: string;
  /** The follow-up this chip asks instead of answering ("Different weight" → "What weight…?"). */
  then?: ChatQuestion;
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
  /** Boxes to answer in, when the answer is several numbers (see ChatQuestion.panel). */
  panel?: ChatPanel;
  /** A question whose chips were used, or which a later message answered — drawn dimmed. */
  answered?: boolean;
  /** A question about the board. A reopened chat asks again whatever is open, so one left open isn't kept. */
  asks?: boolean;
  /** Wodi's newest message, the chat's opening line: its one named value in yellow, its day a link. */
  headline?: ChatOpening;
  /** Workouts this answer quoted, drawn as their posters under it. */
  receipts?: string[];
  /** How to answer this question — small and dim under it (see ChatQuestion.hint). */
  hint?: string;
  /** How to answer by typing — the message box's placeholder while this is open. */
  placeholder?: string;
  /** Last-time loads before a workout, drawn as one card. */
  suggestions?: LoadSuggestion[];
  /** My message answered these questions — tapping "Change" on it asks them again. */
  slotIds?: string[];
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
  /** Every lift they've logged at its latest load — the load card reads related lifts from it. */
  history: LoggedLoad[];
  athleteSex?: string;
  /** Keep the conversation — called whenever it changes once there is a board. */
  onPersist: (chat: SavedChat, workout: ParsedWorkout) => void;
  /** The board changed under the chat — a question about it was answered (ParseUncertainty). */
  onBoardChanged: (workout: ParsedWorkout) => void;
  /** Everything answered: save it exactly like the forms do. */
  onFinished: (results: StoryExerciseResult[], vibe: PosterVibeKey | null, chat: SavedChat) => void;
  /** Hand over to the form with everything answered so far already filled in. */
  onOpenForms: (results: StoryExerciseResult[], how: FormHandoff) => void;
  /** The standard screen asked for before there's a board — it starts from the photo step. */
  onUseForm: (how: FormHandoff) => void;
  /** A question about their own training, answered from their log — or handed back as a workout. */
  ask: AskFn;
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
  /**
   * Wodi's opening words — its newest message, the one on top of Today. Null until the log has
   * loaded: shown once, with the right words, instead of an opener swapped out a moment later.
   */
  opening: ChatOpening | null;
}

/** Wodi's newest message as the chat opens on it. */
export interface ChatOpening {
  text: string;
  highlight: string | null;
  /** The day it's about ("30 Jun") and the poster that day opens. */
  link: { label: string; workoutId: string } | null;
  /** A cheer for a workout just logged: its poster, drawn big under the line with Share. */
  posterId: string | null;
}

/** Two openings say the same thing — the words, the highlight, the poster the day opens. */
export function sameOpening(a: ChatOpening, b: ChatOpening): boolean {
  return a.text === b.text
    && a.highlight === b.highlight
    && (a.link?.label ?? null) === (b.link?.label ?? null)
    && (a.link?.workoutId ?? null) === (b.link?.workoutId ?? null)
    && a.posterId === b.posterId;
}

export interface TellWodiChat {
  messages: ChatMessage[];
  busy: ChatBusy;
  send: (text: string, file?: File | null) => void;
  tapChip: (messageId: string, chip: ChatChipView) => void;
  /** Reopen a kept conversation on its board. */
  resume: (workout: ParsedWorkout, chat: SavedChat) => void;
  /** Ask again what one of my messages answered — a typo is fixed in the chat, not after it. */
  changeAnswer: (messageId: string) => void;
  /** Logging is over (saving) — answers can't be changed here any more. */
  finished: boolean;
  /** True once there is a board. */
  hasBoard: boolean;
  /** The message box's placeholder: the open question's way to answer by typing, if it has one. */
  placeholder: string;
}


/** The way into logging a board — on its first question, and wherever a parked chat waits. */
const DONE_CHIP: ChatChipView = { label: 'Done — log it', action: 'done' };
/** The standard logging screen, offered by name beside the chat's own way in. */
const STANDARD_SCREEN_CHIP: ChatChipView = { label: 'Fill it in myself', action: 'forms', handoff: 'chip' };

/**
 * What a "Change" can reopen: a value the athlete gave. A swap rewrites the movement itself, so
 * undoing one is a fix for the standard screen, not a question asked again.
 */
const CHANGEABLE: ReadonlySet<ChatSlot['kind']> = new Set(['time', 'rounds', 'reps', 'distance', 'duration', 'score', 'weight', 'maxset', 'choice', 'unit']);

let messageSeq = 0;
const nextId = (): string => `m${Date.now()}-${messageSeq++}`;

/**
 * The chat as its waiting board keeps it. A question asked after the athlete's last word was still
 * open when they left: reopening asks it again, and keeping it too put the same question on screen
 * twice. Questions they replied to stay — the transcript reads back complete.
 */
export function toSavedChat(messages: ChatMessage[], waitingForWorkout: boolean): SavedChat {
  const lastMine = messages.map((m) => m.from).lastIndexOf('me');
  return {
    waitingForWorkout,
    messages: messages
      .filter((m, i) => !(m.asks && i > lastMine))
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

/**
 * The conversation a saved board reopens. A board saved without one (from the standard screen)
 * opens as a chat waiting for its result — every saved board opens in the chat.
 */
export function chatForSavedBoard(planned: PlannedWorkout): SavedChat {
  return planned.chat ?? { messages: [], waitingForWorkout: true };
}

/** What Wodi says on reopening: back from the workout, it asks how this board went — by name. */
export function resumeGreeting(workout: ParsedWorkout, waitingForWorkout: boolean): string {
  if (!waitingForWorkout) return 'Picking up where we left off.';
  const title = workout.title?.trim();
  return title ? `How'd ${title} go?` : "How'd it go?";
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
  readBoard, buildResults, lastLoads, history, athleteSex, onPersist, onBoardChanged, onFinished, onOpenForms, onUseForm, ask, habits, notes, onRemember, uploadPhoto, keepInThread, opening,
}: UseTellWodiChatArgs): TellWodiChat {
  const [messages, setMessages] = useState<ChatMessage[]>(() => (
    opening ? [{ id: nextId(), from: 'wodi', text: opening.text, headline: opening, at: Date.now() }] : []
  ));
  const [busy, setBusy] = useState<ChatBusy>(null);
  const [hasBoard, setHasBoard] = useState(false);
  const [finished, setFinished] = useState(false);

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
  const callbacks = useRef({ readBoard, buildResults, lastLoads, history, athleteSex, onPersist, onBoardChanged, onFinished, onOpenForms, onUseForm, ask, habits, notes, onRemember, uploadPhoto, keepInThread });
  useEffect(() => { callbacks.current = { readBoard, buildResults, lastLoads, history, athleteSex, onPersist, onBoardChanged, onFinished, onOpenForms, onUseForm, ask, habits, notes, onRemember, uploadPhoto, keepInThread }; });
  // Every answer that landed, in order — replayed onto the results when an answer about the board
  // itself rebuilds them, so nothing the athlete already said is lost.
  const givenRef = useRef<SlotAnswer[]>([]);

  // The opening is computed from the log, which loads after the chat opens: until the athlete has
  // said anything, it follows the newest words rather than freezing on the first render's.
  // Compared by WORDS, never by identity: the opening is rebuilt as a new object on every
  // render, and treating that as a change set state every render — an endless loop that blanked
  // the chat when it was opened with nothing to send yet.
  useEffect(() => {
    if (!opening) return;
    const current = messagesRef.current;
    // The log just loaded: Wodi speaks first, once.
    if (current.length === 0) {
      const first: ChatMessage[] = [{ id: nextId(), from: 'wodi', text: opening.text, headline: opening, at: Date.now() }];
      messagesRef.current = first;
      setMessages(first);
      return;
    }
    const [only, ...rest] = current;
    if (rest.length > 0 || !only?.headline || sameOpening(only.headline, opening)) return;
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
    commit(messagesRef.current.map((m) => ((m.chips || m.panel) && !m.answered ? { ...m, answered: true } : m)));
  };

  const recentTurns = (): ChatTurn[] => messagesRef.current
    .filter((m) => m.text)
    .slice(-8)
    .map((m) => ({ from: m.from, text: m.text! }));

  /**
   * Applies answers; returns how many landed, the questions they closed that the athlete can
   * change, and a line per swap so Wodi can say it back.
   */
  const applyAnswers = (answers: SlotAnswer[], slots: ChatSlot[]): { applied: number; closed: string[]; swaps: string[] } => {
    const closed: string[] = [];
    let applied = 0;
    const swaps: string[] = [];
    for (const answer of answers) {
      const slot = slots.find((s) => s.id === answer.id);
      if (!slot) continue;
      if (slot.kind === 'clarify') {
        if (settleBoardQuestion(slot, answer)) applied += 1;
        continue;
      }
      const outcome = applyAnswer(resultsRef.current, slot, answer);
      resultsRef.current = outcome.results;
      if (!outcome.closed) continue;
      givenRef.current = [...givenRef.current, answer];
      closedRef.current = new Set(closedRef.current).add(slot.id);
      applied += 1;
      if (CHANGEABLE.has(slot.kind)) closed.push(slot.id);
      if (slot.kind === 'swap' || slot.kind === 'amount') {
        const swapped = resultsRef.current
          .find((r) => r.exerciseIndex === slot.exerciseIndex)
          ?.movementResults?.find((mr) => mr.movement.name === slot.movementNames?.[0] && mr.substitution);
        const sub = swapped?.substitution;
        if (sub) swaps.push(describeSwap(sub));
      }
    }
    return { applied, closed, swaps };
  };

  /**
   * An answer about the board itself: written into the field the reader named, which changes the
   * board, so the results are rebuilt from it and every answer already given is laid back on top.
   * False when the reply didn't answer it — the question stays open.
   */
  const settleBoardQuestion = (slot: ChatSlot, answer: SlotAnswer): boolean => {
    const workout = workoutRef.current;
    const flag = slot.uncertainty;
    if (!workout || !flag) return false;
    const value = answer.skipped ? undefined : uncertaintyValue(flag, answer);
    if (!answer.skipped && value === undefined) return false;
    const next = answerUncertainty(workout, flag.field, value);
    workoutRef.current = next;
    let results = callbacks.current.buildResults(next);
    const all = openSlots(results, new Set(), callbacks.current.habits, next.teamSize);
    for (const given of givenRef.current) {
      const s = all.find((x) => x.id === given.id);
      if (s) results = applyAnswer(results, s, given).results;
    }
    resultsRef.current = results;
    callbacks.current.onBoardChanged(next);
    return true;
  };

  /** Every question still open: the board's own first — their answers can change the rest. */
  const slotsNow = (): ChatSlot[] => [...clarifySlots(workoutRef.current), ...openSlots(resultsRef.current, closedRef.current, callbacks.current.habits, workoutRef.current?.teamSize)];

  /** My message gave these answers — it can be tapped to change them. */
  const markAnswered = (messageId: string, slotIds: string[]): void => {
    if (slotIds.length === 0) return;
    commit(messagesRef.current.map((m) => (m.id === messageId ? { ...m, slotIds } : m)));
  };

  const finish = (): void => {
    waitingRef.current = false;
    setFinished(true);
    push({ from: 'wodi', text: "Got it all — nice work. Making your poster…" });
    setBusy('saving');
    callbacks.current.onFinished(resultsRef.current, vibeRef.current, toSavedChat(messagesRef.current.slice(boardStartRef.current), false));
  };

  const askQuestion = (question: ChatQuestion, prefix?: string): void => {
    push({
      from: 'wodi',
      asks: true,
      text: prefix ? `${prefix} ${question.text}` : question.text,
      ...(question.hint ? { hint: question.hint } : {}),
      ...(question.placeholder ? { placeholder: question.placeholder } : {}),
      ...(question.panel ? { panel: question.panel } : {}),
      ...(question.chips.length > 0
        ? { chips: question.chips.map((c) => ({ label: c.label, answers: c.answers, ...(c.then ? { then: c.then } : {}) })) }
        : {}),
    });
  };

  /**
   * Ask the next open question, hand to the form, or finish. `stillWaiting`: a chat reopened
   * before the athlete has said anything stays parked — leaving again must not lose the welcome back.
   */
  const askNext = (prefix?: string, stillWaiting = false): void => {
    waitingRef.current = stillWaiting;
    const slots = slotsNow();
    const question = nextQuestion(slots, resultsRef.current, callbacks.current.lastLoads);
    if (question) {
      askQuestion(question, prefix);
      return;
    }
    if (isComplete(slots) && resultsRef.current.some(chatCannotLog)) {
      push({
        from: 'wodi',
        text: 'One part of this board is easier to fill in yourself — I\'ll bring over everything you told me.',
        chips: [{ label: 'Fill it in myself', action: 'forms', handoff: 'wodi_handoff' }],
      });
      return;
    }
    finish();
  };

  /**
   * Heading in: a game plan for this board from their own log — a target and pacing from their
   * past results on similar work, a weight per loaded movement — then the chat parks on Today until
   * they're back. Asked again before the workout ("how should I pace it?"), it plans again for that
   * question; the load card and the parking line are said once. Whatever Wodi says last carries
   * "Done — log it": back from class with this chat still open, logging is one tap from here.
   */
  const parkBeforeWorkout = async (question: string): Promise<void> => {
    const { lastLoads: last, history: logged, athleteSex: sex } = callbacks.current;
    const firstTime = !waitingRef.current;
    const suggestions = buildLoadSuggestions(resultsRef.current, last, logged);
    if (firstTime && suggestions.length > 0) {
      push({ from: 'wodi', text: "Here's where you've been on the weights:" });
      push({ from: 'wodi', suggestions });
    }
    setBusy('thinking');
    let planned = false;
    try {
      // The question was just sent — it goes to Ask Wodi once, as the message, not also as history.
      const recent = recentTurns();
      const last = recent[recent.length - 1];
      const plan = await callbacks.current.ask(
        question || 'Give me a game plan for this one.',
        last?.from === 'me' && last.text === question ? recent.slice(0, -1) : recent,
        { board: workoutRef.current?.rawText ?? '', loads: suggestionsAsText(suggestions), sex },
      );
      if (plan.kind === 'answer' && plan.text) {
        planned = true;
        push({
          from: 'wodi',
          text: plan.text,
          ...(plan.receipts.length ? { receipts: plan.receipts } : {}),
          // A follow-up plan is the last word — the parking line isn't said again to carry the chip.
          ...(firstTime ? {} : { chips: [DONE_CHIP] }),
        });
      }
    } catch (err) {
      console.error('[TellWodi] game plan failed', err);
    } finally {
      setBusy(null);
    }
    waitingRef.current = true;
    if (firstTime) {
      push({ from: 'wodi', text: "Go get it. It's on Today too — when you're done, tap below or just tell me your time.", chips: [DONE_CHIP] });
    } else if (!planned) {
      push({ from: 'wodi', text: "Back here when you're done.", chips: [DONE_CHIP] });
    }
  };

  const readWords = async (text: string, sentId: string): Promise<void> => {
    const workout = workoutRef.current;
    if (!workout) return;
    const slots = slotsNow();
    const askedBefore = slots.find((s) => s.asked)?.id;
    // A clean clock reading to "what was your time?" needs no model — read it here (free, exact).
    const local = readAnswerLocally(slots.find((s) => s.asked), text);
    if (local) {
      settleQuestions();
      const { closed } = applyAnswers([local], slots);
      markAnswered(sentId, closed);
      const asked = slots.find((s) => s.id === local.id);
      const heard = asked ? describeAnswer(asked, local) : null;
      push({ from: 'wodi', text: heard ? `Got it — ${heard}.` : 'Got it.' });
      askNext();
      return;
    }
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
      const { applied, closed, swaps } = applyAnswers(reading.answers, slots);
      markAnswered(sentId, closed);
      const stillOpen = askedBefore != null && !closedRef.current.has(askedBefore);
      // Nothing landed on the question just asked: a bare "Got it." would claim it did, so only a
      // reaction to how it felt is said — then "Didn't catch that" and the question again.
      const missed = applied === 0 && stillOpen;
      const reaction = missed && !reading.vibe ? '' : reading.reaction;
      if (reaction) push({ from: 'wodi', text: reaction });
      // A swap changes what the poster and the totals say, so it's said back — never silent.
      if (swaps.length > 0) push({ from: 'wodi', text: `Noted — ${swaps.join('; ')}.` });
      offerToRemember(reading.remember);
      askNext(missed && !reaction ? "Didn't catch that." : undefined);
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
      let route = routeMessage({ hasBoard: !!workoutRef.current, hasFile: !!file, text });
      if (route === 'open-form') {
        openStandardScreen('typed');
        return;
      }
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
            chips: [DONE_CHIP, { label: 'Doing it later', action: 'later' }, STANDARD_SCREEN_CHIP],
          });
          return;
        }
      }
      await readWords(text, sentId);
    })();
    // The helpers read refs only, so the callback never goes stale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commit, push]);

  /** Over to the standard screen — everything said so far goes along when there's a board. */
  const openStandardScreen = (how: FormHandoff): void => {
    if (workoutRef.current) callbacks.current.onOpenForms(resultsRef.current, how);
    else callbacks.current.onUseForm(how);
  };

  const tapChip = useCallback((messageId: string, chip: ChatChipView): void => {
    commit(messagesRef.current.map((m) => (m.id === messageId ? { ...m, answered: true } : m)));
    if (chip.action === 'forms') {
      openStandardScreen(chip.handoff ?? 'chip');
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
    const said = push({ from: 'me', text: chip.label });
    if (chip.then) {
      askQuestion(chip.then);
      return;
    }
    if (chip.action === 'later') {
      void parkBeforeWorkout('');
      return;
    }
    if (chip.action !== 'done') {
      const { closed } = applyAnswers(chip.answers ?? [], slotsNow());
      markAnswered(said.id, closed);
    }
    askNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commit, push]);

  const resume = useCallback((workout: ParsedWorkout, chat: SavedChat): void => {
    workoutRef.current = workout;
    resultsRef.current = callbacks.current.buildResults(workout);
    closedRef.current = new Set();
    givenRef.current = [];
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
    askNext(resumeGreeting(workout, chat.waitingForWorkout), chat.waitingForWorkout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * "Change" on one of my answers: those questions open again and the next thing Wodi asks is
   * that one — the new answer replaces the old. The question that was waiting is asked after.
   */
  const changeAnswer = useCallback((messageId: string): void => {
    const message = messagesRef.current.find((m) => m.id === messageId);
    if (!message?.slotIds?.length || !workoutRef.current) return;
    const reopened = new Set(closedRef.current);
    for (const id of message.slotIds) reopened.delete(id);
    closedRef.current = reopened;
    settleQuestions();
    commit(messagesRef.current.map((m) => (m.id === messageId ? { ...m, slotIds: undefined } : m)));
    askNext('No problem —');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commit]);

  const placeholder = [...messages].reverse().find((m) => m.from === 'wodi' && !m.answered && m.placeholder)?.placeholder
    ?? 'Message Wodi…';

  return { messages, busy, send, tapChip, resume, changeAnswer, finished, hasBoard, placeholder };
}
