"use client";

/* Service accounts console (IGA-06) — the lifecycle redesign. Request → four-eyes (Security + owner,
   by NAME) → provision → recertify, shown as journeys with state. shadcn/ui + the shared app shell,
   people resolved to name·matricule, states + toasts + confirm dialogs. */

import { useCallback, useEffect, useState } from "react";
import { Bot, MoreHorizontal, Plus, RefreshCcw, ShieldCheck, UserRound } from "lucide-react";
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
type ServiceAccount = {
  id: string;
  name: string;
  displayName: string;
  type: "qa" | "m2m" | "automation";
  ownerMatricule: string;
  groupRefs: string[];
  status: "requested" | "active" | "disabled";
  authentikUsername: string | null;
  vaultSecretRef: string | null;
  lastRecertifiedAt: string | null;
};
type SaRequest = {
  id: string;
  requesterId: string;
  serviceAccountId: string;
  justification: string;
  securityApprover: string | null;
  ownerApprover: string | null;
  status: "pending" | "approved" | "denied" | "cancelled";
  securityDecision: Decision;
  ownerDecision: Decision;
};

const STEPS: Step[] = [
  { key: "filed", label: "Filed" },
  { key: "security", label: "Security" },
  { key: "owner", label: "Owner" },
  { key: "provision", label: "Provision" },
  { key: "active", label: "Active" },
];

const legIs = (leg: Decision, v: "approved" | "denied") => leg?.decision === v;

function stepState(req: SaRequest, acc?: ServiceAccount): { activeIndex: number; failed: boolean } {
  if (acc?.status === "active") return { activeIndex: 4, failed: false };
  if (req.status === "denied") {
    const idx = legIs(req.securityDecision, "denied") ? 1 : 2;
    return { activeIndex: idx, failed: true };
  }
  const sec = legIs(req.securityDecision, "approved");
  const own = legIs(req.ownerDecision, "approved");
  if (sec && own) return { activeIndex: 3, failed: false };
  if (sec) return { activeIndex: 2, failed: false };
  return { activeIndex: 1, failed: false };
}

function statusBadge(s: string) {
  if (s === "active" || s === "approved")
    return <Badge variant="success">{s}</Badge>;
  if (s === "denied" || s === "disabled")
    return <Badge variant="destructive">{s}</Badge>;
  return <Badge variant="secondary">{s}</Badge>;
}

