import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { axe } from "jest-axe";
import { PersonLabel } from "@/components/person-label";
import { StatusStepper } from "@/components/status-stepper";
import { RequestCard } from "@/components/access/request-card";
import type { AccessRequest } from "@/hooks/use-access-data";

/**
 * The a11y gate (RGAA / BC02) — axe structural checks on the custom UI building blocks (roles,
 * accessible names, aria correctness). Pure components only, so no app-boot/auth is needed. Colour
 * contrast is verified separately (tokens tuned for AA) — axe cannot compute it in jsdom.
 */

const STEPS = [
  { key: "a", label: "Filed" },
  { key: "b", label: "Security" },
  { key: "c", label: "Owner" },
  { key: "d", label: "Active" },
];

const REQ: AccessRequest = {
  id: "r1",
  requesterId: "100001",
  status: "pending",
  managerApprover: "100002",
  ownerApprover: "100006",
  managerDecision: null,
  ownerDecision: null,
  role: { name: "Viewer", application: { name: "Grafana" } },
};

describe("a11y (axe) — custom components have no violations", () => {
  it("PersonLabel (name · matricule)", async () => {
    const { container } = render(<PersonLabel matricule="100001" name="Sophie K." />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("PersonLabel (matricule only)", async () => {
    const { container } = render(<PersonLabel matricule="100001" />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("StatusStepper", async () => {
    const { container } = render(<StatusStepper steps={STEPS} activeIndex={1} />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("StatusStepper (failed leg)", async () => {
    const { container } = render(<StatusStepper steps={STEPS} activeIndex={2} failed />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("RequestCard — read-only", async () => {
    const { container } = render(<RequestCard req={REQ} me="100099" nameOf={() => "Name"} />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("RequestCard — admin per-leg override", async () => {
    const { container } = render(
      <RequestCard req={REQ} me="100099" nameOf={() => "Name"} onLegDecide={() => {}} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
