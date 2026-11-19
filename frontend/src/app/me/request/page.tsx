"use client";

/* Employee self-service — request a role for an application. Four-eyes (manager + role owner) is
   resolved server-side on submit; the requester is forced to self. */

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Info } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { useAccessData } from "@/hooks/use-access-data";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function RequestAccessPage() {
  const router = useRouter();
  const { apps, loading, error } = useAccessData();
  const [appId, setAppId] = useState("");
  const [roleId, setRoleId] = useState("");
  const [busy, setBusy] = useState(false);
  const roles = apps.find((a) => a.id === appId)?.roles ?? [];

  const submit = async () => {
    if (!roleId) return;
    setBusy(true);
    try {
      await api("/requests", { method: "POST", body: JSON.stringify({ roleId }) });
      toast.success("Access request submitted");
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
              <Select value={roleId} onValueChange={setRoleId} disabled={!appId}>
                <SelectTrigger>
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
            </div>

            <div className="flex items-start gap-2 rounded-lg bg-accent/60 p-3 text-xs text-muted-foreground">
              <Info className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>
                Both your <strong>manager</strong> and the <strong>role owner</strong> approve (four-eyes)
                before access is granted and provisioned into Authentik. You can track it under{" "}
                <strong>My requests</strong>.
              </span>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => router.push("/me")}>
                Cancel
              </Button>
              <Button variant="brand" disabled={!roleId || busy} onClick={submit}>
                {busy ? "Submitting…" : "Submit request"}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </AppShell>
  );
}
