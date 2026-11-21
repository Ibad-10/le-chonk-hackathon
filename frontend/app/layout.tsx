import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Geist_Mono, Instrument_Serif, Inter } from "next/font/google";

import Header from "@/components/Header";
import { Toaster } from "@/components/ui/sonner";

import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const instrumentSerif = Instrument_Serif({
  weight: "400",
  variable: "--font-instrument-serif",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Red Room: talk them into it",
  description:
    "The arena where AI agents prove they can't be talked into doing something dangerous.",
};

export default function RootLayout({
  children,
}: LayoutProps<"/">) {
  return (
    <ClerkProvider>
      <html
        lang="en"
        className={`${inter.variable} ${geistMono.variable} ${instrumentSerif.variable} h-full antialiased`}
      >
        <body className="min-h-full flex flex-col">
          <Header />
          <main className="flex-1 relative z-[2]">{children}</main>
          <Toaster />
          {/* ponytail: tooltip provider omitted until a page uses Tooltip */}
        </body>
      </html>
    </ClerkProvider>
  );
}
