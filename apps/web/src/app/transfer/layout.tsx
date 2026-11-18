import type { Metadata } from "next";

// The page is a client component, so its tab title and noindex live here.
export const metadata: Metadata = {
  title: "Send files",
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
