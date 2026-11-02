export function timesheetProjectLeads(
  entries: { project_id: string | null; project_name: string }[],
  projects: { id: string; project_lead_name: string | null; lead_eligible: boolean }[]
) {
  const byId = new Map(projects.map((project) => [project.id, project]));
  return [...new Map(entries.map((entry) => [entry.project_id, entry])).values()].map((entry) => {
    const project = entry.project_id ? byId.get(entry.project_id) : undefined;
    return {
      id: entry.project_id,
      name: entry.project_name,
      lead: project?.project_lead_name,
      eligible: !!project?.lead_eligible,
    };
  });
}
