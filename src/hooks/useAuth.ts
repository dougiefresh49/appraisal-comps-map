"use client";

import { createContext, useContext } from "react";
import type { User } from "@supabase/supabase-js";

export interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  /** Optional path after OAuth (e.g. `/projects/new`); defaults to `/projects`. */
  signIn: (nextPath?: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoading: true,
  signIn: (_nextPath?: string) => Promise.resolve(),
  signOut: () => Promise.resolve(),
});

export function useAuth() {
  return useContext(AuthContext);
}
