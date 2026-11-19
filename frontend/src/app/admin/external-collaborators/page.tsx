"use client";

/* External collaborators console (IGA-07) — governed onboarding of human non-employees. Request →
   Sponsor + Security four-eyes → provision (scoped + invite) → renew before expiry. Hard expiry +
   sponsor-Leaver sentinel are enforced server-side; this surfaces the lifecycle + the countdown. */

import { useCallback, useEffect, useState } from "react";
import { MoreHorizontal, Plus, RefreshCcw, ShieldCheck, UserPlus, UserRound } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { useDirectory } from "@/hooks/use-directory";
import { AppShell, useCan } from "@/components/app-shell";
import { PersonLabel } from "@/components/person-label";
import { StatusStepper, type Step } from "@/components/status-stepper";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Decision = { approver: string; decision: "approved" | "denied"; at: string; comment?: string } | null;
const TYPES = ["contractor", "auditor", "broker", "partner"] as const;
type Collaborator = {
  id: string;
  name: string;
  displayName: string;
  email: string;
  type: string;
  company: string | null;
  hrWorkerRef: string | null;
  sponsorMatricule: string;
  purpose: string;
  groupRefs: string[];
  status: "requested" | "active" | "expired" | "disabled" | "flagged";
  authentikUsername: string | null;
  expiresAt: string | null;
  lastRecertifiedAt: string | null;
};
type EcRequest = {
  id: string;
  requesterId: string;
  collaboratorId: string;
  sponsorApprover: string | null;
  securityApprover: string | null;
  status: "pending" | "approved" | "denied" | "cancelled";
  sponsorDecision: Decision;
  securityDecision: Decision;
};

const STEPS: Step[] = [
  { key: "filed", label: "Filed" },
  { key: "security", label: "Security" },
  { key: "sponsor", label: "Sponsor" },
  { key: "provision", label: "Provision" },
  { key: "active", label: "Active" },
];

function stepState(r: EcRequest, c?: Collaborator) {
  if (c?.status === "active") return { activeIndex: 4, failed: false };
  if (r.status === "denied")
    return { activeIndex: r.securityDecision?.decision === "denied" ? 1 : 2, failed: true };
  const sec = r.securityDecision?.decision === "approved";
  const spo = r.sponsorDecision?.decision === "approved";
  if (sec && spo) return { activeIndex: 3, failed: false };
  if (sec) return { activeIndex: 2, failed: false };
  return { activeIndex: 1, failed: false };
}

function statusBadge(s: string) {
  if (s === "active" || s === "approved") return <Badge variant="success">{s}</Badge>;
  if (s === "flagged") return <Badge variant="warning">{s}</Badge>;
  if (s === "expired" || s === "disabled" || s === "denied") return <Badge variant="destructive">{s}</Badge>;
  return <Badge variant="secondary">{s}</Badge>;
}

/** The external party's engagement (ADR-012): a firm → Prestataire, no firm → Freelance. */
function engagementOf(c: Collaborator) {
  return c.company?.trim() ? "Prestataire" : "Freelance";
}

/**
 * HR-record cell (ADR-012): the bound ERPNext non-payroll worker id (`HR-EMP-xxxxx`), or a muted "pending"
 * while n8n is still creating/binding it. The person is a *worker* (never a supplier); their pay is a
 * firm-level invoice handled in finance, not here.
 */
function hrRecordCell(c: Collaborator) {
  if (c.hrWorkerRef) return <code className="text-xs">{c.hrWorkerRef}</code>;
  return (
    <Badge variant="secondary" title="The non-payroll ERPNext HR worker record is created by n8n on provisioning; this binds once it exists.">
      pending
    </Badge>
  );
}

