import { useCallback, useEffect, useRef, useState } from 'react';
import type { ParsedWorkout, PlannedWorkout, PosterVibeKey, SavedChat, SavedChatMessage } from '../../types';
import type { StoryExerciseResult } from '../logging/story/types';
import { readAthleteMessage, type ChatTurn } from '../../services/tellWodiReader';
import type { AskFn } from './useAskWodi';
import type { SwapHabit } from '../../services/wodiAgent/athleteHabits';
import type { WodiNote } from '../../types';
import type { ThreadMessage } from '../../services/wodiAgent/threadItems';
import type { LastLoad, LoggedLoad } from '../../utils/lastLoadHistory';
import {
  carriedLoads,
  describeAnswer,
  nextQuestion,
  readAnswerLocally,
  type ChatPanel,
  type ChatPick,
  type ChatQuestion,
  type ChatSlot,
  type SlotAnswer,
} from './chatQuestions';
import { EMPTY_SESSION, answeredSlots as answeredSessionSlots, applySessionAnswers, reopenSlots, sessionSlots, startSession, type ChatSessionContext, type ChatSessionState } from './chatSession';
import { buildLoadSuggestions, type LoadSuggestion } from './loadSuggestions';
import { routeMessage, routeReading, routeWorkoutWords } from './chatRouting';
import { boardReading } from '../../services/wodiAgent/boardReading';
import { buildUnfinishedPoster, type UnfinishedPoster } from '../home/unfinishedPoster';
import { buildBoardPreview, type BoardPreview } from './boardPreview';
import type { ChatNudges } from '../../hooks/useWodiNotifications';
import type { AskSituation } from '../../services/wodiAgent/askWodi';
import type { EnableResult } from '../../services/pushNotifications';

/**
 * The Tell Wodi conversation: the athlete sends a board and words, Wodi fills the same per-block
 * results the forms fill, asks only what's still open, and hands the finished results to the same
 * save. Before the workout it offers the athlete's own last loads and parks the chat on Today until
 * they come back. This hook owns all of it; the chat screen only renders what it returns.
 */

/** How the athlete got from the chat to the standard logging screen — measured (analytics.ts). */
export type FormHandoff = 'typed' | 'chip';

export interface ChatChipView {
  label: string;
  answers?: SlotAnswer[];
  action?: 'forms' | 'done' | 'later' | 'remember' | 'not-now' | 'this-board' | 'new-board' | 'not-done' | 'not-yet' | 'nudge' | 'another';
  /** A 'forms' chip: which offer of the standard screen this is. */
  handoff?: FormHandoff;
  /** The note a 'remember' chip saves — exactly the words the athlete was shown. */
  note?: string;
  /** The follow-up this chip asks instead of answering ("Something else" → "What did you do instead…?"). */
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
  /** Moves to tick, then one confirm (see ChatQuestion.pick). */
  pick?: ChatPick;
  /** The card's quiet button in Skip's place — "Didn't do it" when a saved board's chat reopens on a card. */
  cardChip?: ChatChipView;
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
  /** A board saved for later, drawn as its unfinished poster — how the athlete recognises it. */
  board?: UnfinishedPoster;
  /** A saved board reopened, drawn in full — what's in it, before deciding what to do with it. */
  preview?: BoardPreview;
  /** What the workout just logged here earned — said beside its poster (the EP, a PR). */
  earned?: { ep: number; pr: boolean };
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
  /** The board saved for later (the one pinned above the composer) — null when none waits. */
  waitingBoard: PlannedWorkout | null;
  /** The chat took the waiting board on: from here its saves and its clearing are this chat's. */
  onTakeBoard: (planned: PlannedWorkout) => void;
  /** They never did the saved board this chat reopened: it's cleared from Today. */
  onDropBoard: () => void;
  /** "Not yet" on a reopened board: it stays saved and the chat closes, the same as Back. */
  onNotYet: () => void;
  /** Wodi's nudges on this phone — offered once, when a board is left for later. */
  nudges: ChatNudges;
  /** They asked for something Wodi can't do yet: kept, so what people ask decides what's next. */
  onGap: (request: string, message: string) => void;
}

