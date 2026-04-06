"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import SettingsModal from "./SettingsModal";

interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  {
    id: "overview",
    label: "Overview",
    href: "/",
    icon: (
      <svg
        viewBox="0 0 11 11.7477"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-4 h-4 shrink-0"
      >
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M1 10.7477H3.125V7.34774C3.125 6.64818 3.69211 6.08107 4.39167 6.08107H6.60833C7.30789 6.08107 7.875 6.64818 7.875 7.34774V10.7477H10V4.29091C10 4.26958 9.98979 4.24954 9.97254 4.23699L5.53921 1.01275C5.51584 0.99575 5.48417 0.99575 5.46079 1.01275L1.02746 4.23699C1.01021 4.24954 1 4.26958 1 4.29091V10.7477ZM0 11.2144C0 11.509 0.238781 11.7477 0.533333 11.7477H3.59167C3.88622 11.7477 4.125 11.509 4.125 11.2144V7.34774C4.125 7.20046 4.24439 7.08107 4.39167 7.08107H6.60833C6.75561 7.08107 6.875 7.20046 6.875 7.34774V11.2144C6.875 11.509 7.11378 11.7477 7.40833 11.7477H10.4667C10.7612 11.7477 11 11.509 11 11.2144V4.29091C11 3.94964 10.8367 3.62898 10.5607 3.42826L6.12738 0.204015C5.75336 -0.068005 5.24664 -0.0680049 4.87262 0.204015L0.439284 3.42826C0.16329 3.62898 0 3.94964 0 4.29091V11.2144Z"
          fill="currentColor"
        />
      </svg>
    ),
  },
  {
    id: "video-inventory",
    label: "Video Inventory",
    href: "/video-inventory",
    icon: (
      <svg
        viewBox="0 0 12 12"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-4 h-4 shrink-0"
      >
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M5.55217 4.79058V7.20942L7.26522 6L5.55217 4.79058ZM4.5 4.315C4.5 3.65679 5.23462 3.27103 5.76926 3.64849L8.15593 5.33348C8.61469 5.65737 8.61469 6.34263 8.15593 6.66652L5.76926 8.35151C5.23462 8.72897 4.5 8.34321 4.5 7.685V4.315Z"
          fill="currentColor"
        />
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M8.40039 0C10.3883 0.000211285 11.9998 1.61169 12 3.59961V8.40039C11.9998 10.3883 10.3883 11.9998 8.40039 12H3.59961C1.61169 11.9998 0.000211285 10.3883 0 8.40039V3.59961C0.000211156 1.61169 1.61169 0.000211157 3.59961 0H8.40039ZM3.59961 1C2.16398 1.00021 1.00021 2.16398 1 3.59961V8.40039C1.00021 9.83602 2.16398 10.9998 3.59961 11H8.40039C9.83602 10.9998 10.9998 9.83602 11 8.40039V3.59961C10.9998 2.16398 9.83602 1.00021 8.40039 1H3.59961Z"
          fill="currentColor"
        />
      </svg>
    ),
  },
  {
    id: "ad-inventory",
    label: "Ad Inventory",
    href: "/ad-inventory",
    icon: (
      <svg
        viewBox="0 0 11.667 11.667"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-4 h-4 shrink-0"
      >
        <path fillRule="evenodd" clipRule="evenodd" d="M2 8.66699C2.55228 8.667 3 9.11471 3 9.66699V10.667C2.99985 11.2018 2.57988 11.6381 2.05176 11.665L2 11.667H1L0.948242 11.665C0.43705 11.639 0.0268773 11.229 0.000976562 10.7178L0 10.667V9.66699C0 9.11471 0.447715 8.66699 1 8.66699H2ZM1 10.667H2V9.66699H1V10.667Z" fill="currentColor" />
        <path fillRule="evenodd" clipRule="evenodd" d="M6.33301 8.66699C6.88529 8.66699 7.33301 9.11471 7.33301 9.66699V10.667C7.33286 11.2019 6.91304 11.6383 6.38477 11.665L6.33301 11.667H5.33301L5.28223 11.665C4.77088 11.6391 4.36087 11.2291 4.33496 10.7178L4.33301 10.667V9.66699C4.33301 9.11481 4.78087 8.66716 5.33301 8.66699H6.33301ZM5.33301 10.667H6.33301V9.66699H5.33301V10.667Z" fill="currentColor" />
        <path fillRule="evenodd" clipRule="evenodd" d="M10.667 8.66699C11.2191 8.66717 11.667 9.11482 11.667 9.66699V10.667C11.6668 11.2019 11.2461 11.6383 10.7178 11.665L10.667 11.667H9.66699L9.61523 11.665C9.10389 11.6391 8.69388 11.2291 8.66797 10.7178L8.66699 10.667V9.66699C8.66699 9.11471 9.11471 8.66699 9.66699 8.66699H10.667ZM9.66699 10.667H10.667V9.66699H9.66699V10.667Z" fill="currentColor" />
        <path fillRule="evenodd" clipRule="evenodd" d="M2 4.33301C2.55216 4.33301 2.9998 4.78089 3 5.33301V6.33301C3 6.86793 2.57998 7.30509 2.05176 7.33203L2 7.33301H1L0.948242 7.33203C0.437042 7.30597 0.0268776 6.89601 0.000976562 6.38477L0 6.33301V5.33301C0.000197881 4.78089 0.447837 4.33301 1 4.33301H2ZM1 6.33301H2V5.33301H1V6.33301Z" fill="currentColor" />
        <path fillRule="evenodd" clipRule="evenodd" d="M6.33301 4.33301C6.88517 4.33301 7.33281 4.78089 7.33301 5.33301V6.33301C7.33301 6.86804 6.91314 7.30526 6.38477 7.33203L6.33301 7.33301H5.33301L5.28223 7.33203C4.77088 7.30613 4.36087 6.89611 4.33496 6.38477L4.33301 6.33301V5.33301C4.33321 4.781 4.78099 4.33318 5.33301 4.33301H6.33301ZM5.33301 6.33301H6.33301V5.33301H5.33301V6.33301Z" fill="currentColor" />
        <path fillRule="evenodd" clipRule="evenodd" d="M10.667 4.33301C11.219 4.33319 11.6668 4.781 11.667 5.33301V6.33301C11.667 6.86804 11.2462 7.30526 10.7178 7.33203L10.667 7.33301H9.66699L9.61523 7.33203C9.10389 7.30613 8.69388 6.89611 8.66797 6.38477L8.66699 6.33301V5.33301C8.66719 4.78089 9.11483 4.33301 9.66699 4.33301H10.667ZM9.66699 6.33301H10.667V5.33301H9.66699V6.33301Z" fill="currentColor" />
        <path fillRule="evenodd" clipRule="evenodd" d="M2 0C2.55228 0 3 0.447715 3 1V2C3 2.53493 2.58 2.9721 2.05176 2.99902L2 3H1L0.948242 2.99902C0.437141 2.97297 0.0270267 2.56286 0.000976562 2.05176L0 2V1C1.61064e-08 0.447715 0.447715 3.22129e-08 1 0H2ZM1 2H2V1H1V2Z" fill="currentColor" />
        <path fillRule="evenodd" clipRule="evenodd" d="M6.33301 0C6.88528 0 7.33299 0.447734 7.33301 1V2C7.33301 2.53504 6.91315 2.97225 6.38477 2.99902L6.33301 3H5.33301L5.28223 2.99902C4.77098 2.97312 4.36101 2.56297 4.33496 2.05176L4.33301 2V1C4.33303 0.447839 4.78088 0.000170324 5.33301 0H6.33301ZM5.33301 2H6.33301V1H5.33301V2Z" fill="currentColor" />
        <path fillRule="evenodd" clipRule="evenodd" d="M10.667 0C11.2191 0.000181334 11.667 0.447846 11.667 1V2C11.667 2.53504 11.2462 2.97225 10.7178 2.99902L10.667 3H9.66699L9.61523 2.99902C9.10398 2.97312 8.69401 2.56297 8.66797 2.05176L8.66699 2V1C8.66701 0.447734 9.11472 1.6106e-08 9.66699 0H10.667ZM9.66699 2H10.667V1H9.66699V2Z" fill="currentColor" />
      </svg>
    ),
  },
];

