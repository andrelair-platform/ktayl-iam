# Sprint — IGA v3 (JML / event-driven lifecycle) — GREENFIELD

Builds the **event-driven** half of access governance (the SAP Joiner/Mover/Leaver model) — net-new,
on top of v1's catalog/assignment/sync/audit substrate. **Governing principle:** _workspace = birthright
(auto on join, no approval); business/LOB/engineering = on-request (v1 four-eyes, never auto-granted)._
Full plan + readiness gate: [`docs/iga-v3-lifecycle-sprint-plan.md`](../../../docs/iga-v3-lifecycle-sprint-plan.md).

Board **#17** · milestone **IGA — Access Governance v3 (JML lifecycle)** · depends on **v2**.

| Story | Title | Pts | Cut | Status |
|---|---|---|---|---|
| S014 | Catalog: birthright vs on-request + workspace profile | 5 | MVP | Draft |
| S015 | HR-event intake (ERPNext → ktayl-iam) | 8 | MVP | Draft |
| S016 | Joiner: auto-provision the workspace birthright (no approval) | 8 | MVP | Draft |
| S017 | Leaver: auto-deprovision ALL access | 5 | MVP | Draft |
| S018 | Mover: recompute birthright + flag old access for recert | 8 | complete | Draft |
| S019 | JML fan-out orchestration (n8n → GLPI + email) | 5 | complete | Draft |
| S020 | Lifecycle evidence + RH↔IT drift reconcile | 5 | complete | Draft |

**≈44 pts — an epic (two sprints).** MVP (S014-S017, ≈26) = the owner's birthright rule + no-dangling-access.
Sequence: S014 → S015 → S016 ∥ S017 → (S018 · S019 · S020).
