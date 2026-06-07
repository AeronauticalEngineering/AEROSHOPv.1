"use client";

import type { ComponentType, FormEvent, ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  BriefcaseBusiness,
  Car,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FolderKanban,
  Gauge,
  IdCard,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  Store,
  Users,
  WalletCards,
  X
} from "lucide-react";
import { PRIMARY_VIEWS } from "@/lib/config";
import { AppNav } from "@/components/AppNav";

const ICONS: Record<string, ComponentType<{ size?: number; strokeWidth?: number }>> = {
  "dashboard-main": Gauge,
  "bill-entry": ReceiptText,
  "withdraw-request": WalletCards,
  "contract-open": BriefcaseBusiness,
  "bill-follow": ClipboardList,
  "work-status": FolderKanban,
  "project-all": FolderKanban,
  banks: WalletCards,
  categories: ClipboardList,
  stores: Store,
  contractors: Users,
  people: IdCard,
  cars: Car,
  customers: Users
};

const MOBILE_VIEW_IDS = ["dashboard-main", "bill-entry", "withdraw-request", "contract-open", "bill-follow", "work-status"];

function hrefFor(view: (typeof PRIMARY_VIEWS)[number]) {
  if (view.id === "dashboard-main") return "/";
  if (view.id === "bill-entry") return "/bills";
  return `/views/${view.id}`;
}

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [mobileSearch, setMobileSearch] = useState("");
  const mobileSearchInputRef = useRef<HTMLInputElement>(null);
  const pathname = usePathname();
  const router = useRouter();
  const mobileViews = PRIMARY_VIEWS.filter(view => MOBILE_VIEW_IDS.includes(view.id));
  const activeView = PRIMARY_VIEWS.find(view => {
    const href = hrefFor(view);
    return href === "/" ? pathname === "/" : pathname.startsWith(href);
  }) || PRIMARY_VIEWS[0];

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const search = params.get("search") || "";
    setMobileSearch(search);
    setMobileSearchOpen(Boolean(search));
  }, [pathname]);

  useEffect(() => {
    if (mobileSearchOpen) mobileSearchInputRef.current?.focus();
  }, [mobileSearchOpen]);

  function pushSearch(value: string) {
    const params = new URLSearchParams(window.location.search);
    const query = value.trim();
    if (query) params.set("search", query);
    else params.delete("search");
    const nextQuery = params.toString();
    router.push(nextQuery ? `${pathname}?${nextQuery}` : pathname);
  }

  function handleMobileSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    pushSearch(mobileSearch);
  }

  function closeMobileSearch() {
    setMobileSearch("");
    setMobileSearchOpen(false);
    pushSearch("");
  }

  const mobileAddEvent =
    activeView.id === "bill-entry" ? "open-bill-form" :
    activeView.id === "contract-open" ? "open-contract-form" :
    "";

  return (
    <div className={collapsed ? "app-shell is-sidebar-collapsed" : "app-shell"}>
      <div className="mobile-chrome" aria-label="mobile navigation">
        <div className="mobile-topbar">
          {mobileSearchOpen ? (
            <form className="mobile-search-form" onSubmit={handleMobileSearchSubmit}>
              <input
                ref={mobileSearchInputRef}
                type="search"
                aria-label="ค้นหา"
                placeholder="ค้นหา"
                enterKeyHint="search"
                value={mobileSearch}
                onChange={event => setMobileSearch(event.target.value)}
                onKeyDown={event => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    pushSearch(mobileSearch);
                  }
                  if (event.key === "Escape") closeMobileSearch();
                }}
              />
              <button type="submit" className="mobile-search-submit" aria-label="ค้นหา">
                <Search size={18} />
              </button>
            </form>
          ) : (
            <strong>{activeView.name}</strong>
          )}
          <div className="mobile-actions">
            {mobileSearchOpen ? (
              <button type="button" className="mobile-icon-button mobile-search-close" aria-label="ปิดค้นหา" onClick={closeMobileSearch}><X size={21} /></button>
            ) : (
              <>
                {mobileAddEvent ? (
                  <button type="button" className="mobile-icon-button mobile-add-button" aria-label="เพิ่มข้อมูล" onClick={() => window.dispatchEvent(new CustomEvent(mobileAddEvent))}><Plus size={22} /></button>
                ) : null}
                <button type="button" className="mobile-icon-button" aria-label="ค้นหา" onClick={() => setMobileSearchOpen(true)}><Search size={21} /></button>
                <button type="button" className="mobile-icon-button" aria-label="รีเฟรช" onClick={() => window.location.reload()}><RefreshCw size={22} /></button>
              </>
            )}
          </div>
        </div>
        <nav className="mobile-bottomnav">
          {mobileViews.map(view => {
            const href = hrefFor(view);
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            const Icon = ICONS[view.id];
            return (
              <Link key={view.id} className={active ? "active" : ""} href={href}>
                <span>{Icon ? <Icon size={20} strokeWidth={2.2} /> : null}</span>
                <small>{view.name}</small>
              </Link>
            );
          })}
        </nav>
      </div>
      <aside className="sidebar">
        <div className="sidebar-head">
          <span className="sidebar-title">Costcode</span>
          <button
            type="button"
            className="sidebar-toggle"
            aria-label={collapsed ? "ขยายเมนู" : "ย่อเมนู"}
            aria-pressed={collapsed}
            onClick={() => setCollapsed(value => !value)}
          >
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>
        <AppNav icons={ICONS} />
      </aside>
      <main className="workspace">{children}</main>
    </div>
  );
}
