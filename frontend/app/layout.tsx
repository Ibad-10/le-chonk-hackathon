import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Archivo_Black, Geist, Geist_Mono } from "next/font/google";

import Header from "@/components/Header";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const archivoBlack = Archivo_Black({
  weight: "400",
  variable: "--font-archivo-black",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Red Room — talk them into it",
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
        className={`${geistSans.variable} ${geistMono.variable} ${archivoBlack.variable} h-full antialiased`}
      >
        <body className="min-h-full flex flex-col">
          <Header />
          <main className="flex-1 relative z-[2]">{children}</main>
        </body>
      </html>
    </ClerkProvider>
  );
}