/** A workout the chat just saved — its poster, and what it earned. */
export interface SavedPoster {
  workoutId: string;
  ep: number;
  pr: boolean;
}

/** How long the cheer may take before the poster goes up without it. */
const CHEER_WAIT_MS = 8000;

/** Wodi's newest message as the chat opens on it. */
export interface ChatOpening {
  text: string;
  highlight: string | null;
  /** The day it's about ("30 Jun") and the poster that day opens. */
  link: { label: string; workoutId: string } | null;
  /** The workout this line cheers: its poster under the line — full size only when it was just logged in this chat. */
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
  /** The workout is saved and its poster is in the chat — leaving now is leaving a finished log. */
  logged: boolean;
  /** Saved: the poster goes in the chat, under Wodi's cheer, with what it earned. */
  posterReady: (saved: SavedPoster) => void;
  /** The save failed: said in the chat, and the log is one tap from trying again. */
  saveFailed: () => void;
  /** True once there is a board. */
  hasBoard: boolean;
  /** The message box's placeholder: the open question's way to answer by typing, if it has one. */
  placeholder: string;
  /** The card being answered right now, if any — its dock takes the composer's place. */
  openPanelId: string | null;
}


/** The way into logging a board — on its first question, and wherever a parked chat waits. */
const DONE_CHIP: ChatChipView = { label: 'Done — log it', action: 'done' };
/** The standard logging screen, offered by name beside the chat's own way in. */
const STANDARD_SCREEN_CHIP: ChatChipView = { label: 'Fill it in myself', action: 'forms', handoff: 'chip' };
// A saved board reopened can be one they never got to — one tap clears it, no poster made.
const NOT_DONE_CHIP: ChatChipView = { label: "Didn't do it", action: 'not-done' };
/** A saved board reopened before it was done: it stays saved, and the chat steps aside. */
const NOT_YET_CHIP: ChatChipView = { label: 'Not yet', action: 'not-yet' };
const NUDGE_CHIP: ChatChipView = { label: 'Nudge me if I forget', action: 'nudge' };
/** A workout Wodi wrote, swapped for a different one. */
const ANOTHER_CHIP: ChatChipView = { label: 'Something else', action: 'another' };
const NUDGE_REPLY: Record<EnableResult, string> = {
  on: "Done — if it's still here tomorrow morning, I'll nudge you.",
  blocked: 'Your phone has notifications off for Wodi — you can turn them on in its settings.',
  failed: "Couldn't turn them on just now. No stress — it's on Today either way.",
};

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

/**
 * What Wodi says over a reopened board. It never assumes the workout was done — the board is
 * shown in full under these words, and the athlete says whether they did it.
 */
