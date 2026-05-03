import { useState, useEffect, useRef } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { Mail, ArrowRight, CheckCircle, X, Building2, Lock } from "lucide-react";
import { useT } from "@/i18n";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface SsoLookup {
  provider: "google" | "microsoft";
  domain: string;
  enforce: boolean;
  available: boolean;
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.4-1.6 4.1-5.5 4.1a6.2 6.2 0 1 1 0-12.4c2 0 3.3.8 4 1.5l2.7-2.6C17 3 14.7 2 12 2a10 10 0 1 0 0 20c5.8 0 9.6-4.1 9.6-9.8 0-.7-.1-1.2-.2-2H12z"/>
    </svg>
  );
}

function MicrosoftIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path fill="#F25022" d="M2 2h9.5v9.5H2z"/>
      <path fill="#7FBA00" d="M12.5 2H22v9.5h-9.5z"/>
      <path fill="#00A4EF" d="M2 12.5h9.5V22H2z"/>
      <path fill="#FFB900" d="M12.5 12.5H22V22h-9.5z"/>
    </svg>
  );
}

export default function Login() {
  const { requestMagicLink } = useAuth();
  const t = useT();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);

  const fromParam = params.get("from");
  const nextParam = params.get("next");

  const isValidPath = (p: string | null): p is string =>
    typeof p === "string" && p.startsWith("/") && !p.startsWith("//");

  const closeTo = isValidPath(fromParam) ? fromParam : "/";
  const postLoginTo = isValidPath(nextParam) ? nextParam
    : isValidPath(fromParam) ? fromParam
    : null;

  const isOrgLogin = typeof nextParam === "string" && nextParam.startsWith("/org");

  // Look up the email's SSO config (debounced) so we can show the right
  // sign-in option(s) for an organisation that has set up enterprise SSO.
  const [ssoLookup, setSsoLookup] = useState<SsoLookup | null>(null);
  const [ssoLooking, setSsoLooking] = useState(false);
  const lookupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (lookupTimer.current) clearTimeout(lookupTimer.current);
    const v = email.trim().toLowerCase();
    if (!v.includes("@") || v.split("@")[1]?.length < 3) {
      setSsoLookup(null);
      setSsoLooking(false);
      return;
    }
    setSsoLooking(true);
    lookupTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`${BASE}/api/auth/sso/lookup?email=${encodeURIComponent(v)}`, { credentials: "include" });
        const data = await res.json();
        setSsoLookup(data.sso ?? null);
      } catch {
        setSsoLookup(null);
      } finally {
        setSsoLooking(false);
      }
    }, 300);
    return () => {
      if (lookupTimer.current) clearTimeout(lookupTimer.current);
    };
  }, [email]);

  const handleClose = () => {
    navigate(closeTo);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const normalizedEmail = email.trim().toLowerCase();
    try {
      const result = await requestMagicLink(normalizedEmail, postLoginTo ?? undefined);
      if (result.instantLogin) {
        const target = result.orgRedirect ? "/org" : postLoginTo ?? "/";
        navigate(target);
        return;
      }
      setSent(true);
    } catch (err: any) {
      setError(err.message ?? t("common.error"));
    } finally {
      setLoading(false);
    }
  };

  function handleSsoClick(provider: "google" | "microsoft") {
    const v = email.trim().toLowerCase();
    if (!v.includes("@")) {
      setError("Please enter your work email first.");
      return;
    }
    const params = new URLSearchParams({ email: v });
    if (postLoginTo) params.set("returnTo", postLoginTo);
    window.location.href = `${BASE}/api/auth/sso/${provider}/start?${params.toString()}`;
  }

  const showSsoButton = ssoLookup?.available;
  const enforced = ssoLookup?.enforce; // independent of platform-availability
  const enforcedUnavailable = ssoLookup?.enforce && !ssoLookup?.available;

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

        <div className="bg-white rounded-2xl p-8 shadow-2xl relative">
          <button
            onClick={handleClose}
            aria-label={t("login.closeAndGoBack")}
            className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors rounded-full p-1 focus:outline-none focus:ring-2 focus:ring-[#F06127]/40"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
          {sent ? (
            <div className="text-center">
              <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: "#FFF3ED" }}>
                <CheckCircle className="w-7 h-7" style={{ color: "#F06127" }} aria-hidden="true" />
              </div>
              <h2 className="text-xl font-bold text-foreground mb-2">
                {isOrgLogin ? t("login.checkWorkInbox") : t("login.checkInbox")}
              </h2>
              <p className="text-muted-foreground text-sm leading-relaxed mb-6">
                {isOrgLogin
                  ? t("login.sentOrgDesc", { email })
                  : t("login.sentDesc", { email })}
              </p>
              <button
                onClick={() => { setSent(false); setEmail(""); }}
                className="text-sm text-muted-foreground hover:underline"
              >
                {t("login.useDifferentEmail")}
              </button>
            </div>
          ) : (
            <>
              {isOrgLogin ? (
                <div className="mb-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ background: "rgba(232,99,58,0.10)" }}>
                    <Building2 className="w-5 h-5 text-primary" aria-hidden="true" />
                  </div>
                  <h2 className="text-xl font-bold text-foreground mb-1">{t("login.orgSignIn")}</h2>
                  <p className="text-sm text-muted-foreground">
                    {t("login.orgSignInDesc")}
                  </p>
                </div>
              ) : (
                <>
                  <h2 className="text-xl font-bold text-foreground mb-1">{t("login.signIn")}</h2>
                  <p className="text-sm text-muted-foreground mb-6">
                    {t("login.signInDesc")}
                  </p>
                </>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-foreground mb-1.5">
                    {t("login.emailAddress")}
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); setError(null); }}
                      placeholder={t("login.emailPlaceholder")}
                      required
                      className="w-full pl-10 pr-4 py-3 min-h-[44px] border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F06127]/40 focus:border-[#F06127]"
                    />
                  </div>
                </div>

                {showSsoButton && (
                  <div className={enforced ? "rounded-lg bg-blue-50 border border-blue-100 p-3 space-y-2" : "space-y-2"}>
                    {enforced && (
                      <p className="text-xs text-blue-900 flex items-start gap-1.5">
                        <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
                        <span><strong>{ssoLookup!.domain}</strong> requires single sign-on. Use your work account to continue.</span>
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => handleSsoClick(ssoLookup!.provider)}
                      className="w-full flex items-center justify-center gap-2 py-3 min-h-[44px] px-4 rounded-lg border border-border bg-white text-sm font-semibold text-foreground hover:bg-secondary transition-colors"
                    >
                      {ssoLookup!.provider === "google"
                        ? <><GoogleIcon className="w-4 h-4" /> Continue with Google</>
                        : <><MicrosoftIcon className="w-4 h-4" /> Continue with Microsoft</>}
                    </button>
                  </div>
                )}

                {enforcedUnavailable && (
                  <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
                    <p className="text-xs text-amber-900 flex items-start gap-1.5">
                      <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
                      <span>
                        <strong>{ssoLookup!.domain}</strong> requires single sign-on, but it isn't available right now. Please contact your organisation admin.
                      </span>
                    </p>
                  </div>
                )}

                {error && (
                  <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
                )}

                {!enforced && (
                  <button
                    type="submit"
                    disabled={loading || !email}
                    className="w-full flex items-center justify-center gap-2 py-3 min-h-[44px] px-4 rounded-lg text-white text-sm font-bold transition-opacity disabled:opacity-60"
                    style={{ background: "#F06127" }}
                  >
                    {loading ? t("login.sending") : <>{t("login.sendLink")} <ArrowRight className="w-4 h-4" aria-hidden="true" /></>}
                  </button>
                )}

                {showSsoButton && !enforced && (
                  <p className="text-[11px] text-muted-foreground text-center">
                    Or sign in with your <strong>{ssoLookup!.domain}</strong> account using the button above.
                  </p>
                )}

                {ssoLooking && !ssoLookup && (
                  <p className="text-[11px] text-muted-foreground text-center">Checking sign-in options…</p>
                )}
              </form>

              {!isOrgLogin && (
                <p className="text-xs text-muted-foreground text-center mt-5">
                  {t("login.newHere")}{" "}
                  <Link href="/wizard/actions" className="underline hover:text-foreground">
                    {t("login.calculateFirst")}
                  </Link>
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
