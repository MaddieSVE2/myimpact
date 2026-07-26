import { useEffect, useState } from "react";
import { Link } from "wouter";
import { CheckCircle, XCircle, Loader2, MailX } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function Unsubscribe() {
  const [status, setStatus] = useState<"working" | "done" | "error">("working");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) {
      setStatus("error");
      setErrorMsg("No unsubscribe token found in this link.");
      return;
    }

    fetch(`${BASE}/api/profile/unsubscribe?token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "X-Requested-With": "XMLHttpRequest" },
    })
      .then(async (r) => {
        let data: Record<string, unknown> = {};
        try {
          data = await r.json();
        } catch {
          throw new Error("non-json");
        }
        if (data.ok) {
          setStatus("done");
        } else {
          setStatus("error");
          setErrorMsg(
            (data.error as string) ?? "This unsubscribe link is invalid or has expired."
          );
        }
      })
      .catch(() => {
        setStatus("error");
        setErrorMsg("Something went wrong. Please try again in a moment.");
      });
  }, []);

  return (
    <div className="max-w-md mx-auto px-4 py-20 text-center">
      {status === "working" && (
        <>
          <Loader2 className="w-10 h-10 animate-spin mx-auto mb-4 text-muted-foreground" />
          <h1 className="text-xl font-bold text-foreground">Unsubscribing you…</h1>
        </>
      )}

      {status === "done" && (
        <>
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
            style={{ background: "#FFF3ED" }}
          >
            <CheckCircle className="w-7 h-7" style={{ color: "var(--brand-orange-bright)" }} />
          </div>
          <h1 className="text-2xl font-display font-bold text-foreground mb-3">
            You've been unsubscribed
          </h1>
          <p className="text-muted-foreground mb-2 leading-relaxed">
            We won't send you any more onboarding or digest emails.
          </p>
          <p className="text-muted-foreground mb-8 leading-relaxed text-sm">
            Changed your mind? You can switch emails back on any time from your settings.
          </p>
          <Link
            href="/settings"
            className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-md bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            <MailX className="w-4 h-4" />
            Manage email preferences
          </Link>
        </>
      )}

      {status === "error" && (
        <>
          <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4 bg-red-50">
            <XCircle className="w-7 h-7 text-red-500" />
          </div>
          <h1 className="text-2xl font-display font-bold text-foreground mb-3">
            Link not valid
          </h1>
          <p className="text-muted-foreground mb-8 leading-relaxed">{errorMsg}</p>
          <Link
            href="/settings"
            className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-md bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            Manage email preferences in Settings
          </Link>
        </>
      )}
    </div>
  );
}
