"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "~/utils/supabase/client";
import { AuthContext, type AuthContextValue } from "~/hooks/useAuth";

export function SupabaseAuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  const oauthOptions = useCallback(
    (nextPath?: string) => {
      const next = nextPath?.startsWith("/") ? nextPath : "/projects";
      return {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        queryParams: { access_type: "offline" as const },
        scopes:
          "https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets" as const,
      };
    },
    [],
  );

  const signIn = useCallback(
    async (nextPath?: string) => {
      await supabase.auth.signInWithOAuth({
        provider: "google",
        options: oauthOptions(nextPath),
      });
    },
    [supabase, oauthOptions],
  );

  const signInGooglePopup = useCallback(
    async (nextPath?: string): Promise<boolean> => {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          ...oauthOptions(nextPath),
          skipBrowserRedirect: true,
        },
      });
      if (error ?? !data.url) {
        return false;
      }
      const popup = window.open(
        data.url,
        "google-drive-reauth",
        "width=520,height=720,scrollbars=yes",
      );
      return popup !== null;
    },
    [supabase, oauthOptions],
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, [supabase]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, isLoading, signIn, signInGooglePopup, signOut }),
    [user, isLoading, signIn, signInGooglePopup, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