export default function ServiceAccountsPage() {
  const dir = useDirectory();
  const can = useCan();
  const nameOf = (m?: string | null) => (m ? dir.get(m)?.name : undefined);

  const [accounts, setAccounts] = useState<ServiceAccount[]>([]);
  const [requests, setRequests] = useState<SaRequest[]>([]);
  const [due, setDue] = useState<ServiceAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [a, r, d] = await Promise.all([
        api<ServiceAccount[]>("/service-accounts"),
        api<SaRequest[]>("/service-accounts/requests"),
        api<ServiceAccount[]>("/service-accounts/due?days=90"),
      ]);
      setAccounts(a);
      setRequests(r);
      setDue(d);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([
      api<ServiceAccount[]>("/service-accounts"),
      api<SaRequest[]>("/service-accounts/requests"),
      api<ServiceAccount[]>("/service-accounts/due?days=90"),
    ])
      .then(([a, r, d]) => {
        if (active) {
          setAccounts(a);
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
  const dueIds = new Set(due.map((d) => d.id));

  return (
    <AppShell title="Service accounts" actions={can("service_accounts:manage") ? <NewRequestDialog onDone={reload} /> : null}>
      <p className="mb-5 max-w-2xl text-sm text-muted-foreground">
        Governed non-human identities. A request is <strong>dual-approved</strong> (a Security approver and the
        owner — four-eyes, no self-approval) before it is provisioned to Authentik and its credential minted
        into Vault. Owners recertify them periodically.
      </p>

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
            <TabsTrigger value="accounts">Accounts ({accounts.length})</TabsTrigger>
            <TabsTrigger value="due">Due for recert ({due.length})</TabsTrigger>
          </TabsList>

          {/* Pending requests — the lifecycle cards */}
          <TabsContent value="pending" className="space-y-4 pt-4">
            {pending.length === 0 ? (
              <EmptyState icon={ShieldCheck} line="No requests awaiting a decision." />
            ) : (
              pending.map((r) => {
                const sa = accounts.find((a) => a.id === r.serviceAccountId);
                const st = stepState(r, sa);
                return (
                  <Card key={r.id} className="p-5">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 font-semibold text-primary">
                        <Bot className="size-4 text-brand" />
                        {sa?.name ?? r.serviceAccountId}
                        {sa && <span className="text-xs font-normal text-muted-foreground">· {sa.type}</span>}
                      </div>
                      {statusBadge(r.status)}
                    </div>

                    <div className="mb-4 px-2">
                      <StatusStepper steps={STEPS} activeIndex={st.activeIndex} failed={st.failed} />
                    </div>

                    <p className="mb-4 text-sm text-muted-foreground">
                      “{r.justification}” — by{" "}
                      <PersonLabel matricule={r.requesterId} name={nameOf(r.requesterId)} />
                    </p>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <Leg
                        icon={ShieldCheck}
                        label="Security approver"
                        matricule={r.securityApprover}
                        name={nameOf(r.securityApprover)}
                        decision={r.securityDecision}
                        canDecide={can("requests:decide")}
                        onApprove={() =>
                          run(
                            () =>
                              api(`/service-accounts/requests/${r.id}/decide`, {
                                method: "POST",
                                body: JSON.stringify({ decision: "approved", approver: r.securityApprover }),
                              }),
                            "Security leg approved",
                          )
                        }
                        onDeny={(comment) =>
                          run(
                            () =>
                              api(`/service-accounts/requests/${r.id}/decide`, {
                                method: "POST",
                                body: JSON.stringify({ decision: "denied", approver: r.securityApprover, comment }),
                              }),
                            "Request denied",
                          )
                        }
                      />
                      <Leg
                        icon={UserRound}
                        label="Owner"
                        matricule={r.ownerApprover}
                        name={nameOf(r.ownerApprover)}
                        decision={r.ownerDecision}
                        canDecide={can("requests:decide")}
                        onApprove={() =>
                          run(
                            () =>
                              api(`/service-accounts/requests/${r.id}/decide`, {
                                method: "POST",
                                body: JSON.stringify({ decision: "approved", approver: r.ownerApprover }),
                              }),
                            "Owner leg approved",
                          )
                        }
                        onDeny={(comment) =>
                          run(
                            () =>
                              api(`/service-accounts/requests/${r.id}/decide`, {
                                method: "POST",
                                body: JSON.stringify({ decision: "denied", approver: r.ownerApprover, comment }),
                              }),
                            "Request denied",
                          )
                        }
                      />
                    </div>
                    {sa && (
                      <p className="mt-3 text-xs text-muted-foreground">
                        Groups: {sa.groupRefs.join(", ")}
                      </p>
                    )}
                  </Card>
                );
              })
            )}
          </TabsContent>

          {/* Accounts */}
          <TabsContent value="accounts" className="pt-4">
            {accounts.length === 0 ? (
              <EmptyState icon={Bot} line="No service accounts yet." />
            ) : (
              <Card className="overflow-hidden p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Owner</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Groups</TableHead>
                      <TableHead>Recertified</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {accounts.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell>
                          <div className="font-medium">{a.name}</div>
                          <div className="text-xs text-muted-foreground">{a.displayName}</div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{a.type}</TableCell>
                        <TableCell>
                          <PersonLabel matricule={a.ownerMatricule} name={nameOf(a.ownerMatricule)} />
                        </TableCell>
                        <TableCell>{statusBadge(a.status)}</TableCell>
                        <TableCell className="text-muted-foreground">{a.groupRefs.join(", ")}</TableCell>
                        <TableCell>
                          {a.lastRecertifiedAt ? (
                            new Date(a.lastRecertifiedAt).toLocaleDateString()
                          ) : dueIds.has(a.id) ? (
                            <Badge variant="warning">due</Badge>
                          ) : (
                            <span className="text-muted-foreground">never</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <AccountMenu account={a} run={run} canManage={can("service_accounts:manage")} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}
          </TabsContent>

          {/* Due for recert */}
          <TabsContent value="due" className="pt-4">
            {due.length === 0 ? (
              <EmptyState icon={RefreshCcw} line="Nothing due for recertification. 🎉" />
            ) : (
              <Card className="p-4 text-sm">
                {due.length} active account(s) need re-attestation (never attested or &gt; 90 days). Recertify
                them from the <strong>Accounts</strong> tab.
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
  const decided = decision?.decision;
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon className="size-3.5" /> {label}
      </div>
      <PersonLabel matricule={matricule} name={name} className="text-sm" />
      <div className="mt-2">
        {decided === "approved" ? (
          <Badge variant="success">approved</Badge>
        ) : decided === "denied" ? (
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
          <DialogDescription>
            Denying any leg rejects the whole request. A reason is recorded in the audit log.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="deny-reason">Reason</Label>
          <Input
            id="deny-reason"
            placeholder="Why is this denied?"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
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

function AccountMenu({
  account,
  run,
  canManage,
}: {
  account: ServiceAccount;
  run: (fn: () => Promise<unknown>, ok: string) => Promise<void>;
  canManage: boolean;
}) {
  const [confirmProvision, setConfirmProvision] = useState(false);
  if (!canManage) return null;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon-sm" variant="ghost" aria-label="Account actions">
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {account.status === "active" && (
            <DropdownMenuItem
              onSelect={() =>
                run(
                  () => api(`/service-accounts/${account.id}/recertify`, { method: "POST" }),
                  `Recertified ${account.name}`,
                )
              }
            >
              Recertify
            </DropdownMenuItem>
          )}
          {account.status !== "disabled" && (
            <DropdownMenuItem onSelect={() => setConfirmProvision(true)}>
              {account.status === "active" ? "Re-provision" : "Provision"}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmProvision} onOpenChange={setConfirmProvision}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Provision “{account.name}”?</DialogTitle>
            <DialogDescription>
              This creates/updates the Authentik service account, adds it to {account.groupRefs.join(", ")},
              mints its token, and (if configured) writes it to Vault. The account becomes active.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmProvision(false)}>
              Cancel
            </Button>
            <Button
              variant="brand"
              onClick={() => {
                setConfirmProvision(false);
                void run(
                  () => api(`/service-accounts/${account.id}/provision`, { method: "POST" }),
                  `Provisioned ${account.name}`,
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
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [type, setType] = useState<"qa" | "m2m" | "automation">("qa");
  const [owner, setOwner] = useState("");
  const [groups, setGroups] = useState("");
  const [justification, setJustification] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await api("/service-accounts/requests", {
        method: "POST",
        body: JSON.stringify({
          name,
          displayName,
          type,
          ownerMatricule: owner,
          groupRefs: groups.split(",").map((g) => g.trim()).filter(Boolean),
          justification,
        }),
      });
      toast.success(`Request filed for ${name}`);
      setOpen(false);
      setName("");
      setDisplayName("");
      setOwner("");
      setGroups("");
      setJustification("");
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
          <Plus className="size-4" /> Request service account
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Request a service account</DialogTitle>
          <DialogDescription>
            Dual-approved (Security + owner) before anything is provisioned. The justification is a
            mandatory audit reason.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="sa-name">Name</Label>
            <Input id="sa-name" placeholder="ktayl-qa-finance" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="sa-display">Display name</Label>
            <Input id="sa-display" placeholder="ktayl QA Finance" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="qa">qa</SelectItem>
                  <SelectItem value="m2m">m2m</SelectItem>
                  <SelectItem value="automation">automation</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="sa-owner">Owner matricule</Label>
              <Input id="sa-owner" placeholder="100006" value={owner} onChange={(e) => setOwner(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="sa-groups">Groups (comma-separated)</Label>
            <Input id="sa-groups" placeholder="GROUP_Finance" value={groups} onChange={(e) => setGroups(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="sa-just">Justification</Label>
            <Input id="sa-just" placeholder="Why is this non-human identity needed?" value={justification} onChange={(e) => setJustification(e.target.value)} />
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

function EmptyState({ icon: Icon, line }: { icon: typeof Bot; line: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-12 text-center">
      <Icon className="size-7 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{line}</p>
    </div>
  );
}
