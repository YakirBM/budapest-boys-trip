import { redirect } from "next/navigation";

/** Entry point — the app's home is the Today dashboard. */
export default function Home() {
  redirect("/today");
}
