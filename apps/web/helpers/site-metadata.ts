import type { MetaDescriptor } from "react-router";

export const DEVSPACE_NAME = "Devspace";
export const DEVSPACE_TITLE = "Devspace | Work, Wiki & Timesheets";
export const DEVSPACE_DESCRIPTION =
  "One workspace for your team's projects, knowledge, weekly timesheets and milestones.";

export function createDevspaceMetadata(publicUrl: string): MetaDescriptor[] {
  const origin = new URL(publicUrl).origin;
  const image = new URL("/devspace-og-v1.png", origin).href;
  const imageAlt = "Devspace: Work, Wiki, Timesheets and Milestones";
  return [
    { title: DEVSPACE_TITLE },
    { name: "description", content: DEVSPACE_DESCRIPTION },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: DEVSPACE_NAME },
    { property: "og:title", content: DEVSPACE_TITLE },
    { property: "og:description", content: DEVSPACE_DESCRIPTION },
    { property: "og:url", content: origin + "/" },
    { property: "og:image", content: image },
    { property: "og:image:type", content: "image/png" },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { property: "og:image:alt", content: imageAlt },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: DEVSPACE_TITLE },
    { name: "twitter:description", content: DEVSPACE_DESCRIPTION },
    { name: "twitter:image", content: image },
    { name: "twitter:image:alt", content: imageAlt },
  ];
}
