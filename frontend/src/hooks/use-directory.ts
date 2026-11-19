"use client";

import { useEffect, useState } from "react";

export interface DirUser {
  username: string; // matricule
  name?: string;
  email?: string;
}

/**
 * The Authentik directory keyed by matricule (= username), for resolving matricule → name across the UI
 * (we keep BOTH — the matricule is the key, the name is the human). Tolerant: if the endpoint is
 * unavailable the map is empty and `<PersonLabel>` falls back to the matricule only.
 */
export function useDirectory(): Map<string, DirUser> {
  const [byMatricule, setMap] = useState<Map<string, DirUser>>(new Map());
  useEffect(() => {
    let active = true;
    fetch("/api/directory/users", { credentials: "include" })
      .then((r) => (r.ok ? (r.json() as Promise<DirUser[]>) : []))
      .then((list) => {
        if (active && Array.isArray(list)) setMap(new Map(list.map((u) => [u.username, u])));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  return byMatricule;
}
