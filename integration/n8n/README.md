# n8n integration — external collaborator → ERPNext non-payroll HR worker (ADR-012 / ADR-013)

When an external collaborator is **provisioned**, IAM emits `external_collaborator.onboarded` two ways
(both best-effort, neither fails provisioning):
1. **NATS** JetStream `IAM_EVENTS` (subject `iam.external_collaborator.onboarded`) — durable log (live in prod).
2. **n8n webhook POST** to `N8N_ONBOARD_WEBHOOK_URL`, HMAC-signed (`IAM-Signature`) — **the actual trigger**
   (n8n is webhook-native; it cannot consume NATS — ADR-013).

n8n creates the matching **non-payroll ERPNext `Employee`** and **binds the id back** to IAM. IAM never writes
ERPNext (ADR-009); n8n is the only ERPNext writer.

## Event payload (what the webhook receives)
```json
{
  "idempotencyKey": "<collaborator uuid>",
  "event": "external_collaborator.onboarded",
  "collaboratorId": "<collaborator uuid>",
  "username": "ext-acme-jdoe",
  "displayName": "Jane Doe (Acme)",
  "email": "jane@acme.example",
  "engagementType": "Prestataire",     // firm set → Prestataire, blank → Freelance
  "firm": "Acme Consulting (ESN)",     // null for a freelance
  "sponsorMatricule": "100006",
  "endDate": "2027-02-17"              // engagement end (= access expiry), null if open
}
```
Body is **canonical JSON** (sorted keys); verify `IAM-Signature` = `HMAC_SHA256(rawBody, HR_LIFECYCLE_SIGNING_KEY)`.

## Workflow (nodes in order)
1. **Webhook** (POST, path `iam-collaborator-onboarded`).
2. **Verify signature** (Code node): recompute HMAC over the raw body with the signing key; `!==` header → stop (401).
3. **ERPNext upsert `Employee`** (HTTP Request, idempotent on `custom_iam_collaborator_id` == `idempotencyKey`):
   - `GET  {ERPNEXT}/api/resource/Employee?filters=[["custom_iam_collaborator_id","=","{{idempotencyKey}}"]]`
   - if none → `POST {ERPNEXT}/api/resource/Employee`:
     ```json
     {
       "first_name": "{{displayName}}",
       "employment_type": "{{engagementType}}",         // Prestataire | Freelance (both: NO Salary Structure)
       "custom_agency_or_firm": "{{firm}}",
       "contract_end_date": "{{endDate}}",
       "company": "<the ERPNext Company>",
       "status": "Active",
       "custom_iam_collaborator_id": "{{idempotencyKey}}"
     }
     ```
   - **Never attach a Salary Structure Assignment** → the worker can never enter a Payroll Entry.
   - Auth header: `Authorization: token <api_key>:<api_secret>` (the ERPNext service user).
4. **Bind back to IAM** (HTTP Request):
   - `POST {IAM}/api/collaborators/{{collaboratorId}}/hr-worker-ref`
   - headers: `X-IAM-Service-Key: <IAM_SERVICE_KEY>`, `content-type: application/json`
   - body: `{"hrWorkerRef": "{{ERPNext Employee name e.g. HR-EMP-00042}}"}`
5. **Notify** (optional) — Matrix/email to IT/HR.

> `custom_iam_collaborator_id` + `custom_agency_or_firm` are custom fields on `Employee`. `custom_agency_or_firm`
> was added in ADR-012 Step 1; add `custom_iam_collaborator_id` (Data, the idempotency key) the same way.

## Wiring checklist — ✅ DONE + QA-verified on dev (2026-11-20)
- [x] **ERPNext API token** — service user `iam-integration@devandre.sbs` (HR Manager) + `api_key`/`api_secret`;
      custom fields `custom_agency_or_firm` + `custom_iam_collaborator_id` (unique) on `Employee`; **`gender` +
      `date_of_birth` made non-mandatory** (Property Setter) — externals legitimately have neither.
- [x] **Vault** (break-glass): `secret/platform/ktayl-iam-integration` = `erpnext-api-key`, `erpnext-api-secret`,
      `service-key` (`IAM_SERVICE_KEY`), `n8n-webhook-url`.
- [x] **IAM env (dev)** — `N8N_ONBOARD_WEBHOOK_URL` (literal) + `IAM_SERVICE_KEY` (ESO) → gitops #2322. The
      publisher now emits the signed webhook; the `hr-worker-ref` writeback accepts the key (real→404, wrong→401).
- [x] **n8n** — `n8n-iam-integration` ExternalSecret (`ERPNEXT_API_KEY/SECRET` + `IAM_SERVICE_KEY`) + `envFrom`
      (gitops #2322); netpol `allow-iam-to-n8n-webhook` (IAM→n8n:5678). Workflow imported + **active**.
- [x] **QA on dev** — fired the `onboarded` event → ERPNext `Employee` created (Prestataire · firm · **no Salary
      Structure** → never payroll) → `hr_worker_ref` bound back into IAM. ✅ Full loop verified.

### As-built notes (the gotchas that cost us)
- **Use a Code node with `this.helpers.httpRequest`**, not templated HTTP-Request nodes — the latter's `jsonBody`
  / header expressions are fragile. The committed `*.workflow.json` is the Code-node version.
- **ERPNext `Employee` mandatory fields:** `first_name`, `company` (= `Ktayl Solutions`), `date_of_joining`
  (= today) — plus `gender`/`date_of_birth` unless made non-mandatory (we did). Returns `417` when one is missing
  **or** on a duplicate `custom_iam_collaborator_id` (it's `unique`).
- **The IAM collaborator id must be a valid UUID** (`ParseUUIDPipe`) — real ids are v4; a hand-made test id with a
  bad version nibble `400`s the writeback.
- **n8n reaches ERPNext/IAM via the `erp.devandre.sbs` / `iam-dev.10.0.0.200.nip.io` ingress** with
  `skipSslCertificateValidation` (minicloud CA); the `automation` ns default-denies ingress but egress is open.

### Hardening + prod enablement (ADR-013b) — ✅ DONE + QA-verified (2026-11-20)
- [x] **Prod routing** — the event carries **`iamCallbackBaseUrl`** (IAM stamps its own env's base URL from
      `IAM_CALLBACK_BASE_URL`); the workflow binds back to it (dev→dev IAM, prod→prod IAM — one n8n, both envs).
      Verified: `boundTo` reflects the event's base-URL. Prod IAM gets `N8N_ONBOARD_WEBHOOK_URL` + the prod
      callback URL + a netpol `ktayl-iam-prod → n8n`.
- [x] **Idempotency (GET-first)** — the workflow looks up the worker by `custom_iam_collaborator_id` and reuses
      it; only creates if absent. Verified: a re-fire returns the **same** `HR-EMP-xxxxx` (no `417` duplicate).
- [x] **HMAC verification** — the Code node recomputes `HMAC-SHA256(JSON.stringify(body), HR_LIFECYCLE_SIGNING_KEY)`
      and compares the `IAM-Signature` header. Verified: good-sig → 200, **forged sig → 500 (rejected)**. IAM signs
      this event with `JSON.stringify` (not canonicalJson) so n8n can reproduce the bytes from the parsed body.

See `netpol-automation-egress.yaml` for the (optional, egress-hardening) manifests; the load-bearing one applied
was `is/workplace/n8n/07-netpol-iam-to-n8n.yaml` (ingress IAM→n8n).
