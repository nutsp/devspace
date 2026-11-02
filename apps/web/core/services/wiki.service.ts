import type { WikiGraphData } from "@/helpers/wiki-graph";
import { API_BASE_URL } from "@plane/constants";
import { APIService } from "@/services/api.service";

export type WikiCollection = { id: string; name: string };
export type WikiReview = {
  owner_id: string | null;
  owner_name: string | null;
  due_date: string | null;
  interval_days: number;
  reviewed_at: string | null;
  reviewed_by: string | null;
  reviewed_by_name: string | null;
  revision: string;
  content_hash: string;
  status: "unassigned" | "unscheduled" | "overdue" | "changed" | "due_soon" | "reviewed" | "scheduled";
  changed_since_review: boolean;
};
export type WikiReviewDetail = WikiReview & {
  today: string;
  can_manage: boolean;
  can_complete: boolean;
  members: { id: string; name: string }[];
};
export type WikiTemplate = { id: string; key: string; name: string; description: string; headings: string[] };
export type WikiTemplateDetail = WikiTemplate & {
  content_html: string;
  is_active: boolean;
  version: string;
  updated_at: string;
};
export type WikiDocument = {
  snippet?: string;
  path?: string[];
  match?: "title" | "content";
  id: string;
  name: string;
  collection_id: string;
  parent_id: string | null;
  sort_order: number;
  tree_revision: string;
  can_move: boolean;
  review: WikiReview;
  updated_at: string;
  owner: string;
  access: number;
};

export type WikiSearchHit = WikiDocument & { snippet: string; path: string[]; match: "title" | "content" };
export type WikiSearchResponse = { results: WikiSearchHit[]; count: number; page: number; page_size: number };

export class WikiService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }
  async search(
    slug: string,
    q: string,
    collectionId: string,
    page: number,
    review: string
  ): Promise<WikiSearchResponse> {
    return (
      await this.get(`/api/workspaces/${slug}/wiki/search/`, {
        params: { q, ...(collectionId ? { collection_id: collectionId } : {}), page, review },
      })
    ).data;
  }
  async renderPlantUML(slug: string, source: string, dark: boolean): Promise<string> {
    try {
      return (await this.post(`/api/workspaces/${slug}/wiki/diagrams/plantuml/`, { source, dark })).data.image;
    } catch (failure) {
      const data = (failure as { response?: { data?: { error?: string; source?: string[]; line?: number } } })?.response
        ?.data;
      throw new Error(
        data?.error
          ? `${data.error}${data.line ? ` (line ${data.line})` : ""}`
          : data?.source?.join(" ") || "PlantUML preview is unavailable. Try Preview again.",
        { cause: failure }
      );
    }
  }
  async manageTemplates(slug: string): Promise<WikiTemplateDetail[]> {
    return (await this.get(`/api/workspaces/${slug}/wiki/templates/`, { params: { manage: "1" } })).data;
  }
  async template(slug: string, id: string): Promise<WikiTemplateDetail> {
    return (await this.get(`/api/workspaces/${slug}/wiki/templates/${id}/`)).data;
  }
  async createTemplate(slug: string, data: Record<string, unknown>): Promise<WikiTemplateDetail> {
    return (await this.post(`/api/workspaces/${slug}/wiki/templates/`, data)).data;
  }
  async updateTemplate(slug: string, id: string, data: Record<string, unknown>): Promise<WikiTemplateDetail> {
    return (await this.patch(`/api/workspaces/${slug}/wiki/templates/${id}/`, data)).data;
  }
  async duplicateTemplate(slug: string, row: WikiTemplateDetail): Promise<WikiTemplateDetail> {
    return (await this.post(`/api/workspaces/${slug}/wiki/templates/${row.id}/`, { version: row.version })).data;
  }
  async deleteTemplate(slug: string, row: WikiTemplateDetail): Promise<void> {
    await this.delete(`/api/workspaces/${slug}/wiki/templates/${row.id}/`, { version: row.version });
  }
  async templates(slug: string): Promise<WikiTemplate[]> {
    return (await this.get(`/api/workspaces/${slug}/wiki/templates/`)).data;
  }
  async review(slug: string, collectionId: string, pageId: string): Promise<WikiReviewDetail> {
    return (await this.get(`/api/workspaces/${slug}/wiki/collections/${collectionId}/pages/${pageId}/review/`)).data;
  }
  async updateReview(
    slug: string,
    collectionId: string,
    pageId: string,
    data: Record<string, unknown>
  ): Promise<WikiReviewDetail> {
    return (await this.patch(`/api/workspaces/${slug}/wiki/collections/${collectionId}/pages/${pageId}/review/`, data))
      .data;
  }
  async completeReview(
    slug: string,
    collectionId: string,
    pageId: string,
    data: Record<string, unknown>
  ): Promise<WikiReviewDetail> {
    return (await this.post(`/api/workspaces/${slug}/wiki/collections/${collectionId}/pages/${pageId}/review/`, data))
      .data;
  }
  async collections(slug: string): Promise<WikiCollection[]> {
    return (await this.get(`/api/workspaces/${slug}/wiki/collections/`)).data;
  }
  async createCollection(slug: string, name: string): Promise<WikiCollection> {
    return (await this.post(`/api/workspaces/${slug}/wiki/collections/`, { name })).data;
  }
  async updateCollection(slug: string, id: string, name: string): Promise<WikiCollection> {
    return (await this.patch(`/api/workspaces/${slug}/wiki/collections/${id}/`, { name })).data;
  }
  async movePage(slug: string, page: WikiDocument, targetId: string | null, position: string) {
    return (
      await this.post(`/api/workspaces/${slug}/wiki/collections/${page.collection_id}/pages/${page.id}/move/`, {
        target_id: targetId,
        position,
        revision: page.tree_revision,
      })
    ).data;
  }
  async graph(
    slug: string,
    options: { page_id?: string; collection_id?: string; depth: number; include_hierarchy: boolean }
  ): Promise<WikiGraphData> {
    return (await this.get(`/api/workspaces/${slug}/wiki/graph/`, { params: options })).data;
  }
  async pages(slug: string): Promise<WikiDocument[]> {
    return (await this.get(`/api/workspaces/${slug}/wiki/pages/`)).data;
  }
}
