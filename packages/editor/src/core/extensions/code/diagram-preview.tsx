import { useEffect, useState } from "react";
import { renderMermaid } from "./mermaid-renderer";

export function DiagramPreview({
  source,
  language,
  renderPlantUML,
}: {
  source: string;
  language: "mermaid" | "plantuml";
  renderPlantUML?: (source: string, dark: boolean) => Promise<string>;
}) {
  const [dark, setDark] = useState(false);
  const [result, setResult] = useState<{ image?: string; error?: string; source: string; dark: boolean }>();
  useEffect(() => {
    const update = () => setDark(document.documentElement.getAttribute("data-theme")?.includes("dark") ?? false);
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      const render = language === "mermaid" ? renderMermaid : renderPlantUML;
      const renderJob = render
        ? render(source, dark)
        : Promise.reject(new Error("PlantUML preview is unavailable in this editor."));
      void renderJob.then(
        (image) => {
          if (!cancelled) setResult({ image, source, dark });
          return undefined;
        },
        (failure) => {
          if (!cancelled)
            setResult({
              error: failure instanceof Error ? failure.message : "Unable to preview this diagram.",
              source,
              dark,
            });
        }
      );
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [source, dark, language, renderPlantUML]);
  const current = result?.source === source && result.dark === dark ? result : undefined;
  return (
    <div
      className="mermaid-preview not-prose overflow-x-auto rounded-b-md bg-layer-1 p-4 text-13 text-primary"
      contentEditable={false}
    >
      {!current && <p role="status">Rendering diagram…</p>}
      {current?.error && (
        <div role="alert" className="text-danger-primary">
          <p className="font-medium">Unable to preview {language === "mermaid" ? "Mermaid" : "PlantUML"}</p>
          <pre className="mt-2 text-12 whitespace-pre-wrap">{current.error}</pre>
          <p className="mt-2">Switch to Code to correct the diagram.</p>
        </div>
      )}
      {current?.image && (
        <img
          src={current.image}
          alt={`${language === "mermaid" ? "Mermaid" : "PlantUML"} diagram`}
          className="mx-auto h-auto max-w-full"
        />
      )}
    </div>
  );
}
