let rendering: Promise<unknown> = Promise.resolve();

export function validateMermaidSource(source: string) {
  if (!source.trim()) throw new Error("Enter Mermaid code to preview a diagram.");
  if (source.length > 20000) throw new Error("This diagram is too large to preview (maximum 20,000 characters).");
  // Keep workspace diagrams on the app's own rendering and security settings.
  if (/%%\s*\{/.test(source) || /^\s*---/.test(source))
    throw new Error("Diagram configuration directives are not supported. Enter the diagram source only.");
}

export async function renderMermaid(source: string, dark: boolean) {
  validateMermaidSource(source);
  // Mermaid configuration is global; serialize initialize/render across all blocks.
  const task = rendering
    .catch(() => {})
    .then(async () => {
      const { default: mermaid } = await import("mermaid");
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        suppressErrorRendering: true,
        theme: dark ? "dark" : "default",
        darkMode: dark,
        htmlLabels: false,
        flowchart: { htmlLabels: false },
        maxTextSize: 20000,
        maxEdges: 500,
        fontFamily: "Inter, sans-serif",
      });
      const id = `wiki-mermaid-${crypto.randomUUID()}`;
      const container = document.createElement("div");
      container.style.position = "absolute";
      container.style.left = "-100000px";
      document.body.appendChild(container);
      try {
        const { svg } = await mermaid.render(id, source, container);
        // An image isolates diagram CSS/markup from the application document.
        return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      } finally {
        container.remove();
      }
    });
  rendering = task;
  return task;
}
