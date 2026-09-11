"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, LogOut } from "lucide-react";
import { t } from "@/lib/i18n";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { updateMyProfileAction } from "@/lib/actions/profile";
import { compressImage, isAllowedImageFile } from "@/lib/utils/image";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ConfirmSheet } from "@/components/ui/ConfirmSheet";
import { MemberAvatar } from "@/components/ui/MemberAvatar";
import { pushToast } from "@/components/ui/Toast";

interface OwnProfile {
  fullName: string;
  phone: string;
  addressLine: string;
  city: string;
  country: string;
  iceName: string;
  icePhone: string;
  avatarPath: string | null;
}

/**
 * ProfileMenu — avatar button at the header end edge opening a bottom sheet
 * with full profile edit (docs/14 §1.4): personal details, phones, ICE
 * emergency contact, full address (private, self-only), profile photo
 * (private `avatars` bucket, signed-URL render), and a prominent logout.
 */
export function ProfileMenu() {
  const [open, setOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [form, setForm] = useState<OwnProfile>({
    fullName: "",
    phone: "",
    addressLine: "",
    city: "",
    country: "",
    iceName: "",
    icePhone: "",
    avatarPath: null,
  });
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    void (async () => {
      try {
        const supabase = getSupabaseBrowserClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase
          .from("profiles")
          .select("full_name,phone,address_line,city,country,ice_name,ice_phone,avatar_path")
          .eq("id", user.id)
          .single();
        if (data) {
          setForm({
            fullName: String(data["full_name"] ?? ""),
            phone: String(data["phone"] ?? ""),
            addressLine: String(data["address_line"] ?? ""),
            city: String(data["city"] ?? ""),
            country: String(data["country"] ?? ""),
            iceName: String(data["ice_name"] ?? ""),
            icePhone: String(data["ice_phone"] ?? ""),
            avatarPath: (data["avatar_path"] as string | null) ?? null,
          });
          const path = data["avatar_path"] as string | null;
          if (path) {
            const signed = await supabase.storage.from("avatars").createSignedUrl(path, 3600);
            if (signed.data?.signedUrl) setAvatarUrl(signed.data.signedUrl);
          } else {
            setAvatarUrl(null);
          }
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [open ]);

  const set = (key: keyof OwnProfile) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  async function handlePhoto(file: File): Promise<void> {
    if (!isAllowedImageFile(file)) {
      pushToast({ message: t("media.compressionFailed", { name: file.name }), type: "danger" });
      return;
    }
    try {
      const supabase = getSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      let blob: Blob = file;
      try {
        const compressed = await compressImage(file);
        blob = compressed.blob;
      } catch {
        // Compression failed — keep the original (small avatar, user-chosen).
      }
      const path = `${user.id}/${Date.now()}.webp`;
      const { error } = await supabase.storage.from("avatars").upload(path, blob, {
        contentType: "image/webp",
        upsert: true,
      });
      if (error) throw error;
      setForm((prev) => ({ ...prev, avatarPath: path }));
      const signed = await supabase.storage.from("avatars").createSignedUrl(path, 3600);
      if (signed.data?.signedUrl) setAvatarUrl(signed.data.signedUrl);
    } catch {
      pushToast({ message: t("errors.saveFailed"), type: "danger" });
    }
  }

  async function handleSave(): Promise<void> {
    setSaving(true);
    try {
      const result = await updateMyProfileAction({
        fullName: form.fullName.trim() || undefined,
        phone: form.phone.trim(),
        addressLine: form.addressLine.trim(),
        city: form.city.trim(),
        country: form.country.trim(),
        iceName: form.iceName.trim(),
        icePhone: form.icePhone.trim(),
        avatarPath: form.avatarPath ?? undefined,
      });
      if (!result.ok) {
        pushToast({ message: t("errors.saveFailed"), type: "danger" });
        return;
      }
      pushToast({ message: t("header.saved"), type: "success" });
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout(): Promise<void> {
    setConfirmLogout(false);
    await getSupabaseBrowserClient().auth.signOut();
    window.location.href = "/login";
  }

  const inputClass =
    "w-full rounded-xl border border-border bg-surface-raised px-3 py-3 text-base text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("header.profileMenu")}
        aria-haspopup="dialog"
        className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition-opacity active:opacity-80"
      >
        <MemberAvatar name={form.fullName || "?"} imageUrl={avatarUrl ?? undefined} size={32} />
      </button>

      <BottomSheet open={open} onClose={() => setOpen(false)} title={t("header.editProfile")}>
        {loading ? (
          <p className="py-6 text-center text-sm text-text-muted">{t("common.loading")}</p>
        ) : (
          <div className="flex flex-col gap-3 pb-2">
            <div className="flex items-center gap-3">
              <MemberAvatar name={form.fullName || "?"} imageUrl={avatarUrl ?? undefined} size={40} />
              <div className="flex flex-1 flex-col gap-1">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand-soft px-3 text-sm font-bold text-brand-strong"
                >
                  <Camera aria-hidden size={18} />
                  {t("header.changePhoto")}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  aria-label={t("header.changePhoto")}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void handlePhoto(file);
                    event.target.value = "";
                  }}
                />
              </div>
            </div>

            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-text-primary">{t("header.fullName")}</span>
              <input dir="auto" className={inputClass} value={form.fullName} onChange={(e) => set("fullName")(e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-text-primary">{t("header.phone")}</span>
              <input dir="ltr" inputMode="tel" autoComplete="tel" className={inputClass} value={form.phone} onChange={(e) => set("phone")(e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-text-primary">
                {t("header.addressLine")}{" "}
                <span className="text-xs font-medium text-text-muted">· {t("header.privateBadge")}</span>
              </span>
              <input dir="auto" className={inputClass} value={form.addressLine} onChange={(e) => set("addressLine")(e.target.value)} />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-text-primary">{t("header.city")}</span>
                <input dir="auto" className={inputClass} value={form.city} onChange={(e) => set("city")(e.target.value)} />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-text-primary">{t("header.country")}</span>
                <input dir="auto" className={inputClass} value={form.country} onChange={(e) => set("country")(e.target.value)} />
              </label>
            </div>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-text-primary">
                {t("header.iceName")}{" "}
                <span className="text-xs font-medium text-text-muted">· {t("header.privateBadge")}</span>
              </span>
              <input dir="auto" className={inputClass} value={form.iceName} onChange={(e) => set("iceName")(e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-text-primary">{t("header.icePhone")}</span>
              <input dir="ltr" inputMode="tel" className={inputClass} value={form.icePhone} onChange={(e) => set("icePhone")(e.target.value)} />
            </label>

            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="inline-flex min-h-12 items-center justify-center rounded-xl bg-brand px-4 text-base font-bold text-brand-contrast transition-opacity active:opacity-80 disabled:opacity-50"
            >
              {saving ? t("common.loading") : t("common.save")}
            </button>

            <div aria-hidden className="my-1 h-px bg-border" />
            <button
              type="button"
              onClick={() => setConfirmLogout(true)}
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-danger px-4 text-base font-bold text-danger transition-opacity active:opacity-80"
            >
              <LogOut aria-hidden size={20} />
              {t("header.logout")}
            </button>
          </div>
        )}
      </BottomSheet>

      <ConfirmSheet
        open={confirmLogout}
        onClose={() => setConfirmLogout(false)}
        onConfirm={() => void handleLogout()}
        title={t("header.logoutTitle")}
        description={t("header.logoutDescription")}
        confirmLabel={t("header.logout")}
        danger
      />
    </>
  );
}
