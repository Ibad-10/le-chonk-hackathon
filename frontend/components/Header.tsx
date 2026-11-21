"use client";

import Link from "next/link";
import { useAuth, UserButton } from "@clerk/nextjs";

const NAV = [
  { href: "/", label: "Arena" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/my-agents", label: "My agents" },
];

export default function Header() {
  // Clerk Core 3 removed <SignedIn>/<SignedOut>; use the useAuth hook instead
  const { isLoaded, isSignedIn } = useAuth();
  return (
    <header className="relative z-[3] border-b border-room-line bg-room-bg/80 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link
          href="/"
          className="font-display text-xl tracking-wide text-room-text"
        >
          RED<span className="text-room-red"> ROOM</span>
        </Link>
        <nav aria-label="Main" className="flex flex-1 items-center gap-1 sm:gap-2">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 text-sm font-medium text-room-muted hover:bg-room-panel-2 hover:text-room-text"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          {isLoaded && !isSignedIn && (
            <Link
              href="/sign-in"
              className="rounded-md bg-room-red px-3 py-2 text-sm font-semibold text-white hover:bg-room-red-soft"
            >
              Sign in
            </Link>
          )}
          {isLoaded && isSignedIn && <UserButton />}
        </div>
      </div>
    </header>
  );
}
