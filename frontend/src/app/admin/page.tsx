"use client";

/* Application & role catalog (admin) — the source of truth for what apps exist, their roles, and who
   owns each role (approver #2). Register apps + roles here; access requests target these roles. */

import { useState } from "react";
import { Boxes, Plus } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { useAccessData } from "@/hooks/use-access-data";
import { useDirectory } from "@/hooks/use-directory";
import { AppShell } from "@/components/app-shell";
import { PersonLabel } from "@/components/person-label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const TIERS = ["public", "internal", "restricted"] as const;

function tierBadge(t: string) {
  if (t === "restricted") return <Badge variant="destructive">{t}</Badge>;
  if (t === "internal") return <Badge variant="warning">{t}</Badge>;
  return <Badge variant="secondary">{t}</Badge>;
}

interface Role {
  id: string;
  name: string;
  owner?: string;
  authentikGroupRef?: string;
  description?: string | null;
}
interface Application {
  id: string;
  name: string;
  tier: string;
  authentikAppRef?: string;
  description?: string | null;
  roles: Role[];
}

export default function CatalogPage() {
  const { apps, loading, error, reload } = useAccessData() as unknown as {
    apps: Application[];
    loading: boolean;
    error: string | null;
    reload: () => Promise<void>;
  };
  const dir = useDirectory();
  const nameOf = (m?: string | null) => (m ? dir.get(m)?.name : undefined);

  return (
    <AppShell title="Application & role catalog" actions={<NewApplication onDone={reload} />}>
      <p className="mb-5 max-w-2xl text-sm text-muted-foreground">
        The source of truth for what applications exist, what roles they have, and who owns each role (the
        role owner is approver #2 in four-eyes).
      </p>

      {error && (
        <Card className="mb-4 border-destructive/40 p-4 text-sm text-destructive">Error: {error}</Card>
      )}

      {loading ? (
        <Skeleton className="h-48 w-full" />
      ) : apps.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-12 text-center">
          <Boxes className="size-7 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No applications registered yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {apps.map((app) => (
            <Card key={app.id} className="p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <span className="font-semibold text-primary">{app.name}</span>
                  {tierBadge(app.tier)}
                </span>
                <NewRole appId={app.id} onDone={reload} />
              </div>
              {app.description && <p className="mb-3 text-sm text-muted-foreground">{app.description}</p>}
              {app.roles.length === 0 ? (
                <p className="text-sm text-muted-foreground">No roles yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Role</TableHead>
                      <TableHead>Owner</TableHead>
                      <TableHead>Authentik group</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {app.roles.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell>
                          <PersonLabel matricule={r.owner ?? null} name={nameOf(r.owner)} />
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {r.authentikGroupRef}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card>
          ))}
        </div>
      )}
    </AppShell>
  );
}

function NewApplication({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", tier: "internal", authentikAppRef: "", description: "" });
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));
  const submit = async () => {
    setBusy(true);
    try {
      await api("/applications", {
        method: "POST",
        body: JSON.stringify({ ...f, description: f.description || undefined }),
      });
      toast.success(`Application ${f.name} registered`);
      setOpen(false);
      setF({ name: "", tier: "internal", authentikAppRef: "", description: "" });
      onDone();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="brand" size="sm">
          <Plus className="size-4" /> New application
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Register an application</DialogTitle>
          <DialogDescription>The governance record; `authentikAppRef` is the Authentik slug.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Field id="app-name" label="Name" value={f.name} onChange={(v) => set("name", v)} placeholder="Grafana" />
          <div className="grid gap-1.5">
            <Label>Tier</Label>
            <Select value={f.tier} onValueChange={(v) => set("tier", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIERS.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Field id="app-ref" label="Authentik app ref" value={f.authentikAppRef} onChange={(v) => set("authentikAppRef", v)} placeholder="grafana" />
          <Field id="app-desc" label="Description (optional)" value={f.description} onChange={(v) => set("description", v)} placeholder="" />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="brand" disabled={busy || !f.name || !f.authentikAppRef} onClick={submit}>
            {busy ? "Saving…" : "Register"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewRole({ appId, onDone }: { appId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", owner: "", authentikGroupRef: "", description: "" });
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));
  const submit = async () => {
    setBusy(true);
    try {
      await api(`/applications/${appId}/roles`, {
        method: "POST",
        body: JSON.stringify({ ...f, description: f.description || undefined }),
      });
      toast.success(`Role ${f.name} added`);
      setOpen(false);
      setF({ name: "", owner: "", authentikGroupRef: "", description: "" });
      onDone();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="size-3.5" /> Role
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a role</DialogTitle>
          <DialogDescription>A role must have an owner (approver #2 in four-eyes).</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Field id="role-name" label="Name" value={f.name} onChange={(v) => set("name", v)} placeholder="Viewer" />
          <Field id="role-owner" label="Owner matricule" value={f.owner} onChange={(v) => set("owner", v)} placeholder="100002" />
          <Field id="role-group" label="Authentik group ref" value={f.authentikGroupRef} onChange={(v) => set("authentikGroupRef", v)} placeholder="ktayl-grafana-viewer" />
          <Field id="role-desc" label="Description (optional)" value={f.description} onChange={(v) => set("description", v)} placeholder="" />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="brand" disabled={busy || !f.name || !f.owner || !f.authentikGroupRef} onClick={submit}>
            {busy ? "Saving…" : "Add role"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
