import type { Metadata } from "next";
import { Noto_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import Sidebar from "./components/Sidebar";

const notoSans = Noto_Sans({
  variable: "--font-noto-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Contextual Ad Engine — TwelveLabs",
  description:
    "AI-powered contextual ad engine built with TwelveLabs video understanding APIs.",
  icons: {
    icon: "/favicon.ico",
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
      <head>
        {/* Strand font imports via CDN */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Noto+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap"
        />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/geist@1/dist/fonts/geist-sans/style.min.css"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&display=swap"
        />
      </head>
      <body
        className={`${notoSans.variable} ${ibmPlexMono.variable} antialiased flex min-h-screen`}
      >
        <Sidebar />
        <main className="flex-1 min-w-0">
          {children}
        </main>
      </body>
    </html>
  );
}
