"use client";

import { useEffect, useState } from "react";

export interface Me {
  id: string;
  username: string; // matricule
  email?: string;
  groups: string[];
  isAdmin: boolean;
}

export type MeState =
  | { status: "loading"; me: null }
  | { status: "authed"; me: Me }
  | { status: "anon"; me: null };

/**
 * The signed-in principal, from `/api/auth/me`. `anon` → not authenticated (send to sign-in);
 * `authed` → the session user (drives role-aware nav + the @AdminOnly surfaces). No throw: a 401
 * is a normal `anon` result, not an error.
 */
export function useMe(): MeState {
  const [state, setState] = useState<MeState>({ status: "loading", me: null });
  useEffect(() => {
    let active = true;
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => (r.ok ? (r.json() as Promise<Me>) : null))
      .then((me) => active && setState(me ? { status: "authed", me } : { status: "anon", me: null }))
      .catch(() => active && setState({ status: "anon", me: null }));
    return () => {
      active = false;
    };
  }, []);
  return state;
}
