// The "Copy AI prompt" text: everything a chat assistant needs to go from this
// library's manifest to a completed PDF or Word document. Rendered at build time
// into dist/ai-prompt.md and embedded in dist/index.html.

/** Where Webforms publishes each form's question file (FormSchema JSON). */
export const questionsUrlFor = (webformsUrl, key) => new URL(`skills/read-form-questions/references/${key}.json`, webformsUrl).href;

/** The Webforms page that fills a form in the browser from a pasted answers JSON. */
export const fillUrlFor = (webformsUrl, manifestUrl, key) => `${new URL("fill/", webformsUrl).href}#${new URLSearchParams({ library: manifestUrl, form: key })}`;

const row = (form) => `| \`${form.id}\` | ${form.title} | ${form.category} | ${form.documentFormat === "PDF" ? "PDF" : "Word (.docx)"} | ${form.questionCount} | ${form.guidance?.purpose ?? form.description} |`;

export function renderAgentPrompt({ manifestUrl, siteUrl, webformsUrl, forms }) {
  const exampleKey = forms.find((form) => form.documentFormat === "PDF")?.id ?? forms[0].id;
  const exampleForm = forms.find((form) => form.id === exampleKey);
  return `# Fill an occupational therapy form with Webforms

You are helping me complete one of the forms in the Webforms **OT form library**
and hand back the finished document: a filled PDF for PDF forms, a filled Word
(.docx) document for Word forms. The library publishes each supplier's original
document untouched; Webforms writes my answers into that real document.

Follow the steps below in order. Never invent clinical, claim or practitioner
details. If I have not given you a fact, ask for it or leave the question blank.

## The library

- Library site: ${siteUrl}
- Manifest (machine-readable list of every form, its package and checksum): ${manifestUrl}
- Webforms app: ${webformsUrl}

Each form has a **form key** (use it everywhere), a **questions file** listing
every question id, and a **fill page** that turns your answers JSON into the
completed document in my browser. Questions file: \`${new URL("skills/read-form-questions/references/", webformsUrl).href}<form key>.json\`.
Fill page: \`${new URL("fill/", webformsUrl).href}#library=${encodeURIComponent(manifestUrl)}&form=<form key>\`
(also \`fillUrl\` in the manifest).

| Form key | Title | Issuer | Output | Questions | What it is for |
| --- | --- | --- | --- | --- | --- |
${forms.map(row).join("\n")}

## Step 1 — Pick the form

Match what I ask for (a form code such as "CL489M" or "83D488", or a
description such as "ICBC progress report") to one row above. If two rows fit
(several forms come as both PDF and Word), ask which output I want. Never guess
a key; if nothing fits, say so.

## Step 2 — Read its questions

Fetch the form's questions file (or, with the MCP tools, \`get_form_schema\`).
If you cannot fetch URLs, ask me to paste or attach it. It returns:

- \`guidance\` — purpose, audience and form-specific tips. Read the tips first:
  they explain which Yes/No questions gate a detail box, which checkboxes are
  really either/or, and which tables repeat.
- \`questions\` — in document order, each with \`id\` (\`answer_12\`), \`label\`,
  \`type\`, \`options\`, \`maxLength\`, \`section\`, \`page\` (PDF only), and for a
  cell in a document table a \`table\` object \`{ table, row, column }\`.

## Step 3 — Gather the facts

Use only what I give you in this chat: the session transcript, referral, earlier
reports, and my practice profile (clinic, practitioner name, designation,
registration, vendor and GST numbers). List the questions you cannot answer
and ask me once, together. Leave a question blank rather than filling it with
something plausible. The suppliers mark mandatory boxes with a trailing \`*\` in
the label; \`required\` in the schema is often empty for these documents.

## Step 4 — Write the answers JSON

One JSON object keyed by **question id**, never by label (labels repeat):

\`\`\`json
{
  "answer_5": "Jane Example",
  "answer_6": "2026-03-04",
  "answer_9": true,
  "answer_12": "Option text exactly as listed"
}
\`\`\`

| Schema \`type\` | Send | Notes |
| --- | --- | --- |
| \`text\`, \`longText\` | string | Kept in full; a box that is too small shrinks the type and warns. |
| \`number\` | number | \`"$1,250.50"\` is read as \`1250.5\`. |
| \`date\` | \`"yyyy-MM-dd"\` | Always ISO; the document's own format is applied for you. |
| \`time\` | \`"HH:mm"\` | 24-hour. |
| \`yesNo\`, \`checkbox\` | \`true\` / \`false\` | |
| \`choice\` | one of \`options\` | Exact option text. A two-state PDF box ("Initial"/"Revised") is a \`choice\`, not \`true\`. |

- **Tables:** build one row at a time from questions whose \`table.table\` and
  \`table.row\` match. Never pair cells by the \`· item N\` label suffix; it
  restarts in every table. When a table object has \`overflowKey\` (for example
  \`"medications#{row}.name"\`), rows past \`capacity\` go in as
  \`{ "medications#4.name": "…" }\` and print on an addendum.
- **Word either/or** answers are separate checkboxes with nothing stopping both:
  tick exactly one.
- **Signatures:** only for a PDF question with \`acceptsSignatureSvg: true\`, and
  only an SVG the signer gave you. Never draw a signature from a name.
- Blank (\`null\` or \`""\`) means unanswered and is never an error. A partial
  form is fine.
- Totals on invoices and quotes are recalculated from the line items; do not
  compute them yourself.

## Step 5 — Produce the document

Use the first route you have.

### A. Webforms MCP tools are connected (\`webforms-forms\`)

Pass the manifest as \`catalogUrl\` on every call:

1. \`list_forms({ catalogUrl: "${manifestUrl}" })\`
2. \`get_form_schema({ catalogUrl, formKey })\`
3. \`get_fill_context({ catalogUrl, formKey })\`: guidance plus any practice
   profile and session material already stored with the tool.
4. \`validate_answers({ catalogUrl, formKey, answers })\`: fix every rejected
   answer before filling.
5. \`fill_form({ catalogUrl, formKey, answers, outputPath })\`: writes the
   completed document and returns its path and a report. Add \`flatten: true\`
   only if I ask for a non-editable PDF.

### B. You can run shell commands

Use the Webforms command-line tool from a checkout:

\`\`\`bash
git clone https://github.com/ahzs645/webforms && cd webforms && pnpm install
pnpm forms schema ${exampleKey} --library ${manifestUrl} --json
pnpm forms template ${exampleKey} --library ${manifestUrl} --out answers.json
pnpm forms validate ${exampleKey} --library ${manifestUrl} --answers answers.json
pnpm forms fill ${exampleKey} --library ${manifestUrl} --answers answers.json --out filled.pdf --json
\`\`\`

Use \`.docx\` as the output name for Word forms. The same checkout provides the MCP
server for route A; register it with
\`{"mcpServers":{"webforms-forms":{"command":"node","args":["<checkout>/cli/dist/agent-forms/mcp.mjs"]}}}\`.

### C. No tools, or only a browser

Give me:

1. The answers JSON in one code block.
2. The form's fill page link, for example
   ${fillUrlFor(webformsUrl, manifestUrl, exampleKey)}

I open the link, paste your whole reply (the page finds the JSON in the code
block), press **Fill and download**, and get the completed
${exampleForm.documentFormat === "PDF" ? "PDF" : "document"} with the same report as route A. The page fills the original
document in my browser; the answers are never uploaded. If you can operate a
browser yourself, do those steps for me. The page also has **Check answers**,
which lists rejected answers without producing a file.

The page cannot draw signature SVGs; leave signatures for the practitioner.

## Step 6 — Hand it back

Attach or link the completed file and summarise the fill report:

- \`filled\`: what landed.
- \`skipped\`: answers that could not be written, and why.
- \`missingRequired\` and \`failedChecks\`: what still needs attention.
- \`warnings\`: for example, type shrunk to fit a box.

List every question you left blank. These forms are signed by the treating
practitioner: tell me to review the document before it is signed and sent.

## XFA PDFs from outside this library

If I give you a different fillable PDF (including Adobe XFA forms), Word file or
Webforms workspace ZIP, fill it from the local file instead of a library key:
\`sourcePath\` in MCP or \`--source FILE\` on the command line. For dynamic XFA
forms add \`xfaDatasets: true\` (\`--xfa-datasets\`) to every schema, validate and
fill call. The result stays an XFA PDF that needs Adobe Reader or Acrobat. Chat
previews show only "Please wait…", so report its contents with
\`read_filled_form\` (\`pnpm forms read filled.pdf\`).

## Privacy

Answers are patient information. Keep them in this conversation and the local
Webforms tool. Never upload them to the library site, a URL parameter, or any
other service. The library publishes blank templates only.
`;
}
