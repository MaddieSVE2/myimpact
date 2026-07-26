import { useState } from "react";
import { Link } from "wouter";
import { Loader2, Cake } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Date-of-birth step shown after the first magic-link confirmation (and to
 * any signed-in user who is missing birth data). Submits to
 * POST /api/auth/birth-date, which applies the age gate:
 *   - under-13 → account erased server-side; we show a blocked message;
 *   - otherwise → stored (with the minor flag) and onComplete() fires.
 */
export function BirthDateForm({ onComplete }: { onComplete: () => void }) {
  const [birthMonth, setBirthMonth] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!birthMonth || !birthYear) {
      setError("Please choose your birth month and year.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${BASE}/api/auth/birth-date`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ birthMonth: Number(birthMonth), birthYear: Number(birthYear) }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        onComplete();
        return;
      }
      if (data.code === "under_13") {
        setBlocked(true);
        return;
      }
      setError((data.error as string) ?? "Something went wrong. Please try again.");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (blocked) {
    return (
      <div className="text-center" data-testid="text-underage-blocked">
        <h2 className="text-xl font-bold text-foreground mb-2">Sorry — you must be 13 or older</h2>
        <p className="text-sm text-muted-foreground leading-relaxed mb-6">
          You must be 13 or older to use My Impact, so we couldn't finish creating
          your account. We haven't kept any of your details. We'd love to see you
          back when you're 13!
        </p>
        <Link
          href="/"
          className="inline-block px-5 py-2.5 rounded-lg text-white text-sm font-bold"
          style={{ background: "#F06127" }}
        >
          Back to home
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="text-left">
      <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: "#FFF3ED" }}>
        <Cake className="w-7 h-7" style={{ color: "#F06127" }} aria-hidden="true" />
      </div>
      <h2 className="text-xl font-bold text-foreground mb-2 text-center">When were you born?</h2>
      <p className="text-sm text-muted-foreground leading-relaxed mb-5 text-center">
        We ask everyone for their birth month and year to keep My Impact safe
        for younger people. You must be 13 or older to have an account.
      </p>
      <div className="flex gap-2 mb-4">
        <select
          id="birth-month"
          value={birthMonth}
          onChange={(e) => { setBirthMonth(e.target.value); setError(null); }}
          data-testid="select-birth-month"
          className="flex-1 px-3 py-3 min-h-[44px] border border-border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#F06127]/40 focus:border-[#F06127]"
          aria-label="Birth month"
          required
        >
          <option value="">Month</option>
          {MONTH_NAMES.map((name, i) => (
            <option key={name} value={i + 1}>{name}</option>
          ))}
        </select>
        <select
          id="birth-year"
          value={birthYear}
          onChange={(e) => { setBirthYear(e.target.value); setError(null); }}
          data-testid="select-birth-year"
          className="w-28 px-3 py-3 min-h-[44px] border border-border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#F06127]/40 focus:border-[#F06127]"
          aria-label="Birth year"
          required
        >
          <option value="">Year</option>
          {Array.from({ length: 100 }, (_, i) => new Date().getFullYear() - i).map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-4">{error}</p>
      )}

      <button
        type="submit"
        disabled={saving || !birthMonth || !birthYear}
        data-testid="button-save-birth-date"
        className="w-full flex items-center justify-center gap-2 py-3 min-h-[44px] px-4 rounded-lg text-white text-sm font-bold transition-opacity disabled:opacity-60"
        style={{ background: "#F06127" }}
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : null}
        {saving ? "Saving…" : "Continue"}
      </button>
    </form>
  );
}
