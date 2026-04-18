import { redirect } from "next/navigation";

// Primary redirect is in next.config.ts (avoids component mount).
// This page is a fallback safety net.
export default function CabinetPage() {
  redirect("/cabinet/analytics");
}