const settingsIcon = (
  <svg
    viewBox="0 0 12 10.6667"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className="w-4 h-4 shrink-0"
  >
    <g>
      <path fillRule="evenodd" clipRule="evenodd" d="M6 1.83337H1.12852e-06V0.833374H6V1.83337ZM12 1.83337H10V0.833374H12V1.83337Z" fill="currentColor" />
      <path fillRule="evenodd" clipRule="evenodd" d="M4.66667 9.83337H1.12852e-06V8.83337H4.66667V9.83337ZM12 9.83337H8.66667V8.83337H12V9.83337Z" fill="currentColor" />
      <path fillRule="evenodd" clipRule="evenodd" d="M6 4.83337L12 4.83337V5.83337L6 5.83337V4.83337ZM0 4.83337L2 4.83337L2 5.83337L1.0411e-06 5.83337L0 4.83337Z" fill="currentColor" />
      <path fillRule="evenodd" clipRule="evenodd" d="M7.66797 1V1.66667H8.33464V1H7.66797ZM7.46797 0C7.02614 0 6.66797 0.358173 6.66797 0.800001V1.86667C6.66797 2.30849 7.02614 2.66667 7.46797 2.66667H8.53464C8.97646 2.66667 9.33464 2.30849 9.33464 1.86667V0.8C9.33464 0.358172 8.97646 0 8.53464 0H7.46797Z" fill="currentColor" />
      <path fillRule="evenodd" clipRule="evenodd" d="M3.66797 5V5.66667H4.33464V5H3.66797ZM3.46797 4C3.02614 4 2.66797 4.35817 2.66797 4.8V5.86667C2.66797 6.30849 3.02614 6.66667 3.46797 6.66667H4.53464C4.97646 6.66667 5.33464 6.30849 5.33464 5.86667V4.8C5.33464 4.35817 4.97646 4 4.53464 4H3.46797Z" fill="currentColor" />
      <path fillRule="evenodd" clipRule="evenodd" d="M6.33399 9V9.66667H7.00065V9H6.33399ZM6.13399 8C5.69216 8 5.33399 8.35817 5.33399 8.8V9.86667C5.33399 10.3085 5.69216 10.6667 6.13399 10.6667H7.20065C7.64248 10.6667 8.00065 10.3085 8.00065 9.86667V8.8C8.00065 8.35817 7.64248 8 7.20065 8H6.13399Z" fill="currentColor" />
    </g>
  </svg>
);

