import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { classFont, nameFont } from "@/lib/fonts";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "REPEXSA 2026 Badge Editor",
  description: "Add your photo, name and class to your REPEXSA 2026 AGM badge and download it.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0143cf",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${nameFont.variable} ${classFont.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
