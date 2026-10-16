import { isSupabaseConfigured, supabase } from "@/shared/api/supabase";
import type { Session, User } from "@supabase/supabase-js";

export type SessionSnapshot = {
  session: Session | null;
  user: User | null;
};

export async function getSessionSnapshot(): Promise<SessionSnapshot> {
  if (!isSupabaseConfigured || !supabase) {
    return { session: null, user: null };
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return {
    session: data.session,
    user: data.session?.user ?? null,
  };
}

export async function signInWithPassword(email: string, password: string) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Supabase не настроен");
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) throw error;
  return data;
}

export type SignUpResult = {
  session: Session | null;
  user: User | null;
  /** True when auth user was created but email confirmation is required. */
  needsEmailConfirmation: boolean;
};

export async function signUpWithPassword(input: {
  email: string;
  password: string;
  fullName: string;
}): Promise<SignUpResult> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Supabase не настроен");
  }

  const email = input.email.trim().toLowerCase();
  const fullName = input.fullName.trim();

  const { data, error } = await supabase.auth.signUp({
    email,
    password: input.password,
    options: {
      data: {
        full_name: fullName,
      },
    },
  });
  if (error) throw error;

  const user = data.user;
  const session = data.session;

  // Supabase returns a user without session when email confirmation is on.
  // Identities empty = existing email (project setting "Prevent duplicate").
  if (
    user &&
    !session &&
    Array.isArray(user.identities) &&
    user.identities.length === 0
  ) {
    throw new Error("User already registered");
  }

  return {
    session,
    user,
    needsEmailConfirmation: Boolean(user && !session),
  };
}

export async function signOut() {
  if (!isSupabaseConfigured || !supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export function subscribeAuth(
  listener: (snapshot: SessionSnapshot) => void,
): () => void {
  if (!isSupabaseConfigured || !supabase) {
    return () => undefined;
  }

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    listener({
      session,
      user: session?.user ?? null,
    });
  });

  return () => {
    subscription.unsubscribe();
  };
}
