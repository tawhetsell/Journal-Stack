"use client";

import { useSyncExternalStore } from "react";

type Theme = "light" | "dark";

function subscribe(callback: () => void) {
  window.addEventListener("themechange", callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener("themechange", callback);
    window.removeEventListener("storage", callback);
  };
}

function getSnapshot(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function getServerSnapshot(): Theme {
  return "light";
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  window.localStorage.setItem("theme", theme);
  window.dispatchEvent(new Event("themechange"));
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const nextTheme = theme === "dark" ? "light" : "dark";

  function handleToggle() {
    applyTheme(nextTheme);
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      suppressHydrationWarning
      aria-label={`Switch to ${nextTheme} mode`}
      title={`Switch to ${nextTheme} mode`}
      className="flex h-11 w-11 items-center justify-center rounded-full border border-line bg-surface-strong/80 text-foreground hover:-translate-y-0.5 hover:border-accent/40 hover:text-accent"
    >
      {theme === "dark" ? (
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
