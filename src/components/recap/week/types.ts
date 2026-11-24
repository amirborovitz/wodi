import type { WeekPage, WeekPosterData } from '../../../hooks/useWeekPosterData';

export type { WeekPage };

/** The week poster renders the same week on either page, and takes nothing else. */
export interface WeekPosterProps {
  week: WeekPosterData;
  page: WeekPage;
}
