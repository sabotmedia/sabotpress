# Phase 39 Backup Notes

This pass adds a pragmatic backup export surface.

## What it exports
- native content
- native revisions
- taxonomy terms
- editor roles
- audit log entries

## What it does not do
- server-side restore
- automated scheduled backups
- homepage config export
- database dump orchestration

## Why this exists
A downloadable JSON snapshot is better than discovering too late that recovery was mostly a spiritual concept.
