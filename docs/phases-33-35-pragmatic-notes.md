# Phases 33 to 35 Pragmatic Notes

This pass adds:

## Phase 33
A first pragmatic collaboration layer:
- editor roles table
- roles admin page
- admin/editor/contributor/reviewer/viewer records

## Phase 34
Audit log:
- audit log table
- audit log API
- event writes for editor role changes
- patch hooks can extend this later to more entities

## Phase 35
Design system consolidation:
- shared design tokens
- reusable surface card utility
- stack spacing utilities
- design system reference page

Apply:
- `db/editor_roles.sql`
- `db/audit_log.sql`
