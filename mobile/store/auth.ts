import { create } from "zustand";
import * as SecureStore from "expo-secure-store";

interface AuthUser { id: string; name: string; email: string; role: string }

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  hydrated: boolean;
  setAuth: (user: AuthUser, token: string) => Promise<void>;
  clearAuth: () => Promise<void>;
  hydrate: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  hydrated: false,

  setAuth: async (user, token) => {
    await SecureStore.setItemAsync("session_token", token);
    await SecureStore.setItemAsync("session_user", JSON.stringify(user));
    set({ user, token });
  },

  clearAuth: async () => {
    await SecureStore.deleteItemAsync("session_token");
    await SecureStore.deleteItemAsync("session_user");
    set({ user: null, token: null });
  },

  hydrate: async () => {
    const token = await SecureStore.getItemAsync("session_token");
    const raw = await SecureStore.getItemAsync("session_user");
    const user = raw ? (JSON.parse(raw) as AuthUser) : null;
    set({ user, token, hydrated: true });
  },
}));
