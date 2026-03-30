import type { Task, FocusTheme } from '../types';
import type { FunnelScript } from './geminiService';
import { useAuthStore } from '../store/useAuthStore';

async function parseError(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: string };
    return j.error || res.statusText;
  } catch {
    return res.statusText;
  }
}

async function authFetch(path: string, init?: RequestInit): Promise<Response> {
  const build = () => {
    const token = useAuthStore.getState().accessToken;
    const headers = new Headers(init?.headers);
    if (!headers.has('Content-Type') && init?.body) {
      headers.set('Content-Type', 'application/json');
    }
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return fetch(path, { ...init, headers });
  };

  let res = await build();
  if (res.status === 401) {
    const refreshed = await useAuthStore.getState().tryRefresh();
    if (refreshed) res = await build();
  }
  return res;
}

export async function fetchTasks(): Promise<Task[]> {
  const res = await authFetch('/api/tasks');
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as { tasks: Task[] };
  return data.tasks ?? [];
}

export async function saveTasks(tasks: Task[]): Promise<void> {
  const res = await authFetch('/api/tasks', {
    method: 'PUT',
    body: JSON.stringify({ tasks }),
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function fetchFocusThemes(): Promise<FocusTheme[]> {
  const res = await authFetch('/api/focus-themes');
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as { themes: FocusTheme[] };
  return data.themes ?? [];
}

export async function saveFocusThemes(themes: FocusTheme[]): Promise<void> {
  const res = await authFetch('/api/focus-themes', {
    method: 'PUT',
    body: JSON.stringify({ themes }),
  });
  if (!res.ok) throw new Error(await parseError(res));
}

/** Optional analytics row; fails silently if unauthenticated or network error. */
export async function logFunnelRun(payload: {
  isSubsequent: boolean;
  script: FunnelScript;
  inputSummary?: string;
}): Promise<void> {
  if (!useAuthStore.getState().accessToken) return;
  try {
    const res = await authFetch('/api/funnel-runs', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (!res.ok) console.warn('[funnel-runs]', await parseError(res));
  } catch (e) {
    console.warn('[funnel-runs]', e);
  }
}
