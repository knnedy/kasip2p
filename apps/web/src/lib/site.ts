export const SITE_NAME = "KasiP2P";
export const SITE_TITLE = "KasiP2P · Send files over Wi-Fi, device to device";
export const SITE_DESCRIPTION =
  "Send files and folders between your phone and computer over Wi-Fi. Pair with a code and files go straight from one device to the other: nothing is uploaded, no account needed.";

// Absolute base for canonical URLs, the sitemap and link previews.
export function siteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:3000";
}
