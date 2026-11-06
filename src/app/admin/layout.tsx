import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { SITE_URL } from "@/lib/public/site";
import { parseThemePref, THEME_COOKIE } from "@/features/admin/theme";
import "../globals.css";
import "./admin.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  robots: { index: false, follow: false },
  title: "Ramsløk",
  description: "Høsting, pakking og lager for ramsløk",
};

export const viewport: Viewport = {
  // Content may go under the notch / home indicator; the bars pad with safe-area insets.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f2f7" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default async function AdminRootLayout({ children }: { children: React.ReactNode }) {
  // Set on the server from the cookie, so the first paint already has the right theme (no flash).
  const theme = parseThemePref((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html lang="nb" data-theme={theme} className="h-full">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
