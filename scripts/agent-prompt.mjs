// The "Copy AI prompt" text. It names the library and how to work, not the
// forms: the assistant looks the forms up in forms.json when the chat starts,
// so a prompt saved in a project or custom instructions never goes stale.
// Rendered at build time into dist/ai-prompt.md and embedded in dist/index.html.

/** Where Webforms publishes each form's question file (FormSchema JSON). */
export const questionsUrlFor = (webformsUrl, key) => new URL(`skills/read-form-questions/references/${key}.json`, webformsUrl).href;

/** The Webforms page that fills a form in the browser from answers in the link or pasted. */
export const fillUrlFor = (webformsUrl, manifestUrl, key) => `${new URL("fill/", webformsUrl).href}#${new URLSearchParams({ library: manifestUrl, form: key })}`;

/** The slim index the prompt sends the assistant to: enough to choose a form and reach it. */
export function formsIndex({ siteUrl, manifestUrl, forms }) {
  return {
    library: siteUrl,
    manifest: manifestUrl,
    forms: forms.map((form) => ({
      key: form.id,
      title: form.title,
      issuer: form.category,
      output: form.documentFormat === "PDF" ? "PDF" : "Word (.docx)",
      questions: form.questionCount,
      purpose: form.guidance?.purpose ?? form.description,
      questionsUrl: form.questionsUrl,
      fillUrl: form.fillUrl,
    })),
  };
}

export function renderAgentPrompt({ siteUrl, manifestUrl, webformsUrl }) {
  const formsUrl = new URL("forms.json", siteUrl).href;
  const fillBase = `${new URL("fill/", webformsUrl).href}#library=${encodeURIComponent(manifestUrl)}&form=<form key>`;
  return `# Fill a form from the Webforms OT library

You are helping me complete a form from the Webforms occupational therapy form
library and hand back the finished document: a filled PDF for PDF forms, a
filled Word (.docx) document for Word forms. Webforms writes my answers into
the supplier's original document, so the result is the official form.

Never invent clinical, claim or practitioner details. If I have not given you a
fact, ask for it or leave the question blank.

## Step 1 — Look up the forms

Fetch the library index: ${formsUrl}

Each entry has the form \`key\`, \`title\`, \`issuer\`, \`output\` (PDF or Word),
the number of \`questions\`, its \`purpose\`, its \`questionsUrl\` and its
\`fillUrl\`. Show me the forms briefly (issuer, title, output) and ask which one I
need, unless I already said. Match form codes such as "CL489M" or "83D488" to
the title. Several forms come as both PDF and Word; ask which output I want.
Never guess a key.

If you cannot open links, say so and ask me to paste the form's questions: each
form on ${siteUrl} has a **Copy questions** button.

## Step 2 — Show what the form needs

Fetch the form's \`questionsUrl\`. It returns:

- \`guidance\`: purpose, audience and tips. Read the tips first: they explain
  which Yes/No questions open a detail box, which checkboxes are really
  either/or, and which tables repeat.
- \`questions\`, in document order, each with \`id\` (\`answer_12\`), \`label\`,
  \`type\`, \`options\`, \`maxLength\`, \`section\`, \`page\` (PDF only), and for a
  cell in a document table a \`table\` object \`{ table, row, column }\`.

Do not list every question. Summarise the form for me: its sections, the key
facts each one needs, and which answers open further questions. Then ask for
the source material in one message: session notes or transcript, the referral,
earlier reports, and my practice details (clinic, practitioner, designation,
registration, vendor and GST numbers).

## Step 3 — Draft the answers

Answer only from what I gave you. List the questions you could not answer and
ask about them together, once. Leave a question blank rather than filling it
with something plausible. Suppliers mark mandatory boxes with a trailing \`*\`
in the label; \`required\` in the schema is often empty for these documents.

Write one JSON object keyed by **question id**, never by label (labels repeat):

\`\`\`json
{ "answer_5": "Jane Example", "answer_6": "2026-03-04", "answer_9": true, "answer_12": "Option text exactly as listed" }
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
- **Signatures:** leave them for the practitioner.
- Blank (\`null\` or \`""\`) means unanswered and is never an error.
- Invoice and quote totals are recalculated from the line items; do not
  compute them.

## Step 4 — Hand me the fill link

Do not clone, download or install Webforms; you do not need it. The form's
\`fillUrl\` opens the Webforms fill page in my browser:

\`${fillBase}\`

**If you can run code,** put the answers in the link: append
\`&answers=z.<value>\`, where the value is the base64url of the
deflate-raw-compressed UTF-8 JSON. Encode with code, never by hand:

\`\`\`python
import base64, json, zlib
data = json.dumps(answers, ensure_ascii=False).encode("utf-8")
packer = zlib.compressobj(9, zlib.DEFLATED, -15)
value = base64.urlsafe_b64encode(packer.compress(data) + packer.flush()).decode().rstrip("=")
link = fill_url + "&answers=z." + value
\`\`\`

(Node: \`"z." + zlib.deflateRawSync(Buffer.from(JSON.stringify(answers))).toString("base64url")\`.)
Give me the link, plus the answers JSON in a code block in case the link is too
long for this chat.

**If you cannot run code,** give me the answers JSON in one code block and the
plain \`fillUrl\`. I paste your reply into the page.

On the page I see the answers checked against the form, then press **Fill and
download** (or **Open filled PDF**). The page fills the original document in
my browser; the answers are never uploaded.

If the Webforms MCP tools (\`webforms-forms\`) are already connected, you may
instead call \`fill_form({ catalogUrl: "${manifestUrl}", formKey, answers })\` and
attach the file it writes. Do not set them up just for this.

## Step 5 — Tell me what is left

List the questions you left blank and anything you were unsure of. These forms
are signed by the treating practitioner: remind me to review the document
before it is signed and sent.

## Privacy

Answers are patient information. Keep them in this conversation and the fill
link you give me. Never send them to any other website or service. The library
publishes blank templates only.
`;
}
