"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";

export type HumanDecision = {
  approver: string;
  decision: "approved" | "denied";
  at: string;
  comment?: string;
} | null;

export interface AccessRequest {
  id: string;
  requesterId: string;
  status: "pending" | "approved" | "denied" | "cancelled";
  managerApprover: string | null;
  ownerApprover: string | null;
  managerDecision: HumanDecision;
  ownerDecision: HumanDecision;
  role?: { name: string; application?: { name: string } };
  /** ADR-017 — the batch instance this request belongs to (null for a standalone single request). */
  batchId?: string | null;
  batchLabel?: string | null;
}

export interface Role {
  id: string;
  name: string;
}
export interface Application {
  id: string;
  name: string;
  roles: Role[];
}

/** The un-decided legs of a request assigned to `me` (the four-eyes inbox predicate). */
export function myOpenLegs(r: AccessRequest, me: string): ("manager" | "owner")[] {
  if (r.status !== "pending") return [];
  const legs: ("manager" | "owner")[] = [];
  if (r.managerApprover === me && !r.managerDecision) legs.push("manager");
  if (r.ownerApprover === me && !r.ownerDecision) legs.push("owner");
  return legs;
}

/** Applications (catalog, for the request form) + all requests the caller may see, with a reload. */
export function useAccessData() {
  const [apps, setApps] = useState<Application[]>([]);
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [a, r] = await Promise.all([
        api<Application[]>("/applications"),
        api<AccessRequest[]>("/requests"),
      ]);
      setApps(a);
      setRequests(r);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([api<Application[]>("/applications"), api<AccessRequest[]>("/requests")])
      .then(([a, r]) => {
        if (active) {
          setApps(a);
          setRequests(r);
          setError(null);
        }
      })
      .catch((e) => active && setError(e instanceof ApiError ? e.message : String(e)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  return { apps, requests, loading, error, reload, setError };
}
