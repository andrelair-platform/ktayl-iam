# Contributing

## Branch strategy (trunk-based)

| Branch | Rules |
|---|---|
| `main` | Only deploy branch. **PR required + GPG-signed commits.** CI builds `:<sha>` (Harbor dev + ghcr prod), cosign + SBOM. release-please cuts SemVer releases; Kargo promotes dev→prod. |
| `dev` | Working/integration branch (NOT a deploy track). |
| `feat/…` `fix/…` `docs/…` `chore/…` | → PR → `main`. Short-lived; auto-deleted on merge. |

`staging` does not exist (2-env standard: dev + prod). See `minicloud-gitops/.claude/rules/ci-registry.md`.

## Commit style

Conventional commits — `type(scope): message`. release-please derives version bumps from these
(`feat:` → minor, `fix:` → patch, `feat!:` → major).

Common types: `feat`, `fix`, `docs`, `chore`, `ci`, `refactor`, `test`.

```
feat(S004): dual-approval (manager + role owner) workflow
fix(ci): drop base-image npm from runtime (Trivy CRITICAL)
docs(iam): access role & tier model
```

## PR requirements

- All CI checks green before merge (lint + build + test; on main also image build + Trivy + cosign + SBOM).
- `main` requires **GPG-signed commits** (key `FD6D39D681DEFA34`) — merge with **squash** (single signed commit).
- **No `Co-Authored-By` lines** — commits represent the portfolio owner's work.

## Running locally

```bash
# backend  (--legacy-peer-deps: Nest 12 scaffold peer-dep graph)
cd backend  && npm ci --legacy-peer-deps && npm run lint && npm run build && npm test
# frontend
cd frontend && npm ci                     && npm run lint && npm run build
```
