import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import { Link } from "wouter";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function AuthConfirm() {
  const [, navigate] = useLocation();
  const { } = useAuth();

  const [status, setStatus] = useState<"verifying" | "ready" | "confirming" | "error">("verifying");
  const [email, setEmail] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const token = new URLSearchParams(window.location.search).get("token");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setErrorMsg("No token found in this link.");
      return;
    }

    fetch(`${BASE}/api/auth/verify?token=${encodeURIComponent(token)}`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) {
          setEmail(data.email ?? null);
          setStatus("ready");
        } else {
          setStatus("error");
          setErrorMsg(data.error ?? "This link is invalid or expired.");
        }
      })
      .catch(() => {
        setStatus("error");
        setErrorMsg("Something went wrong. Please try again.");
      });
  }, [token]);

  const handleConfirm = async () => {
    setStatus("confirming");
    try {
      const res = await fetch(`${BASE}/api/auth/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (data.ok) {
        window.location.href = (import.meta.env.BASE_URL || "/") + "history";
      } else {
        setStatus("error");
        setErrorMsg(data.error ?? "Failed to confirm sign-in.");
      }
    } catch {
      setStatus("error");
      setErrorMsg("Something went wrong. Please try again.");
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "#213547" }}
    >
      <div className="w-full max-w-sm">
        <Link href="/">
          <img
            src={`${import.meta.env.BASE_URL}images/myimpact.png`}
            alt="My Impact"
            className="h-12 mx-auto mb-8"
          />
        </Link>

        <div className="bg-white rounded-2xl p-8 shadow-2xl text-center">
          {status === "verifying" && (
            <>
              <Loader2 className="w-10 h-10 animate-spin mx-auto mb-4 text-muted-foreground" />
              <h2 className="text-lg font-bold text-foreground">Checking your link…</h2>
            </>
          )}

          {status === "ready" && (
            <>
              <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: "#FFF3ED" }}>
                <CheckCircle className="w-7 h-7" style={{ color: "#F06127" }} />
              </div>
              <h2 className="text-xl font-bold text-foreground mb-2">Confirm sign in</h2>
              {email && (
                <p className="text-sm text-muted-foreground mb-6">
                  Signing in as <strong>{email}</strong>
                </p>
              )}
              <button
                onClick={handleConfirm}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-white text-sm font-bold"
                style={{ background: "#F06127" }}
              >
                Confirm sign in
              </button>
            </>
          )}

          {status === "confirming" && (
            <>
              <Loader2 className="w-10 h-10 animate-spin mx-auto mb-4" style={{ color: "#F06127" }} />
              <h2 className="text-lg font-bold text-foreground">Signing you in…</h2>
            </>
          )}

          {status === "error" && (
            <>
              <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4 bg-red-50">
                <XCircle className="w-7 h-7 text-red-500" />
              </div>
              <h2 className="text-xl font-bold text-foreground mb-2">Link not valid</h2>
              <p className="text-sm text-muted-foreground mb-6">{errorMsg}</p>
              <Link
                href="/login"
                className="inline-block px-5 py-2.5 rounded-lg text-white text-sm font-bold"
                style={{ background: "#F06127" }}
              >
                Request a new link
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
