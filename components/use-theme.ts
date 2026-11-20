"use client";

import { useSyncExternalStore } from "react";

import { defaultTheme, isThemeId, type ThemeId } from "@/lib/themes";

function subscribe(callback: () => void) {
  window.addEventListener("themechange", callback);
  return () => window.removeEventListener("themechange", callback);
}

// The boot script in app/layout.tsx has already set this before React runs.
function getSnapshot(): ThemeId {
  const current = document.documentElement.dataset.theme;
  return isThemeId(current) ? current : defaultTheme;
}

function getServerSnapshot(): ThemeId {
  return defaultTheme;
}

// The current colour theme. Change it with window.journalStackSetTheme.
export function useTheme(): ThemeId {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
