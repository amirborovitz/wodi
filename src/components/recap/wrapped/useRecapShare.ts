/**
 * Getting a recap poster out of the app.
 *
 * One path, two buttons: the finale card in the story, and the share control on
 * the Me hero. Both capture the same `WrappedFinaleCard` node and hand it to
 * the native sheet, falling back to a download where the sheet doesn't exist —
 * a share that silently does nothing is the one failure a poster studio can't
 * afford.
 */

import { useCallback, useState } from 'react';
import { canvasToBlob, downloadBlob, elementToCanvas, shareImage } from '../../../utils/shareUtils';
import type { RecapData } from '../../../hooks/useRecapData';

export interface RecapShare {
  sharing: boolean;
  shareNode: (node: HTMLElement | null, data: RecapData) => Promise<void>;
}

export function useRecapShare(): RecapShare {
  const [sharing, setSharing] = useState(false);

  const shareNode = useCallback(async (node: HTMLElement | null, data: RecapData) => {
    if (!node || sharing) return;
    setSharing(true);
    try {
      const canvas = await elementToCanvas(node, { scale: 3 });
      const blob = await canvasToBlob(canvas, 'png');
      const shared = await shareImage(blob, `wodi ${data.period} wrapped`);
      if (!shared) {
        downloadBlob(blob, `wodi-wrapped-${data.period.toLowerCase()}-${data.periodSub}.png`);
      }
    } catch (err) {
      console.error('[Wrapped] share failed:', err);
    } finally {
      setSharing(false);
    }
  }, [sharing]);

  return { sharing, shareNode };
}
