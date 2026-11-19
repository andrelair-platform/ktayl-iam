"use client";

/* Access requests — the admin workflow console. All requests + their four-eyes state; unblock a stuck
   leg via the audited admin override (act as the assigned approver — a dedicated reassign endpoint is a
   backend follow-up); trigger a reconcile; export the audit (Audit log page). */

import { RefreshCcw } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function AdminRequestsPage() {
  const meState = useMe();
  const myName = meState.status === "authed" ? meState.me.username : "";
  const dir = useDirectory();
  const nameOf = (m?: string | null) => (m ? dir.get(m)?.name : undefined);
  const { requests, loading, error, reload } = useAccessData();

  const pending = requests.filter((r) => r.status === "pending");

  const legDecide = async (
    id: string,
    approver: string,
    decision: "approved" | "denied",
    comment?: string,
  ) => {
    try {
      await api(`/requests/${id}/decide`, {
        method: "POST",
        body: JSON.stringify({ decision, approver, comment }),
      });
      toast.success(`Leg ${decision} (as ${nameOf(approver) ?? approver})`);
      await reload();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : String(e));
    }
  };

  const reconcile = async () => {
    try {
      const rep = await api<{ driftCount?: number }>("/sync/reconcile", { method: "POST" });
      toast.success(
        `Reconcile complete${rep?.driftCount != null ? ` — ${rep.driftCount} drift(s) healed` : ""}`,
      );
      await reload();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : String(e));
    }
  };

  const list = (items: typeof requests, admin: boolean) =>
    items.length === 0 ? (
      <EmptyLine text="Nothing here." />
    ) : (
      <div className="space-y-4">
        {items.map((r) => (
          <RequestCard
            key={r.id}
            req={r}
            me={myName}
            nameOf={nameOf}
            onLegDecide={admin ? (a, d, c) => legDecide(r.id, a, d, c) : undefined}
          />
        ))}
      </div>
    );

  return (
    <AppShell
      title="Access requests"
      actions={
        <Button variant="outline" size="sm" onClick={reconcile}>
          <RefreshCcw className="size-4" /> Reconcile
        </Button>
      }
    >
      <p className="mb-5 max-w-2xl text-sm text-muted-foreground">
        All access requests + their four-eyes state. Unblock a stuck leg with the admin override
        (approve/deny acting as the assigned approver) — every action is audited.
      </p>

      {error && (
        <Card className="mb-4 border-destructive/40 p-4 text-sm text-destructive">Error: {error}</Card>
      )}

      {loading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <Tabs defaultValue="pending">
          <TabsList>
            <TabsTrigger value="pending">Pending ({pending.length})</TabsTrigger>
            <TabsTrigger value="all">All ({requests.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="pending" className="pt-4">
            {list(pending, true)}
          </TabsContent>
          <TabsContent value="all" className="pt-4">
            {list(requests, false)}
          </TabsContent>
        </Tabs>
      )}
    </AppShell>
  );
}

function EmptyLine({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}
