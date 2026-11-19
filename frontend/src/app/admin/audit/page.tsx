"use client";

/* Audit log (admin) — the append-only activity trail (who · when · action · entity). Searchable +
   exportable (CSV/JSON). Read-only; the DB enforces append-only. */

import { useEffect, useState } from "react";
import { Download, ScrollText } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useDirectory } from "@/hooks/use-directory";
import { AppShell } from "@/components/app-shell";
import { PersonLabel } from "@/components/person-label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface AuditRow {
  id: string;
  actor: string;
  action: string;
  entityType: string;
  entityId: string;
  detail: Record<string, unknown>;
  at: string;
}

export default function AuditPage() {
  const dir = useDirectory();
  const nameOf = (m?: string | null) => (m ? dir.get(m)?.name : undefined);
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    let active = true;
    api<AuditRow[]>("/access/audit?limit=200")
      .then((r) => active && setRows(r))
      .catch((e) => active && setError(e instanceof ApiError ? e.message : String(e)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const filtered = q
    ? rows.filter((r) =>
        `${r.actor} ${r.action} ${r.entityType} ${r.entityId} ${JSON.stringify(r.detail)}`
          .toLowerCase()
          .includes(q.toLowerCase()),
      )
    : rows;

  return (
    <AppShell
      title="Audit log"
      actions={
        <span className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <a href="/api/access/audit/export?format=csv">
              <Download className="size-4" /> CSV
            </a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href="/api/access/audit/export?format=json">JSON</a>
          </Button>
        </span>
      }
    >
      <p className="mb-4 max-w-2xl text-sm text-muted-foreground">
        Append-only activity trail — who did what, when. Every governance action (requests, decisions,
        catalog, provisioning, service accounts) is recorded.
      </p>

      <Input
        placeholder="Filter by actor, action, entity…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="mb-4 max-w-sm"
      />

      {error && (
        <Card className="mb-4 border-destructive/40 p-4 text-sm text-destructive">Error: {error}</Card>
      )}

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-12 text-center">
          <ScrollText className="size-7 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No audit entries match.</p>
        </div>
      ) : (
        <Card className="overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">When</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Entity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {new Date(r.at).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    {r.actor === "system" ? (
                      <Badge variant="secondary">system</Badge>
                    ) : (
                      <PersonLabel matricule={r.actor} name={nameOf(r.actor)} />
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{r.action}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.entityType}
                    <span className="opacity-60"> · {r.entityId.slice(0, 8)}</span>
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
