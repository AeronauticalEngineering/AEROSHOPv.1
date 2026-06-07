"use client";

import type { ComponentType } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PRIMARY_VIEWS } from "@/lib/config";

type AppNavProps = {
  icons?: Record<string, ComponentType<{ size?: number; strokeWidth?: number }>>;
};

function hrefFor(view: (typeof PRIMARY_VIEWS)[number]) {
  if (view.id === "dashboard-main") return "/";
  if (view.id === "bill-entry") return "/bills";
  return `/views/${view.id}`;
}

export function AppNav({ icons = {} }: AppNavProps) {
  const pathname = usePathname();

  return (
    <nav className="nav">
      {PRIMARY_VIEWS.map(view => {
        const href = hrefFor(view);
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        const Icon = icons[view.id];
        return (
          <Link key={view.id} className={active ? "active" : ""} href={href} title={view.name}>
            <span className="nav-icon" aria-hidden="true">
              {Icon ? <Icon size={18} strokeWidth={2.2} /> : view.name.slice(0, 1)}
            </span>
            <span className="nav-label">{view.name}</span>
          </Link>
        );
      })}
    </nav>
  );
}
