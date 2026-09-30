import { create } from "zustand";
import { api, getToken, setToken } from "./api";

export type User = { id: string; name: string; email: string; role: string };

type AuthState = {
  user: User | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  hydrate: () => Promise<void>;
};

export const useAuth = create<AuthState>((set) => ({
  user: null,
  ready: false,
  async login(email, password) {
    const data = await api<{ token: string; user: User }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setToken(data.token);
    set({ user: data.user });
  },
  logout() {
    setToken(null);
    set({ user: null });
  },
  async hydrate() {
    if (!getToken()) {
      set({ ready: true, user: null });
      return;
    }
    try {
      const user = await api<User>("/api/auth/me");
      set({ user, ready: true });
    } catch {
      setToken(null);
      set({ user: null, ready: true });
    }
  },
}));
