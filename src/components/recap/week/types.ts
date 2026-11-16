import type { WeekPosterData } from '../../../hooks/useWeekPosterData';

/**
 * Which poster of the week to draw. The week is the main one; the body page shows what
 * the week worked. One skin draws both, so the two always share a surface.
 */
export type WeekPage = 'week' | 'body';

/** Every week skin renders the same week, on one of its two pages, and takes nothing else. */
export interface WeekSkinProps {
  week: WeekPosterData;
  page: WeekPage;
}
