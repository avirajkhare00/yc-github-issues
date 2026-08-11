import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

// Absolute URLs are required for OG tags. VERCEL_URL is deliberately not used
// as the default: it is unique per deployment, so link previews would point at
// a build-specific host that dies on the next deploy. Falls back to the
// canonical domain, which NEXT_PUBLIC_SITE_URL overrides once a real one exists.
const CANONICAL_URL = "https://ycfirstpr.vercel.app";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.NODE_ENV === "development" ? "http://localhost:3000" : CANONICAL_URL);

const title = "First PR — land your first PR at a YC startup that's hiring";
const description =
  "Beginner-friendly open source issues at YC-backed startups, filtered to the ones that are unassigned, actively maintained, and at companies currently hiring.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title,
  description,
  alternates: {
    canonical: "/"
  },
  openGraph: {
    title,
    description,
    url: siteUrl,
    siteName: "First PR",
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    creator: "@avirajkhare00"
  }
};

// Runs before first paint so a dark-mode visitor never sees a white flash.
// Kept as a string because it has to execute ahead of hydration.
const themeScript = `
(function () {
  try {
    var stored = localStorage.getItem('theme');
    var theme = stored === 'light' || stored === 'dark' ? stored : 'system';
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    if (theme === 'dark' || (theme === 'system' && prefersDark)) {
      document.documentElement.classList.add('dark');
    }
  } catch (error) {
    // Private mode can throw on localStorage; fall back to the system setting
  }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body
        className={`${geistSans.variable} antialiased`}
      >
        {children}
        <Analytics />
      </body>
    </html>
  );
}
