"use client";

/* ADR-017 — My Access: the signed-in user's COMPLETE access picture (governed grants + birthright/direct
   Authentik groups), each row tagged by WHY they have it. Read-only; grants change only via request→four-eyes. */

import { useEffect, useState } from "react";
import Link from "next/link";
import { KeyRound, FilePlus2, Info } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface MyAccessRow {
  source: "Governed" | "Birthright" | "Direct";
  application: string;
  role: string;
  authentikGroup: string;
  status: string;
  synced: boolean;
  grantedAt: string | null;
}

const SOURCE_VARIANT: Record<MyAccessRow["source"], "default" | "secondary" | "outline"> = {
  Governed: "default",
  Birthright: "secondary",
  Direct: "outline",
};

export default function MyAccessPage() {
  const [rows, setRows] = useState<MyAccessRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<{ user: string; access: MyAccessRow[] }>("/access/me")
      .then((data) => {
        if (!cancelled) setRows(data.access);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof ApiError ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AppShell
      title="My access"
      actions={
        <Button asChild variant="brand" size="sm">
          <Link href="/me/request">
            <FilePlus2 className="size-4" /> Request access
          </Link>
        </Button>
      }
    >
      <div className="mb-4 flex items-start gap-2 rounded-lg bg-accent/60 p-3 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0 text-primary" />
        <span>
          Everything you can access, and <strong>why</strong>: <strong>Governed</strong> = granted via
          four-eyes approval · <strong>Birthright</strong> = the workplace baseline everyone gets ·{" "}
          <strong>Direct</strong> = a directory group. To gain a new business role, use{" "}
          <strong>Request access</strong>.
        </span>
      </div>

      {error && (
        <Card className="mb-4 border-destructive/40 p-4 text-sm text-destructive">Error: {error}</Card>
      )}

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-12 text-center">
          <KeyRound className="size-7 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">You don&apos;t have any access recorded yet.</p>
        </div>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source</TableHead>
                <TableHead>Application</TableHead>
                <TableHead>Role / group</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Granted</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={`${r.authentikGroup}-${i}`}>
                  <TableCell>
                    <Badge variant={SOURCE_VARIANT[r.source]}>{r.source}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{r.application}</TableCell>
                  <TableCell className="font-medium">{r.role}</TableCell>
                  <TableCell>
                    <span className="text-sm">
                      {r.status === "active" ? "active" : r.status}
                      {r.source === "Governed" && !r.synced && (
                        <span className="ml-1 text-xs text-amber-600">(sync pending)</span>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {r.grantedAt ? new Date(r.grantedAt).toLocaleDateString() : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </AppShell>
  );
}
