import type { ExternalCollaborator } from './entities/external-collaborator.entity.js';

/**
 * The IAM→integration event contract (ADR-012 / ADR-011 seam). When an external collaborator is provisioned,
 * IAM emits this so **n8n** can create the matching *non-payroll HR worker* in ERPNext and bind the
 * `HR-EMP-xxxxx` id back (via `POST /collaborators/:id/hr-worker-ref`). IAM never writes ERPNext (ADR-009).
 *
 * **Loop-safe (R1):** `idempotencyKey` (the collaborator id) lets n8n/ERPNext upsert and recognise the
 * resulting bind-back as a confirmation, not a re-create — so there is no onboarded↔lifecycle event loop.
 */
export const EXTERNAL_COLLABORATOR_ONBOARDED_SUBJECT = 'iam.external_collaborator.onboarded';

/** JetStream stream (subjects `iam.>`) the onboarded event is published to. n8n consumes it. */
export const IAM_EVENTS_STREAM = 'IAM_EVENTS';
export const IAM_EVENTS_SUBJECTS = ['iam.>'];

export interface ExternalCollaboratorOnboardedEvent {
  /** Stable idempotency key — the IAM collaborator id (n8n upserts on it; bind-back is keyed on it). */
  idempotencyKey: string;
  event: 'external_collaborator.onboarded';
  collaboratorId: string;
  /** Authentik username (= the HR worker's user link). */
  username: string;
  displayName: string;
  email: string;
  /** The ERPNext `employment_type` to create: a firm → Prestataire, no firm → Freelance (non-payroll either way). */
  engagementType: 'Prestataire' | 'Freelance';
  /** The external firm (ESN) → ERPNext `custom_agency_or_firm`; null for a freelance. */
  firm: string | null;
  /** The accountable internal sponsor (manager) matricule. */
  sponsorMatricule: string;
  /** Engagement end = the hard access-expiry (ERPNext `contract_end_date`). ISO date, null if open. */
  endDate: string | null;
}

/** Build the onboarded event from a provisioned collaborator. `company` (firm) decides Prestataire vs Freelance. */
export function buildOnboardedEvent(c: ExternalCollaborator): ExternalCollaboratorOnboardedEvent {
  const firm = c.company?.trim() || null;
  return {
    idempotencyKey: c.id,
    event: 'external_collaborator.onboarded',
    collaboratorId: c.id,
    username: c.authentikUsername ?? c.name,
    displayName: c.displayName,
    email: c.email,
    engagementType: firm ? 'Prestataire' : 'Freelance',
    firm,
    sponsorMatricule: c.sponsorMatricule,
    endDate: c.expiresAt ? c.expiresAt.toISOString().slice(0, 10) : null,
  };
}
