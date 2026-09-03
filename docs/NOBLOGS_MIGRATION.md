# Moving from Noblogs / WordPress

SabotPress keeps WordPress/Noblogs import as a migration path instead of requiring editors to rebuild an archive by hand.

Export the old site as WordPress WXR/XML, keep an untouched copy of that export, and run the repository importer against it. Imported publication content is instance data and should not be committed to the SabotPress software repository.

A migration should preserve post/page titles, dates, authors where available, taxonomy, body content, media references and old slugs. Existing import tooling lives under `scripts/`; test the import on a disposable install before pointing an old public domain at the new site.

The intended nontechnical flow is:

1. Export the old Noblogs/WordPress site.
2. Import the WXR/XML into the new publication.
3. Review an import report instead of hand-checking every record.
4. Fix only the exceptions.
5. Connect the old domain after the new archive is ready.
6. Preserve redirects from old public URLs where the host allows it.

Infrastructure diagnostics belong in Site Health, not in the normal editor workflow.
