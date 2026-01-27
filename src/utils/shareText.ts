import type { RingMetric, Achievement } from '../types';

/**
 * Get a fun, celebratory message about volume lifted
 */
export function getVolumeMessage(kg: number): string {
  const tons = kg / 1000;

  if (tons >= 10) return `You moved ${tons.toFixed(1)} tons today! Beast mode!`;
  if (tons >= 5) return `${tons.toFixed(1)} tons lifted! Unstoppable!`;
  if (tons >= 2) return `You lifted ${tons.toFixed(1)} tons!`;
  if (tons >= 1) return `${tons.toFixed(1)} tons of iron moved!`;
  if (kg >= 500) return `${Math.round(kg)}kg lifted! Strong work!`;
  if (kg >= 100) return `${Math.round(kg)}kg moved! Keep pushing!`;
  return 'Every rep counts!';
}

/**
 * Get a short celebration tag based on achievement type
 */
export function getCelebrationEmoji(type?: Achievement['type']): string {
  const tagMap: Record<string, string> = {
    pr: 'PR',
    benchmark: 'BM',
    streak: 'STREAK',
    milestone: 'MILE',
    generic: 'NICE',
  };
  return tagMap[type || 'generic'] || 'NICE';
}

/**
 * Get icon tag for achievement display
 */
export function getAchievementIconEmoji(icon?: string): string {
  const iconMap: Record<string, string> = {
    trophy: 'TROPHY',
    fire: 'FIRE',
    star: 'STAR',
    medal: 'MEDAL',
    crown: 'CROWN',
  };
  return iconMap[icon || 'trophy'] || 'TROPHY';
}

/**
 * Calculate XP from ring metrics (weighted average scaled to ~0-1000)
 */
export function calculateXP(rings: RingMetric[]): number {
  if (!rings || rings.length === 0) return 0;

  const weights: Record<string, number> = {
    intensity: 0.4,
    volume: 0.35,
    consistency: 0.25,
  };

  let totalXP = 0;
  let totalWeight = 0;

  rings.forEach((ring) => {
    const weight = weights[ring.id] || 0.33;
    totalXP += ring.percentage * weight * 10;
    totalWeight += weight;
  });

  // Normalize if weights don't sum to 1
  if (totalWeight > 0 && totalWeight !== 1) {
    totalXP = totalXP / totalWeight;
  }

  return Math.round(totalXP);
}

/**
 * Format duration in a friendly way
 */
export function formatDurationFriendly(mins: number): string {
  if (mins < 1) return '<1m';
  if (mins < 60) return `${Math.round(mins)}m`;
  const hours = Math.floor(mins / 60);
  const remainingMins = Math.round(mins % 60);
  if (remainingMins === 0) return `${hours}h`;
  return `${hours}h ${remainingMins}m`;
}

/**
 * Format volume with appropriate units
 */
export function formatVolumeFriendly(kg: number): string {
  if (kg >= 1000) return `${(kg / 1000).toFixed(1)}t`;
  return `${Math.round(kg)}kg`;
}

/**
 * Format date for display
 */
export function formatShareDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Get workout type tag
 */
export function getWorkoutTypeEmoji(type: string): string {
  const typeTags: Record<string, string> = {
    strength: 'STR',
    metcon: 'MET',
    emom: 'EMOM',
    amrap: 'AMRAP',
    for_time: 'FT',
    mixed: 'MIX',
  };
  return typeTags[type] || 'WOD';
}
