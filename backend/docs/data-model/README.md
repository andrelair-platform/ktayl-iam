# ktayl_iam

## Tables

| Name                                                                            | Columns | Comment | Type       |
| ------------------------------------------------------------------------------- | ------- | ------- | ---------- |
| [public.application](public.application.md)                                     | 7       |         | BASE TABLE |
| [public.assignment](public.assignment.md)                                       | 10      |         | BASE TABLE |
| [public.audit_log](public.audit_log.md)                                         | 7       |         | BASE TABLE |
| [public.external_collaborator](public.external_collaborator.md)                 | 15      |         | BASE TABLE |
| [public.external_collaborator_request](public.external_collaborator_request.md) | 10      |         | BASE TABLE |
| [public.identity](public.identity.md)                                           | 16      |         | BASE TABLE |
| [public.request](public.request.md)                                             | 10      |         | BASE TABLE |
| [public.role](public.role.md)                                                   | 8       |         | BASE TABLE |
| [public.service_account](public.service_account.md)                             | 12      |         | BASE TABLE |
| [public.service_account_request](public.service_account_request.md)             | 11      |         | BASE TABLE |

## Relations

```mermaid
erDiagram

"public.assignment" }o--|| "public.role" : "FOREIGN KEY (role_id) REFERENCES role(id) ON DELETE CASCADE"
"public.external_collaborator_request" }o--|| "public.external_collaborator" : "FOREIGN KEY (collaborator_id) REFERENCES external_collaborator(id) ON DELETE CASCADE"
"public.request" }o--|| "public.role" : "FOREIGN KEY (role_id) REFERENCES role(id) ON DELETE CASCADE"
"public.role" }o--|| "public.application" : "FOREIGN KEY (application_id) REFERENCES application(id) ON DELETE CASCADE"
"public.service_account_request" }o--|| "public.service_account" : "FOREIGN KEY (service_account_id) REFERENCES service_account(id) ON DELETE CASCADE"

"public.application" {
  varchar_160_ authentik_app_ref
  timestamp_with_time_zone created_at
  text description
  uuid id
  varchar_120_ name
  varchar_20_ tier
  timestamp_with_time_zone updated_at
}
"public.assignment" {
  timestamp_with_time_zone granted_at
  varchar_32_ granted_by
  uuid id
  text last_sync_error
  timestamp_with_time_zone revoked_at
  varchar_32_ revoked_by
  uuid role_id FK
  varchar_20_ status
  timestamp_with_time_zone synced_at
  varchar_32_ user_id
}
"public.audit_log" {
  varchar_60_ action
  varchar_32_ actor
  timestamp_with_time_zone at
  jsonb detail
  varchar_64_ entity_id
  varchar_40_ entity_type
  uuid id
}
"public.external_collaborator" {
  varchar_160_ authentik_username
  varchar_200_ company
  timestamp_with_time_zone created_at
  varchar_32_ created_by
  varchar_200_ display_name
  varchar_200_ email
  timestamp_with_time_zone expires_at
  text__ group_refs
  uuid id
  timestamp_with_time_zone last_recertified_at
  varchar_120_ name
  text purpose
  varchar_32_ sponsor_matricule
  varchar_16_ status
  varchar_20_ type
}
"public.external_collaborator_request" {
  uuid collaborator_id FK
  timestamp_with_time_zone created_at
  uuid id
  varchar_32_ requester_id
  varchar_32_ security_approver
  jsonb security_decision
  varchar_32_ sponsor_approver
  jsonb sponsor_decision
  varchar_20_ status
  timestamp_with_time_zone updated_at
}
"public.identity" {
  boolean authentik_provisioned
  varchar_80_ country
  timestamp_with_time_zone created_at
  varchar_120_ department
  timestamp_with_time_zone deprovisioned_at
  varchar_190_ email
  varchar_120_ entity
  varchar_160_ full_name
  varchar_64_ initial_mailbox_password
  varchar_60_ job
  timestamp_with_time_zone last_event_at
  boolean mailbox_provisioned
  varchar_32_ matricule
  date offboard_date
  varchar_20_ status
  timestamp_with_time_zone updated_at
}
"public.request" {
  timestamp_with_time_zone created_at
  uuid id
  varchar_32_ manager_approver
  jsonb manager_decision
  varchar_32_ owner_approver
  jsonb owner_decision
  varchar_32_ requester_id
  uuid role_id FK
  varchar_20_ status
  timestamp_with_time_zone updated_at
}
"public.role" {
  uuid application_id FK
  varchar_160_ authentik_group_ref
  timestamp_with_time_zone created_at
  text description
  uuid id
  varchar_120_ name
  varchar_32_ owner
  timestamp_with_time_zone updated_at
}
"public.service_account" {
  varchar_160_ authentik_username
  timestamp_with_time_zone created_at
  varchar_32_ created_by
  varchar_200_ display_name
  text__ group_refs
  uuid id
  timestamp_with_time_zone last_recertified_at
  varchar_120_ name
  varchar_32_ owner_matricule
  varchar_16_ status
  varchar_16_ type
  varchar_200_ vault_secret_ref
}
"public.service_account_request" {
  timestamp_with_time_zone created_at
  uuid id
  text justification
  varchar_32_ owner_approver
  jsonb owner_decision
  varchar_32_ requester_id
  varchar_32_ security_approver
  jsonb security_decision
  uuid service_account_id FK
  varchar_20_ status
  timestamp_with_time_zone updated_at
}
```

---

> Generated by [tbls](https://github.com/k1LoW/tbls)
