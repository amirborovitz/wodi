import { useCallback, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import type { Workout } from '../types';
import { toIsoDate } from '../utils/workoutDate';
import { buildWorkoutExport, toAgentText } from '../services/export/workoutExport';

export type ExportResult = 'copied' | 'downloaded' | 'failed';

export interface WorkoutExportActions {
  /** There is something to hand over. */
  available: boolean;
  /** A saved file is a desk thing — on a phone it vanishes into Files. */
  canDownload: boolean;
  /** The whole log as a JSON file — for an agent that reads files. */
  downloadJson: () => ExportResult;
  /** The whole log as one line per workout, on the clipboard — for an agent you chat to. */
  copyForAgent: () => Promise<ExportResult>;
}

function isDesktop(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia?.('(hover: hover) and (pointer: fine)').matches === true;
}

function saveFile(name: string, contents: string, type: string): ExportResult {
  try {
    const url = URL.createObjectURL(new Blob([contents], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    // Freed on the next tick: revoking synchronously can beat the browser to the download.
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    return 'downloaded';
  } catch (error) {
    console.error('Workout export failed:', error);
    return 'failed';
  }
}

/**
 * The athlete's whole log, handed to whatever they want to read it with.
 *
 * Both routes leave the machine only if the athlete sends them somewhere: one writes a file,
 * one fills the clipboard. Nothing is uploaded and no key is needed.
 */
export function useWorkoutExport(workouts: readonly Workout[]): WorkoutExportActions {
  const { user } = useAuth();
  const [desktop] = useState(() => isDesktop());

  const build = useCallback(
    () => buildWorkoutExport(workouts, user?.displayName?.split(' ')[0]),
    [workouts, user?.displayName],
  );

  const downloadJson = useCallback((): ExportResult => saveFile(
    `wodi-workouts-${toIsoDate(new Date())}.json`,
    JSON.stringify(build(), null, 2),
    'application/json',
  ), [build]);

  const copyForAgent = useCallback(async (): Promise<ExportResult> => {
    const text = toAgentText(build());
    try {
      await navigator.clipboard.writeText(text);
      return 'copied';
    } catch (error) {
      // Clipboard blocked (no permission, or an insecure context) — the log is still worth
      // handing over, so it falls back to the file rather than failing silently.
      console.error('Clipboard copy failed:', error);
      return saveFile(`wodi-workouts-${toIsoDate(new Date())}.txt`, text, 'text/plain');
    }
  }, [build]);

  return {
    available: workouts.length > 0,
    canDownload: desktop,
    downloadJson,
    copyForAgent,
  };
}
