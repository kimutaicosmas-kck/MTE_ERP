import { create } from "zustand";
import { api, getToken, setToken } from "./api";
import { isOnline } from "./offline";

export type User = {
  id: string;
  name: string;
  email: string;
  role: string;
  department?: string;
  modules?: string[];
  phone?: string | null;
  avatarUrl?: string | null;
  jobTitle?: string | null;
  monthlyTarget?: number;
  mfaEnabled?: boolean;
};

type AuthState = {
  user: User | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<{ mfaRequired?: boolean; ticket?: string } | void>;
  finishMfa: (ticket: string, code: string) => Promise<void>;
  logout: () => void;
  hydrate: () => Promise<void>;
  setUser: (user: User) => void;
};

export const useAuth = create<AuthState>((set) => ({
  user: null,
  ready: false,
  async login(email, password) {
    const data = await api<{ token?: string; user?: User; mfaRequired?: boolean; ticket?: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    if (data.mfaRequired && data.ticket) return { mfaRequired: true, ticket: data.ticket };
    if (!data.token || !data.user) throw new Error("Sign in failed");
    setToken(data.token);
    localStorage.setItem("mte_user", JSON.stringify(data.user));
    localStorage.setItem("mte_last_active", String(Date.now()));
    set({ user: data.user });
  },
  async finishMfa(ticket, code) {
    const data = await api<{ token: string; user: User }>("/api/auth/mfa", {
      method: "POST",
      body: JSON.stringify({ ticket, code }),
    });
    setToken(data.token);
    localStorage.setItem("mte_user", JSON.stringify(data.user));
    localStorage.setItem("mte_last_active", String(Date.now()));
    set({ user: data.user });
  },
  logout() {
    const token = getToken();
    if (token) {
      fetch("/api/auth/logout", { method: "POST", headers: { Authorization: `Bearer ${token}` } }).catch(() => undefined);
    }
    setToken(null);
    localStorage.removeItem("mte_user");
    localStorage.removeItem("mte_last_active");
    set({ user: null });
  },
  setUser(user) {
    localStorage.setItem("mte_user", JSON.stringify(user));
    set({ user });
  },
  async hydrate() {
    const cached = localStorage.getItem("mte_user");
    const cachedUser = cached ? (JSON.parse(cached) as User) : null;
    if (!getToken()) {
      set({ ready: true, user: null });
      return;
    }
    if (cachedUser) set({ user: cachedUser });
    try {
      const user = await api<User>("/api/auth/me");
      localStorage.setItem("mte_user", JSON.stringify(user));
      localStorage.setItem("mte_last_active", String(Date.now()));
      set({ user, ready: true });
    } catch {
      if (!isOnline() && cachedUser) {
        set({ user: cachedUser, ready: true });
        return;
      }
      setToken(null);
      localStorage.removeItem("mte_user");
      localStorage.removeItem("mte_last_active");
      set({ user: null, ready: true });
    }
  },
}));
