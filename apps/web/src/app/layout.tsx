import type { Metadata, Viewport } from "next";
import { Archivo, Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { QueryProvider } from "@/providers/query-provider";
import { PairingProvider } from "@/providers/pairing-provider";
import { themeBootScript } from "@/lib/theme";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, siteUrl } from "@/lib/site";

// Self-hosted at build time: no font requests leave the device at runtime.
const archivo = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-archivo" });
const hanken = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-hanken" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains" });

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: SITE_TITLE, template: `%s · ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "file sharing",
    "send files over Wi-Fi",
    "phone to computer file transfer",
    "peer-to-peer",
    "P2P",
    "WebRTC",
    "AirDrop alternative",
    "share files without uploading",
    "local network",
  ],
  authors: [{ name: "Kennedy Mwendwa" }],
  creator: "Kennedy Mwendwa",
  category: "utilities",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    locale: "en",
  },
  twitter: { card: "summary_large_image", title: SITE_TITLE, description: SITE_DESCRIPTION },
  robots: { index: true, follow: true },
  formatDetection: { telephone: false, email: false, address: false },
  appleWebApp: { title: SITE_NAME, statusBarStyle: "black-translucent" },
};

// browser chrome matches the default (dark) theme
export const viewport: Viewport = {
  themeColor: "#0b0f14",
  colorScheme: "dark light",
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