export function resumeGreeting(waitingForWorkout: boolean): string {
  return waitingForWorkout ? "Here's the board you saved." : 'Picking up where we left off.';
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
  readBoard, buildResults, lastLoads, history, athleteSex, onPersist, onBoardChanged, onFinished, onOpenForms, onUseForm, ask, habits, notes, onRemember, uploadPhoto, keepInThread, opening, waitingBoard, onTakeBoard, onDropBoard, onNotYet, nudges, onGap,
}: UseTellWodiChatArgs): TellWodiChat {
  const [messages, setMessages] = useState<ChatMessage[]>(() => (
    opening ? [{ id: nextId(), from: 'wodi', text: opening.text, headline: opening, at: Date.now() }] : []
  ));
  const [busy, setBusy] = useState<ChatBusy>(null);
  const [hasBoard, setHasBoard] = useState(false);
  const [finished, setFinished] = useState(false);
  const [logged, setLogged] = useState(false);
  // Saved, its poster waiting for Wodi's cheer (the opening for that workout) — or the time-out.
  const [awaitingCheer, setAwaitingCheer] = useState<SavedPoster | null>(null);

  // The conversation's working state. Refs, because every step is async and must read the latest
  // answers — a stale closure here would re-ask a question the athlete just answered.
  // The board, its results, and what's been answered — the ONE conversation engine's state
  // (chatSession.ts), the same the ChatGPT plugin keeps between its calls.
  const sessionRef = useRef<ChatSessionState>(EMPTY_SESSION);
  const vibeRef = useRef<PosterVibeKey | null>(null);
  const waitingRef = useRef(false);
  // Where this workout's own conversation starts. Everything before it — the greeting, questions
  // about training — belongs to the ongoing thread, not to the poster this board becomes.
  const boardStartRef = useRef(0);
  const messagesRef = useRef<ChatMessage[]>(messages);
  const callbacks = useRef({ readBoard, buildResults, lastLoads, history, athleteSex, onPersist, onBoardChanged, onFinished, onOpenForms, onUseForm, ask, habits, notes, onRemember, uploadPhoto, keepInThread, waitingBoard, onTakeBoard, onDropBoard, onNotYet, nudges, onGap });
  useEffect(() => { callbacks.current = { readBoard, buildResults, lastLoads, history, athleteSex, onPersist, onBoardChanged, onFinished, onOpenForms, onUseForm, ask, habits, notes, onRemember, uploadPhoto, keepInThread, waitingBoard, onTakeBoard, onDropBoard, onNotYet, nudges, onGap }; });
  // A waiting board taken on mid-chat already has a conversation (the photo, "Doing it later", the
  // plan). It isn't redrawn here — the athlete is mid-sentence — but it's kept ahead of this one.
  const priorRef = useRef<SavedChatMessage[]>([]);
  // Words that may be about the waiting board, held while Wodi asks whether they are.
  const pendingWordsRef = useRef<{ text: string; sentId: string; board: PlannedWorkout } | null>(null);
  // The words to read once a taken-on board has reached the screen.
  const [takenBoardWords, setTakenBoardWords] = useState<{ text: string; sentId: string } | null>(null);

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

  // The poster goes in the chat under Wodi's cheer for it — written once the workout lands in the
  // log, usually a second or two. Never a wait on a spinner: past CHEER_WAIT_MS it goes up anyway.
  const showPoster = (saved: SavedPoster, headline: ChatOpening): void => {
    setAwaitingCheer(null);
    setBusy(null);
    setLogged(true);
    push({ from: 'wodi', text: headline.text, headline, earned: { ep: saved.ep, pr: saved.pr } });
  };
  useEffect(() => {
    if (awaitingCheer && opening?.posterId === awaitingCheer.workoutId) showPoster(awaitingCheer, opening);
    // showPoster reads refs and stable setters only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awaitingCheer, opening]);
  // Its own effect, on the save alone: the opening is rebuilt as the log loads, and a timer tied to
  // it would start over each time and never run out.
  useEffect(() => {
    if (!awaitingCheer) return;
    const late = setTimeout(
      () => showPoster(awaitingCheer, { text: "Poster's done.", highlight: null, link: null, posterId: awaitingCheer.workoutId }),
      CHEER_WAIT_MS,
    );
    return () => clearTimeout(late);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awaitingCheer]);

  /** This board's conversation as it's kept: what it already had, then everything since it opened here. */
  const boardChat = (all: ChatMessage[], waiting: boolean): SavedChat => {
    const saved = toSavedChat(all.slice(boardStartRef.current), waiting);
    return { ...saved, messages: [...priorRef.current, ...saved.messages] };
  };

  // A chat the athlete has left keeps nothing. A board photo still being read when they open a
  // saved board instead (2026-10-23: sent 10:20:14, saved board opened 10:20:26) finished in
  // the closed chat and kept the board for later as a second copy — one the log never cleared.
  const leftRef = useRef(false);
  useEffect(() => {
    leftRef.current = false;
    return () => { leftRef.current = true; };
  }, []);

  const commit = useCallback((next: ChatMessage[]): void => {
    if (leftRef.current) return;
    messagesRef.current = next;
    setMessages(next);
    if (sessionRef.current.workout) callbacks.current.onPersist(boardChat(next, waitingRef.current), sessionRef.current.workout);
    // boardChat reads refs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** The chat is now on this board: its questions start from blank answers. */
  const openBoard = (workout: ParsedWorkout): void => {
    sessionRef.current = startSession(workout, sessionContext());
    setHasBoard(true);
  };

  /** What the conversation engine needs from this athlete — read fresh, never a stale closure. */
  const sessionContext = (): ChatSessionContext => ({
    buildResults: callbacks.current.buildResults,
    habits: callbacks.current.habits,
  });

  const push = useCallback((message: Omit<ChatMessage, 'id' | 'at'>): ChatMessage => {
    const full: ChatMessage = { ...message, id: nextId(), at: Date.now() };
    commit([...messagesRef.current, full]);
    return full;
  }, [commit]);

  /** Kept in the ongoing thread only while there's no board — after that it's the workout's chat. */
  const keepIfBetweenWorkouts = (...said: (ChatMessage | null)[]): void => {
    if (sessionRef.current.workout) return;
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
   * Applies answers through the one conversation engine (chatSession.ts); returns how many landed,
   * the questions they closed that the athlete can change, a line per swap so Wodi can say it
   * back, and each correction of an earlier answer.
   */
  const applyAnswers = (answers: SlotAnswer[], slots: ChatSlot[]): { applied: number; closed: string[]; swaps: string[]; corrected: string[] } => {
    const out = applySessionAnswers(sessionRef.current, answers, slots, sessionContext());
    sessionRef.current = out.state;
    // An answer about the board itself changed it — the save reads this one.
    if (out.boardChanged && out.state.workout) callbacks.current.onBoardChanged(out.state.workout);
    const swaps = out.swapSlots.flatMap((slot) => {
      const sub = out.state.results
        .find((r) => r.exerciseIndex === slot.exerciseIndex)
        ?.movementResults?.find((mr) => mr.movement.name === slot.movementNames?.[0] && mr.substitution)
        ?.substitution;
      return sub ? [describeSwap(sub)] : [];
    });
    return { applied: out.applied, closed: out.closed, swaps, corrected: out.corrected };
  };

  /** Every question still open: the board's own first — their answers can change the rest. */
  const slotsNow = (): ChatSlot[] => sessionSlots(sessionRef.current, sessionContext());

  /**
   * What they've already answered, with what they said — handed to the reader beside the open
   * questions so "oops, 19:30 not 18:30" lands. Never asked: only a correction fills one.
   */
  const answeredSlots = (): ChatSlot[] => answeredSessionSlots(sessionRef.current, sessionContext());

  /** My message gave these answers — it can be tapped to change them. An answer given again moves its "Change" here. */
  const markAnswered = (messageId: string, slotIds: string[]): void => {
    if (slotIds.length === 0) return;
    commit(messagesRef.current.map((m) => {
      if (m.id === messageId) return { ...m, slotIds };
      const kept = m.slotIds?.filter((id) => !slotIds.includes(id));
      return kept && kept.length !== m.slotIds?.length ? { ...m, slotIds: kept.length ? kept : undefined } : m;
    }));
  };

  const finish = (): void => {
    waitingRef.current = false;
    setFinished(true);
    push({ from: 'wodi', text: 'Got it all. Making your poster…' });
    setBusy('saving');
    callbacks.current.onFinished(sessionRef.current.results, vibeRef.current, boardChat(messagesRef.current, false));
  };

  const askQuestion = (question: ChatQuestion, prefix?: string, extra: ChatChipView[] = []): void => {
    // A question on a card offers its extra on the card itself, where Skip would be.
    const [cardChip, ...beside] = question.panel ? extra : [];
    const chips: ChatChipView[] = [
      ...question.chips.map((c) => ({ label: c.label, answers: c.answers, ...(c.then ? { then: c.then } : {}) })),
      ...(question.panel ? beside : extra),
    ];
    push({
      from: 'wodi',
      asks: true,
      text: prefix ? `${prefix} ${question.text}` : question.text,
      ...(question.hint ? { hint: question.hint } : {}),
      ...(question.placeholder ? { placeholder: question.placeholder } : {}),
      ...(question.panel ? { panel: question.panel } : {}),
      ...(question.pick ? { pick: question.pick } : {}),
      ...(cardChip ? { cardChip } : {}),
      ...(chips.length > 0 ? { chips } : {}),
    });
  };

  /**
   * Ask the next open question, hand to the form, or finish. `stillWaiting`: a chat reopened
   * before the athlete has said anything stays parked — leaving again must not lose the welcome back.
   * `extra`: chips offered beside this one question's own.
   */
  const askNext = (prefix?: string, stillWaiting = false, extra: ChatChipView[] = []): void => {
    waitingRef.current = stillWaiting;
    const slots = slotsNow();
    // A lift they already weighed today is said, not asked — with Change on Wodi's line.
    const carried = carriedLoads(slots, sessionRef.current.reopened);
    if (carried) {
      const { closed } = applyAnswers(carried.answers, slots);
      if (closed.length > 0) {
        const said = push({ from: 'wodi', text: prefix ? `${prefix} ${carried.text}` : carried.text });
        markAnswered(said.id, closed);
        askNext(undefined, stillWaiting, extra);
        return;
      }
    }
    const question = nextQuestion(slots, sessionRef.current.results, callbacks.current.lastLoads);
    if (question) {
      askQuestion(question, prefix, extra);
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
    const suggestions = buildLoadSuggestions(sessionRef.current.results, last, logged);
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
        { kind: 'upcoming', workout: { board: sessionRef.current.workout?.rawText ?? '', reading: boardReading(sessionRef.current.workout), loads: suggestionsAsText(suggestions), sex } },
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
      // Once per phone, Wodi offers to nudge them if the board is still waiting tomorrow.
      const offer = callbacks.current.nudges.takeOffer();
      push({
        from: 'wodi',
        text: "Go get it. It's on Today too — when you're done, tap below or just tell me your time.",
        chips: offer === 'ask' ? [DONE_CHIP, NUDGE_CHIP] : [DONE_CHIP],
      });
      if (offer === 'install-first') {
        push({ from: 'wodi', text: "Add Wodi to your Home Screen (Share → Add to Home Screen) and I can nudge you if it's still waiting tomorrow." });
      }
    } else if (!planned) {
      push({ from: 'wodi', text: "Back here when you're done.", chips: [DONE_CHIP] });
    }
  };

  const readWords = async (text: string, sentId: string): Promise<void> => {
    const workout = sessionRef.current.workout;
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
    const answered = answeredSlots();
    setBusy('thinking');
    try {
      const reading = await readAthleteMessage({
        boardText: workout.rawText ?? '',
        // The open questions, then what they already answered — a correction can land on those.
        slots: [...slots, ...answered],
        recent: recentTurns(),
        message: text,
        notes: callbacks.current.notes,
      });
      settleQuestions();
      const route = routeReading(reading);
      if (route === 'park') {
        // The advice is the answer; a "good luck" line before it is noise.
        offerToRemember(reading.remember);
        await parkBeforeWorkout(text);
        return;
      }
      if (route === 'ask-wodi') {
        // An aside: Wodi answers it, then the logging carries on where it was. A board waiting for
        // them stays waiting, with its way back in on the answer.
        const waiting = waitingRef.current;
        await askWodiFor(text, sentId, { kind: 'logging', board: workout.rawText ?? '' }, waiting ? [DONE_CHIP] : []);
        if (!waiting) askNext();
        return;
      }
      if (reading.vibe) vibeRef.current = reading.vibe;
      const { applied, closed, swaps, corrected } = applyAnswers(reading.answers, [...slots, ...answered]);
      markAnswered(sentId, closed);
      const stillOpen = askedBefore != null && !sessionRef.current.closed.has(askedBefore);
      // Nothing landed on the question just asked: a bare "Got it." would claim it did, so only a
      // reaction to how it felt is said — then "Didn't catch that" and the question again.
      const missed = applied === 0 && stillOpen;
      const reaction = missed && !reading.vibe ? '' : reading.reaction;
      // A correction is said back as the new value — that, not a reaction, is what they need to see.
      if (corrected.length > 0) push({ from: 'wodi', text: `Changed — ${corrected.join(', ')}.` });
      else if (reaction) push({ from: 'wodi', text: reaction });
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
   * Wodi, the chat's one brain: it answers, writes them a workout, or says what it can't do yet.
   * `'log'` means the words were a workout to log — the caller reads them as a board.
   * `chips`: offered on the answer (a parked board's way back in).
   */
  const askWodiFor = async (
    text: string,
    sentId: string,
    situation: AskSituation,
    chips: ChatChipView[] = [],
  ): Promise<'answered' | 'log'> => {
    setBusy('thinking');
    try {
      // The message itself was just pushed; Ask Wodi takes it separately from the history.
      const reply = await callbacks.current.ask(text, recentTurns().slice(0, -1), situation);
      if (reply.kind === 'log') return 'log';
      if (reply.gap) callbacks.current.onGap(reply.gap, text);
      if (reply.kind === 'workout') {
        await readNewBoard(reply.board, null, sentId, { why: reply.why });
        return 'answered';
      }
      const answer = push({
        from: 'wodi',
        text: reply.text || "I couldn't find that in your log.",
        ...(reply.receipts.length ? { receipts: reply.receipts } : {}),
        ...(chips.length ? { chips } : {}),
      });
      const sent = messagesRef.current.find((m) => m.id === sentId) ?? null;
      keepIfBetweenWorkouts(sent, answer, offerToRemember(reply.proposedNote));
      return 'answered';
    } catch (err) {
      console.error('[TellWodi] ask failed', err);
      push({ from: 'wodi', text: 'My connection dropped for a sec — say that again?', ...(chips.length ? { chips } : {}) });
      return 'answered';
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
      const route = routeMessage({ hasBoard: !!sessionRef.current.workout, hasFile: !!file, text });
      if (route === 'open-form') {
        openStandardScreen('typed');
        return;
      }
      if (route === 'read-words') {
        await readWords(text, sentId);
        return;
      }
      if (route === 'ask-wodi') {
        if (await askWodiFor(text, sentId, { kind: 'between' }) === 'answered') return;
        // It was a workout, not a question.
        const board = callbacks.current.waitingBoard;
        if (board && routeWorkoutWords({ hasWaitingBoard: !!board.parsedWorkout }) === 'confirm-board') {
          askAboutWaitingBoard(text, sentId, board);
          return;
        }
      }
      await readNewBoard(text, file ?? null, sentId);
    })();
    // The helpers read refs only, so the callback never goes stale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commit, push]);

  /**
   * A new board from this message — a photo, or words that are the board and its results at once.
   * `suggested`: Wodi wrote this board for them (create_workout) — they haven't done it, so it's
   * offered to take on or swap, never asked about as a result.
   */
  const readNewBoard = async (text: string, file: File | null, sentId: string, suggested: { why: string } | null = null): Promise<void> => {
    // This message starts the workout's own chat.
    boardStartRef.current = Math.max(0, messagesRef.current.findIndex((m) => m.id === sentId));
    priorRef.current = [];
    setBusy('reading-board');
    try {
      // A photo is the board. Words alone are the board AND the results in one breath —
      // the same text parse the forms' "Say it or type it" uses.
      openBoard(await callbacks.current.readBoard(file ? { file } : { text }));
    } catch (err) {
      console.error('[TellWodi] board read failed', err);
      push({ from: 'wodi', text: "I couldn't read that board. Try another photo, or type the workout out." });
      setBusy(null);
      return;
    }
    setBusy(null);
    if (suggested) {
      offerSuggestedBoard(text, suggested.why);
      return;
    }
    if (!text) {
      const title = sessionRef.current.workout?.title?.trim();
      // Just the board — it could be before class or after. Ask rather than assume.
      push({
        from: 'wodi',
        text: `${title ? `Got it — ${title}.` : 'Got the board.'} Done it already, or heading in?`,
        chips: [DONE_CHIP, { label: 'Doing it later', action: 'later' }, STANDARD_SCREEN_CHIP],
      });
      return;
    }
    await readWords(text, sentId);
  };

  /** The workout Wodi just wrote, drawn as its board: take it on, or ask for another. */
  const offerSuggestedBoard = (board: string, why: string): void => {
    const workout = sessionRef.current.workout;
    const planned: PlannedWorkout = { id: 'suggested', userId: '', status: 'parsed', raw: board, parsedWorkout: workout ?? undefined, createdAt: new Date() };
    push({
      from: 'wodi',
      text: why || 'Here\'s one for you.',
      board: buildUnfinishedPoster(planned, new Date()),
      chips: [{ label: "Let's do it", action: 'later' }, ANOTHER_CHIP],
    });
  };

  /** "Something else": the written board is let go and Wodi writes a different one. */
  const anotherWorkout = async (sentId: string): Promise<void> => {
    const title = sessionRef.current.workout?.title?.trim();
    releaseBoard();
    const reply = await askWodiFor(`Write me a different workout${title ? ` than "${title}"` : ''}.`, sentId, { kind: 'between' });
    if (reply === 'log') push({ from: 'wodi', text: 'Tell me what you\'re after — time, kit or focus — and I\'ll write one.' });
  };

  /** "Is this the one?" — the waiting board drawn as its poster, so it's recognised by sight. */
  const askAboutWaitingBoard = (text: string, sentId: string, board: PlannedWorkout): void => {
    pendingWordsRef.current = { text, sentId, board };
    push({
      from: 'wodi',
      text: 'Is this the one you did?',
      board: buildUnfinishedPoster(board, new Date()),
      chips: [{ label: 'Yes, this one', action: 'this-board' }, { label: 'Something else', action: 'new-board' }],
    });
  };

  /** Their words are about the waiting board: the chat takes it on and reads them against it. */
  const takeWaitingBoard = (): void => {
    const pending = pendingWordsRef.current;
    pendingWordsRef.current = null;
    const workout = pending?.board.parsedWorkout;
    if (!pending || !workout) return;
    boardStartRef.current = Math.max(0, messagesRef.current.findIndex((m) => m.id === pending.sentId));
    priorRef.current = pending.board.chat?.messages ?? [];
    waitingRef.current = false;
    openBoard(workout);
    callbacks.current.onTakeBoard(pending.board);
    // Read once the screen holds this board — words that answer everything save at once, and the
    // save must be of this board (see the effect below).
    setTakenBoardWords({ text: pending.text, sentId: pending.sentId });
  };

  /**
   * They never did the board: it's cleared from Today and the chat lets go of it — nothing more is
   * kept on it, and the next words start fresh. Wodi doesn't make anything of it.
   */
  const dropBoard = (): void => {
    releaseBoard();
    push({ from: 'wodi', text: 'No worries — cleared it.' });
  };

  /** The chat lets go of its board: cleared from Today, and the next words start fresh. */
  const releaseBoard = (): void => {
    callbacks.current.onDropBoard();
    sessionRef.current = EMPTY_SESSION;
    waitingRef.current = false;
    priorRef.current = [];
    setHasBoard(false);
  };

  /** Over to the standard screen — everything said so far goes along when there's a board. */
  const openStandardScreen = (how: FormHandoff): void => {
    if (sessionRef.current.workout) callbacks.current.onOpenForms(sessionRef.current.results, how);
    else callbacks.current.onUseForm(how);
  };

  const tapChip = useCallback((messageId: string, chip: ChatChipView): void => {
    // Not yet: nothing said, nothing asked — the board stays saved, waiting, and the chat closes.
    if (chip.action === 'not-yet') waitingRef.current = true;
    commit(messagesRef.current.map((m) => (m.id === messageId ? { ...m, answered: true } : m)));
    if (chip.action === 'not-yet') {
      callbacks.current.onNotYet();
      return;
    }
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
    if (chip.action === 'another') {
      void anotherWorkout(said.id);
      return;
    }
    if (chip.action === 'nudge') {
      void callbacks.current.nudges.turnOn().then((result) => {
        push({ from: 'wodi', text: NUDGE_REPLY[result], chips: [DONE_CHIP] });
      });
      return;
    }
    if (chip.action === 'not-done') {
      dropBoard();
      return;
    }
    if (chip.action === 'this-board') {
      takeWaitingBoard();
      return;
    }
    if (chip.action === 'new-board') {
      const pending = pendingWordsRef.current;
      pendingWordsRef.current = null;
      if (pending) void readNewBoard(pending.text, null, pending.sentId);
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
    openBoard(workout);
    waitingRef.current = chat.waitingForWorkout;
    // The kept conversation is drawn below and saved from there — nothing goes ahead of it.
    priorRef.current = [];
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
    // The board first, in full — then they say what happened. Nothing is asked until "Done":
    // answers aren't kept on a waiting board (see SavedChat), so the questions start from there.
    // `asks` keeps this line out of the saved transcript until it's answered, so reopening again
    // shows it once, not stacked.
    push({
      from: 'wodi',
      text: resumeGreeting(chat.waitingForWorkout),
      preview: buildBoardPreview(workout),
      asks: true,
      chips: [DONE_CHIP, NOT_YET_CHIP, NOT_DONE_CHIP],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * "Change" on one of my answers: those questions open again and the next thing Wodi asks is
   * that one — the new answer replaces the old. The question that was waiting is asked after.
   */
  const changeAnswer = useCallback((messageId: string): void => {
    const message = messagesRef.current.find((m) => m.id === messageId);
    if (!message?.slotIds?.length || !sessionRef.current.workout) return;
    sessionRef.current = reopenSlots(sessionRef.current, message.slotIds);
    settleQuestions();
    commit(messagesRef.current.map((m) => (m.id === messageId ? { ...m, slotIds: undefined } : m)));
    askNext('No problem —');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commit]);

  // After the render that gave the screen the taken-on board — and after `callbacks` caught up
  // with it, the effect above this one — so a save these words finish saves that board.
  useEffect(() => {
    if (!takenBoardWords) return;
    setTakenBoardWords(null);
    void readWords(takenBoardWords.text, takenBoardWords.sentId);
    // readWords reads refs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [takenBoardWords]);

  const placeholder = [...messages].reverse().find((m) => m.from === 'wodi' && !m.answered && m.placeholder)?.placeholder
    ?? 'Message Wodi…';

  const openPanelId = [...messages].reverse().find((m) => m.panel && !m.answered)?.id ?? null;

  const posterReady = useCallback((saved: SavedPoster): void => setAwaitingCheer(saved), []);

  const saveFailed = useCallback((): void => {
    setBusy(null);
    setFinished(false);
    push({ from: 'wodi', text: "Couldn't save that — check your connection and try again.", chips: [DONE_CHIP] });
  }, [push]);

  return { messages, busy, send, tapChip, resume, changeAnswer, finished, logged, posterReady, saveFailed, hasBoard, placeholder, openPanelId };
}
