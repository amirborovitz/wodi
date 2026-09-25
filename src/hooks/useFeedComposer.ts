/**
 * The draft behind the feed composer.
 *
 * A POST IS NOT A WORKOUT. The composer holds three things in descending order
 * of necessity — a photo, a workout, a line of text — and only the first is
 * required. Nothing here treats the workout as the point: attaching one is a
 * choice the athlete makes after they have already picked the picture.
 *
 * All of the state lives here so the composer screen only renders. That matters
 * more than usual for this one, because the draft outlives a camera and a
 * scroll through the roll, and the moment any of them owned a piece of it the
 * "what will I actually post" question had more than one place to look.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePosterPayload } from './usePosterPayload';
import { usePostToFeed } from './usePostToFeed';
import { feedTrainedFrom } from '../services/feed/trained';
import type { FeedTrained } from '../services/feed/types';
import type { PosterPayload } from '../components/celebration/faces/HandwrittenFace/posterPayload';
import type { WorkoutWithStats } from './useWorkouts';

/**
 * A workout dressed for the composer: the poster it will publish, when it was
 * trained, and whether it set a record.
 *
 * `workoutId` is identity only — which card in the rail is lit. It is
 * deliberately NOT written to the post: a post is a snapshot, not a pointer at
 * a workout that can still change. Absent when the poster came straight off the
 * celebration screen, where the athlete may be looking at skin and vibe edits
 * that are not saved yet.
 */
export interface ComposerWod {
  workoutId?: string;
  payload: PosterPayload;
  trained: FeedTrained;
  isPR: boolean;
}

/**
 * One photo the athlete has put in play this session, and the object URL
 * previewing it. Created and freed as one.
 */
export interface PickedPhoto {
  id: string;
  file: File;
  url: string;
}

/**
 * Turns one saved workout into an attachment. A hook, because building a poster
 * runs the whole celebration pipeline — so a rail of candidates is a rail of
 * components, one per card, not a loop in here.
 */
export function useComposerWod(workout: WorkoutWithStats | undefined): ComposerWod | null {
  const payload = usePosterPayload(workout);
  return useMemo(() => (workout && payload ? {
    workoutId: workout.id,
    payload,
    trained: feedTrainedFrom(workout),
    isPR: workout.isPR ?? false,
  } : null), [workout, payload]);
}

export interface UseFeedComposerResult {
  /**
   * Everything put in play this session, newest first. This is the composer's
   * "recents" strip — the browser cannot read the device's camera roll, so the
   * roll it shows is the one the athlete has handed it.
   */
  photos: readonly PickedPhoto[];
  /** The one on the post. */
  photo: PickedPhoto | null;
  /** Adds to the roll and selects it, because a photo just taken is the one you meant. */
  addPhotos: (files: readonly File[]) => void;
  selectPhoto: (id: string) => void;
  wod: ComposerWod | null;
  /** Tapping the attached workout again detaches it — the rail is a toggle, not a menu. */
  toggleWod: (wod: ComposerWod) => void;
  text: string;
  setText: (text: string) => void;
  /** A post is a photo first. See FeedPost. */
  canPost: boolean;
  posting: boolean;
  /** Why the last attempt failed. The composer stays open and says so. */
  error: string | null;
  /** First post: the composer still owes them the 24h explanation. */
  explain: boolean;
  publish: () => void;
}

export function useFeedComposer(initialWod: ComposerWod | null, onPosted: () => void): UseFeedComposerResult {
  const [text, setText] = useState('');
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [wod, setWod] = useState<ComposerWod | null>(initialWod);
  const feed = usePostToFeed();

  // Every object URL handed out, so they can all be handed back on the way out.
  // A ref rather than the state itself: the cleanup has to run exactly once, at
  // unmount, and a dependency on `photos` would revoke the previous roll every
  // time a photo is added — including the ones still on screen.
  const urls = useRef<string[]>([]);
  useEffect(() => () => { urls.current.forEach(URL.revokeObjectURL); }, []);

  const addPhotos = useCallback((files: readonly File[]): void => {
    if (files.length === 0) return;
    const added = files.map((file, index) => ({
      id: `${Date.now()}-${index}`,
      file,
      url: URL.createObjectURL(file),
    }));
    urls.current.push(...added.map((photo) => photo.url));
    setPhotos((previous) => [...added, ...previous]);
    // The newest is selected on arrival: someone who just took a photo, or just
    // picked one, has already made the choice this step exists to ask about.
    setSelectedId(added[0].id);
  }, []);

  const toggleWod = useCallback((next: ComposerWod): void => {
    setWod((current) => (current?.workoutId === next.workoutId ? null : next));
  }, []);

  const photo = photos.find((candidate) => candidate.id === selectedId) ?? null;

  const publish = useCallback((): void => {
    if (!photo) return;
    feed.post({
      photoFile: photo.file,
      poster: wod?.payload,
      trained: wod?.trained,
      caption: text,
      isPR: wod?.isPR ?? false,
    }, onPosted);
  }, [feed, photo, wod, text, onPosted]);

  return {
    photos,
    photo,
    addPhotos,
    selectPhoto: setSelectedId,
    wod,
    toggleWod,
    text,
    setText,
    canPost: photo != null,
    posting: feed.posting,
    error: feed.error,
    explain: feed.needsConfirm,
    publish,
  };
}
