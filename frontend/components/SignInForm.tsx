"use client";

import { SignIn } from "@clerk/nextjs";

/** Client-side Clerk sign-in widget, rendered only when a secret key exists. */
export default function SignInForm() {
  return (
    <div className="mt-8">
      <SignIn routing="hash" fallbackRedirectUrl="/" />
    </div>
  );
}
