import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

import { themeBootScript } from "@/lib/themes";

export const metadata: Metadata = {
  title: "Journal Stack",
  description:
    "Local-first journal monitoring with direct and institution-routed article access.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full">
        <Script id="theme-script" strategy="beforeInteractive">
          {themeBootScript}
        </Script>
        {children}
      </body>
    </html>
  );
}
