"use client";

/* My requests — track the access I've requested (lifecycle + cancel a pending one). */

import Link from "next/link";
import { FilePlus2, ListChecks } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { useMe } from "@/hooks/use-me";
import { useAccessData } from "@/hooks/use-access-data";
import { useDirectory } from "@/hooks/use-directory";
import { AppShell } from "@/components/app-shell";
import { RequestCard } from "@/components/access/request-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function MyRequestsPage() {
  const meState = useMe();
  const myName = meState.status === "authed" ? meState.me.username : "";
  const dir = useDirectory();
  const nameOf = (m?: string | null) => (m ? dir.get(m)?.name : undefined);
  const { requests, loading, error, reload } = useAccessData();

  const mine = requests.filter((r) => r.requesterId === myName);

  // ADR-017 — group a multi-role "demande" under its batch instance; standalone requests stay ungrouped.
  const standalone = mine.filter((r) => !r.batchId);
  const batchMap = new Map<string, typeof mine>();
  for (const r of mine) {
    if (!r.batchId) continue;
    batchMap.set(r.batchId, [...(batchMap.get(r.batchId) ?? []), r]);
  }
  const batches = [...batchMap.entries()];

  const cancel = async (id: string) => {
    try {
      await api(`/requests/${id}/cancel`, { method: "POST" });
      toast.success("Request cancelled");
      await reload();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : String(e));
    }
  };

  return (
    <AppShell
      title="My requests"
      actions={
        <Button asChild variant="brand" size="sm">
          <Link href="/me/request">
            <FilePlus2 className="size-4" /> Request access
          </Link>
        </Button>
      }
    >
      {error && (
        <Card className="mb-4 border-destructive/40 p-4 text-sm text-destructive">Error: {error}</Card>
      )}
      {loading ? (
        <Skeleton className="h-40 w-full" />
      ) : mine.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-12 text-center">
          <ListChecks className="size-7 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">You haven&apos;t requested any access yet.</p>
          <Button asChild variant="brand" size="sm" className="mt-1">
            <Link href="/me/request">Request access</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* ADR-017 — batch "demandes": one instance, N roles, each with its own four-eyes */}
          {batches.map(([batchId, reqs]) => {
            const granted = reqs.filter((r) => r.status === "approved").length;
            const blocked = reqs.filter(
              (r) => r.status === "pending" && (r.managerDecision || r.ownerDecision),
            ).length;
            const label = reqs[0].batchLabel;
            return (
              <Card key={batchId} className="border-primary/30 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">
                      {label || "Batch request"}{" "}
                      <span className="font-mono text-xs text-muted-foreground">
                        #{batchId.slice(0, 8)}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {reqs.length} roles · {granted} granted
                      {blocked > 0 && ` · ${blocked} waiting on an approval`}
                    </p>
                  </div>
                </div>
                <div className="space-y-3">
                  {reqs.map((r) => (
                    <RequestCard
                      key={r.id}
                      req={r}
                      me={myName}
                      nameOf={nameOf}
                      onCancel={() => cancel(r.id)}
                    />
                  ))}
                </div>
              </Card>
            );
          })}

          {/* standalone single-role requests */}
          {standalone.map((r) => (
            <RequestCard key={r.id} req={r} me={myName} nameOf={nameOf} onCancel={() => cancel(r.id)} />
          ))}
        </div>
      )}
    </AppShell>
  );
}
