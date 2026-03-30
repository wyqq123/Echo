import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useUserStore } from './useUserStore';

export type AuthUser = { id: string; email: string; createdAt: string };

type AuthState = {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  setSession: (s: { user: AuthUser; accessToken: string; refreshToken: string }) => void;
  clearSession: () => void;
  tryRefresh: () => Promise<boolean>;
  refreshAccessIfNeeded: () => Promise<void>;
  logout: () => Promise<void>;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,

      setSession: ({ user, accessToken, refreshToken }) => {
        useUserStore.setState({ tasks: [], focusThemes: [] });
        set({ user, accessToken, refreshToken });
      },

      clearSession: () => {
        set({ user: null, accessToken: null, refreshToken: null });
        useUserStore.setState({ tasks: [], focusThemes: [] });
      },

      tryRefresh: async () => {
        const rt = get().refreshToken;
        if (!rt) return false;
        const res = await fetch('/api/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: rt }),
        });
        if (!res.ok) {
          get().clearSession();
          return false;
        }
        const data = (await res.json()) as { user: AuthUser; accessToken: string };
        set({ user: data.user, accessToken: data.accessToken });
        return true;
      },

      refreshAccessIfNeeded: async () => {
        if (get().accessToken) return;
        if (!get().refreshToken) return;
        await get().tryRefresh();
      },

      logout: async () => {
        const rt = get().refreshToken;
        try {
          await fetch('/api/auth/logout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken: rt }),
          });
        } catch {
          /* ignore network errors */
        }
        get().clearSession();
      },
    }),
    {
      name: 'echo-auth-v1',
      partialize: (s) => ({
        refreshToken: s.refreshToken,
        user: s.user,
      }),
    }
  )
);
