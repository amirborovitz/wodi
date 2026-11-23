/** The isolated print process receives only the authenticated owner's weight, never a Firebase session. */
export function useAuth(): { user: { weight?: number } } {
  return { user: { weight: window.wodiRenderWeight } };
}
declare global { interface Window { wodiRenderWeight?: number } }
