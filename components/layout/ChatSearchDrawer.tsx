"use client";

import { Bot, ExternalLink, FileUp, Library, MessageCircle, Search, Send, X } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { quickAddPlaceAction } from "@/lib/actions/route";
import { TRIP_ID } from "@/lib/trip-constants";
import { t } from "@/lib/i18n";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { pushToast } from "@/components/ui/Toast";
import { lockDocumentScroll } from "@/lib/utils/scroll-lock";

type DrawerTab = "group" | "ai";
interface ChatMessage {
  id: string; author_id: string; body: string | null; kind: string;
  media_path: string | null; media_name: string | null; media_mime: string | null; created_at: string;
  authorName?: string; mediaUrl?: string;
}
interface SearchResult { text: string; citations: { title: string; url: string }[]; verifiedAt: string }

function safeFileName(name: string): string {
  const ext = name.includes(".") ? `.${name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "")}` : "";
  return `attachment${ext.slice(0, 8)}`;
}

export function ChatSearchDrawer() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<DrawerTab>("group");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  const loadMessages = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    const { data: auth } = await supabase.auth.getUser();
    setViewerId(auth.user?.id ?? null);
    const { data, error } = await supabase
      .from("trip_messages")
      .select("id,author_id,body,kind,media_path,media_name,media_mime,created_at")
      .eq("trip_id", TRIP_ID).order("created_at", { ascending: true }).limit(120);
    if (error) { setLoadFailed(true); return; }
    const rows = (data ?? []) as ChatMessage[];
    const ids = [...new Set(rows.map((row) => row.author_id))];
    const { data: profiles } = ids.length
      ? await supabase.from("profiles").select("id,full_name").in("id", ids)
      : { data: [] as { id: string; full_name: string }[] };
    const names = new Map((profiles ?? []).map((profile) => [String(profile.id), String(profile.full_name)]));
    const hydrated = await Promise.all(rows.map(async (row) => {
      let mediaUrl: string | undefined;
      if (row.media_path) {
        const signed = await supabase.storage.from("chat-media").createSignedUrl(row.media_path, 3600);
        mediaUrl = signed.data?.signedUrl;
      }
      return { ...row, authorName: names.get(row.author_id) ?? "—", mediaUrl };
    }));
    setMessages(hydrated);
    setLoadFailed(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    void loadMessages();
    const supabase = getSupabaseBrowserClient();
    const channel = supabase.channel(`trip-chat:${TRIP_ID}`).on(
      "postgres_changes", { event: "*", schema: "public", table: "trip_messages", filter: `trip_id=eq.${TRIP_ID}` },
      () => void loadMessages(),
    ).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [loadMessages, open]);

  useEffect(() => { if (open && tab === "group") endRef.current?.scrollIntoView({ block: "end" }); }, [messages, open, tab]);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const unlockScroll = lockDocumentScroll();
    panelRef.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); return; }
      if (event.key !== "Tab") return;
      const focusable = [...(panelRef.current?.querySelectorAll<HTMLElement>('button, a, textarea, input, [tabindex]:not([tabindex="-1"])') ?? [])];
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); unlockScroll(); previous?.focus(); };
  }, [open]);

  async function sendMessage(): Promise<void> {
    const body = text.trim();
    if (!body || !viewerId || busy) return;
    setBusy(true);
    const { error } = await getSupabaseBrowserClient().from("trip_messages").insert({ trip_id: TRIP_ID, author_id: viewerId, kind: "text", body });
    setBusy(false);
    if (error) pushToast({ message: t("chat.sendError"), type: "danger" });
    else { setText(""); void loadMessages(); }
  }

  async function upload(file: File): Promise<void> {
    if (!viewerId || file.size > 25 * 1024 * 1024) { pushToast({ message: t("chat.sendError"), type: "danger" }); return; }
    setBusy(true);
    const supabase = getSupabaseBrowserClient();
    const path = `${TRIP_ID}/${viewerId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
    const uploaded = await supabase.storage.from("chat-media").upload(path, file, { contentType: file.type, upsert: false });
    if (uploaded.error) { setBusy(false); pushToast({ message: t("chat.sendError"), type: "danger" }); return; }
    const kind = file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : "file";
    const inserted = await supabase.from("trip_messages").insert({ trip_id: TRIP_ID, author_id: viewerId, kind, media_path: path, media_name: file.name.slice(0, 160), media_mime: file.type });
    if (inserted.error) { await supabase.storage.from("chat-media").remove([path]); pushToast({ message: t("chat.sendError"), type: "danger" }); }
    setBusy(false); void loadMessages();
  }

  async function search(): Promise<void> {
    if (!query.trim() || busy) return;
    setBusy(true); setResult(null);
    try {
      const response = await fetch("/api/trip-search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: query.trim() }) });
      const payload = await response.json() as { ok?: boolean; text?: string; citations?: SearchResult["citations"]; verifiedAt?: string };
      if (!response.ok || !payload.ok || !payload.text || !payload.verifiedAt) throw new Error("search_failed");
      setResult({ text: payload.text, citations: payload.citations ?? [], verifiedAt: payload.verifiedAt });
    } catch { pushToast({ message: t("chat.searchError"), type: "danger" }); }
    finally { setBusy(false); }
  }

  async function saveCitation(citation: { title: string; url: string }): Promise<void> {
    const saved = await quickAddPlaceAction({ rawUrl: citation.url, name: citation.title, note: t("chat.disclaimer") });
    pushToast({ message: saved.ok ? t("chat.savedSource") : t("errors.saveFailed"), type: saved.ok ? "success" : "danger" });
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={t("chat.open")} className="fixed left-0 top-[42%] z-30 flex min-h-12 items-center gap-2 rounded-e-2xl border border-s-0 border-white/35 bg-night/95 px-2.5 py-3 text-white shadow-xl backdrop-blur-xl">
        <MessageCircle aria-hidden size={20} />
        <span className="[writing-mode:vertical-rl] text-[11px] font-bold tracking-wide">{t("chat.title")}</span>
      </button>

      {open && <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={t("chat.title")}>
        <button type="button" aria-label={t("chat.close")} className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
        <section ref={panelRef} tabIndex={-1} dir="rtl" className="chat-drawer-in absolute inset-y-0 left-0 flex w-[min(92vw,27rem)] flex-col border-e border-white/20 bg-background/98 pb-safe shadow-[24px_0_80px_-30px_rgb(0_0_0/.7)] backdrop-blur-2xl outline-none">
          <header className="flex items-center gap-3 border-b border-border px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top,0px))]">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand text-brand-contrast"><MessageCircle aria-hidden size={22} /></span>
            <div className="min-w-0 flex-1"><h2 className="text-lg font-extrabold text-text-primary">{t("chat.title")}</h2><p className="text-xs text-text-muted">{tab === "group" ? t("chat.groupHint") : t("chat.aiHint")}</p></div>
            <button type="button" onClick={() => setOpen(false)} aria-label={t("chat.close")} className="grid h-12 w-12 place-items-center rounded-2xl bg-surface-raised text-text-secondary"><X aria-hidden size={21} /></button>
          </header>
          <div className="grid grid-cols-2 gap-1 border-b border-border bg-surface/70 p-2" role="tablist">
            {([{ id: "group", icon: MessageCircle, label: t("chat.groupTab") }, { id: "ai", icon: Bot, label: t("chat.aiTab") }] as const).map(({ id, icon: Icon, label }) => <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`flex min-h-12 items-center justify-center gap-2 rounded-xl text-sm font-bold ${tab === id ? "bg-brand text-brand-contrast shadow-sm" : "text-text-muted"}`}><Icon aria-hidden size={18} />{label}</button>)}
          </div>

          {tab === "group" ? <>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
              {loadFailed ? <button type="button" onClick={() => void loadMessages()} className="min-h-12 w-full rounded-xl border border-danger text-sm font-bold text-danger">{t("chat.loadError")} · {t("common.retry")}</button> : messages.length === 0 ? <div className="grid h-full place-content-center text-center text-sm text-text-muted"><MessageCircle className="mx-auto mb-3 opacity-35" size={38} />{t("chat.empty")}</div> : <div className="flex flex-col gap-3">{messages.map((message) => {
                const mine = message.author_id === viewerId;
                return <article key={message.id} className={`max-w-[86%] rounded-2xl px-3.5 py-2.5 ${mine ? "self-end rounded-ee-md bg-brand text-brand-contrast" : "self-start rounded-es-md border border-border bg-surface-raised text-text-primary"}`}>
                  {!mine && <p className="mb-1 text-[11px] font-bold text-accent-paprika">{message.authorName}</p>}
                  {message.body && <p className="whitespace-pre-wrap text-sm leading-6">{message.body}</p>}
                  {message.mediaUrl && message.kind === "image" && <Image unoptimized src={message.mediaUrl} alt={message.media_name ?? ""} width={640} height={480} className="mt-1 max-h-64 w-full rounded-xl object-cover" />}
                  {message.mediaUrl && message.kind === "video" && <video src={message.mediaUrl} controls className="mt-1 max-h-64 w-full rounded-xl" />}
                  {message.mediaUrl && message.kind === "file" && <a href={message.mediaUrl} target="_blank" rel="noopener noreferrer" className="mt-1 flex min-h-11 items-center gap-2 underline"><FileUp size={16} />{message.media_name}</a>}
                  <time dateTime={message.created_at} className={`mt-1 block text-[10px] ${mine ? "text-white/70" : "text-text-muted"}`}>{new Intl.DateTimeFormat("he-IL", { hour: "2-digit", minute: "2-digit" }).format(new Date(message.created_at))}</time>
                </article>;
              })}<div ref={endRef} /></div>}
            </div>
            <form className="flex items-end gap-2 border-t border-border bg-surface/90 p-3" onSubmit={(event) => { event.preventDefault(); void sendMessage(); }}>
              <button type="button" onClick={() => fileRef.current?.click()} aria-label={t("chat.attach")} className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-surface-raised text-text-secondary"><FileUp aria-hidden size={20} /></button>
              <input ref={fileRef} type="file" accept="image/*,video/mp4,video/quicktime,application/pdf" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = ""; }} />
              <textarea rows={1} value={text} maxLength={2000} onChange={(event) => setText(event.target.value)} placeholder={busy ? t("chat.uploading") : t("chat.messagePlaceholder")} className="min-h-12 max-h-28 min-w-0 flex-1 resize-none rounded-2xl border border-border bg-surface-raised px-3 py-3 text-base text-text-primary outline-none focus:border-brand" />
              <button type="submit" disabled={!text.trim() || busy} aria-label={t("chat.send")} className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-accent-paprika text-white disabled:opacity-40"><Send aria-hidden size={20} /></button>
            </form>
          </> : <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
            <div className="rounded-[1.75rem] bg-night p-5 text-white shadow-lg"><Bot aria-hidden size={28} className="mb-4 text-accent-paprika" /><h3 className="text-xl font-extrabold">{t("chat.aiTitle")}</h3><p className="mt-1 text-sm leading-6 text-white/70">{t("chat.aiHint")}</p></div>
            <form className="mt-4" onSubmit={(event) => { event.preventDefault(); void search(); }}><textarea value={query} onChange={(event) => setQuery(event.target.value)} maxLength={800} rows={4} placeholder={t("chat.aiPlaceholder")} className="w-full resize-none rounded-2xl border border-border bg-surface-raised p-4 text-base leading-6 text-text-primary outline-none focus:border-brand" /><button type="submit" disabled={!query.trim() || busy} className="mt-2 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-brand px-4 font-bold text-brand-contrast disabled:opacity-45"><Search aria-hidden size={19} />{busy ? t("chat.searching") : t("chat.search")}</button></form>
            {result && <article className="mt-4 rounded-2xl border border-border bg-surface p-4"><p className="whitespace-pre-wrap text-sm leading-7 text-text-primary">{result.text}</p><p className="mt-3 text-[11px] text-text-muted">{t("common.lastVerifiedAt")}: <span dir="ltr">{new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeStyle: "short" }).format(new Date(result.verifiedAt))}</span></p>{result.citations.length > 0 && <div className="mt-4 border-t border-border pt-3"><h4 className="mb-2 text-sm font-bold text-text-primary">{t("chat.sources")}</h4><div className="flex flex-col gap-2">{result.citations.map((citation) => <div key={citation.url} className="rounded-xl bg-surface-raised p-3"><a href={citation.url} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center gap-2 text-sm font-bold text-brand"><ExternalLink aria-hidden size={16} />{citation.title}</a><button type="button" onClick={() => void saveCitation(citation)} className="mt-1 flex min-h-11 items-center gap-2 text-xs font-bold text-text-secondary"><Library aria-hidden size={16} />{t("chat.saveSource")}</button></div>)}</div></div>}<p className="mt-3 text-xs leading-5 text-warning">{t("chat.disclaimer")}</p></article>}
          </div>}
        </section>
      </div>}
    </>
  );
}