function expiryLabel(iso: string | null) {
  if (!iso) return <span className="text-muted-foreground">—</span>;
  const days = Math.round((new Date(iso).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  if (days < 0) return <Badge variant="destructive">expired</Badge>;
  if (days <= 14) return <Badge variant="warning">{days}d left</Badge>;
  return <span className="text-muted-foreground">{days}d</span>;
}

export default function ExternalCollaboratorsPage() {
  const dir = useDirectory();
  const can = useCan();
  const nameOf = (m?: string | null) => (m ? dir.get(m)?.name : undefined);

  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [requests, setRequests] = useState<EcRequest[]>([]);
  const [due, setDue] = useState<Collaborator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [c, r, d] = await Promise.all([
        api<Collaborator[]>("/collaborators"),
        api<EcRequest[]>("/collaborators/requests"),
        api<Collaborator[]>("/collaborators/due?days=30"),
      ]);
      setCollaborators(c);
      setRequests(r);
      setDue(d);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([
      api<Collaborator[]>("/collaborators"),
      api<EcRequest[]>("/collaborators/requests"),
      api<Collaborator[]>("/collaborators/due?days=30"),
    ])
      .then(([c, r, d]) => {
        if (active) {
          setCollaborators(c);
          setRequests(r);
          setDue(d);
          setError(null);
        }
      })
      .catch((e) => active && setError(e instanceof ApiError ? e.message : String(e)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
      await reload();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : String(e));
    }
  };

  const pending = requests.filter((r) => r.status === "pending");
  const flaggedCount = collaborators.filter((c) => c.status === "flagged").length;

  return (
    <AppShell
      title="External collaborators"
      actions={can("collaborators:manage") ? <NewRequestDialog onDone={reload} /> : null}
    >
      <p className="mb-5 max-w-2xl text-sm text-muted-foreground">
        Governed access for human non-employees (contractors, brokers, auditors — or freelance). IT files it;
        <strong> the manager + the admin/Security</strong> double-validate before provisioning; a hard expiry
        + a daily sponsor-health sweep keep access time-boxed (never orphaned).
      </p>

      {flaggedCount > 0 && (
        <Card className="mb-4 border-warning/40 bg-warning/10 p-4 text-sm text-warning">
          {flaggedCount} collaborator(s) <strong>flagged</strong> — their sponsor is no longer active.
          Reassign a sponsor or disable them.
        </Card>
      )}
      {error && (
        <Card className="mb-4 border-destructive/40 p-4 text-sm text-destructive">
          <div className="flex items-center justify-between gap-3">
            <span>Error: {error}</span>
            <Button size="sm" variant="outline" onClick={reload}>
              <RefreshCcw className="size-3.5" /> Retry
            </Button>
          </div>
        </Card>
      )}

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-9 w-72" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : (
        <Tabs defaultValue="pending">
          <TabsList>
            <TabsTrigger value="pending">Pending ({pending.length})</TabsTrigger>
            <TabsTrigger value="collaborators">Collaborators ({collaborators.length})</TabsTrigger>
            <TabsTrigger value="due">Expiring ({due.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="pending" className="space-y-4 pt-4">
            {pending.length === 0 ? (
              <EmptyState icon={ShieldCheck} line="No requests awaiting a decision." />
            ) : (
              pending.map((r) => {
                const c = collaborators.find((x) => x.id === r.collaboratorId);
                const st = stepState(r, c);
                const legDecide = (approver: string | null, decision: "approved" | "denied", comment?: string) =>
                  approver &&
                  run(
                    () =>
                      api(`/collaborators/requests/${r.id}/decide`, {
                        method: "POST",
                        body: JSON.stringify({ decision, approver, comment }),
                      }),
                    `Leg ${decision}`,
                  );
                return (
                  <Card key={r.id} className="p-5">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 font-semibold text-primary">
                        <UserPlus className="size-4 text-brand" />
                        {c?.name ?? r.collaboratorId}
                        {c && <span className="text-xs font-normal text-muted-foreground">· {c.type}</span>}
                      </div>
                      {statusBadge(r.status)}
                    </div>
                    <div className="mb-4 px-2">
                      <StatusStepper steps={STEPS} activeIndex={st.activeIndex} failed={st.failed} />
                    </div>
                    {c && <p className="mb-4 text-sm text-muted-foreground">“{c.purpose ?? ""}”</p>}
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Leg
                        icon={ShieldCheck}
                        label="Security approver"
                        matricule={r.securityApprover}
                        name={nameOf(r.securityApprover)}
                        decision={r.securityDecision}
                        canDecide={can("requests:decide")}
                        onApprove={() => legDecide(r.securityApprover, "approved")}
                        onDeny={(cm) => legDecide(r.securityApprover, "denied", cm)}
                      />
                      <Leg
                        icon={UserRound}
                        label="Manager (sponsor)"
                        matricule={r.sponsorApprover}
                        name={nameOf(r.sponsorApprover)}
                        decision={r.sponsorDecision}
                        canDecide={can("requests:decide")}
                        onApprove={() => legDecide(r.sponsorApprover, "approved")}
                        onDeny={(cm) => legDecide(r.sponsorApprover, "denied", cm)}
                      />
                    </div>
                    {c && (
                      <p className="mt-3 flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
                        {engagementOf(c)}{c.company ? ` · ${c.company}` : ""} · groups: {c.groupRefs.join(", ")} · expires{" "}
                        {c.expiresAt ? new Date(c.expiresAt).toLocaleDateString() : "—"}
                      </p>
                    )}
                  </Card>
                );
              })
            )}
          </TabsContent>

          <TabsContent value="collaborators" className="pt-4">
            {collaborators.length === 0 ? (
              <EmptyState icon={UserPlus} line="No external collaborators yet." />
            ) : (
              <Card className="overflow-hidden p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Engagement</TableHead>
                      <TableHead>HR record</TableHead>
                      <TableHead>Manager</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Expires</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {collaborators.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell>
                          <div className="font-medium">{c.name}</div>
                          <div className="text-xs text-muted-foreground">{c.displayName} · {c.email}</div>
                        </TableCell>
                        <TableCell>
                          <div>{engagementOf(c)}</div>
                          <div className="text-xs text-muted-foreground">{c.company ?? "no firm"} · {c.type}</div>
                        </TableCell>
                        <TableCell>{hrRecordCell(c)}</TableCell>
                        <TableCell>
                          <PersonLabel matricule={c.sponsorMatricule} name={nameOf(c.sponsorMatricule)} />
                        </TableCell>
                        <TableCell>{statusBadge(c.status)}</TableCell>
                        <TableCell>{expiryLabel(c.expiresAt)}</TableCell>
                        <TableCell>
                          <RowMenu collaborator={c} run={run} canManage={can("collaborators:manage")} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="due" className="pt-4">
            {due.length === 0 ? (
              <EmptyState icon={RefreshCcw} line="Nothing expiring in the next 30 days." />
            ) : (
              <Card className="p-4 text-sm">
                {due.length} collaborator(s) expire within 30 days — renew them from the{" "}
                <strong>Collaborators</strong> tab before access auto-suspends.
              </Card>
            )}
          </TabsContent>
        </Tabs>
      )}
    </AppShell>
  );
}

function Leg({
  icon: Icon,
  label,
  matricule,
  name,
  decision,
  canDecide,
  onApprove,
  onDeny,
}: {
  icon: typeof ShieldCheck;
  label: string;
  matricule: string | null;
  name?: string;
  decision: Decision;
  canDecide: boolean;
  onApprove: () => void;
  onDeny: (comment: string) => void;
}) {
  const d = decision?.decision;
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon className="size-3.5" /> {label}
      </div>
      <PersonLabel matricule={matricule} name={name} className="text-sm" />
      <div className="mt-2">
        {d === "approved" ? (
          <Badge variant="success">approved</Badge>
        ) : d === "denied" ? (
          <Badge variant="destructive">denied</Badge>
        ) : canDecide ? (
          <div className="flex gap-2">
            <Button size="sm" variant="success" onClick={onApprove}>
              Approve
            </Button>
            <DenyDialog onDeny={onDeny} />
          </div>
        ) : (
          <Badge variant="secondary">pending</Badge>
        )}
      </div>
    </div>
  );
}

function DenyDialog({ onDeny }: { onDeny: (comment: string) => void }) {
  const [comment, setComment] = useState("");
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Deny
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Deny this request?</DialogTitle>
          <DialogDescription>Denying any leg rejects the whole request. A reason is audited.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="deny-reason">Reason</Label>
          <Input id="deny-reason" value={comment} onChange={(e) => setComment(e.target.value)} />
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <DialogClose asChild>
            <Button variant="destructive" onClick={() => onDeny(comment)}>
              Deny request
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RowMenu({
  collaborator,
  run,
  canManage,
}: {
  collaborator: Collaborator;
  run: (fn: () => Promise<unknown>, ok: string) => Promise<void>;
  canManage: boolean;
}) {
  const [confirm, setConfirm] = useState<null | "provision">(null);
  if (!canManage) return null;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon-sm" variant="ghost" aria-label="Collaborator actions">
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {collaborator.status === "active" && (
            <DropdownMenuItem
              onSelect={() =>
                run(
                  () => api(`/collaborators/${collaborator.id}/renew`, { method: "POST", body: JSON.stringify({ days: 90 }) }),
                  `Renewed ${collaborator.name}`,
                )
              }
            >
              Renew (90d)
            </DropdownMenuItem>
          )}
          {collaborator.status !== "disabled" && (
            <DropdownMenuItem onSelect={() => setConfirm("provision")}>
              {collaborator.status === "active" ? "Re-provision" : "Provision"}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirm === "provision"} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Provision “{collaborator.name}”?</DialogTitle>
            <DialogDescription>
              Creates/updates the Authentik user, adds it to {collaborator.groupRefs.join(", ")}, and issues
              an invitation so they set their own credential. The collaborator becomes active.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="brand"
              onClick={() => {
                setConfirm(null);
                run(
                  () => api(`/collaborators/${collaborator.id}/provision`, { method: "POST" }),
                  `Provisioned ${collaborator.name}`,
                );
              }}
            >
              Provision
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function NewRequestDialog({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    name: "",
    displayName: "",
    email: "",
    type: "contractor" as (typeof TYPES)[number],
    company: "",
    sponsorMatricule: "",
    groups: "",
    purpose: "",
    expiryDays: "90",
  });
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    setBusy(true);
    try {
      await api("/collaborators/requests", {
        method: "POST",
        body: JSON.stringify({
          name: f.name,
          displayName: f.displayName,
          email: f.email,
          type: f.type,
          company: f.company.trim() || undefined,
          sponsorMatricule: f.sponsorMatricule,
          groupRefs: f.groups.split(",").map((g) => g.trim()).filter(Boolean),
          purpose: f.purpose,
          expiryDays: Number(f.expiryDays) || 90,
        }),
      });
      toast.success(`Request filed for ${f.name}`);
      setOpen(false);
      setF({ name: "", displayName: "", email: "", type: "contractor", company: "", sponsorMatricule: "", groups: "", purpose: "", expiryDays: "90" });
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
          <Plus className="size-4" /> Request collaborator
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Request an external collaborator</DialogTitle>
          <DialogDescription>
            Double validation before provisioning: the <strong>manager</strong> (who employs them) + the{" "}
            <strong>admin/Security</strong> both approve. The manager must be an active employee; access is
            time-boxed (max 180 days).
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Field id="ec-name" label="Name" value={f.name} onChange={(v) => set("name", v)} placeholder="ext-acme-jdoe" />
            <Field id="ec-display" label="Display name" value={f.displayName} onChange={(v) => set("displayName", v)} placeholder="Jane Doe (Acme)" />
          </div>
          <Field id="ec-email" label="Email" value={f.email} onChange={(v) => set("email", v)} placeholder="jane@acme.example" />
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Type</Label>
              <Select value={f.type} onValueChange={(v) => set("type", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Field id="ec-manager" label="Manager matricule (sponsor)" value={f.sponsorMatricule} onChange={(v) => set("sponsorMatricule", v)} placeholder="100006" />
          </div>
          <div className="grid gap-1.5">
            <Field id="ec-company" label="Firm / ESN (blank = freelance)" value={f.company} onChange={(v) => set("company", v)} placeholder="Acme Consulting (ESN)" />
            <p className="text-xs text-muted-foreground">
              A firm → <strong>Prestataire</strong>; blank → <strong>Freelance</strong>. On provisioning a
              <strong> non-payroll HR worker</strong> is created in ERPNext (never payroll). Their pay is a
              firm-level invoice handled in finance — not here, and they are never a supplier.
            </p>
          </div>
          <Field id="ec-groups" label="Groups (comma-sep)" value={f.groups} onChange={(v) => set("groups", v)} placeholder="GROUP_Claims_ReadOnly" />
          <div className="grid grid-cols-2 gap-3">
            <Field id="ec-purpose" label="Purpose" value={f.purpose} onChange={(v) => set("purpose", v)} placeholder="External pentest of…" />
            <Field id="ec-expiry" label="Expiry (days, ≤180)" value={f.expiryDays} onChange={(v) => set("expiryDays", v)} placeholder="90" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="brand" disabled={busy} onClick={submit}>
            {busy ? "Filing…" : "File request"}
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

function EmptyState({ icon: Icon, line }: { icon: typeof UserPlus; line: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-12 text-center">
      <Icon className="size-7 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{line}</p>
    </div>
  );
}
