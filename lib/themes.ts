// Colour themes offered in the header dropdown. Every id needs a matching
// `:root[data-theme="…"]` block in app/globals.css ("light" is plain `:root`).
export const themes = [
  { id: "light", label: "Journal Stack Light", mode: "light" },
  { id: "flexoki-light", label: "Flexoki Light", mode: "light" },
  { id: "modus-operandi-tinted", label: "Modus Operandi Tinted", mode: "light" },
  { id: "dark", label: "Journal Stack Dark", mode: "dark" },
  { id: "flexoki-dark", label: "Flexoki Dark", mode: "dark" },
  { id: "modus-vivendi-tinted", label: "Modus Vivendi Tinted", mode: "dark" },
] as const;

export type ThemeId = (typeof themes)[number]["id"];

// What a fresh install starts in. The desktop app has its own copy
// (DEFAULT_THEME in desktop/src-tauri/src/lib.rs); a test there keeps them equal.
export const defaultTheme: ThemeId = "modus-operandi-tinted";

// The light/dark button in the header switches between a theme and its
// counterpart in the same family.
export const themeCounterpart: Record<ThemeId, ThemeId> = {
  light: "dark",
  dark: "light",
  "flexoki-light": "flexoki-dark",
  "flexoki-dark": "flexoki-light",
  "modus-operandi-tinted": "modus-vivendi-tinted",
  "modus-vivendi-tinted": "modus-operandi-tinted",
};

export function themeMode(id: ThemeId) {
  return themes.find((theme) => theme.id === id)?.mode ?? "light";
}

// The choice is kept in a cookie as well as localStorage. localStorage is tied
// to the port, and the desktop app serves from a different port on every
// launch; a cookie is tied to the host only, so it survives.
export const themeStorageKey = "theme";

export function isThemeId(value: unknown): value is ThemeId {
  return themes.some((theme) => theme.id === value);
}

declare global {
  interface Window {
    // Defined by themeBootScript. Also called by the desktop app's
    // Settings > Appearance menu (desktop/src-tauri/src/lib.rs).
    journalStackSetTheme?: (id: string) => void;
    // Set by the macOS app before the page loads.
    journalStackShell?: boolean;
  }
}

// Runs before first paint (see app/layout.tsx) so the page never flashes the
// default theme. Kept as a string because it must not wait for React. It also
// defines the one function that changes the theme, so the in-page menu and the
// desktop app's native menu behave identically.
export const themeBootScript = `
  (function () {
    var ids = ${JSON.stringify(themes.map((theme) => theme.id))};
    var key = ${JSON.stringify(themeStorageKey)};

    function stored() {
      try {
        var match = document.cookie.match(new RegExp("(?:^|; )" + key + "=([^;]*)"));
        var value = match ? decodeURIComponent(match[1]) : null;
        if (ids.indexOf(value) === -1) value = window.localStorage.getItem(key);
        if (ids.indexOf(value) !== -1) return value;
      } catch (e) {}
      return ${JSON.stringify(defaultTheme)};
    }

    // The macOS app sets journalStackShell and listens on this address so its
    // menu-bar tick and saved setting follow changes made in the page.
    function tellShell(id) {
      if (!window.journalStackShell) return;
      try {
        fetch("journalstack://localhost/theme/" + id, { mode: "no-cors" }).catch(function () {});
      } catch (e) {}
    }

    window.journalStackSetTheme = function (id) {
      if (ids.indexOf(id) === -1) return;
      document.documentElement.dataset.theme = id;
      try {
        document.cookie = key + "=" + id + "; path=/; max-age=31536000; samesite=lax";
      } catch (e) {}
      try {
        window.localStorage.setItem(key, id);
      } catch (e) {}
      window.dispatchEvent(new Event("themechange"));
      tellShell(id);
    };

    var initial = stored();
    document.documentElement.dataset.theme = initial;
    tellShell(initial);
  })();
`;
