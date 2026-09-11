"use client";

import { useRef, useState } from "react";
import { FileText, Info, Lock, Upload } from "lucide-react";
import { t } from "@/lib/i18n";
import { pushToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { openEticket, uploadEticket } from "@/lib/actions/flights";
import type { EticketDoc } from "@/lib/data/flights";

export interface EticketCardProps {
  doc: EticketDoc | null;
}

/**
 * Private e-ticket PDF (owner path scheme trips/{trip}/documents/{user}/{uuid}.pdf).
 * Signed URLs (1h) are minted on tap and never stored/logged/cached.
 */
export function EticketCard({ doc }: EticketCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [opening, setOpening] = useState(false);

  const onUpload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const result = await uploadEticket(formData);
      if (result.ok) {
        pushToast({ message: t("flights.savedOffline"), type: "success" });
        window.location.reload(); // re-render the RSC with the new document row
      } else {
        pushToast({ message: t("errors.saveFailed"), type: "danger" });
      }
    } finally {
      setUploading(false);
    }
  };

  const onOpen = async () => {
    if (!doc) return;
    setOpening(true);
    try {
      const result = await openEticket(doc.id);
      if (result.ok) {
        window.open(result.url, "_blank", "noopener,noreferrer");
      } else {
        pushToast({ message: t("flights.openFailed"), type: "danger" });
      }
    } finally {
      setOpening(false);
    }
  };

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-text-primary">
        <FileText aria-hidden size={18} className="text-cat-flight" />
        {t("flights.eticketTitle")}
      </h2>
      <p className="flex items-center gap-1.5 text-xs text-text-muted">
        <Lock aria-hidden size={12} className="shrink-0" />
        {t("flights.eticketPrivate")}
      </p>

      {doc ? (
        <Button variant="primary" loading={opening} onClick={() => void onOpen()}>
          {t("flights.eticketOpen")}
        </Button>
      ) : (
        <p className="text-sm text-text-secondary">{t("flights.eticketNone")}</p>
      )}

      <>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            void onUpload(file);
          }}
        />
        <Button
          variant="secondary"
          loading={uploading}
          icon={<Upload aria-hidden size={16} />}
          onClick={() => inputRef.current?.click()}
        >
          {t("flights.eticketUpload")} · {t("flights.eticketSizeHint")}
        </Button>
      </>

      <p className="flex items-start gap-1.5 text-xs leading-5 text-warning">
        <Info aria-hidden size={14} className="mt-0.5 shrink-0" />
        {t("flights.noGmailNote")}
      </p>
    </Card>
  );
}
