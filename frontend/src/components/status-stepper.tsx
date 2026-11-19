import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Step {
  key: string;
  label: string;
}

/**
 * The request lifecycle as a horizontal stepper — steps before `activeIndex` are done (success), the
 * active one is current (brand, or destructive if `failed`), the rest upcoming. Makes "where is this
 * request right now" obvious at a glance (the redesign's lifecycle-over-lists principle).
 */
export function StatusStepper({
  steps,
  activeIndex,
  failed = false,
}: {
  steps: Step[];
  activeIndex: number;
  failed?: boolean;
}) {
  return (
    <ol className="flex items-start" aria-label="Request lifecycle">
      {steps.map((s, i) => {
        const done = i < activeIndex;
        const current = i === activeIndex;
        return (
          <li key={s.key} className={cn("flex items-center", i < steps.length - 1 && "flex-1")}>
            <div className="flex flex-col items-center gap-1.5">
              <span
                className={cn(
                  "grid size-6 place-items-center rounded-full border text-[11px] font-semibold",
                  done && "border-success bg-success text-success-foreground",
                  current && !failed && "border-brand bg-brand text-brand-foreground",
                  current && failed && "border-destructive bg-destructive text-destructive-foreground",
                  !done && !current && "border-border bg-muted text-muted-foreground",
                )}
                aria-current={current ? "step" : undefined}
              >
                {done ? (
                  <Check className="size-3.5" />
                ) : current && failed ? (
                  <X className="size-3.5" />
                ) : (
                  i + 1
                )}
              </span>
              <span
                className={cn(
                  "text-[11px] whitespace-nowrap",
                  done || current ? "font-medium text-foreground" : "text-muted-foreground",
                )}
              >
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <span className={cn("mx-1 mb-5 h-px flex-1", done ? "bg-success" : "bg-border")} />
            )}
          </li>
        );
      })}
    </ol>
  );
}
