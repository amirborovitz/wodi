import { createContext } from 'react';
import type { PosterDateEditor } from '../../../../hooks/usePosterDate';

/**
 * Present only around the poster the athlete is editing. Everywhere else a skin renders —
 * thumbnails, the feed, the post preview — there is no provider, so the date is plain text.
 */
export const PosterDateContext = createContext<PosterDateEditor | null>(null);
