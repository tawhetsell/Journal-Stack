import type { ReactNode } from "react";

import { BrandMark } from "@/components/brand-mark";
import { InstitutionProvider } from "@/components/institution";
import { SettingsMenu } from "@/components/settings-menu";
import { SiteNav } from "@/components/site-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { getInstitutionSetting } from "@/lib/settings";
import { site } from "@/lib/site";

type AppShellProps = {
  title: string;
  description: string;
  children: ReactNode;
  actions?: ReactNode;
  aside?: ReactNode;
  headerAside?: ReactNode;
  titleTone?: "section" | "page";
  descriptionProminent?: boolean;
};

export async function AppShell({
  title,
  description,
  children,
  actions,
  aside,
  headerAside,
  titleTone = "section",
  descriptionProminent = false,
}: AppShellProps) {
  const hasSidebar = Boolean(aside);
  const showBrandMark = Boolean(headerAside) && titleTone !== "page";
  const institution = await getInstitutionSetting();
  // The macOS desktop app sets this and offers Settings in its menu bar.
  const hasNativeSettings = process.env.JOURNAL_STACK_NATIVE_SETTINGS === "1";
  const descriptionClassName = descriptionProminent
    ? "max-w-3xl text-xl leading-9 text-foreground sm:text-[2rem] sm:leading-[1.35]"
    : "max-w-2xl text-base leading-7 text-muted sm:text-lg";

  return (
    <InstitutionProvider setting={institution}>
      <div className="min-h-screen px-4 py-6 sm:px-6 lg:px-10">
        <div className="mx-auto flex max-w-7xl flex-col gap-6">
          {/* Raised above the page so the settings menu can hang below it. */}
          <header className="masthead-shell card-surface relative z-20 rounded-[2rem]">
            <div className="relative px-6 py-6 sm:px-8 sm:py-7">
              {/* Decorations are clipped to the rounded header; the header
                  itself is not, or the settings menu would be cut off. */}
              <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[2rem]">
                <div className="absolute -left-8 top-8 h-24 w-24 rounded-full border border-line/70" />
                <div className="absolute left-10 top-10 h-px w-20 bg-line/80" />
                <div className="absolute left-10 top-14 h-px w-10 bg-line/70" />
                <div className="absolute -right-10 top-0 h-36 w-36 rounded-full bg-accent-soft blur-3xl" />
              </div>
              {showBrandMark ? (
                <BrandMark className="absolute left-1/2 top-[4.8rem] hidden -translate-x-1/2 lg:flex" />
              ) : null}
              <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                <div className="max-w-4xl space-y-4 lg:min-w-0">
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 text-[0.7rem] font-semibold tracking-[0.26em] text-muted uppercase">
                      <span className="inline-block h-2 w-2 rounded-full bg-accent" />
                      <span>Personal edition</span>
                    </div>
                    <p className="display-title text-5xl font-semibold leading-none text-foreground sm:text-6xl lg:text-7xl">
                      {site.name}
                    </p>
                    {titleTone === "page" ? (
                      <>
                        <h1 className="display-title text-3xl leading-tight text-foreground sm:text-4xl lg:text-5xl">
                          {title}
                        </h1>
                        <p className={descriptionClassName}>{description}</p>
                      </>
                    ) : (
                      <>
                        <h1 className="sr-only">{title}</h1>
                        <p className={descriptionClassName}>{description}</p>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col gap-4 lg:w-full lg:max-w-sm lg:justify-self-end lg:items-stretch">
                  <div className="flex flex-wrap items-start justify-end gap-3">
                    {headerAside ? (
                      <div className="min-w-[220px] flex-1">{headerAside}</div>
                    ) : null}
                    <ThemeToggle />
                    {hasNativeSettings ? null : <SettingsMenu />}
                  </div>
                  {actions ? (
                    <div className="flex flex-wrap justify-end gap-3">{actions}</div>
                  ) : null}
                </div>
              </div>
              <div className="masthead-divider mt-6 pt-5">
                <SiteNav />
              </div>
            </div>
          </header>

          {hasSidebar ? (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
              <main className="min-w-0">{children}</main>
              <aside className="space-y-6">{aside}</aside>
            </div>
          ) : (
            <main className="min-w-0">{children}</main>
          )}

          <footer className="pb-2 text-center text-xs tracking-[0.18em] text-muted uppercase">
            <p>
              By Travis A. Whetsell ·{" "}
              <a
                href="https://github.com/tawhetsell/Journal-Stack"
                target="_blank"
                rel="noreferrer"
                className="hover:text-accent"
              >
                github.com/tawhetsell/Journal-Stack
              </a>
            </p>
          </footer>
        </div>
      </div>
    </InstitutionProvider>
  );
}
