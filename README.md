# form-library-ot

Published library: [Occupational therapy forms](https://projects.ahmadjalil.com/form-library-ot/).
Copy the [manifest link](https://projects.ahmadjalil.com/form-library-ot/manifest.json)
into Webforms **Form libraries → Add library → Import link**, or use the site's
**Load library in Webforms** button. The 17 forms appear under the **OT** filter
tag, with PDF/Word, Summary and MOIS previews. **Download library ZIP** installs
the complete library on one device.

A Webforms **form library**: supplier forms prepared for filling, each shipped
with its untouched original document. The Webforms app mounts this repository
as a git submodule under `libraries/ot` and its fill tools (workspace "Fill
with AI", MCP server, CLI, HTTP routes) fill these forms from JSON answers.
Nothing here is edited at runtime; an agent supplies answers and receives the
completed PDF or Word document.

## Layout

| Path | What it is |
| --- | --- |
| `library.json` | Library metadata and per-form guidance (purpose, audience, tips) shown to whoever fills the form. |
| `catalog.json` | One entry per form: key, label, description, document template paths, and the builder-field payload the app lists and the agent turns into questions. Written by the packager. |
| `forms/<key>.webforms.json` | The saved workspace session for the form, referencing its supplier document under `externalDocuments`. |
| `forms/<key>.pdf` / `forms/<key>.docx` | The original supplier document. Never modified. |
| `field-review.json` | Reviewed labels, controls and source SHA-256 per form. The packager refuses changed sources or field ids until they are reviewed here. |
| `table-layouts.json` | Supplier row groupings for repeating and fixed tables. |

## Contract

- Every `catalog.json` entry has a `documentTemplate.format` of `PDF` or `Word`
  and a sibling document in `forms/`. Forms without an original document do not
  belong in a library.
- Keys are unique across all libraries mounted by the app. Prefix them with the
  library name (`ot-…`).
- `library.json.forms[<key>].guidance` is optional; the app falls back to
  generic guidance, but every form should have its own.
- Only blank templates. These files are served publicly with the app and must
  never contain patient answers or credentials.

## Adding or updating a form

From the Webforms checkout, with the prepared blank session in a folder:

```sh
node scripts/package-ot-builder-presets.mjs '<prepared templates folder>' --library libraries/ot
pnpm sync:form-libraries
pnpm exec vitest run lib/__tests__/document-presets.test.ts lib/__tests__/agent-form-fill.test.ts
```

Then add guidance for the new key to `library.json`, commit here, and commit
the submodule bump plus the regenerated catalog in Webforms.

## Publishing the importable library

```sh
npm ci
npm test
```

The build writes `dist/index.html`, `dist/manifest.json`, a matching
`dist/catalog.json`, versioned workspace ZIPs under `dist/forms/`, and
`dist/webforms-library.zip`. The **source** `catalog.json` remains the existing
array used by the Webforms submodule; only the **published** catalog uses the
version-1 import-manifest format. Each package includes its original PDF or
DOCX and a self-contained workspace, including Word template bytes and bindings.
The source hash must match `field-review.json`, and tests compare every packaged
workspace and document against the original source.

`SITE_URL` overrides the published directory URL when building for another
host. A push to `main` validates and publishes `dist/` through GitHub Pages.
Never add completed forms or answers. Generated files and dependencies are
ignored; supplier documents remain untouched.
