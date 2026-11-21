"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth, UserButton } from "@clerk/nextjs";
import { Radio, Shield, Swords, Trophy, type LucideIcon } from "lucide-react";

// Two modes (Attack / Defend) plus the leaderboard and the live wall.
const NAV: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/", label: "Attack", icon: Swords },
  { href: "/my-agents", label: "Defend", icon: Shield },
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { href: "/arena-wall", label: "Live", icon: Radio },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/" || pathname.startsWith("/play");
  if (href === "/my-agents") return pathname.startsWith("/my-agents") || pathname.startsWith("/agents");
  return pathname.startsWith(href);
}

export default function Header() {
  // Clerk Core 3 removed <SignedIn>/<SignedOut>; use the useAuth hook instead
  const { isLoaded, isSignedIn } = useAuth();
  const pathname = usePathname() ?? "/";
  return (
    <header className="relative z-[3] border-b border-room-line bg-room-bg/80 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-4 sm:gap-6 sm:px-6">
        <Link href="/" className="whitespace-nowrap font-display text-2xl text-room-text">
          Red <span className="text-room-red">Room</span>
        </Link>
        <nav aria-label="Main" className="flex flex-1 items-center gap-0.5 sm:gap-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-label={label}
                aria-current={active ? "page" : undefined}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-semibold sm:px-3 ${
                  active
                    ? "bg-room-panel-2 text-room-text"
                    : "text-room-muted hover:bg-room-panel-2 hover:text-room-text"
                }`}
              >
                <Icon size={16} aria-hidden="true" className={active ? "text-room-red" : undefined} />
                <span className="hidden md:inline">{label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-3">
          {isLoaded && !isSignedIn && (
            <Link
              href="/sign-in"
              className="whitespace-nowrap rounded-lg bg-room-red px-3 py-2 text-sm font-semibold text-room-bg hover:bg-room-red-soft"
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
