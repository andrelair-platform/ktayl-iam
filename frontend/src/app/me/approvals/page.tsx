"use client";

/* My approvals — the four-eyes inbox: requests with a leg assigned to me (manager or role owner).
   I decide MY leg; the server knows the approver is me (no override in the human flow). */

import { CheckSquare } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { useMe } from "@/hooks/use-me";
import { myOpenLegs, useAccessData } from "@/hooks/use-access-data";
import { useDirectory } from "@/hooks/use-directory";
import { AppShell } from "@/components/app-shell";
import { RequestCard } from "@/components/access/request-card";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function MyApprovalsPage() {
  const meState = useMe();
  const myName = meState.status === "authed" ? meState.me.username : "";
  const dir = useDirectory();
  const nameOf = (m?: string | null) => (m ? dir.get(m)?.name : undefined);
  const { requests, loading, error, reload } = useAccessData();

  const mine = requests.filter((r) => myOpenLegs(r, myName).length > 0);

  const decide = async (id: string, decision: "approved" | "denied", comment?: string) => {
    try {
      await api(`/requests/${id}/decide`, {
        method: "POST",
        body: JSON.stringify({ decision, comment }),
      });
      toast.success(decision === "approved" ? "Approved" : "Denied");
      await reload();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : String(e));
    }
  };

  return (
    <AppShell title="My approvals">
      <p className="mb-5 text-sm text-muted-foreground">
        Requests waiting for your decision (four-eyes). You decide the leg assigned to you — you cannot
        approve your own request.
      </p>
      {error && (
        <Card className="mb-4 border-destructive/40 p-4 text-sm text-destructive">Error: {error}</Card>
      )}
      {loading ? (
        <Skeleton className="h-40 w-full" />
      ) : mine.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-12 text-center">
          <CheckSquare className="size-7 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Nothing awaiting your approval. 🎉</p>
        </div>
      ) : (
        <div className="space-y-4">
          {mine.map((r) => (
            <RequestCard
              key={r.id}
              req={r}
              me={myName}
              nameOf={nameOf}
              onDecide={(d, c) => decide(r.id, d, c)}
            />
          ))}
        </div>
      )}
    </AppShell>
  );
}
