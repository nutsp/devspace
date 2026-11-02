/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useParams, usePathname } from "next/navigation";
import { getWorkspaceSection } from "@/helpers/workspace-app-navigation";

/**
 * Custom hook to detect different workspace paths
 * @returns Object containing boolean flags for different workspace paths
 */
export const useWorkspacePaths = () => {
  const { workspaceSlug } = useParams();
  const pathname = usePathname();

  const section = getWorkspaceSection(pathname, workspaceSlug?.toString());
  const isSettingsPath = section === "settings";
  const isWikiPath = section === "wiki";
  const isTimesheetPath = section === "timesheet";
  const isAiPath = section === "ai";
  const isProjectsPath = section === "work";
  const isNotificationsPath = pathname.includes(`/${workspaceSlug}/notifications`);

  return {
    isSettingsPath,
    isWikiPath,
    isTimesheetPath,
    isAiPath,
    isProjectsPath,
    isNotificationsPath,
  };
};
