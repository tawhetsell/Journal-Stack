"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";

import { saveInstitutionAction } from "@/app/actions";
import {
  findInstitutionPreset,
  institutionPresets,
  type InstitutionSetting,
} from "@/lib/institutions";

// Fired on `window` to open the chooser. `detail.continueTo` is the link the
// user was trying to open, if any. The macOS app fires this from its
// Settings > Institution menu item (desktop/src-tauri/src/lib.rs).
const CHOOSE_INSTITUTION_EVENT = "journalstack:choose-institution";

export function openInstitutionChooser(continueTo?: string) {
  window.dispatchEvent(
    new CustomEvent(CHOOSE_INSTITUTION_EVENT, { detail: { continueTo } }),
  );
}

const InstitutionContext = createContext<InstitutionSetting>({
  status: "unset",
});

export function useInstitution() {
  return useContext(InstitutionContext);
}

// Wraps the app so every "Open via Institution" link knows the setting, and
// mounts the one chooser dialog they all share.
export function InstitutionProvider({
  setting,
  children,
}: {
  setting: InstitutionSetting;
  children: ReactNode;
}) {
  return (
    <InstitutionContext.Provider value={setting}>
      {children}
      <InstitutionDialog setting={setting} />
    </InstitutionContext.Provider>
  );
}

// The "Open via Institution" link. Until an institution is chosen, the first
// click opens the chooser and then carries on to the article. It disappears
// for users who said they have no institution.
export function InstitutionLink({
  href,
  className,
}: {
  href: string;
  className?: string;
}) {
  const setting = useInstitution();

  if (setting.status === "none") {
    return null;
  }

  return (
    <a
      href={href}
      className={className}
      title={
        setting.status === "set"
          ? `Open through ${setting.institution.name}`
          : "Choose your institution"
      }
      onClick={(event) => {
        if (setting.status === "unset") {
          event.preventDefault();
          openInstitutionChooser(href);
        }
      }}
    >
      Open via Institution
    </a>
  );
}

type Choice = "preset" | "custom" | "none";

const fieldClass =
  "w-full rounded-2xl border border-line bg-surface px-4 py-2.5 text-sm text-foreground outline-none focus:border-accent";
const optionClass =
  "flex cursor-pointer items-start gap-3 rounded-2xl border border-line px-4 py-3";

function InstitutionDialog({ setting }: { setting: InstitutionSetting }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const continueTo = useRef<string | undefined>(undefined);

  const [choice, setChoice] = useState<Choice>("preset");
  const [presetUrl, setPresetUrl] = useState("");
  const [customName, setCustomName] = useState("");
  const [customUrl, setCustomUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();

  useEffect(() => {
    function handleOpen(event: Event) {
      continueTo.current = (
        event as CustomEvent<{ continueTo?: string } | null>
      ).detail?.continueTo;

      // Start from what is saved, so reopening it from Settings shows the
      // current choice.
      const saved = setting.status === "set" ? setting.institution : null;
      const savedPreset = saved && findInstitutionPreset(saved.resolverUrl);

      setChoice(
        setting.status === "none"
          ? "none"
          : saved && !savedPreset
            ? "custom"
            : "preset",
      );
      setPresetUrl(savedPreset?.resolverUrl ?? "");
      setCustomName(saved && !savedPreset ? saved.name : "");
      setCustomUrl(saved && !savedPreset ? saved.resolverUrl : "");
      setError(null);

      if (!dialog.current?.open) {
        dialog.current?.showModal();
      }
    }

    window.addEventListener(CHOOSE_INSTITUTION_EVENT, handleOpen);
    return () =>
      window.removeEventListener(CHOOSE_INSTITUTION_EVENT, handleOpen);
  }, [setting]);

  function handleSave() {
    setError(null);

    const formData = new FormData();
    formData.set("choice", choice);
    if (choice === "preset") {
      formData.set("resolverUrl", presetUrl);
    } else if (choice === "custom") {
      formData.set("name", customName);
      formData.set("resolverUrl", customUrl);
    }

    startSaving(async () => {
      const result = await saveInstitutionAction(formData);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      dialog.current?.close();

      // Carry on to the article the user originally clicked.
      if (continueTo.current && choice !== "none") {
        window.location.assign(continueTo.current);
      }
    });
  }

  return (
    <dialog
      ref={dialog}
      aria-labelledby="institution-dialog-title"
      className="m-auto w-[min(34rem,calc(100vw-2rem))] rounded-[1.75rem] border border-line bg-surface-strong p-0 text-foreground shadow-[var(--shadow)] backdrop:bg-black/45"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          handleSave();
        }}
        className="grid gap-4 p-6 sm:p-7"
      >
        <div>
          <h2
            id="institution-dialog-title"
            className="display-title text-2xl text-foreground"
          >
            Choose your institution
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            <strong>Open via Institution</strong> sends an article to your
            library, which signs you in and finds the full text. Tell Journal
            Stack which library to use. You can change this later in Settings.
          </p>
        </div>

        <label className={optionClass}>
          <input
            type="radio"
            name="choice"
            checked={choice === "preset"}
            onChange={() => setChoice("preset")}
            className="mt-1 accent-[var(--accent)]"
          />
          <span className="grid flex-1 gap-2">
            <span className="text-sm font-semibold">Pick from the list</span>
            <select
              aria-label="Institution"
              value={presetUrl}
              onChange={(event) => {
                setPresetUrl(event.target.value);
                setChoice("preset");
              }}
              className={fieldClass}
            >
              <option value="">Select an institution…</option>
              {institutionPresets.map((preset) => (
                <option key={preset.resolverUrl} value={preset.resolverUrl}>
                  {preset.name}
                </option>
              ))}
            </select>
          </span>
        </label>

        <label className={optionClass}>
          <input
            type="radio"
            name="choice"
            checked={choice === "custom"}
            onChange={() => setChoice("custom")}
            className="mt-1 accent-[var(--accent)]"
          />
          <span className="grid flex-1 gap-2">
            <span className="text-sm font-semibold">
              My library isn&apos;t listed
            </span>
            <input
              aria-label="Institution name"
              placeholder="Institution name"
              value={customName}
              onChange={(event) => setCustomName(event.target.value)}
              onFocus={() => setChoice("custom")}
              className={fieldClass}
            />
            <input
              aria-label="Library link-resolver address"
              placeholder="https://your-library.example.edu/openurl"
              value={customUrl}
              onChange={(event) => setCustomUrl(event.target.value)}
              onFocus={() => setChoice("custom")}
              inputMode="url"
              className={fieldClass}
            />
            <span className="text-xs leading-5 text-muted">
              Paste your library&apos;s link-resolver address. Search your
              library&apos;s website for &ldquo;link resolver&rdquo; or
              &ldquo;OpenURL&rdquo;, or ask a librarian.
            </span>
          </span>
        </label>

        <label className={optionClass}>
          <input
            type="radio"
            name="choice"
            checked={choice === "none"}
            onChange={() => setChoice("none")}
            className="mt-1 accent-[var(--accent)]"
          />
          <span className="grid gap-1">
            <span className="text-sm font-semibold">
              I don&apos;t have an institution
            </span>
            <span className="text-xs leading-5 text-muted">
              Hides the Open via Institution button.
            </span>
          </span>
        </label>

        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            className="rounded-full border border-line px-5 py-2.5 text-sm font-semibold text-foreground hover:border-accent/40 hover:text-accent"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="rounded-full bg-accent-fill px-5 py-2.5 text-sm font-semibold text-on-accent hover:bg-accent-fill-strong disabled:cursor-wait disabled:opacity-60"
          >
            {isSaving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
