"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { W } from "@/lib/words";
import { Button } from "./ui/Button";

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export function SignInButton({ next }: { next?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = async () => {
    setBusy(true);
    setError(null);
    const redirect = new URL("/auth/callback", window.location.origin);
    if (next) redirect.searchParams.set("volgende", next);
    const { error } = await supabaseBrowser().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: redirect.toString() },
    });
    if (error) {
      setBusy(false);
      setError("Aanmelden lukt nu niet. Probeer het zo meteen opnieuw.");
    }
  };

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        variant="primary"
        onClick={signIn}
        disabled={busy}
        className="h-12 px-5 text-[15px]"
        icon={
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white">
            <GoogleMark />
          </span>
        }
      >
        {busy ? "Even geduld…" : W.signIn}
      </Button>
      {error && <p className="text-[13px] text-danger">{error}</p>}
    </div>
  );
}
