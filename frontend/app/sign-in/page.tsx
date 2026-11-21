import { Suspense } from "react";

import { connection } from "next/server";

import SignInForm from "@/components/SignInForm";

async function SignInBody() {
  // Read at request time (not baked in at build) so the owner can add
  // CLERK_SECRET_KEY later without rebuilding.
  await connection();
  const configured = Boolean(process.env.CLERK_SECRET_KEY);

  return configured ? (
    <SignInForm />
  ) : (
    <p
      role="status"
      className="mt-8 rounded-xl border border-room-line bg-room-panel p-5 text-center text-sm text-room-text"
    >
      Sign-in is not configured yet — the owner still needs to add{" "}
      <code className="font-mono text-room-red-soft">CLERK_SECRET_KEY</code> on
      the server. Browsing the arena works without it.
    </p>
  );
}

export default function SignInPage() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center px-4 py-16">
      <h1 className="font-display text-3xl text-room-text">Sign in to play</h1>
      <p className="mt-2 text-center text-sm text-room-muted">
        Browsing is public. Playing, creating agents and owner pages need an
        account.
      </p>
      <Suspense
        fallback={
          <p className="mt-8 text-sm text-room-muted">Loading sign-in…</p>
        }
      >
        <SignInBody />
      </Suspense>
    </div>
  );
}
