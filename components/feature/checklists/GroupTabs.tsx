"use client";

import { SubTabs } from "@/components/ui/SubTabs";
import { t } from "@/lib/i18n";
import {
  CHECKLIST_GROUPS,
  type ChecklistGroup,
  type ChecklistSubFilter,
} from "./checklistGroups";

export interface GroupTabsProps {
  active: ChecklistGroup;
  filter: ChecklistSubFilter;
}

/**
 * GroupTabs — the 3 sticky life-phase tabs for Tab 2 (docs/14 §4.1).
 * Rendered via the shared SubTabs primitive (48px targets, role=tablist,
 * deep-linkable hrefs). Preserves the current mine|group|all sub-filter in
 * the URL (?group=&filter=).
 */
export function GroupTabs({ active, filter }: GroupTabsProps) {
  const labels: Record<ChecklistGroup, string> = {
    preflight: t("checklists.groups.preflight.label"),
    travelers: t("checklists.groups.travelers.label"),
    return: t("checklists.groups.return.label"),
  };
  return (
    <SubTabs
      ariaLabel={t("checklists.groups.label")}
      activeId={active}
      tabs={CHECKLIST_GROUPS.map((group) => ({
        id: group,
        label: labels[group],
        href: `/checklists?group=${group}&filter=${filter}`,
      }))}
    />
  );
}
