"use client";

import { useQuery } from "@tanstack/react-query";
import { getMyProfileAction } from "@/lib/actions/profile";
import { t } from "@/lib/i18n";
import { Card } from "@/components/ui/Card";
import { MemberAvatar } from "@/components/ui/MemberAvatar";
import { Skeleton } from "@/components/ui/Skeleton";

const STATUS_META = {
  active: {
    labelKey: "profile.statusActive",
    dot: "var(--color-success)",
    text: "text-success",
  },
  pending: {
    labelKey: "profile.statusPending",
    dot: "var(--color-warning)",
    text: "text-warning",
  },
  declined: {
    labelKey: "profile.statusDeclined",
    dot: "var(--color-text-muted)",
    text: "text-text-muted",
  },
} as const;

/**
 * ProfileCard — compact current-member identity affordance (docs/13 Phase 6).
 * Identity comes from the authenticated Supabase session via a server action;
 * renders only self-owned, non-sensitive fields (never the email). Pending
 * members see their read-only state explicitly.
 */
export function ProfileCard() {
  const { data, isPending } = useQuery({
    queryKey: ["my-profile"],
    queryFn: getMyProfileAction,
    staleTime: 5 * 60 * 1000,
  });

  if (isPending) {
    return (
      <Card className="mb-4 flex items-center gap-3" aria-busy>
        <Skeleton className="h-10 w-10 rounded-full" />
        <span className="flex flex-1 flex-col gap-1.5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-24" />
        </span>
      </Card>
    );
  }

  if (!data) return null;

  const status = STATUS_META[data.status];
  return (
    <Card className="mb-4 flex flex-col gap-2">
      <span className="flex items-center gap-3">
        <MemberAvatar name={data.fullName} size={40} pending={data.status === "pending"} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-base font-bold text-text-primary">{data.fullName}</span>
          <span className={`flex items-center gap-1.5 text-xs font-semibold ${status.text}`}>
            <span
              aria-hidden
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: status.dot }}
            />
            {t(status.labelKey)}
            <span aria-hidden className="font-normal text-text-muted">
              · {data.role === "owner" ? t("profile.roleOwner") : t("profile.roleMember")}
            </span>
          </span>
        </span>
      </span>
      {data.status === "pending" && (
        <p className="text-xs leading-5 text-text-muted">{t("profile.pendingHint")}</p>
      )}
    </Card>
  );
}
