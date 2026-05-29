import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

const themeScript = `
  try {
    const storedTheme = window.localStorage.getItem("theme");
    const theme =
      storedTheme === "dark" || storedTheme === "light"
        ? storedTheme
        : "light";
    document.documentElement.dataset.theme = theme;
  } catch {}
`;

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
          {themeScript}
        </Script>
        {children}
      </body>
    </html>
  );
}
