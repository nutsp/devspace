/** Resolve the workspace app from complete path segments, including nested routes. */
export function getWorkspaceSection(pathname: string, workspaceSlug?: string) {
  const [workspace, section] = pathname.split("/").filter(Boolean);
  if (!workspaceSlug || workspace !== workspaceSlug) return null;
  if (section === "wiki" || section === "timesheet" || section === "settings") return section;
  if (section === "pi-chat") return "ai";
  return "work";
}
