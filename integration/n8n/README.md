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

## Owner wiring checklist (what needs secrets / the n8n UI)
- [ ] **ERPNext API token** — create a service user (e.g. `iam-integration@…`) with Employee create/read perms →
      generate `api_key`/`api_secret`.
- [ ] **Vault** (break-glass): `secret/platform/ktayl-iam-integration` = `erpnext-api-key`, `erpnext-api-secret`,
      `service-key` (a fresh random `IAM_SERVICE_KEY`), `n8n-webhook-url`.
- [ ] **IAM env** (gitops `services/ktayl-iam/helm/values-*.yaml` + an ESO ExternalSecret): `IAM_SERVICE_KEY`
      and `N8N_ONBOARD_WEBHOOK_URL` (dev first). Until set, the webhook-emit is off + the writeback is fail-closed.
- [ ] **egress netpols** — apply `netpol-automation-egress.yaml` (below) in minicloud-gitops: `automation → erp`
      + `automation → ktayl-iam(-prod)` + `automation → DNS`.
- [ ] **n8n** — import `external-collaborator-onboarding.workflow.json`, set the ERPNext + IAM credentials, set
      the signing key, **activate**; copy the webhook URL into Vault → IAM.
- [ ] **QA on dev** — provision a test external collaborator → the ERPNext `Employee` appears (non-payroll) →
      `hr_worker_ref` binds → the console shows the `HR-EMP-xxxxx` (flag clears from `pending`).

See `netpol-automation-egress.yaml` for the exact NetworkPolicy manifests.
