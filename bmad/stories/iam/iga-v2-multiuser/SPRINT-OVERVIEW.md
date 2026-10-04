# Sprint — IGA v2 (real multi-user login)

Makes the four-eyes control **operational**: ordinary employees log in as requesters, managers + role
owners log in as approvers, and the dev `ALLOW_APPROVER_OVERRIDE` is retired in prod. Builds on the v1
slice (S001–S007, live on dev). Full plan + readiness gate: [`docs/iga-v2-multiuser-sprint-plan.md`](../../../docs/iga-v2-multiuser-sprint-plan.md).

Board **#17** · milestone **IGA — Access Governance v2 (multi-user)** · Path B.

| Story | Title | Pts | Status |
|---|---|---|---|
| S008 | Multi-user authentication (admit any authenticated user) | 5 | Draft |
| S009 | Role-based authorization (AdminOnly guard + request scoping) | 8 | Draft |
| S010 | Self-service requester experience (UI) | 5 | Draft |
| S011 | Approvals inbox (UI) | 5 | Draft |
| S012 | Notifications (requester + approver) — *stretch* | 5 | Draft |
| S013 | Prod hardening + shared session store, then promote | 3 | Draft |

**Sequence:** S008 → S009 (land together) → S010 ∥ S011 → S012 (stretch) → S013. ≈31 pts (26 without S012).
