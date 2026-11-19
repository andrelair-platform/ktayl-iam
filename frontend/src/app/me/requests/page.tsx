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
        <div className="space-y-4">
          {mine.map((r) => (
            <RequestCard key={r.id} req={r} me={myName} nameOf={nameOf} onCancel={() => cancel(r.id)} />
          ))}
        </div>
      )}
    </AppShell>
  );
}
