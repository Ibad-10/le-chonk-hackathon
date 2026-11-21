"use client";

import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center px-4 py-16">
      <h1 className="font-display text-3xl text-room-text">Sign in to play</h1>
      <p className="mt-2 text-center text-sm text-room-muted">
        Browsing is public. Playing, creating agents and owner pages need an
        account.
      </p>
      <div className="mt-8">
        <SignIn routing="hash" fallbackRedirectUrl="/" />
      </div>
    </div>
  );
}
