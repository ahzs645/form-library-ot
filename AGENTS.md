# Editing the OT form library

The existing `catalog.json` array and `forms/*.webforms.json` are the source
contract consumed by Webforms' `libraries/ot` submodule. Preserve that format.
Original supplier PDFs and DOCX files are read-only. New documents and changed
sources must pass the field-review workflow described in README.md.

`npm run build` publishes a separate version-1 library manifest under
`dist/manifest.json` and `dist/catalog.json`, plus self-contained form ZIPs and a
portable library ZIP. Packages preserve all fields, document bindings, and the
original document bytes. `npm test` verifies those properties across every form.
The build checks source hashes against `field-review.json`.

Only blank templates belong here. Never commit completed documents, patient
answers, signatures, credentials, or user uploads. A push to main publishes
the generated `dist/` directory through GitHub Pages. Keep generated files and
dependencies out of Git. `SITE_URL` may override the published directory URL.
