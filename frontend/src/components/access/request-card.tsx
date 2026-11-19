"use client";

import { useState } from "react";
import { Briefcase, ShieldCheck, UserRound } from "lucide-react";
import type { AccessRequest, HumanDecision } from "@/hooks/use-access-data";
import { myOpenLegs } from "@/hooks/use-access-data";
import { PersonLabel } from "@/components/person-label";
import { StatusStepper, type Step } from "@/components/status-stepper";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

const STEPS: Step[] = [
  { key: "filed", label: "Filed" },
  { key: "manager", label: "Manager" },
  { key: "owner", label: "Owner" },
  { key: "granted", label: "Granted" },
];

function stepState(r: AccessRequest): { activeIndex: number; failed: boolean } {
  if (r.status === "approved") return { activeIndex: 3, failed: false };
  if (r.status === "denied")
    return { activeIndex: r.managerDecision?.decision === "denied" ? 1 : 2, failed: true };
  if (r.status === "cancelled") return { activeIndex: 0, failed: true };
  const mgr = r.managerDecision?.decision === "approved";
  return { activeIndex: mgr ? 2 : 1, failed: false };
}

function statusBadge(s: string) {
  if (s === "approved") return <Badge variant="success">{s}</Badge>;
  if (s === "denied" || s === "cancelled") return <Badge variant="destructive">{s}</Badge>;
  return <Badge variant="secondary">{s}</Badge>;
}

function LegRow({
  icon: Icon,
  label,
  matricule,
  name,
  decision,
  override,
}: {
  icon: typeof ShieldCheck;
  label: string;
  matricule: string | null;
  name?: string;
  decision: HumanDecision;
  override?: { onApprove: () => void; onDeny: (c: string) => void };
}) {
  const d = decision?.decision;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="size-3.5" /> {label}
        <PersonLabel matricule={matricule} name={name} className="ml-1" />
      </span>
      {d === "approved" ? (
        <Badge variant="success">approved</Badge>
      ) : d === "denied" ? (
        <Badge variant="destructive">denied</Badge>
      ) : override && matricule ? (
        <span className="flex gap-1.5">
          <Button size="xs" variant="success" onClick={override.onApprove}>
            Approve
          </Button>
          <DenyDialog onDeny={override.onDeny} trigger={<Button size="xs" variant="outline">Deny</Button>} />
        </span>
      ) : (
        <Badge variant="secondary">pending</Badge>
      )}
    </div>
  );
}

/**
 * A human access request as a lifecycle card (Filed → Manager → Owner → Granted) with both legs by name.
 * - `onDecide` → the four-eyes inbox: Approve/Deny the viewer's own open leg (server knows the approver).
 * - `onCancel` → the requester's own pending request.
 * - `onLegDecide` → ADMIN override (act as the leg's assigned approver, audited) to unblock a stuck leg —
 *   per-leg Approve/Deny on pending legs. (A dedicated reassign endpoint is a backend follow-up.)
 */
export function RequestCard({
  req,
  me,
  nameOf,
  onDecide,
  onCancel,
  onLegDecide,
}: {
  req: AccessRequest;
  me: string;
  nameOf: (m?: string | null) => string | undefined;
  onDecide?: (decision: "approved" | "denied", comment?: string) => void;
  onCancel?: () => void;
  onLegDecide?: (approver: string, decision: "approved" | "denied", comment?: string) => void;
}) {
  const st = stepState(req);
  const canDecide = !!onDecide && myOpenLegs(req, me).length > 0;
  const canCancel = !!onCancel && req.requesterId === me && req.status === "pending";
  const title = req.role
    ? `${req.role.name}${req.role.application ? ` · ${req.role.application.name}` : ""}`
    : req.id;

  const legOverride = (approver: string | null) =>
    onLegDecide && req.status === "pending" && approver
      ? {
          onApprove: () => onLegDecide(approver, "approved"),
          onDeny: (c: string) => onLegDecide(approver, "denied", c),
        }
      : undefined;

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-semibold text-primary">
          <Briefcase className="size-4 text-brand" />
          {title}
        </span>
        {statusBadge(req.status)}
      </div>

      <div className="mb-4 px-2">
        <StatusStepper steps={STEPS} activeIndex={st.activeIndex} failed={st.failed} />
      </div>

      <p className="mb-3 text-sm text-muted-foreground">
        Requested by <PersonLabel matricule={req.requesterId} name={nameOf(req.requesterId)} />
      </p>

      <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
        <LegRow
          icon={UserRound}
          label="Manager"
          matricule={req.managerApprover}
          name={nameOf(req.managerApprover)}
          decision={req.managerDecision}
          override={legOverride(req.managerApprover)}
        />
        <LegRow
          icon={ShieldCheck}
          label="Role owner"
          matricule={req.ownerApprover}
          name={nameOf(req.ownerApprover)}
          decision={req.ownerDecision}
          override={legOverride(req.ownerApprover)}
        />
      </div>

      {(canDecide || canCancel) && (
        <div className="mt-4 flex gap-2">
          {canDecide && (
            <>
              <Button size="sm" variant="success" onClick={() => onDecide?.("approved")}>
                Approve
              </Button>
              <DenyDialog
                onDeny={(c) => onDecide?.("denied", c)}
                trigger={
                  <Button size="sm" variant="outline">
                    Deny
                  </Button>
                }
              />
            </>
          )}
          {canCancel && (
            <Button size="sm" variant="outline" onClick={onCancel}>
              Cancel request
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

function DenyDialog({ onDeny, trigger }: { onDeny: (comment: string) => void; trigger: React.ReactNode }) {
  const [comment, setComment] = useState("");
  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Deny this request?</DialogTitle>
          <DialogDescription>
            Denying any leg rejects the request. A reason is recorded in the audit log.
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