const collapseIcon = (
  <svg viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 shrink-0">
    <path fillRule="evenodd" clipRule="evenodd" d="M5.16667 1V11H8.4C9.83594 11 11 9.83594 11 8.4V3.6C11 2.16406 9.83594 1 8.4 1H5.16667ZM4.16667 1V11H3.6C2.16406 11 1 9.83594 1 8.4V3.6C1 2.16406 2.16406 1 3.6 1H4.16667ZM3.6 0C1.61178 0 0 1.61178 0 3.6V8.4C0 10.3882 1.61178 12 3.6 12H8.4C10.3882 12 12 10.3882 12 8.4V3.6C12 1.61177 10.3882 0 8.4 0H3.6Z" fill="currentColor" />
    <path fillRule="evenodd" clipRule="evenodd" d="M6.78507 5.17508L8.31366 3.64648L9.02077 4.35359L7.49217 5.88219C7.42709 5.94727 7.42709 6.0528 7.49218 6.11789L9.02077 7.64648L8.31366 8.35359L6.78507 6.825C6.32946 6.36938 6.32946 5.63069 6.78507 5.17508Z" fill="currentColor" />
  </svg>
);

const expandIcon = (
  <svg viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 shrink-0">
    <path fillRule="evenodd" clipRule="evenodd" d="M5.16667 1V11H8.4C9.83594 11 11 9.83594 11 8.4V3.6C11 2.16406 9.83594 1 8.4 1H5.16667ZM4.16667 1V11H3.6C2.16406 11 1 9.83594 1 8.4V3.6C1 2.16406 2.16406 1 3.6 1H4.16667ZM3.6 0C1.61178 0 0 1.61178 0 3.6V8.4C0 10.3882 1.61178 12 3.6 12H8.4C10.3882 12 12 10.3882 12 8.4V3.6C12 1.61177 10.3882 0 8.4 0H3.6Z" fill="currentColor" />
    <path fillRule="evenodd" clipRule="evenodd" d="M8.67981 5.17504L7.15122 3.64645L6.44411 4.35355L7.97271 5.88215C8.03779 5.94724 8.03779 6.05276 7.97271 6.11785L6.44411 7.64645L7.15122 8.35355L8.67981 6.82496C9.13542 6.36935 9.13543 5.63065 8.67981 5.17504Z" fill="currentColor" />
  </svg>
);

