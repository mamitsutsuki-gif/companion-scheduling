import type { Metadata } from "next";
import { Inter, Noto_Sans_JP, JetBrains_Mono } from "next/font/google";
import { APP_DISPLAY_NAME, APP_SHORT_DESCRIPTION } from "@/lib/brand";
import "./globals.css";

/*
 * Variant A の方向性に合わせて、欧文 Inter + 和文 Noto Sans JP に切り替え。
 * Geist は工芸的だが SaaS ライクな端正さに欠けていたため、Inter に統一して
 * 見出し・本文・ボタンのすべてを 1 つのファミリで揃える。
 * 等幅は JetBrains Mono（数値 / ID 表示用）。
 */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const notoJp = Noto_Sans_JP({
  variable: "--font-noto-jp",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const mono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
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
    <html
      lang="ja"
      className={`${inter.variable} ${notoJp.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-slate-50 font-sans text-slate-900">{children}</body>
    </html>
  );
}
