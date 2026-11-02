/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { NodeViewProps } from "@tiptap/react";
import type { CodeBlockOptions } from "./code-block";
import { NodeViewWrapper, NodeViewContent } from "@tiptap/react";
import ts from "highlight.js/lib/languages/typescript";
import { common, createLowlight } from "lowlight";
import { CheckIcon } from "lucide-react";
import { useState } from "react";
import { CopyIcon } from "@plane/propel/icons";
// ui
import { Tooltip } from "@plane/propel/tooltip";
// plane utils
import { cn } from "@plane/utils";
// types
import type { TCodeBlockAttributes } from "./types";
import { ECodeBlockAttributeNames } from "./types";
import { DiagramPreview } from "./diagram-preview";

// we just have ts support for now
const lowlight = createLowlight(common);
lowlight.register("ts", ts);

type Props = {
  node: ProseMirrorNode;
  extension: NodeViewProps["extension"];
};

export function CodeBlockComponent({ node, extension }: Props) {
  const [copied, setCopied] = useState(false);
  const [preview, setPreview] = useState(false);
  const language = node.attrs.language;
  const diagram = language === "mermaid" || language === "plantuml";
  const label = language === "plantuml" ? "PlantUML" : "Mermaid";
  const { renderPlantUML } = extension.options as CodeBlockOptions;
  // derived values
  const attrs = node.attrs as TCodeBlockAttributes;

  const copyToClipboard = async (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
    try {
      await navigator.clipboard.writeText(node.textContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 1000);
    } catch {
      setCopied(false);
    }
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <NodeViewWrapper key={attrs[ECodeBlockAttributeNames.ID]} className="code-block group/code relative">
      {diagram && (
        <div
          contentEditable={false}
          className="not-prose flex items-center justify-between gap-3 rounded-t-md border-b border-subtle bg-layer-2 px-3 py-2 text-12 text-secondary"
        >
          <span className="font-medium">{label}</span>
          <div role="group" aria-label={`${label} view`} className="flex items-center gap-1">
            {([false, true] as const).map((value) => (
              <button
                key={String(value)}
                type="button"
                aria-pressed={preview === value}
                className={cn(
                  "rounded-sm px-3 py-1 text-12 font-medium",
                  preview === value ? "bg-layer-1-selected text-primary" : "hover:bg-layer-2-hover"
                )}
                onClick={() => setPreview(value)}
              >
                {value ? "Preview" : "Code"}
              </button>
            ))}
          </div>
        </div>
      )}
      <Tooltip tooltipContent="Copy code">
        <button
          type="button"
          className={cn(
            "group/button absolute top-2 right-2 z-10 hidden size-8 items-center justify-center rounded-md border border-subtle bg-layer-1 backdrop-blur-sm transition duration-150 ease-in-out group-hover/code:flex",
            {
              "bg-success-subtle hover:bg-success-subtle-1 active:bg-success-subtle-1": copied,
              "top-14": diagram,
            }
          )}
          onClick={(e) => void copyToClipboard(e)}
        >
          {copied ? (
            <CheckIcon className="h-3 w-3 text-success-primary" strokeWidth={3} />
          ) : (
            <CopyIcon className="h-3 w-3 text-tertiary group-hover/button:text-primary" />
          )}
        </button>
      </Tooltip>

      <pre
        className={cn(
          "my-2 rounded-lg bg-layer-3 p-4 text-primary",
          diagram && "!mt-0 !rounded-t-none",
          diagram && preview && "hidden"
        )}
      >
        <NodeViewContent as="code" className="whitespace-pre-wrap" />
      </pre>
      {diagram && preview && (
        <DiagramPreview source={node.textContent} language={language} renderPlantUML={renderPlantUML} />
      )}
    </NodeViewWrapper>
  );
}
