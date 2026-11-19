# public.external_collaborator

## Columns

| Name                | Type                     | Default                        | Nullable | Children                                                                        | Parents | Comment |
| ------------------- | ------------------------ | ------------------------------ | -------- | ------------------------------------------------------------------------------- | ------- | ------- |
| authentik_username  | varchar(160)             |                                | true     |                                                                                 |         |         |
| company             | varchar(200)             |                                | true     |                                                                                 |         |         |
| created_at          | timestamp with time zone | now()                          | false    |                                                                                 |         |         |
| created_by          | varchar(32)              |                                | false    |                                                                                 |         |         |
| display_name        | varchar(200)             |                                | false    |                                                                                 |         |         |
| email               | varchar(200)             |                                | false    |                                                                                 |         |         |
| expires_at          | timestamp with time zone |                                | true     |                                                                                 |         |         |
| group_refs          | text[]                   | '{}'::text[]                   | false    |                                                                                 |         |         |
| hr_worker_ref       | varchar(60)              |                                | true     |                                                                                 |         |         |
| id                  | uuid                     | gen_random_uuid()              | false    | [public.external_collaborator_request](public.external_collaborator_request.md) |         |         |
| last_recertified_at | timestamp with time zone |                                | true     |                                                                                 |         |         |
| name                | varchar(120)             |                                | false    |                                                                                 |         |         |
| purpose             | text                     |                                | false    |                                                                                 |         |         |
| sponsor_matricule   | varchar(32)              |                                | false    |                                                                                 |         |         |
| status              | varchar(16)              | 'requested'::character varying | false    |                                                                                 |         |         |
| type                | varchar(20)              |                                | false    |                                                                                 |         |         |

## Constraints

| Name                               | Type        | Definition                                                                                                                                                                                               |
| ---------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| external_collaborator_pkey         | PRIMARY KEY | PRIMARY KEY (id)                                                                                                                                                                                         |
| external_collaborator_status_check | CHECK       | CHECK (((status)::text = ANY ((ARRAY['requested'::character varying, 'active'::character varying, 'expired'::character varying, 'disabled'::character varying, 'flagged'::character varying])::text[]))) |
| external_collaborator_type_check   | CHECK       | CHECK (((type)::text = ANY ((ARRAY['contractor'::character varying, 'auditor'::character varying, 'broker'::character varying, 'partner'::character varying])::text[])))                                 |

## Indexes

| Name                          | Definition                                                                                           |
| ----------------------------- | ---------------------------------------------------------------------------------------------------- |
| external_collaborator_pkey    | CREATE UNIQUE INDEX external_collaborator_pkey ON public.external_collaborator USING btree (id)      |
| uq_external_collaborator_name | CREATE UNIQUE INDEX uq_external_collaborator_name ON public.external_collaborator USING btree (name) |

## Relations

```mermaid
erDiagram

"public.external_collaborator_request" }o--|| "public.external_collaborator" : "FOREIGN KEY (collaborator_id) REFERENCES external_collaborator(id) ON DELETE CASCADE"

"public.external_collaborator" {
  varchar_160_ authentik_username
  varchar_200_ company
  timestamp_with_time_zone created_at
  varchar_32_ created_by
  varchar_200_ display_name
  varchar_200_ email
  timestamp_with_time_zone expires_at
  text__ group_refs
  varchar_60_ hr_worker_ref
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
```

---

> Generated by [tbls](https://github.com/k1LoW/tbls)
