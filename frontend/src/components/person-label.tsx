import { cn } from "@/lib/utils";

/**
 * Renders a person as **name · matricule** (both kept — the name is the human, the matricule is the key).
 * `name` comes resolved from the directory (`useDirectory`); when unknown, shows the matricule alone.
 */
export function PersonLabel({
  matricule,
  name,
  className,
}: {
  matricule: string | null | undefined;
  name?: string;
  className?: string;
}) {
  if (!matricule) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={cn("inline-flex items-baseline gap-1.5", className)}>
      {name ? (
        <>
          <span className="font-medium text-foreground">{name}</span>
          <span className="font-mono text-xs text-muted-foreground">· {matricule}</span>
        </>
      ) : (
        <span className="font-mono text-foreground">{matricule}</span>
      )}
    </span>
  );
}
