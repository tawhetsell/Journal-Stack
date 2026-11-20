"use client";

import { useEffect, useRef } from "react";

import { openInstitutionChooser, useInstitution } from "@/components/institution";
import { useTheme } from "@/components/use-theme";
import { themes } from "@/lib/themes";

const groups = [
  { heading: "Light", mode: "light" },
  { heading: "Dark", mode: "dark" },
] as const;

// In-page settings (appearance and institution), for the browser and for
// desktop builds without a native menu. The macOS app offers the same choices
// under Journal Stack > Settings and hides this (see AppShell).
export function SettingsMenu() {
  const theme = useTheme();
  const institution = useInstitution();
  const details = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    function close() {
      details.current?.removeAttribute("open");
    }
    function handlePointerDown(event: PointerEvent) {
      if (!details.current?.contains(event.target as Node)) close();
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <details ref={details} className="relative">
      <summary
        aria-label="Settings"
        title="Settings"
        className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-full border border-line bg-surface-strong/80 text-foreground transition-colors hover:border-accent/40 hover:text-accent [&::-webkit-details-marker]:hidden"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-[1.15rem] w-[1.15rem] fill-none stroke-current"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
        </svg>
      </summary>

      <div
        role="menu"
        aria-label="Settings"
        className="absolute right-0 z-30 mt-2 w-60 rounded-2xl border border-line bg-surface-strong p-2 text-left shadow-[var(--shadow)]"
      >
        <p className="px-3 pb-1 pt-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-muted">
          Appearance
        </p>
        {groups.map((group, index) => (
          <div
            key={group.mode}
            className={index > 0 ? "mt-1 border-t border-line pt-1" : ""}
          >
            {themes
              .filter((option) => option.mode === group.mode)
              .map((option) => {
                const selected = option.id === theme;
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={selected}
                    onClick={() => {
                      window.journalStackSetTheme?.(option.id);
                      details.current?.removeAttribute("open");
                    }}
                    className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-1.5 text-sm ${
                      selected
                        ? "bg-accent-soft font-semibold text-accent"
                        : "text-foreground hover:bg-accent-soft"
                    }`}
                  >
                    <span>{option.label}</span>
                    {selected ? <span aria-hidden="true">✓</span> : null}
                  </button>
                );
              })}
          </div>
        ))}

        <div className="mt-1 border-t border-line pt-1">
          <p className="px-3 pb-1 pt-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-muted">
            Institution
          </p>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              details.current?.removeAttribute("open");
              openInstitutionChooser();
            }}
            className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-1.5 text-left text-sm text-foreground hover:bg-accent-soft"
          >
            <span>
              {institution.status === "set"
                ? institution.institution.name
                : institution.status === "none"
                  ? "None"
                  : "Not set"}
            </span>
            <span className="shrink-0 text-xs text-muted">Change…</span>
          </button>
        </div>
      </div>
    </details>
  );
}
