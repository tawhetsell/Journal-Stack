"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { SVGProps } from "react";

import { site } from "@/lib/site";

type IconProps = SVGProps<SVGSVGElement>;

function FeedIcon(props: IconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <rect x="4" y="5" width="16" height="14" rx="3.5" />
      <path d="M8 9.25h8" />
      <path d="M8 12.5h8" />
      <path d="M8 15.75h4.5" />
    </svg>
  );
}

function JournalsIcon(props: IconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M5.5 6.25A2.25 2.25 0 0 1 7.75 4h8.5v15.75h-8.5A2.25 2.25 0 0 0 5.5 22Z" />
      <path d="M18.5 6.25A2.25 2.25 0 0 0 16.25 4" />
      <path d="M8.75 8.5h4.75" />
      <path d="M8.75 11.75h4.75" />
      <path d="M8.75 15h3.25" />
    </svg>
  );
}

function SavedIcon(props: IconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M7.5 4.75h9a2 2 0 0 1 2 2v12.5l-6.5-3.75-6.5 3.75V6.75a2 2 0 0 1 2-2Z" />
    </svg>
  );
}

const iconByHref = {
  "/feed": FeedIcon,
  "/journals": JournalsIcon,
  "/saved": SavedIcon,
} as const;

function getActiveHref(pathname: string) {
  if (pathname.startsWith("/journals")) {
    return "/journals";
  }

  if (pathname.startsWith("/saved")) {
    return "/saved";
  }

  return "/feed";
}

export function SiteNav() {
  const pathname = usePathname() ?? "/feed";
  const activeHref = getActiveHref(pathname);

  return (
    <nav aria-label="Primary" className="flex flex-wrap gap-3">
      {site.nav.map((item) => {
        const Icon = iconByHref[item.href as keyof typeof iconByHref];
        const isActive = item.href === activeHref;

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            title={item.label}
            className={
              isActive
                ? "inline-flex h-12 items-center gap-2.5 rounded-full border border-accent/55 bg-accent px-4 text-white shadow-[0_16px_34px_-22px_rgba(105,198,191,0.95)] transition"
                : "inline-flex h-12 items-center gap-2.5 rounded-full border border-line bg-surface-strong/55 px-4 text-foreground/80 transition hover:-translate-y-0.5 hover:border-accent/40 hover:text-accent"
            }
          >
            <Icon className="h-5 w-5" />
            <span className="text-[0.68rem] font-semibold tracking-[0.2em] uppercase">
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
