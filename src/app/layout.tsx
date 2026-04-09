import "~/styles/globals.css";

import { type Metadata, type Viewport } from "next";
import { Geist } from "next/font/google";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "AppraisalBot Reports",
  description:
    "Commercial appraisal reporting workspace — projects, comps, and AI-assisted workflows.",
  icons: {
    icon: [{ url: "/logo128.png", type: "image/png", sizes: "128x128" }],
    apple: "/logo128.png",
  },
  openGraph: {
    title: "AppraisalBot Reports",
    description:
      "Commercial appraisal reporting workspace — projects, comps, and AI-assisted workflows.",
    images: [{ url: "/logo128.png", width: 128, height: 128, alt: "AppraisalBot" }],
  },
  twitter: {
    card: "summary",
    title: "AppraisalBot Reports",
    description:
      "Commercial appraisal reporting workspace — projects, comps, and AI-assisted workflows.",
    images: ["/logo128.png"],
  },
};

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

import { ThemeProvider } from "~/components/ThemeProvider";
import { SupabaseAuthProvider } from "~/components/SupabaseAuthProvider";
import { DriveReauthProvider } from "~/components/DriveReauthProvider";

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geist.variable} h-full min-h-dvh`}>
      <body className="m-0 min-h-dvh bg-transparent">
        <SupabaseAuthProvider>
          <DriveReauthProvider>
            <ThemeProvider>{children}</ThemeProvider>
          </DriveReauthProvider>
        </SupabaseAuthProvider>
      </body>
    </html>
  );
}
