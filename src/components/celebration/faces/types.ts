import type React from 'react';
import type { CelebrationData } from '../../../hooks/useCelebrationData';
import type { PosterCustomizationUpdate } from '../../../hooks/usePosterCustomization';

export interface CelebrationFaceProps {
  data: CelebrationData;
  mode: 'reward' | 'detail';
  onBack?: () => void;
  onDone?: () => void;
  onEdit?: () => void;
  onPosterCustomizationChange?: (update: PosterCustomizationUpdate) => void;
}

export interface CelebrationFace {
  id: string;
  label: string;
  component: React.ComponentType<CelebrationFaceProps>;
}
