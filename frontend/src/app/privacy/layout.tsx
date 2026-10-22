import type { Metadata } from "next";

// One title per route (WCAG 2.4.2). The page itself is a client component, so the metadata lives here.
export const metadata: Metadata = { title: "حریم خصوصی · Privacy" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
