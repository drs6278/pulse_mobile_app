// Web: use the browser's own localStorage. During static rendering on the
// server there is no window, so return undefined and let supabase-js keep the
// session in memory for that render.
export const authStorage: Storage | undefined =
  typeof window === 'undefined' ? undefined : window.localStorage;