const logoMark = (
  <svg viewBox="0 0 50.27 36" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-6 h-[17px] text-text-primary">
    <rect x="10.83" y="12.36" width="15.89" height="2.14" rx="0.63" fill="currentColor" />
    <rect x="0.00" y="12.36" width="8.71" height="2.14" rx="0.63" fill="currentColor" />
    <rect x="30.67" y="12.36" width="9.94" height="2.14" rx="0.63" fill="currentColor" />
    <rect x="32.10" y="9.28" width="8.52" height="2.15" rx="0.63" fill="currentColor" />
    <rect x="41.74" y="9.28" width="6.76" height="2.15" rx="0.63" fill="currentColor" />
    <rect x="38.86" y="6.14" width="7.70" height="2.15" rx="0.63" fill="currentColor" />
    <rect x="41.30" y="3.07" width="2.26" height="2.15" rx="0.63" fill="currentColor" />
    <rect x="18.36" y="27.71" width="3.92" height="2.15" rx="0.63" fill="currentColor" />
    <rect x="25.16" y="27.71" width="2.56" height="2.15" rx="0.63" fill="currentColor" />
    <rect x="28.91" y="27.71" width="6.92" height="2.15" rx="0.63" fill="currentColor" />
    <rect x="32.38" y="24.64" width="2.87" height="2.14" rx="0.63" fill="currentColor" />
    <rect x="12.96" y="27.71" width="2.26" height="2.15" rx="0.63" fill="currentColor" />
    <rect x="23.41" y="30.78" width="2.26" height="2.15" rx="0.63" fill="currentColor" />
    <rect x="21.19" y="33.86" width="2.16" height="2.14" rx="0.63" fill="currentColor" />
    <rect x="29.75" y="0.00" width="2.81" height="2.15" rx="0.63" fill="currentColor" />
    <rect x="13.79" y="9.28" width="7.18" height="2.15" rx="0.63" fill="currentColor" />
    <rect x="27.10" y="3.07" width="4.36" height="2.15" rx="0.63" fill="currentColor" />
    <rect x="24.42" y="6.14" width="7.03" height="2.15" rx="0.63" fill="currentColor" />
    <rect x="46.30" y="12.36" width="4.11" height="2.14" rx="0.63" fill="currentColor" />
    <rect x="7.56" y="15.43" width="20.28" height="2.15" rx="0.63" fill="currentColor" />
    <rect x="25.97" y="21.57" width="7.92" height="2.15" rx="0.63" fill="currentColor" />
    <rect x="10.83" y="18.50" width="25.76" height="2.15" rx="0.63" fill="currentColor" />
    <rect x="6.89" y="21.57" width="9.58" height="2.15" rx="0.63" fill="currentColor" />
    <rect x="15.64" y="24.64" width="3.14" height="2.14" rx="0.63" fill="currentColor" />
    <rect x="26.72" y="24.64" width="3.38" height="2.14" rx="0.63" fill="currentColor" />
    <rect x="9.84" y="24.64" width="3.18" height="2.14" rx="0.63" fill="currentColor" />
    <rect x="30.67" y="15.43" width="8.19" height="2.15" rx="0.63" fill="currentColor" />
    <rect x="32.57" y="6.12" width="2.26" height="2.15" rx="0.63" fill="currentColor" />
  </svg>
);

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const pathname = usePathname();

  return (
    <>
      {/* Sidebar spacer */}
      <div
        className="shrink-0 transition-all duration-200 ease-in-out"
        style={{ width: collapsed ? 64 : 240 }}
      />

      <aside
        className={`
          fixed top-0 left-0 h-screen z-50
          flex flex-col
          bg-white border-r border-border-light
          transition-all duration-200 ease-in-out
          ${collapsed ? "w-[64px]" : "w-[240px]"}
        `}
      >
        {/* ── Logo + Collapse ──────────────────────────────── */}
        <div
          className={`
            flex items-center h-[56px] shrink-0
            border-b border-border-light
            ${collapsed ? "justify-center px-0" : "justify-between px-5"}
          `}
        >
          {collapsed ? (
            logoMark
          ) : (
            <Image
              src="/strand/assets/logo-full.svg"
              alt="TwelveLabs"
              width={130}
              height={22}
              style={{ width: "auto", height: 22 }}
              draggable={false}
              priority
            />
          )}

          {!collapsed && (
            <button
              onClick={() => setCollapsed(true)}
              className="p-1.5 rounded-md text-text-tertiary hover:text-text-primary hover:bg-gray-50 transition-colors duration-200"
              aria-label="Collapse sidebar"
            >
              {collapseIcon}
            </button>
          )}
        </div>

        {/* ── App Title ────────────────────────────────────── */}
        {!collapsed && (
          <div className="px-5 pt-4 pb-2">
            <p className="text-[10px] font-semibold uppercase tracking-[1.5px] text-text-tertiary">
              Contextual Video Library
            </p>
          </div>
        )}

        {/* ── Navigation Items ─────────────────────────────── */}
        <nav className="flex-1 flex flex-col py-1 px-3 gap-1">
          {navItems.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.id}
                href={item.href}
                title={collapsed ? item.label : undefined}
                className={`
                  flex items-center gap-3 rounded-lg
                  text-sm font-medium
                  transition-all duration-200
                  ${collapsed ? "justify-center px-0 py-2.5" : "px-3 py-2.5"}
                  ${isActive
                    ? "bg-gray-50 text-text-primary"
                    : "text-text-secondary hover:bg-gray-50 hover:text-text-primary"
                  }
                `}
              >
                <span className={isActive ? "text-text-primary" : "text-text-tertiary"}>
                  {item.icon}
                </span>
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* ── Bottom Section ───────────────────────────────── */}
        <div className="border-t border-border-light px-3 py-3">
          <button
            onClick={() => setSettingsOpen(true)}
            title={collapsed ? "Settings" : undefined}
            className={`
              flex items-center gap-3 rounded-lg w-full
              text-sm font-medium text-text-secondary
              hover:bg-gray-50 hover:text-text-primary
              transition-all duration-200
              ${collapsed ? "justify-center px-0 py-2.5" : "px-3 py-2.5"}
            `}
          >
            <span className="text-text-tertiary">{settingsIcon}</span>
            {!collapsed && <span>Settings</span>}
          </button>

          {collapsed && (
            <button
              onClick={() => setCollapsed(false)}
              className="flex items-center justify-center w-full mt-1 py-2.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-gray-50 transition-colors duration-200"
              aria-label="Expand sidebar"
            >
              {expandIcon}
            </button>
          )}
        </div>
      </aside>

      {/* Settings Modal */}
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}
