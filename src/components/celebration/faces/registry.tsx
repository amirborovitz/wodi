import type { CelebrationFace } from './types';
import { HandwrittenFace } from './HandwrittenFace';
import { GlassFace } from './GlassFace';

export const CELEBRATION_FACES: CelebrationFace[] = [
  { id: 'handwritten', label: 'Poster', component: HandwrittenFace },
  { id: 'glass', label: 'Stats', component: GlassFace },
];

export const DEFAULT_FACE_ID = 'handwritten';

export function getFace(id: string): CelebrationFace {
  return CELEBRATION_FACES.find((f) => f.id === id) ?? CELEBRATION_FACES[0];
}
