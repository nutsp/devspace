import { useTranslation } from "@plane/i18n";
/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// hoc/withDockItems.tsx
import React from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { PlaneNewIcon } from "@plane/propel/icons";
import { BookOpen, Clock3 } from "lucide-react";
import type { AppSidebarItemData } from "@/components/sidebar/sidebar-item";
import { useWorkspacePaths } from "@/hooks/use-workspace-paths";

type WithDockItemsProps = {
  dockItems: (AppSidebarItemData & { shouldRender: boolean })[];
};

export function withDockItems<P extends WithDockItemsProps>(WrappedComponent: React.ComponentType<P>) {
  const ComponentWithDockItems = observer(function ComponentWithDockItems(props: Omit<P, keyof WithDockItemsProps>) {
    const { t } = useTranslation();
    const { workspaceSlug } = useParams();
    const { isProjectsPath, isNotificationsPath, isWikiPath, isTimesheetPath } = useWorkspacePaths();

    const dockItems: (AppSidebarItemData & { shouldRender: boolean })[] = [
      {
        label: t("workspace_tools.work"),
        icon: <PlaneNewIcon className="size-5" />,
        href: `/${workspaceSlug}/`,
        isActive: isProjectsPath && !isNotificationsPath,
        shouldRender: true,
      },
      {
        label: t("workspace_tools.wiki"),
        icon: <BookOpen className="size-5" />,
        href: `/${workspaceSlug}/wiki/`,
        isActive: isWikiPath,
        shouldRender: true,
      },
      {
        label: t("workspace_tools.timesheet"),
        icon: <Clock3 className="size-5" />,
        href: `/${workspaceSlug}/timesheet/`,
        isActive: isTimesheetPath,
        shouldRender: true,
      },
    ];

    return <WrappedComponent {...(props as P)} dockItems={dockItems} />;
  });

  return ComponentWithDockItems;
}
