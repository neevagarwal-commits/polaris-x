import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import React from "react";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "POLARIS-X | Antarctic Navigation Intelligence",
  description: "Real-time Antarctic sea ice monitoring, iceberg tracking, and AI-powered route planning.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full w-full overflow-hidden`}>
      <body className="h-full w-full overflow-hidden bg-[#03070b] text-white m-0 p-0 select-none">
        {children}
      </body>
    </html>
  );
}
