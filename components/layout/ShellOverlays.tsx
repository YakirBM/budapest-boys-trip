"use client";

import dynamic from "next/dynamic";
import { TravelBubble } from "@/components/layout/TravelBubble";

// The chat implementation contains realtime, uploads, image rendering and AI
// search. Keep it out of every page's initial JavaScript and load its chunk in
// parallel after the shell becomes interactive.
const ChatSearchDrawer = dynamic(
  () => import("@/components/layout/ChatSearchDrawer").then((mod) => mod.ChatSearchDrawer),
  { ssr: false },
);

export function ShellOverlays() {
  return (
    <>
      <ChatSearchDrawer />
      <TravelBubble />
    </>
  );
}
