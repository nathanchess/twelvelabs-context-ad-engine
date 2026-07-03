"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AssetsIcon,
  Button,
  ChevronLeftIcon,
  ChevronRightIcon,
  cn,
  GridIcon,
  HomeIcon,
  SettingsIcon,
  Text,
  TwelveLabsLogo,
} from "@twelvelabs-io/react";
import SettingsModal from "./SettingsModal";

interface NavItem {
  id: string;
  label: string;
  href: string;
  Icon: typeof HomeIcon;
}

const navItems: NavItem[] = [
  { id: "overview", label: "Overview", href: "/", Icon: HomeIcon },
  { id: "video-inventory", label: "Video Inventory", href: "/video-inventory", Icon: AssetsIcon },
  { id: "ad-inventory", label: "Ad Inventory", href: "/ad-inventory", Icon: GridIcon },
];

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const pathname = usePathname();

  return (
    <>
      <div
        className="shrink-0 transition-all duration-200 ease-in-out"
        style={{ width: collapsed ? 64 : 240 }}
      />

      <aside
        className={cn(
          "fixed top-0 left-0 z-50 flex h-screen flex-col border-r border-border-secondary bg-surface-white transition-all duration-200 ease-in-out",
          collapsed ? "w-16" : "w-[240px]",
        )}
      >
        <div
          className={cn(
            "flex h-14 shrink-0 items-center border-b border-border-secondary",
            collapsed ? "justify-center px-2" : "justify-between gap-2 px-3",
          )}
        >
          {!collapsed && (
            <Link href="/" className="flex min-w-0 flex-1 items-center">
              <TwelveLabsLogo className="h-8 w-auto" />
            </Link>
          )}

          <Button
            type="button"
            variant="outlined-gray"
            size="regular"
            onClick={() => setCollapsed((value) => !value)}
            className="size-8 shrink-0 p-0"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <ChevronRightIcon className="size-4" />
            ) : (
              <ChevronLeftIcon className="size-4" />
            )}
          </Button>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-3 py-1">
          {navItems.map((item) => {
            const isActive =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const { Icon } = item;

            return (
              <Link
                key={item.id}
                href={item.href}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg text-sm font-medium transition-all duration-200",
                  collapsed ? "justify-center px-0 py-2.5" : "px-3 py-2.5",
                  isActive
                    ? "bg-surface-card text-foreground-body"
                    : "text-foreground-subtle hover:bg-surface-card hover:text-foreground-body",
                )}
              >
                <Icon className={cn("size-4 shrink-0", isActive ? "text-foreground-body" : "text-foreground-muted")} />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="flex flex-col gap-2 border-t border-border-secondary px-3 py-3">
          {!collapsed ? (
            <div
              className="flex w-full items-center justify-center rounded-lg border border-border-secondary bg-surface-card px-3 py-2"
              aria-label="Demo application"
            >
              <Text variant="all-caps-mini" className="tracking-[1.5px] text-foreground-subtle">
                Demo App
              </Text>
            </div>
          ) : (
            <div
              className="mx-auto flex size-9 items-center justify-center rounded-lg border border-border-secondary bg-surface-card"
              title="Demo App"
              aria-label="Demo application"
            >
              <Text variant="all-caps-mini" className="font-semibold text-foreground-subtle">
                D
              </Text>
            </div>
          )}

          <Button
            type="button"
            variant="ghosted"
            size="regular"
            onClick={() => setSettingsOpen(true)}
            title={collapsed ? "Settings" : undefined}
            className={cn(
              "w-full justify-start gap-3 font-medium text-foreground-subtle hover:text-foreground-body",
              collapsed ? "justify-center px-0 py-2.5" : "px-3 py-2.5",
            )}
          >
            <SettingsIcon className="size-4 shrink-0 text-foreground-muted" />
            {!collapsed && <span>Settings</span>}
          </Button>
        </div>
      </aside>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}
