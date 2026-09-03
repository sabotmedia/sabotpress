# Native Content Editorial Workflow

This phase adds three things together:

## 1. Scheduling
Native content entries may now include:

- `scheduledFor`

Public routes should not render scheduled published entries until the scheduled time has passed.

## 2. Revisions
Each native content save now writes revision snapshots to:

- `native_public_content_revisions`

Delete operations also save a pre-delete revision.

Restore is available through:

- `/api/native-content-revisions`

## 3. Workflow states
Native entries now track:

- `draft`
- `in_review`
- `needs_revision`
- `ready`
- `scheduled`
- `published`
- `archived`

These are editorial workflow states and should not be treated as identical to public visibility, though they are related.

## Required SQL
Apply both:

- `db/native_public_content.sql`
- `db/native_public_content_revisions.sql`

## Public visibility rule
Current public visibility is:

- `status === published`
- workflow state not archived
- scheduled time not in the future

## Notes
This is a practical first revision/workflow system, not a final collaborative editorial platform.
