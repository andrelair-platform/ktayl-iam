"use client";

/* Employee self-service — request one OR several roles (ADR-017 batch). Each role still gets its own
   four-eyes (manager + that role's owner), resolved server-side; a multi-role submission is grouped under
   one trackable batch instance. The requester is forced to self. */

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Info, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { useAccessData, type Application, type Role } from "@/hooks/use-access-data";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface BasketItem {
  roleId: string;
  roleName: string;
  appName: string;
}

/** The roles of the currently-selected application (empty when none is picked). */
function rolesFor(apps: Application[], appId: string): Role[] {
  return apps.find((a) => a.id === appId)?.roles ?? [];
}

export default function RequestAccessPage() {
  const router = useRouter();
  const { apps, loading, error } = useAccessData();
  const [appId, setAppId] = useState("");
  const [roleId, setRoleId] = useState("");
  const [basket, setBasket] = useState<BasketItem[]>([]);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const roles = rolesFor(apps, appId);

  const addToBasket = () => {
    if (!roleId) return;
    if (basket.some((b) => b.roleId === roleId)) {
      toast.info("That role is already in your request");
      return;
    }
    const app = apps.find((a) => a.id === appId);
    const role = app?.roles.find((r) => r.id === roleId);
    if (!app || !role) return;
    setBasket((b) => [...b, { roleId: role.id, roleName: role.name, appName: app.name }]);
    setRoleId("");
  };

  const removeFromBasket = (id: string) => setBasket((b) => b.filter((x) => x.roleId !== id));

  const submit = async () => {
    if (basket.length === 0) return;
    setBusy(true);
    try {
      if (basket.length === 1) {
        await api("/requests", { method: "POST", body: JSON.stringify({ roleId: basket[0].roleId }) });
        toast.success("Access request submitted");
      } else {
        await api("/requests/batch", {
          method: "POST",
          body: JSON.stringify({
            roleIds: basket.map((b) => b.roleId),
            label: label.trim() || undefined,
          }),
        });
        toast.success(`Batch request submitted (${basket.length} roles)`);
      }
      router.push("/me/requests");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell title="Request access">
      <Card className="max-w-lg p-6">
        {error && <p className="mb-4 text-sm text-destructive">Error: {error}</p>}
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : (
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label>Application</Label>
              <Select
                value={appId}
                onValueChange={(v) => {
                  setAppId(v);
                  setRoleId("");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pick an application…" />
                </SelectTrigger>
                <SelectContent>
                  {apps.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label>Role</Label>
              <div className="flex gap-2">
                <Select value={roleId} onValueChange={setRoleId} disabled={!appId}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder={appId ? "Pick a role…" : "Pick an application first"} />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" disabled={!roleId} onClick={addToBasket} title="Add role">
                  <Plus className="size-4" /> Add
                </Button>
              </div>
            </div>

            {basket.length > 0 && (
              <div className="grid gap-2 rounded-lg border p-3">
                <Label className="text-xs text-muted-foreground">
                  Requesting {basket.length} role{basket.length > 1 ? "s" : ""}
                </Label>
                <div className="flex flex-wrap gap-2">
                  {basket.map((b) => (
                    <Badge key={b.roleId} variant="secondary" className="gap-1 pr-1">
                      <span>
                        {b.appName} · {b.roleName}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeFromBasket(b.roleId)}
                        className="rounded-full p-0.5 hover:bg-background/60"
                        aria-label={`Remove ${b.roleName}`}
                      >
                        <X className="size-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
                {basket.length > 1 && (
                  <div className="grid gap-1.5 pt-1">
                    <Label htmlFor="batch-label" className="text-xs">
                      Batch title (optional)
                    </Label>
                    <Input
                      id="batch-label"
                      value={label}
                      onChange={(e) => setLabel(e.target.value)}
                      placeholder="e.g. Onboarding access for my new project"
                    />
                  </div>
                )}
              </div>
            )}

            <div className="flex items-start gap-2 rounded-lg bg-accent/60 p-3 text-xs text-muted-foreground">
              <Info className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>
                Each role is approved by <strong>both</strong> your <strong>manager</strong> and that{" "}
                <strong>role&apos;s owner</strong> (four-eyes). A multi-role request is grouped under one
                trackable instance — a role is granted as soon as its own two approvals clear. Track it under{" "}
                <strong>My requests</strong>.
              </span>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => router.push("/me")}>
                Cancel
              </Button>
              <Button variant="brand" disabled={basket.length === 0 || busy} onClick={submit}>
                {busy
                  ? "Submitting…"
                  : basket.length > 1
                    ? `Submit ${basket.length} roles`
                    : "Submit request"}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </AppShell>
  );
}
