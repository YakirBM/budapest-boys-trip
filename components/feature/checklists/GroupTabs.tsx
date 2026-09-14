"use client";

import { SubTabs } from "@/components/ui/SubTabs";
import { Backpack, PlaneLanding, PlaneTakeoff } from "lucide-react";
import { t } from "@/lib/i18n";
import {
  CHECKLIST_GROUPS,
  type ChecklistGroup,
  type ChecklistSubFilter,
} from "./checklistGroups";

export interface GroupTabsProps {
  active: ChecklistGroup;
  filter: ChecklistSubFilter;
  onGroupChange?: (group: ChecklistGroup) => void;
}

/**
 * GroupTabs — the 3 sticky life-phase tabs for Tab 2 (docs/14 §4.1).
 * Rendered via the shared SubTabs primitive (48px targets, role=tablist,
 * deep-linkable hrefs). Preserves the current mine|group|all sub-filter in
 * the URL (?group=&filter=).
 */
export function GroupTabs({ active, filter, onGroupChange }: GroupTabsProps) {
  const labels: Record<ChecklistGroup, string> = {
    preflight: t("checklists.groups.preflight.label"),
    travelers: t("checklists.groups.travelers.label"),
    return: t("checklists.groups.return.label"),
  };
  const icons = {
    preflight: <PlaneTakeoff aria-hidden size={17} />,
    travelers: <Backpack aria-hidden size={17} />,
    return: <PlaneLanding aria-hidden size={17} />,
  } satisfies Record<ChecklistGroup, React.ReactNode>;
  return (
    <SubTabs
      ariaLabel={t("checklists.groups.label")}
      activeId={active}
      onSelect={onGroupChange ? (id) => onGroupChange(id as ChecklistGroup) : undefined}
      tabs={CHECKLIST_GROUPS.map((group) => ({
        id: group,
        label: labels[group],
        href: `/checklists?group=${group}&filter=${filter}`,
        icon: icons[group],
      }))}
    />
  );
}
