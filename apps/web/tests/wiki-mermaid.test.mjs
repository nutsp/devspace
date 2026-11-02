import { test } from "node:test";
import assert from "node:assert/strict";
import { validateMermaidSource } from "../../../packages/editor/src/core/extensions/code/mermaid-renderer.ts";
test("accepts ordinary diagrams including comments and non-ASCII labels", () => {
  for (const source of [
    "flowchart TD\nA[เริ่มต้น] --> B[Done]",
    "sequenceDiagram\nAlice->>Bob: Hello",
    "%% note\nclassDiagram\nclass User",
  ])
    assert.doesNotThrow(() => validateMermaidSource(source));
});
test("rejects empty, oversized, and diagram-level configuration before rendering", () => {
  for (const source of [
    "",
    " ".repeat(4),
    "x".repeat(20001),
    '%%{init: {"securityLevel":"loose"}}%%\nflowchart TD\nA-->B',
    "---\nconfig:\n  themeCSS: body {display:none}\n---\nflowchart TD\nA-->B",
  ])
    assert.throws(() => validateMermaidSource(source));
});
test("server HTML to collaborative binary roundtrip retains Mermaid language and source", async () => {
  const { getBinaryDataFromDocumentEditorHTMLString, getAllDocumentFormatsFromDocumentEditorBinaryData } =
    await import("../../../packages/editor/dist/index.js");
  const html = '<pre><code class="language-mermaid">flowchart LR\nA[เริ่มต้น]--&gt;B[Done]</code></pre>';
  const binary = getBinaryDataFromDocumentEditorHTMLString(html, "Diagram");
  const result = getAllDocumentFormatsFromDocumentEditorBinaryData(binary, true);
  assert.equal(result.contentJSON.content[0].attrs.language, "mermaid");
  assert.equal(result.contentJSON.content[0].content[0].text, "flowchart LR\nA[เริ่มต้น]-->B[Done]");
  assert.match(result.contentHTML, /class="language-mermaid"/);
});
test("server HTML and collaborative binary retain PlantUML source and language", async () => {
  const { getBinaryDataFromDocumentEditorHTMLString, getAllDocumentFormatsFromDocumentEditorBinaryData } =
    await import("../../../packages/editor/dist/index.js");
  const source = "@startuml\nAlice -&gt; Bob: Hello\n@enduml";
  const result = getAllDocumentFormatsFromDocumentEditorBinaryData(
    getBinaryDataFromDocumentEditorHTMLString(`<pre><code class="language-plantuml">${source}</code></pre>`, "UML"),
    true
  );
  assert.equal(result.contentJSON.content[0].attrs.language, "plantuml");
  assert.equal(result.contentJSON.content[0].content[0].text, "@startuml\nAlice -> Bob: Hello\n@enduml");
  assert.match(result.contentHTML, /language-plantuml/);
});
