import { API_BASE_URL } from "@plane/constants";
import { APIService } from "@/services/api.service";

export type TimeEntry = {
  id: string;
  work_date: string;
  project_id: string | null;
  issue_id: string | null;
  project_name: string;
  project_code: string;
  issue_name: string;
  issue_code: string;
  activity: string;
  duration_minutes: number;
  note: string;
};
export type ProjectReview = {
  project_id: string;
  project_name: string;
  project_code: string;
  reviewer_id: string | null;
  reviewer_name: string | null;
  status: "submitted" | "approved" | "returned";
  reason: string;
  reviewed_at: string | null;
  can_review: boolean;
};
export type WeeklyTimesheet = {
  id: string | null;
  week_start: string;
  timezone: string;
  user_id: string | null;
  user_name: string;
  status: "draft" | "submitted" | "returned" | "approved";
  reviewer_id: string | null;
  reviewer_name: string | null;
  project_reviews: ProjectReview[];
  review_status: "draft" | "submitted" | "returned" | "approved";
  version: number;
  total_minutes: number;
  entries: TimeEntry[];
  events: { id: string; action: string; actor: string; reason: string; created_at: string; version: number }[];
};
export type TimesheetOptions = {
  projects: {
    id: string;
    name: string;
    identifier: string;
    project_lead_id: string | null;
    project_lead_name: string | null;
    lead_eligible: boolean;
  }[];
  issues: { id: string; name: string; code: string }[];
  reviewers: { id: string; name: string }[];
  activities: string[];
  is_reviewer: boolean;
  can_write: boolean;
};

export class TimesheetService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }
  private path(slug: string) {
    return `/api/workspaces/${slug}/timesheets`;
  }
  async my(slug: string, week: string): Promise<WeeklyTimesheet> {
    return (await this.get(`${this.path(slug)}/my/`, { params: { week_start: week } })).data;
  }
  async create(slug: string, week: string): Promise<WeeklyTimesheet> {
    return (await this.post(`${this.path(slug)}/my/`, { week_start: week })).data;
  }
  async options(slug: string, projectId = "", search = ""): Promise<TimesheetOptions> {
    return (await this.get(`${this.path(slug)}/options/`, { params: { project_id: projectId || undefined, search } }))
      .data;
  }
  async inbox(slug: string): Promise<WeeklyTimesheet[]> {
    return (await this.get(`${this.path(slug)}/review/`)).data;
  }
  async detail(slug: string, id: string): Promise<WeeklyTimesheet> {
    return (await this.get(`${this.path(slug)}/${id}/`)).data;
  }
  async action(
    slug: string,
    id: string,
    action: string,
    body: Record<string, unknown>,
    entryId?: string
  ): Promise<WeeklyTimesheet> {
    const path = entryId ? `${id}/entries/${entryId}/${action}` : `${id}/${action}`;
    return (await this.post(`${this.path(slug)}/${path}/`, body)).data;
  }
  exportUrl(slug: string, id: string) {
    return `${API_BASE_URL}${this.path(slug)}/${id}/export/`;
  }
}
