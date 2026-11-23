import { createRoot } from 'react-dom/client';
import { usePosterPayload } from '../../src/hooks/usePosterPayload';
import { PosterCard } from '../../src/components/celebration/faces/HandwrittenFace/PosterCard';
import { SKINS } from '../../src/components/celebration/faces/HandwrittenFace/skinRegistry';
import type { WorkoutWithStats } from '../../src/hooks/useWorkouts';
import '@fontsource/barlow/400.css';
import '@fontsource/barlow/600.css';
import '@fontsource/barlow/700.css';
import '@fontsource/barlow/800.css';
import '@fontsource/barlow/900.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/barlow-condensed/800.css';
import '@fontsource/barlow-condensed/900.css';
import '@fontsource/caveat/400.css';
import '@fontsource/caveat/700.css';
import '@fontsource/dm-mono/400.css';
import '@fontsource/archivo-black/400.css';

function Print({ workout }: { workout: WorkoutWithStats }): React.ReactElement | null {
  const payload = usePosterPayload(workout);
  return payload ? <>{payload.wods.map((_, page) => <div className="poster-page" key={page}><PosterCard payload={payload} page={page} /></div>)}</> : null;
}
window.wodiSkins = SKINS.map(s => s.id);
window.wodiRender = (workout, weight): void => {
  window.wodiRenderWeight = weight;
  createRoot(document.getElementById('root')!).render(<Print workout={{ ...workout, date: new Date(workout.date), createdAt: new Date(workout.createdAt), updatedAt: new Date(workout.updatedAt) }} />);
};
declare global {
  interface Window {
    wodiSkins: string[];
    wodiRender: (workout: WorkoutWithStats, weight?: number) => void;
  }
}
