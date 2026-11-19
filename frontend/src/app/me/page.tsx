"use client";

/* Employee dashboard — the role-aware landing. Everyone lands here: a snapshot (my open requests,
   awaiting my approval) + the four-eyes inbox (the most actionable) + a quick "request access". */

import Link from "next/link";
import { CheckSquare, FilePlus2, Inbox, ListChecks } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { useMe } from "@/hooks/use-me";
import { myOpenLegs, useAccessData } from "@/hooks/use-access-data";
import { useDirectory } from "@/hooks/use-directory";
import { AppShell } from "@/components/app-shell";
import { RequestCard } from "@/components/access/request-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function Stat({
  label,
  value,
  icon: Icon,
  href,
}: {
  label: string;
  value: number;
  icon: typeof Inbox;
  href: string;
}) {
  return (
    <Link href={href}>
      <Card className="p-4 transition-colors hover:border-brand/50">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{label}</span>
          <Icon className="size-4 text-brand" />
        </div>
        <div className="mt-2 text-2xl font-semibold text-primary">{value}</div>
      </Card>
    </Link>
  );
}

export default function Dashboard() {
  const meState = useMe();
  const me = meState.status === "authed" ? meState.me : null;
  const myName = me?.username ?? "";
  const dir = useDirectory();
  const nameOf = (m?: string | null) => (m ? dir.get(m)?.name : undefined);
  const { requests, loading, error, reload } = useAccessData();

  const myRequests = requests.filter((r) => r.requesterId === myName);
  const myPendingCount = myRequests.filter((r) => r.status === "pending").length;
  const myApprovals = requests.filter((r) => myOpenLegs(r, myName).length > 0);
  const allPending = requests.filter((r) => r.status === "pending").length;

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
    <AppShell
      title="Dashboard"
      actions={
        <Button asChild variant="brand" size="sm">
          <Link href="/me/request">
            <FilePlus2 className="size-4" /> Request access
          </Link>
        </Button>
      }
    >
      <p className="mb-5 text-sm text-muted-foreground">
        Welcome{myName ? `, ${nameOf(myName) ?? myName}` : ""}. Request access to the tools you need, track
        it, and approve what&apos;s assigned to you.
      </p>

      {error && (
        <Card className="mb-4 border-destructive/40 p-4 text-sm text-destructive">Error: {error}</Card>
      )}

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-3">
            <Stat label="My open requests" value={myPendingCount} icon={ListChecks} href="/me/requests" />
            <Stat
              label="Awaiting my approval"
              value={myApprovals.length}
              icon={CheckSquare}
              href="/me/approvals"
            />
            {me?.isAdmin && (
              <Stat label="All pending (org)" value={allPending} icon={Inbox} href="/admin/requests" />
            )}
          </div>

          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Awaiting your approval
            </h2>
            {myApprovals.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-10 text-center">
                <CheckSquare className="size-7 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Nothing awaiting your approval. 🎉</p>
              </div>
            ) : (
              <div className="space-y-4">
                {myApprovals.map((r) => (
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
          </section>
        </>
      )}
    </AppShell>
  );
}
