import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { before, test } from "node:test";
import JSZip from "jszip";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const catalog = JSON.parse(await readFile(join(root, "catalog.json"), "utf8"));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
let manifest;
before(async () => {
  execFileSync(process.execPath, ["scripts/build.mjs"], { cwd: root, stdio: "inherit" });
  manifest = JSON.parse(await readFile(join(root, "dist", "manifest.json"), "utf8"));
});

test("publishes independent import manifests and exactly the listed portable packages", async () => {
  assert.equal(manifest.id, "webforms-ot");
  assert.equal(manifest.forms.length, catalog.length);
  assert.equal(manifest.forms.filter((form) => form.documentFormat === "PDF").length, 8);
  assert.equal(manifest.forms.filter((form) => form.documentFormat === "Word").length, 9);
  assert.deepEqual(JSON.parse(await readFile(join(root, "dist", "catalog.json"), "utf8")), manifest);
  const archive = await JSZip.loadAsync(await readFile(join(root, "dist", "webforms-library.zip")));
  assert.deepEqual(Object.keys(archive.files).filter((key) => !archive.files[key].dir).sort(), ["catalog.json", ...manifest.forms.map((form) => `forms/${form.file}`)].sort());
  for (const form of manifest.forms) assert.equal(hash(await archive.file(`forms/${form.file}`).async("nodebuffer")), form.sha256);
  assert.equal(Array.isArray(JSON.parse(await readFile(join(root, "catalog.json"), "utf8"))), true);
});

for (const entry of catalog) test(`${entry.key}: preserves original document, fields, bindings and workspace settings`, async () => {
  const form = manifest.forms.find((form) => form.id === entry.key);
  const bytes = await readFile(join(root, "dist", "forms", form.file));
  assert.equal(hash(bytes), form.sha256);
  assert.equal(bytes.length, form.sizeBytes);
  const zip = await JSZip.loadAsync(bytes);
  const packaged = JSON.parse(await zip.file("workspace.json").async("string"));
  const original = JSON.parse(await readFile(join(root, "forms", `${entry.key}.webforms.json`), "utf8"));
  const key = form.documentFormat === "PDF" ? "sessionPdf" : "wordTemplate";
  const sourceBytes = await readFile(join(root, "forms", original.externalDocuments[key]));
  const expected = structuredClone(original);
  if (key === "sessionPdf") {
    expected.sessionPdf.base64 = sourceBytes.toString("base64");
    assert.deepEqual(await zip.file(expected.sessionPdf.name).async("nodebuffer"), sourceBytes);
  } else {
    expected.workspaceDocument.preview.footerButtons.wordTemplate.sourceDocxBase64 = sourceBytes.toString("base64");
    assert.deepEqual(await zip.file(original.externalDocuments.wordTemplate).async("nodebuffer"), sourceBytes);
  }
  delete expected.externalDocuments;
  assert.deepEqual(packaged, expected);
  assert.deepEqual(await readFile(join(root, "dist", "forms", original.externalDocuments[key])), sourceBytes);
});
