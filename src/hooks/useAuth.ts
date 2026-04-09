"use client";

import { createContext, useContext } from "react";
import type { User } from "@supabase/supabase-js";

export interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  /** Optional path after OAuth (e.g. `/projects/new`); defaults to `/projects`. */
  signIn: (nextPath?: string) => Promise<void>;
  /**
   * Opens Google OAuth in a popup when possible (returns true).
   * Returns false if the URL could not be obtained or the popup was blocked.
   */
  signInGooglePopup: (nextPath?: string) => Promise<boolean>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoading: true,
  signIn: (_nextPath?: string) => Promise.resolve(),
  signInGooglePopup: () => Promise.resolve(false),
  signOut: () => Promise.resolve(),
});

export function useAuth() {
  return useContext(AuthContext);
}
