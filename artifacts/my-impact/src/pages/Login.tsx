import { useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { Mail, ArrowRight, CheckCircle, X } from "lucide-react";

const DEMO_EMAIL = "demo@demo.org";

export default function Login() {
  const { requestMagicLink, demoLogin } = useAuth();
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

  const handleClose = () => {
    navigate(closeTo);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const normalizedEmail = email.trim().toLowerCase();
    try {
      if (normalizedEmail === DEMO_EMAIL) {
        await demoLogin(normalizedEmail);
        navigate(postLoginTo ?? "/org");
      } else {
        await requestMagicLink(normalizedEmail, postLoginTo ?? undefined);
        setSent(true);
      }
    } catch (err: any) {
      setError(err.message ?? "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
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

        <div className="bg-white rounded-2xl p-8 shadow-2xl relative">
          <button
            onClick={handleClose}
            aria-label="Close and go back"
            className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors rounded-full p-1 focus:outline-none focus:ring-2 focus:ring-[#F06127]/40"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
          {sent ? (
            <div className="text-center">
              <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: "#FFF3ED" }}>
                <CheckCircle className="w-7 h-7" style={{ color: "#F06127" }} aria-hidden="true" />
              </div>
              <h2 className="text-xl font-bold text-foreground mb-2">Check your inbox</h2>
              <p className="text-muted-foreground text-sm leading-relaxed mb-6">
                We've sent a sign-in link to <strong>{email}</strong>. It expires in 15 minutes.
              </p>
              <button
                onClick={() => { setSent(false); setEmail(""); }}
                className="text-sm text-muted-foreground hover:underline"
              >
                Use a different email
              </button>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-bold text-foreground mb-1">Sign in</h2>
              <p className="text-sm text-muted-foreground mb-6">
                We'll email you a magic link, no password needed.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-foreground mb-1.5">
                    Email address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      required
                      className="w-full pl-10 pr-4 py-3 min-h-[44px] border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F06127]/40 focus:border-[#F06127]"
                    />
                  </div>
                </div>

                {error && (
                  <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={loading || !email}
                  className="w-full flex items-center justify-center gap-2 py-3 min-h-[44px] px-4 rounded-lg text-white text-sm font-bold transition-opacity disabled:opacity-60"
                  style={{ background: "#F06127" }}
                >
                  {loading ? "Sending..." : <>Send sign-in link <ArrowRight className="w-4 h-4" aria-hidden="true" /></>}
                </button>
              </form>

              <p className="text-xs text-muted-foreground text-center mt-5">
                New here?{" "}
                <Link href="/wizard/actions" className="underline hover:text-foreground">
                  Calculate your impact first
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
