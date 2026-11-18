import type { Metadata } from "next";
import { Archivo, Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { QueryProvider } from "@/providers/query-provider";
import { PairingProvider } from "@/providers/pairing-provider";
import { themeBootScript } from "@/lib/theme";

// Self-hosted at build time: no font requests leave the device at runtime.
const archivo = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-archivo" });
const hanken = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-hanken" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains" });

export const metadata: Metadata = {
  title: "KasiP2P",
  description: "Local network peer-to-peer file sharing",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // dark by default; the boot script may switch to light before paint
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "dark h-full antialiased",
        archivo.variable,
        hanken.variable,
        jetbrains.variable,
        "font-sans",
      )}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      {/* providers render UI (status banner, modal), so they must sit inside body */}
      <body className="min-h-full flex flex-col">
        <QueryProvider>
          <PairingProvider>{children}</PairingProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
