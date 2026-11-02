import { API_BASE_URL } from "@plane/constants";
import { APIService } from "@/services/api.service";

export type Milestone = {
  id: string;
  name: string;
  description: string;
  target_date: string | null;
  updated_at: string;
  total: number;
  completed: number;
  cancelled: number;
  pending: number;
  progress: number;
  overdue: boolean;
  late_work_items: number;
  due_soon: boolean;
  days_remaining: number | null;
  risk_status: MilestoneRiskStatus;
  at_risk: boolean;
  late_pending_work_items: number;
  overdue_work_items: number;
  unassigned_work_items: number;
  undated_work_items: number;
};
export type MilestoneList = {
  results: Milestone[];
  can_write: boolean;
  visibility_limited: boolean;
  timezone: string;
  project_name: string;
};
export type MilestoneWorkItem = {
  id: string;
  name: string;
  code: string;
  state: string;
  state_group: string;
  target_date: string | null;
  milestone_id: string | null;
  milestone_name: string | null;
  late: boolean;
};
export type MilestoneWorkItems = {
  results: MilestoneWorkItem[];
  total: number;
  next_page: number | null;
  visibility_limited: boolean;
};
export type MilestoneForm = { name: string; description: string; target_date: string | null };
export class MilestoneService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }
  path(slug: string, project: string) {
    return `/api/workspaces/${slug}/projects/${project}/milestones/`;
  }
  async portfolio(slug: string, params: Record<string, string | number>): Promise<MilestonePortfolio> {
    return (await this.get(`/api/workspaces/${slug}/milestones/`, { params })).data;
  }
  async list(slug: string, project: string): Promise<MilestoneList> {
    return (await this.get(this.path(slug, project))).data;
  }
  async save(slug: string, project: string, data: MilestoneForm, id?: string) {
    return id ? this.patch(`${this.path(slug, project)}${id}/`, data) : this.post(this.path(slug, project), data);
  }
  async remove(slug: string, project: string, id: string) {
    return this.delete(`${this.path(slug, project)}${id}/`);
  }
  async issues(slug: string, project: string, params: Record<string, string | number>): Promise<MilestoneWorkItems> {
    return (await this.get(`${this.path(slug, project)}work-items/`, { params })).data;
  }
  async link(slug: string, project: string, id: string, issue_ids: string[]) {
    return this.post(`${this.path(slug, project)}${id}/work-items/`, { issue_ids });
  }
  async assign(slug: string, project: string, issue: string, milestone_id: string | null) {
    return this.post(`${this.path(slug, project)}work-items/${issue}/`, { milestone_id });
  }
}
export const milestoneService = new MilestoneService();
export const milestoneKey = (slug: string, project: string) => ["project-milestones", slug, project];
export function milestoneError(error: unknown, fallback: string) {
  const data = (error as { response?: { data?: unknown } })?.response?.data;
  return data && typeof data === "object" ? Object.values(data).flat().map(String).join(" · ") : fallback;
}

export type MilestoneRiskStatus = "overdue" | "at_risk" | "due_soon" | "on_track" | "completed" | "no_target" | "empty";
export type PortfolioMilestone = Milestone & {
  project_id: string;
  project_name: string;
  project_code: string;
  visibility_limited: boolean;
};
export type MilestonePortfolio = {
  results: PortfolioMilestone[];
  total: number;
  next_page: number | null;
  projects: { id: string; name: string; identifier: string }[];
  timezone: string;
  today: string;
  window_days: number;
  limited_project_count: number;
};
