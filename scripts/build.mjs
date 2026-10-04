import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const output = join(root, "dist");
const catalog = JSON.parse(await readFile(join(root, "catalog.json"), "utf8"));
const metadata = JSON.parse(await readFile(join(root, "library.json"), "utf8"));
const review = JSON.parse(await readFile(join(root, "field-review.json"), "utf8"));
const site = new URL(process.env.SITE_URL || "https://projects.ahmadjalil.com/form-library-ot/");
if (site.protocol !== "https:" || site.username || site.password || !site.pathname.endsWith("/")) throw new Error("SITE_URL must be an HTTPS directory URL.");
const manifestUrl = new URL("manifest.json", site).href;
const openLibraryUrl = `https://webform.ahmadjalil.com/#formLibrary=${encodeURIComponent(manifestUrl)}`;
const localLibraryUrl = `http://127.0.0.1:3000/#formLibrary=${encodeURIComponent(manifestUrl)}`;
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const epoch = new Date("1980-01-01T00:00:00Z");
const zipOptions = { type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } };
const escape = (value) => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const fileName = (name, extension) => {
  if (typeof name !== "string" || basename(name) !== name || name.includes("\\") || !name.toLowerCase().endsWith(extension)) throw new Error(`Invalid source document filename: ${name}`);
  return name;
};
if (!Array.isArray(catalog) || !catalog.length) throw new Error("The source catalog must list forms.");
await rm(output, { recursive: true, force: true });
await mkdir(join(output, "forms"), { recursive: true });
const portable = new JSZip();
const seen = new Set();
const forms = [];
let total = 0;
for (const entry of catalog) {
  const key = entry.key, format = entry.documentTemplate?.format;
  if (typeof key !== "string" || !/^ot-[a-z0-9-]+$/.test(key) || seen.has(key)) throw new Error(`Invalid or duplicate form key: ${key}`);
  seen.add(key);
  if (!["PDF", "Word"].includes(format)) throw new Error(`${key}: missing document format.`);
  const workspace = JSON.parse(await readFile(join(root, "forms", `${key}.webforms.json`), "utf8"));
  if (workspace.version !== 3 || !Array.isArray(workspace.workspaceDocument?.document?.fields)) throw new Error(`${key}: invalid workspace.`);
  for (const name of ["answers", "values", "formData", "builderValues"]) {
    if (workspace[name] && Object.keys(workspace[name]).length) throw new Error(`${key}: contains saved answers.`);
  }
  const extension = format === "PDF" ? ".pdf" : ".docx";
  const sourceName = fileName(workspace.externalDocuments?.[format === "PDF" ? "sessionPdf" : "wordTemplate"], extension);
  const original = await readFile(join(root, "forms", sourceName));
  if (review.presets?.[key]?.sourceSha256 !== hash(original)) throw new Error(`${key}: original document changed since its field review.`);
  let packageDocumentName = sourceName;
  if (format === "PDF") {
    packageDocumentName = fileName(workspace.sessionPdf?.name || sourceName, ".pdf");
    workspace.sessionPdf = { ...workspace.sessionPdf, name: packageDocumentName, base64: original.toString("base64") };
  } else {
    const template = workspace.workspaceDocument.preview?.footerButtons?.wordTemplate;
    if (!template || !Array.isArray(template.bindings)) throw new Error(`${key}: missing Word template bindings.`);
    template.sourceDocxBase64 = original.toString("base64");
  }
  delete workspace.externalDocuments;
  const file = `${key}-v1.zip`;
  const bytes = await new JSZip()
    .file("workspace.json", JSON.stringify(workspace), { date: epoch })
    .file(packageDocumentName, original, { date: epoch })
    .generateAsync(zipOptions);
  total += bytes.length;
  if (bytes.length > 25 * 1024 * 1024 || total > 150 * 1024 * 1024) throw new Error("Library exceeds Webforms package size limits.");
  await writeFile(join(output, "forms", file), bytes);
  await copyFile(join(root, "forms", sourceName), join(output, "forms", sourceName));
  portable.file(`forms/${file}`, bytes, { date: epoch });
  const packageUrl = new URL(`forms/${file}`, site).href;
  forms.push({ id: key, title: entry.label, description: entry.description, version: "1", file,
    category: entry.label.startsWith("ICBC") ? "ICBC" : "WorkSafeBC", tags: ["OT", format],
    documentFormat: format, documentUrl: new URL(`forms/${sourceName}`, site).href,
    packageUrl, openUrl: `https://webform.ahmadjalil.com/#formPackage=${encodeURIComponent(packageUrl)}`,
    sha256: hash(bytes), sizeBytes: bytes.length, fieldCount: workspace.workspaceDocument.document.fields.length,
    questionCount: review.presets[key].fields.length, guidance: metadata.forms?.[key]?.guidance,
  });
}
const manifest = { version: 1, id: "webforms-ot", title: "OT forms", openLibraryUrl, forms };
const manifestText = JSON.stringify(manifest, null, 2) + "\n";
await writeFile(join(output, "manifest.json"), manifestText);
await writeFile(join(output, "catalog.json"), manifestText);
await copyFile(join(root, "library.json"), join(output, "library.json"));
portable.file("catalog.json", manifestText, { date: epoch });
await writeFile(join(output, "webforms-library.zip"), await portable.generateAsync(zipOptions));
await writeFile(join(output, ".nojekyll"), "");
const cards = forms.map((form) => `<article class="card" data-search="${escape(`${form.title} ${form.category} ${form.documentFormat}`.toLowerCase())}"><span class="tag">${escape(form.category)} · ${form.documentFormat}</span><h2>${escape(form.title)}</h2><p>${escape(form.guidance?.purpose || form.description)}</p><p class="small">${form.questionCount} questions · ${Math.ceil(form.sizeBytes / 1024)} KB</p><div class="actions"><a class="primary" href="${escape(form.openUrl)}">Open in Webforms</a><a href="${escape(form.packageUrl)}" download>Download form ZIP</a><a href="${escape(form.documentUrl)}">View original ${form.documentFormat}</a></div></article>`).join("\n");
await writeFile(join(output, "index.html"), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Occupational therapy form library</title><style>
:root{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#183044;background:#f4f8fa}*{box-sizing:border-box}body{margin:0}main{max-width:1040px;margin:auto;padding:48px 24px 64px}h1{font-size:clamp(2rem,5vw,3.4rem);letter-spacing:-.04em;margin:0 0 16px}h2{font-size:1.18rem;line-height:1.4}p{line-height:1.6;color:#4a6070}.eyebrow{font-size:.8rem;font-weight:700;color:#39737f;margin-bottom:12px}.actions{display:flex;flex-wrap:wrap;gap:10px;margin:18px 0}.actions a,.actions button{font:inherit;font-size:.9rem;font-weight:600;text-decoration:none;border-radius:8px;padding:10px 14px;border:1px solid #9bb5c0;color:#214b5e;background:#fff;cursor:pointer}.actions .primary{background:#006d77;border-color:#006d77;color:#fff}a{color:#006d77}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,380px),1fr));gap:18px}.card{border:1px solid #d5e3e9;border-radius:12px;background:#fff;padding:24px}.tag{font-size:.8rem;background:#e7f3f5;border-radius:6px;padding:4px 8px}.small{font-size:.85rem}.search{display:block;width:100%;font:inherit;border:1px solid #9bb5c0;border-radius:8px;padding:12px;margin:24px 0 12px}:focus-visible{outline:3px solid #438da5;outline-offset:3px}[hidden]{display:none}footer{margin-top:36px;font-size:.9rem}
</style></head><body><main><header><div class="eyebrow">Webforms · OT library</div><h1>Occupational therapy forms</h1><p>${escape(metadata.description)}</p><p>${forms.length} forms · ${forms.filter((form) => form.documentFormat === "PDF").length} PDF · ${forms.filter((form) => form.documentFormat === "Word").length} Word</p><div class="actions"><a class="primary" href="${escape(openLibraryUrl)}">Load library in Webforms</a><a href="${escape(localLibraryUrl)}">Load in local Webforms</a><button type="button" id="copy-manifest">Copy manifest link</button><a href="webforms-library.zip" download>Download library ZIP</a></div><p class="small">Paste the manifest link into Webforms: Form libraries → Add library → Import link. <a href="manifest.json">View manifest</a></p><p id="copy-status" role="status"></p></header><label class="small" for="search">Search forms</label><input class="search" type="search" id="search" placeholder="Search ICBC, WorkSafeBC, PDF or Word forms"><p id="count" class="small">${forms.length} forms</p><section class="cards" aria-label="Forms">${cards}</section><footer>These are blank supplier templates. Keep completed documents and answers on your own device. <a href="library.json">Form guidance</a> · <a href="AGENTS.md">Agent filling instructions</a></footer></main><script>
document.getElementById('copy-manifest').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(${JSON.stringify(manifestUrl)});document.getElementById('copy-status').textContent='Manifest link copied.'}catch{document.getElementById('copy-status').textContent='Clipboard unavailable. Open View manifest and copy its address.'}});
document.getElementById('search').addEventListener('input',event=>{const query=event.target.value.toLowerCase().trim();let count=0;document.querySelectorAll('[data-search]').forEach(card=>{card.hidden=!card.dataset.search.includes(query);if(!card.hidden)count++});document.getElementById('count').textContent=count+' '+(count===1?'form':'forms')});
</script></body></html>\n`);
await writeFile(join(output, "AGENTS.md"), `# Fill an OT form\n\nManifest: ${manifestUrl}\n\nDownload a form's packageUrl and verify its sha256 against the manifest. Use Webforms agent-form-fill CLI or MCP with that local ZIP: inspect the schema and filling guidance, collect the user's answers, validate them, and return a completed PDF or DOCX. The manifest documentFormat identifies the output format. Per-form guidance is also in library.json. Do not publish answers or completed documents. Signature artwork requires the user's authorization.\n\nGitHub Pages serves blank templates; it does not run an AI filling service.\n`);
console.log(`Built OT library: ${forms.length} forms (${forms.filter((form) => form.documentFormat === "PDF").length} PDF, ${forms.filter((form) => form.documentFormat === "Word").length} Word). Manifest: ${manifestUrl}`);
