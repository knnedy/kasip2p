"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { Wordmark } from "@/components/wordmark";

// Back to the device list; the wordmark keeps every screen anchored to the brand.
export function TopBar({ children }: { children?: React.ReactNode }) {
  const router = useRouter();
  return (
    <header className="flex min-h-11 items-center justify-between gap-4">
      <button
        type="button"
        onClick={() => router.push("/")}
        className="-ml-2 inline-flex min-h-11 items-center gap-2 rounded-full px-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="size-4" />
        Devices
      </button>
      {children ?? <Wordmark />}
    </header>
  );
}
