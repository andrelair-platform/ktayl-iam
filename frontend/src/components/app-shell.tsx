"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bot,
  Boxes,
  CheckSquare,
  FilePlus2,
  Inbox,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  LogOut,
  ScrollText,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { useMe, type Me } from "@/hooks/use-me";
import { can, capabilitiesFor, type Capability } from "@/lib/capabilities";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  cap?: Capability; // when set, the item shows only if the user holds it
}

// Target IA (frontend-redesign.md §4); paths keep the current routes during migration.
const MY_ACCESS: NavItem[] = [
  { href: "/me", label: "Dashboard", icon: LayoutDashboard },
  { href: "/me/request", label: "Request access", icon: FilePlus2 },
  { href: "/me/requests", label: "My requests", icon: ListChecks },
  { href: "/me/approvals", label: "My approvals", icon: CheckSquare },
];
const ADMIN: NavItem[] = [
  { href: "/admin/requests", label: "Access requests", icon: Inbox, cap: "requests:reassign" },
  { href: "/admin", label: "Catalog", icon: Boxes, cap: "catalog:manage" },
  { href: "/admin/service-accounts", label: "Service accounts", icon: Bot, cap: "service_accounts:manage" },
  { href: "/admin/audit", label: "Audit log", icon: ScrollText, cap: "audit:read:all" },
];

function envLabel(): string {
  if (typeof window === "undefined") return "";
  const h = window.location.hostname;
  if (h.includes("-dev") || h.startsWith("localhost") || h === "127.0.0.1") return "dev";
  return "prod";
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
      )}
    >
      <Icon className={cn("size-4", active && "text-brand")} />
      {item.label}
    </Link>
  );
}

function initials(name?: string, matricule?: string): string {
  if (name) {
    const p = name.trim().split(/\s+/);
    return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "?";
  }
  return matricule?.slice(0, 2) ?? "?";
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-background p-6">
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-sm">{children}</div>
    </main>
  );
}

/**
 * The persistent app shell — a role-aware sidebar + topbar wrapping every authed page. Handles the
 * loading, signed-out and no-access states so pages don't re-implement them. Nav items are gated by
 * CAPABILITY (not raw isAdmin), so the ADMIN group adapts to the persona (no dead links / 403s).
 */
export function AppShell({
  children,
  title,
  actions,
}: {
  children: ReactNode;
  title?: string;
  actions?: ReactNode;
}) {
  const state = useMe();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  if (state.status === "loading") {
    return (
      <div className="flex min-h-dvh">
        <aside className="hidden w-60 border-r bg-card p-4 md:block">
          <Skeleton className="mb-6 h-7 w-32" />
          <Skeleton className="mb-2 h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </aside>
        <main className="flex-1 p-8">
          <Skeleton className="mb-4 h-8 w-48" />
          <Skeleton className="h-64 w-full" />
        </main>
      </div>
    );
  }

  if (state.status === "anon") {
    return (
      <Centered>
        <div className="flex flex-col items-center gap-3 text-center">
          <ShieldCheck className="size-8 text-primary" />
          <h1 className="text-lg font-semibold text-foreground">ktayl Access Governance</h1>
          <p className="text-sm text-muted-foreground">Your session has expired. Please sign in.</p>
          <Button asChild variant="brand" className="mt-1 w-full">
            <a href="/api/auth/login">Sign in with Authentik</a>
          </Button>
        </div>
      </Centered>
    );
  }

  const me: Me = state.me;
  const caps = capabilitiesFor(me);
  const adminItems = ADMIN.filter((i) => !i.cap || caps.has(i.cap));
  const sidebar = (
    <nav className="flex flex-1 flex-col gap-6 p-3">
      <div className="space-y-1">
        <p className="px-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          My access
        </p>
        {MY_ACCESS.map((i) => (
          <NavLink key={i.href} item={i} active={pathname === i.href} />
        ))}
      </div>
      {adminItems.length > 0 && (
        <div className="space-y-1">
          <p className="px-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Admin · IT
          </p>
          {adminItems.map((i) => (
            <NavLink key={i.href} item={i} active={pathname === i.href} />
          ))}
        </div>
      )}
    </nav>
  );

  return (
    <div className="flex min-h-dvh bg-background">
      {/* Sidebar (desktop) */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r bg-card md:flex">
        <div className="flex items-center gap-2 px-4 py-4">
          <KeyRound className="size-5 text-brand" />
          <span className="font-semibold text-primary">ktayl IAM</span>
        </div>
        {sidebar}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b bg-card/80 px-4 py-3 backdrop-blur md:px-6">
          <div className="flex items-center gap-2 md:hidden">
            <KeyRound className="size-5 text-brand" />
            <span className="font-semibold text-primary">IAM</span>
          </div>
          {title && (
            <h1 className="truncate text-base font-semibold text-foreground md:text-lg">{title}</h1>
          )}
          <span className="ml-auto flex items-center gap-3">
            {actions}
            <span className="rounded-full border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {envLabel()}
            </span>
            <DropdownMenu open={open} onOpenChange={setOpen}>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Avatar className="size-8">
                    <AvatarFallback className="bg-primary text-xs text-primary-foreground">
                      {initials(undefined, me.username)}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="font-medium">{me.username}</div>
                  <div className="text-xs font-normal text-muted-foreground">
                    {me.isAdmin ? "Admin · IT" : "Employee"}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => {
                    fetch("/api/auth/logout", { method: "POST", credentials: "include" }).finally(
                      () => {
                        // Full reload (not a client nav) after sign-out — resets all session-derived state.
                        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
                        window.location.href = "/";
                      },
                    );
                  }}
                >
                  <LogOut className="size-4" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </span>
        </header>

        {/* Mobile nav (simple) */}
        <div className="border-b bg-card md:hidden">{sidebar}</div>

        <main className="flex-1 p-4 md:p-8">
          <div className="mx-auto w-full max-w-5xl">{children}</div>
        </main>
      </div>
    </div>
  );
}

/** Convenience: the `can()` check bound to the shell's principal, for action gating inside pages. */
export function useCan() {
  const state = useMe();
  const me = state.status === "authed" ? state.me : null;
  return (cap: Capability) => can(me, cap);
}
