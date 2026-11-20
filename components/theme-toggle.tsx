"use client";

import { useTheme } from "@/components/use-theme";
import { themeCounterpart, themeMode } from "@/lib/themes";

// Switches between the light and dark theme of the current family (for
// example Flexoki Light and Flexoki Dark). Other themes are chosen in Settings.
export function ThemeToggle() {
  const theme = useTheme();
  const isDark = themeMode(theme) === "dark";
  const nextMode = isDark ? "light" : "dark";

  function handleToggle() {
    window.journalStackSetTheme?.(themeCounterpart[theme]);
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      suppressHydrationWarning
      aria-label={`Switch to ${nextMode} mode`}
      title={`Switch to ${nextMode} mode`}
      className="flex h-11 w-11 items-center justify-center rounded-full border border-line bg-surface-strong/80 text-foreground hover:-translate-y-0.5 hover:border-accent/40 hover:text-accent"
    >
      {isDark ? (
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-4 w-4 fill-none stroke-current"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="4.25" />
          <path d="M12 2.75v2.5" />
          <path d="M12 18.75v2.5" />
          <path d="m5.46 5.46 1.77 1.77" />
          <path d="m16.77 16.77 1.77 1.77" />
          <path d="M2.75 12h2.5" />
          <path d="M18.75 12h2.5" />
          <path d="m5.46 18.54 1.77-1.77" />
          <path d="m16.77 7.23 1.77-1.77" />
        </svg>
      ) : (
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-4 w-4 fill-none stroke-current"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M19.25 14.75A7.75 7.75 0 0 1 9.25 4.75a8.5 8.5 0 1 0 10 10Z" />
        </svg>
      )}
    </button>
  );
}
