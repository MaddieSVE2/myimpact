import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Sparkles, X, ArrowRight } from "lucide-react";
import {
  getRecapYear,
  isInRecapWindow,
  isRecapViewed,
  markRecapViewed,
} from "@/lib/recap-utils";
import { useAuth } from "@/lib/auth-context";

interface RecapBannerProps {
  variant?: "hero" | "card";
  forceShow?: boolean;
}

export default function RecapBanner({ variant = "card", forceShow = false }: RecapBannerProps) {
  const { isLoggedIn } = useAuth();
  const [year] = useState(() => getRecapYear());
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isLoggedIn) {
      setVisible(false);
      return;
    }
    if (forceShow) {
      setVisible(true);
      return;
    }
    if (!isInRecapWindow()) {
      setVisible(false);
      return;
    }
    setVisible(!isRecapViewed(year));
  }, [isLoggedIn, year, forceShow]);

  if (!visible) return null;

  const dismiss = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    markRecapViewed(year);
    setVisible(false);
  };

  if (variant === "hero") {
    return (
      <div style={{ background: "var(--brand-cream)", padding: "16px 5% 0" }}>
        <div style={{ maxWidth: 980, margin: "0 auto" }}>
          <Link
            href={`/recap?year=${year}`}
            className="block relative overflow-hidden rounded-2xl group"
            style={{
              background: "linear-gradient(135deg, #1a2e3a 0%, #2a4054 60%, #e8622a 140%)",
              border: "1px solid rgba(255,255,255,0.12)",
            }}
          >
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                top: -80,
                right: -80,
                width: 240,
                height: 240,
                borderRadius: "50%",
                background: "radial-gradient(circle, rgba(232,98,42,0.6) 0%, transparent 70%)",
                opacity: 0.7,
              }}
            />
            <div className="relative z-10 px-5 sm:px-7 py-5 sm:py-6 flex items-center gap-4">
              <div
                className="flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center"
                style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.18)" }}
              >
                <Sparkles className="w-5 h-5 text-white" aria-hidden="true" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-extrabold tracking-[0.18em] text-white/60 uppercase">
                  {year} · Year in impact
                </p>
                <p className="text-white font-bold text-base sm:text-lg leading-tight mt-0.5">
                  Your {year} recap is ready
                </p>
                <p className="text-white/70 text-xs sm:text-sm mt-1 hidden sm:block">
                  See your top activity, biggest moments and shareable card.
                </p>
              </div>
              <div className="hidden sm:flex items-center gap-1 text-white text-sm font-semibold">
                View <ArrowRight className="w-4 h-4 ml-0.5" aria-hidden="true" />
              </div>
              <button
                onClick={dismiss}
                aria-label="Dismiss recap banner"
                className="flex-shrink-0 p-1.5 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <Link
      href={`/recap?year=${year}`}
      className="block relative overflow-hidden rounded-xl group mb-4"
      style={{
        background: "linear-gradient(135deg, #1a2e3a 0%, #2a4054 100%)",
        border: "1px solid rgba(232,98,42,0.4)",
      }}
    >
      <div className="relative z-10 px-4 py-3.5 flex items-center gap-3">
        <Sparkles className="w-4 h-4 text-[#e8622a] flex-shrink-0" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-semibold leading-tight">
            Your {year} recap is ready
          </p>
          <p className="text-white/60 text-xs mt-0.5">Tap to see your year in impact</p>
        </div>
        <ArrowRight className="w-4 h-4 text-white/70 flex-shrink-0" aria-hidden="true" />
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          className="flex-shrink-0 p-1 rounded-full text-white/50 hover:text-white hover:bg-white/10 transition"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </Link>
  );
}
