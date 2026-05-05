import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { APP_DISPLAY_NAME, APP_SHORT_DESCRIPTION } from "@/lib/brand";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: APP_DISPLAY_NAME,
    template: `%s · ${APP_DISPLAY_NAME}`,
  },
  description: APP_SHORT_DESCRIPTION,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-slate-50 font-sans text-slate-900">{children}</body>
    </html>
  );
}
