"use client";

import { BedDouble, GripVertical, Plane } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type MouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { t } from "@/lib/i18n";

const STORAGE_KEY = "travel-bubble-position-v3";
const BUBBLE_WIDTH = 78;
const BUBBLE_HEIGHT = 62;
const DRAG_THRESHOLD = 8;

interface Position { x: number; y: number }

function safePosition(position: Position): Position {
  if (typeof window === "undefined") return position;
  return {
    x: Math.min(Math.max(8, position.x), window.innerWidth - BUBBLE_WIDTH - 8),
    y: Math.min(Math.max(112, position.y), window.innerHeight - BUBBLE_HEIGHT - 92),
  };
}

function defaultPosition(): Position {
  const appRightEdge = window.innerWidth / 2 + 224;
  const desktopX = Math.min(window.innerWidth - BUBBLE_WIDTH - 12, appRightEdge + 12);
  return safePosition({
    x: window.innerWidth >= 768 ? desktopX : window.innerWidth - BUBBLE_WIDTH - 12,
    y: Math.max(130, window.innerHeight * 0.58),
  });
}

/** Draggable, keyboard-accessible travel shortcut. Dragging is optional: a
 * normal click and focus/Enter always remain available. */
export function TravelBubble() {
  const router = useRouter();
  const pathname = usePathname();
  const [position, setPosition] = useState<Position | null>(null);
  const drag = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
    moved: boolean;
    position: Position;
  } | null>(null);
  const suppressClick = useRef(false);

  useEffect(() => {
    let initial = defaultPosition();
    try {
      const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null") as Position | null;
      if (stored && Number.isFinite(stored.x) && Number.isFinite(stored.y)) initial = stored;
    } catch {
      // Keep the safe default.
    }
    setPosition(safePosition(initial));
    const onResize = () => setPosition((current) => current ? safePosition(current) : current);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  function start(event: ReactPointerEvent<HTMLButtonElement>): void {
    if (!position) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: position.x,
      startY: position.y,
      moved: false,
      position,
    };
  }

  function move(event: ReactPointerEvent<HTMLButtonElement>): void {
    const state = drag.current;
    if (!state || state.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - state.startClientX;
    const deltaY = event.clientY - state.startClientY;
    if (!state.moved && Math.hypot(deltaX, deltaY) < DRAG_THRESHOLD) return;
    state.moved = true;
    const next = safePosition({ x: state.startX + deltaX, y: state.startY + deltaY });
    state.position = next;
    setPosition(next);
  }

  function end(event: ReactPointerEvent<HTMLButtonElement>): void {
    const state = drag.current;
    if (!state || state.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const finalPosition = safePosition(state.position);
    setPosition(finalPosition);
    if (state.moved) {
      suppressClick.current = true;
      try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(finalPosition)); } catch { /* session-only */ }
    }
    drag.current = null;
  }

  function activate(event: MouseEvent<HTMLButtonElement>): void {
    if (suppressClick.current) {
      suppressClick.current = false;
      event.preventDefault();
      return;
    }
    router.push("/travel");
  }

  if (!position || pathname.startsWith("/travel")) return null;

  return (
    <button
      type="button"
      aria-label={`${t("travelHub.open")}. ${t("travelHub.dragHint")}`}
      title={t("travelHub.dragHint")}
      onClick={activate}
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={() => { drag.current = null; suppressClick.current = false; }}
      style={{ transform: `translate3d(${position.x}px, ${position.y}px, 0)` }}
      className="travel-bubble fixed left-0 top-0 z-30 flex h-[62px] w-[78px] touch-none select-none items-center justify-center rounded-[1.35rem] border border-white/35 bg-night/95 text-white shadow-[0_18px_42px_-14px_rgb(4_24_23/.75)] backdrop-blur-xl cursor-grab active:cursor-grabbing active:scale-[.97]"
    >
      <span className="relative flex items-center" aria-hidden>
        <span className="grid h-10 w-10 place-items-center rounded-full bg-white/12">
          <Plane size={20} className="-translate-y-0.5" />
          <BedDouble size={14} className="absolute bottom-0 end-0 rounded-full bg-accent-paprika p-0.5" />
        </span>
        <GripVertical size={14} className="ms-1 text-white/55" />
      </span>
    </button>
  );
}
