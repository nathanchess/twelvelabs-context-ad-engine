import type { Metadata } from "next";
import { TooltipProvider } from "@twelvelabs-io/react";
import "./globals.css";
import Sidebar from "./components/Sidebar";

export const metadata: Metadata = {
  title: "Contextual Ad Engine — TwelveLabs",
  description:
    "AI-powered contextual ad engine built with TwelveLabs video understanding APIs.",
  icons: {
    icon: [{ url: "/favicon.ico", type: "image/x-icon" }],
    shortcut: "/favicon.ico",
    apple: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="flex min-h-screen antialiased">
        <TooltipProvider>
          <Sidebar />
          <main className="min-w-0 flex-1">{children}</main>
        </TooltipProvider>
      </body>
    </html>
  );
}
