import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ArrowRight, Download, Share2, X, Sparkles, Loader2, Coins, Clock, Film } from "lucide-react";
import { useGetAnnualRecap, getGetAnnualRecapQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatNumber } from "@/lib/utils";
import {
  getRecapYear,
  markRecapViewed,
  getShowMoneyPref,
  setShowMoneyPref as persistShowMoney,
} from "@/lib/recap-utils";
import {
  buildRecapVideo,
  buildRecapPoster,
  isVideoExportSupported,
  type RecapVideoData,
} from "@/lib/recap-video";

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

async function loadLogoImage(): Promise<HTMLImageElement> {
  const res = await fetch(`${BASE_URL}/images/myimpact.png`);
  const blob = await res.blob();
  const dataUrl: string = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  return await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

type StepKind =
  | "intro"
  | "totalValue"
  | "totalHours"
  | "topSdg"
  | "topActivity"
  | "biggestSession"
  | "journalHighlight"
  | "shareCard";

interface StepDef {
  kind: StepKind;
  enabled: boolean;
}

function StepDots({ steps, current }: { steps: StepDef[]; current: number }) {
  return (
    <div style={{ display: "flex", gap: 6, padding: "12px 16px", justifyContent: "center" }}>
      {steps.map((_, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            maxWidth: 60,
            height: 3,
            borderRadius: 2,
            background: i <= current ? "#e8622a" : "rgba(255,255,255,0.2)",
            transition: "background 0.3s",
          }}
        />
      ))}
    </div>
  );
}

function StepShell({
  children,
  bg,
}: {
  children: React.ReactNode;
  bg?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -24 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 24px",
        textAlign: "center",
        background: bg ?? "transparent",
        color: "white",
      }}
    >
      {children}
    </motion.div>
  );
}

function StepLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontSize: 12,
        fontWeight: 800,
        letterSpacing: 2.5,
        textTransform: "uppercase",
        color: "rgba(255,255,255,0.55)",
        margin: 0,
        marginBottom: 16,
      }}
    >
      {children}
    </p>
  );
}

function HugeFigure({ children, color = "#ffffff" }: { children: React.ReactNode; color?: string }) {
  return (
    <p
      style={{
        fontSize: "clamp(56px, 14vw, 128px)",
        fontWeight: 900,
        color,
        margin: 0,
        lineHeight: 0.95,
        letterSpacing: -3,
        fontFamily: "'Outfit', 'Inter', sans-serif",
      }}
    >
      {children}
    </p>
  );
}

function StepCaption({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontSize: 18,
        color: "rgba(255,255,255,0.75)",
        margin: "20px auto 0",
        lineHeight: 1.5,
        maxWidth: 460,
        fontWeight: 500,
      }}
    >
      {children}
    </p>
  );
}

export default function AnnualRecap() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const { user, isLoggedIn, isLoading: authLoading } = useAuth();

  const yearFromQuery = useMemo(() => {
    const params = new URLSearchParams(search);
    const y = params.get("year");
    if (y) {
      const n = parseInt(y, 10);
      if (!isNaN(n)) return n;
    }
    return getRecapYear();
  }, [search]);

  const [showMoney, setShowMoneyState] = useState<boolean>(getShowMoneyPref());
  const setShowMoney = (v: boolean) => {
    setShowMoneyState(v);
    persistShowMoney(v);
  };

  const [stepIndex, setStepIndex] = useState(0);
  const [logoImage, setLogoImage] = useState<HTMLImageElement | null>(null);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const videoSupported = useMemo(() => isVideoExportSupported(), []);
  const { toast } = useToast();
  const lastVideoRef = useRef<{ blob: Blob; extension: string; posterBlob: Blob | null; year: number } | null>(null);

  const { data: recap, isLoading, isError, refetch } = useGetAnnualRecap(yearFromQuery, {
    query: { enabled: isLoggedIn, queryKey: getGetAnnualRecapQueryKey(yearFromQuery) },
  });

  useEffect(() => {
    loadLogoImage().then(setLogoImage).catch(() => {});
  }, []);

  useEffect(() => {
    if (recap) markRecapViewed(yearFromQuery);
  }, [recap, yearFromQuery]);

  const steps: StepDef[] = useMemo(() => {
    if (!recap) return [];
    const all: StepDef[] = [
      { kind: "intro", enabled: true },
      { kind: "totalValue", enabled: recap.hasEnoughActivity && showMoney },
      { kind: "totalHours", enabled: recap.totalHours > 0 },
      { kind: "topSdg", enabled: !!recap.topSdg },
      { kind: "topActivity", enabled: !!recap.topActivity },
      { kind: "biggestSession", enabled: !!recap.biggestSession && (recap.recordCount ?? 0) > 1 },
      { kind: "journalHighlight", enabled: !!recap.journalHighlight },
      { kind: "shareCard", enabled: true },
    ];
    return all.filter((s) => s.enabled);
  }, [recap, showMoney]);

  useEffect(() => {
    if (stepIndex >= steps.length && steps.length > 0) {
      setStepIndex(steps.length - 1);
    }
  }, [steps.length, stepIndex]);

  const advance = () => {
    if (stepIndex < steps.length - 1) setStepIndex((i) => i + 1);
  };
  const back = () => {
    if (stepIndex > 0) setStepIndex((i) => i - 1);
  };

  const close = () => {
    markRecapViewed(yearFromQuery);
    setLocation("/");
  };

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        advance();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        back();
      } else if (e.key === "Escape") {
        close();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex, steps.length]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center">
        <Sparkles className="w-10 h-10 mx-auto text-primary mb-4" />
        <h1 className="text-2xl font-display font-bold mb-2">Your year in impact</h1>
        <p className="text-muted-foreground mb-6">Log in or create an account to see your recap.</p>
        <Link
          href="/login"
          className="inline-flex items-center justify-center px-6 py-2.5 rounded-md bg-primary text-white text-sm font-semibold hover:bg-primary/90"
        >
          Log in
        </Link>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: "#1a2e3a", color: "white" }}>
        <Sparkles className="w-10 h-10 text-[#e8622a] mb-4 animate-pulse" />
        <p className="text-base text-white/70">Putting your year together…</p>
      </div>
    );
  }

  if (isError || !recap) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center" style={{ background: "#1a2e3a", color: "white" }}>
        <p className="text-base text-white/80 mb-4">Could not load your recap. Please try again.</p>
        <button onClick={() => refetch()} className="px-5 py-2 rounded-md bg-[#e8622a] text-white font-semibold">
          Try again
        </button>
      </div>
    );
  }

  // Empty story: not enough records
  if (!recap.hasEnoughActivity) {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: "#1a2e3a", color: "white" }}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <p className="text-sm font-bold tracking-widest text-white/60 uppercase">Your story so far</p>
          <button onClick={close} aria-label="Close" className="p-2 rounded-full hover:bg-white/10">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-12">
          <Sparkles className="w-12 h-12 text-[#e8622a] mb-6" />
          <h2 className="text-3xl sm:text-4xl font-display font-bold mb-3" style={{ letterSpacing: -1 }}>
            {recap.lifetimeRecordCount === 0 ? "Your story is just beginning" : "Not quite enough yet"}
          </h2>
          <p className="text-white/70 max-w-md mb-2 leading-relaxed">
            {recap.lifetimeRecordCount === 0
              ? `You haven't logged any activity in ${recap.year} yet. Start now and your ${recap.year} recap will be waiting.`
              : `You have ${recap.lifetimeRecordCount} record${recap.lifetimeRecordCount === 1 ? "" : "s"} so far — keep going to unlock a full annual recap.`}
          </p>
          {recap.firstRecordAt ? (
            <p className="text-white/40 text-sm mb-8">
              You joined My Impact on {new Date(recap.firstRecordAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}.
            </p>
          ) : null}
          <Link
            href="/wizard/actions"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-white font-semibold"
            style={{ background: "#e8622a" }}
          >
            Calculate my impact <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    );
  }

  const step = steps[stepIndex];

  const renderStep = () => {
    if (!step) return null;
    switch (step.kind) {
      case "intro":
        return (
          <StepShell>
            <p style={{ fontSize: 13, fontWeight: 800, letterSpacing: 3, textTransform: "uppercase", color: "#e8622a", margin: 0 }}>
              {recap.year} · Year in impact
            </p>
            <h1
              style={{
                fontSize: "clamp(38px, 8vw, 72px)",
                fontWeight: 900,
                color: "white",
                margin: "16px 0 12px",
                letterSpacing: -2,
                lineHeight: 1.05,
                fontFamily: "'Fraunces', 'Outfit', serif",
              }}
            >
              {user?.displayName ? `${user.displayName.split(" ")[0]}, here's` : "Here's"} <span style={{ color: "#e8622a", fontStyle: "italic" }}>your year</span>.
            </h1>
            <StepCaption>
              {recap.recordCount} record{recap.recordCount === 1 ? "" : "s"}, {formatNumber(recap.totalHours)} hours, and a whole lot of difference.
            </StepCaption>
            <p className="text-xs text-white/40 mt-10">Tap to begin → use ← → to navigate</p>
          </StepShell>
        );
      case "totalValue":
        return (
          <StepShell>
            <StepLabel>Total social value</StepLabel>
            <HugeFigure color="#e8622a">{formatCurrency(recap.totalValue)}</HugeFigure>
            <StepCaption>
              That's the value of every hour, every act, every donation you logged in {recap.year}.
            </StepCaption>
          </StepShell>
        );
      case "totalHours":
        return (
          <StepShell>
            <StepLabel>Hours given</StepLabel>
            <HugeFigure>
              {formatNumber(recap.totalHours)}
              <span style={{ fontSize: "0.45em", marginLeft: 12, color: "rgba(255,255,255,0.55)", fontWeight: 700 }}>hrs</span>
            </HugeFigure>
            <StepCaption>
              {recap.totalHours >= 100
                ? "That's an extraordinary amount of time given to others."
                : "Every hour adds up. Yours did this year."}
            </StepCaption>
          </StepShell>
        );
      case "topSdg": {
        const sdg = recap.topSdg!;
        return (
          <StepShell>
            <StepLabel>Your top UN goal</StepLabel>
            <p
              style={{
                fontSize: "clamp(36px, 7vw, 64px)",
                fontWeight: 900,
                color: sdg.sdgColor,
                margin: 0,
                lineHeight: 1.1,
                letterSpacing: -1.5,
                maxWidth: 820,
                fontFamily: "'Outfit', 'Inter', sans-serif",
              }}
            >
              {sdg.sdg}
            </p>
            <StepCaption>
              {showMoney
                ? <>You created <strong style={{ color: "white" }}>{formatCurrency(sdg.value)}</strong> of value contributing to this goal.</>
                : <>This was the goal you contributed to most.</>}
            </StepCaption>
          </StepShell>
        );
      }
      case "topActivity": {
        const a = recap.topActivity!;
        return (
          <StepShell>
            <StepLabel>Your standout activity</StepLabel>
            <p
              style={{
                fontSize: "clamp(34px, 6vw, 56px)",
                fontWeight: 900,
                color: "white",
                margin: 0,
                lineHeight: 1.15,
                letterSpacing: -1.5,
                maxWidth: 820,
                fontFamily: "'Outfit', 'Inter', sans-serif",
              }}
            >
              {a.activityName}
            </p>
            <StepCaption>
              {showMoney
                ? <><strong style={{ color: "#e8622a" }}>{formatCurrency(a.impactValue)}</strong> of value · {formatNumber(a.hours)} hours</>
                : <><strong style={{ color: "#e8622a" }}>{formatNumber(a.hours)} hours</strong> in {a.category.toLowerCase()}</>}
            </StepCaption>
          </StepShell>
        );
      }
      case "biggestSession": {
        const b = recap.biggestSession!;
        const dateLabel = new Date(b.createdAt).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
        return (
          <StepShell>
            <StepLabel>Biggest single record</StepLabel>
            <p
              style={{
                fontSize: "clamp(28px, 5vw, 48px)",
                fontWeight: 800,
                color: "white",
                margin: 0,
                lineHeight: 1.2,
                letterSpacing: -1,
                maxWidth: 760,
                fontFamily: "'Outfit', 'Inter', sans-serif",
              }}
            >
              {b.period ? b.period : b.name}
            </p>
            <p style={{ marginTop: 16, color: "rgba(255,255,255,0.55)", fontSize: 14 }}>{dateLabel}</p>
            {showMoney ? (
              <HugeFigure color="#e8622a">{formatCurrency(b.totalValue)}</HugeFigure>
            ) : (
              <HugeFigure>
                {formatNumber(b.totalHours)}
                <span style={{ fontSize: "0.45em", marginLeft: 12, color: "rgba(255,255,255,0.55)", fontWeight: 700 }}>hrs</span>
              </HugeFigure>
            )}
          </StepShell>
        );
      }
      case "journalHighlight": {
        const j = recap.journalHighlight!;
        const dateLabel = new Date(j.createdAt).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
        return (
          <StepShell>
            <StepLabel>In your own words</StepLabel>
            <p
              style={{
                fontSize: "clamp(20px, 3vw, 28px)",
                fontWeight: 500,
                color: "white",
                margin: 0,
                lineHeight: 1.5,
                maxWidth: 720,
                fontStyle: "italic",
                fontFamily: "'Fraunces', 'Outfit', serif",
              }}
            >
              "{j.text}"
            </p>
            <p style={{ marginTop: 24, color: "rgba(255,255,255,0.55)", fontSize: 14 }}>— Your journal · {dateLabel}</p>
          </StepShell>
        );
      }
      case "shareCard": {
        return (
          <StepShell>
            <StepLabel>Share your year</StepLabel>
            <div
              style={{
                width: "min(280px, 70vw)",
                aspectRatio: "9 / 16",
                borderRadius: 20,
                background: "linear-gradient(160deg, #1a2e3a 0%, #243b4a 60%, rgba(232,98,42,0.4) 140%)",
                border: "1px solid rgba(255,255,255,0.12)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginTop: 12,
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div
                aria-hidden="true"
                style={{
                  position: "absolute",
                  top: -40,
                  right: -40,
                  width: 180,
                  height: 180,
                  borderRadius: "50%",
                  background: "radial-gradient(circle, rgba(232,98,42,0.55) 0%, transparent 70%)",
                }}
              />
              <div style={{ textAlign: "center", padding: 24, zIndex: 1 }}>
                <Film size={36} color="#e8622a" style={{ margin: "0 auto 12px" }} />
                <p style={{ fontSize: 13, fontWeight: 800, letterSpacing: 2, textTransform: "uppercase", color: "rgba(255,255,255,0.6)", margin: 0 }}>
                  {recap.year} recap
                </p>
                <p style={{ fontSize: 18, fontWeight: 800, color: "white", marginTop: 6, lineHeight: 1.2 }}>
                  Your year, ready to share
                </p>
                <p style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: 8, lineHeight: 1.4 }}>
                  ~12s portrait video for Stories, WhatsApp & more
                </p>
              </div>
            </div>

            {generating ? (
              <div style={{ marginTop: 22, width: "min(320px, 80vw)" }}>
                <p className="text-sm text-white/80 mb-2 flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Generating your video…
                </p>
                <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.12)", overflow: "hidden" }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${Math.round(progress * 100)}%`,
                      background: "#e8622a",
                      transition: "width 0.15s linear",
                    }}
                  />
                </div>
                <p className="text-xs text-white/40 mt-2 text-center">Recording happens in real time — about 15 seconds.</p>
              </div>
            ) : !videoSupported ? (
              <div style={{ marginTop: 22, maxWidth: 340, textAlign: "center" }}>
                <p className="text-sm text-white/80">
                  Video sharing isn't supported on this browser — try Chrome or Safari.
                </p>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 12, marginTop: 22, flexWrap: "wrap", justifyContent: "center" }}>
                <button
                  onClick={handleShareVideo}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full font-semibold text-sm text-white"
                  style={{ background: "#e8622a" }}
                  data-testid="button-share-video"
                >
                  <Share2 size={16} /> Share video
                </button>
                <button
                  onClick={handleDownloadVideo}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full font-semibold text-sm text-white border border-white/20 hover:bg-white/10"
                  data-testid="button-download-video"
                >
                  <Download size={16} /> Download video
                </button>
              </div>
            )}
            <p className="text-xs text-white/40 mt-4">All caught up · close to return home</p>
          </StepShell>
        );
      }
      default:
        return null;
    }
  };

  function buildVideoData(): RecapVideoData {
    return {
      year: recap!.year,
      displayName: user?.displayName ?? null,
      showMoney,
      totalValue: recap!.totalValue,
      totalHours: recap!.totalHours,
      recordCount: recap!.recordCount,
      topSdg: recap!.topSdg
        ? { name: recap!.topSdg.sdg, color: recap!.topSdg.sdgColor }
        : null,
      topActivity: recap!.topActivity
        ? {
            name: recap!.topActivity.activityName,
            hours: recap!.topActivity.hours,
            value: recap!.topActivity.impactValue,
            category: recap!.topActivity.category,
          }
        : null,
      biggestRecord:
        recap!.biggestSession && (recap!.recordCount ?? 0) > 1
          ? {
              title: recap!.biggestSession.period || recap!.biggestSession.name,
              dateLabel: new Date(recap!.biggestSession.createdAt).toLocaleDateString("en-GB", {
                month: "long",
                year: "numeric",
              }),
              totalValue: recap!.biggestSession.totalValue,
              totalHours: recap!.biggestSession.totalHours,
            }
          : null,
      appUrl:
        typeof window !== "undefined"
          ? window.location.hostname.replace(/^www\./, "")
          : "myimpact.com",
      logoImage,
    };
  }

  function buildShareCaption(): string {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return showMoney
      ? `My ${recap!.year} on My Impact: ${formatCurrency(recap!.totalValue)} of social value across ${formatNumber(recap!.totalHours)} hours. ${origin}`
      : `My ${recap!.year} on My Impact: ${formatNumber(recap!.totalHours)} hours given. ${origin}`;
  }

  async function ensureVideo(): Promise<{ blob: Blob; extension: string; posterBlob: Blob | null } | null> {
    if (!recap) return null;
    if (
      lastVideoRef.current &&
      lastVideoRef.current.year === recap.year
    ) {
      return lastVideoRef.current;
    }
    setGenerating(true);
    setProgress(0);
    try {
      const data = buildVideoData();
      const result = await buildRecapVideo(data, {
        onProgress: (p) => setProgress(p),
      });
      let posterBlob: Blob | null = null;
      try {
        posterBlob = await buildRecapPoster(data);
      } catch (err) {
        console.warn("Poster generation failed", err);
      }
      lastVideoRef.current = { blob: result.blob, extension: result.extension, posterBlob, year: recap.year };
      return lastVideoRef.current;
    } catch (err) {
      console.error("Video generation failed", err);
      toast({
        title: "Couldn't make your video",
        description: "Please try again, or try a different browser.",
        variant: "destructive",
      });
      return null;
    } finally {
      setGenerating(false);
    }
  }

  // Re-generate next time if money toggle changes
  useEffect(() => {
    lastVideoRef.current = null;
  }, [showMoney]);

  function downloadBlob(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function handleDownloadVideo() {
    const v = await ensureVideo();
    if (!v) return;
    const year = recap?.year ?? "recap";
    downloadBlob(v.blob, `my-impact-${year}.${v.extension}`);
    if (v.posterBlob) {
      setTimeout(() => {
        downloadBlob(v.posterBlob!, `my-impact-${year}-poster.jpg`);
      }, 400);
    }
    toast({
      title: "Video saved",
      description: v.posterBlob
        ? "Saved your video and a matching poster image to Downloads."
        : "Find it in your Downloads folder.",
    });
  }

  async function handleShareVideo() {
    const v = await ensureVideo();
    if (!v || !recap) return;

    const fileName = `my-impact-${recap.year}.${v.extension}`;
    const fileType = v.blob.type || (v.extension === "mp4" ? "video/mp4" : "video/webm");
    const videoFile = new File([v.blob], fileName, { type: fileType });
    const posterFile = v.posterBlob
      ? new File([v.posterBlob], `my-impact-${recap.year}-poster.jpg`, { type: "image/jpeg" })
      : null;
    const shareText = buildShareCaption();
    const title = `My ${recap.year} in impact`;

    const canShare = (files: File[]) =>
      typeof navigator !== "undefined" &&
      typeof navigator.share === "function" &&
      typeof navigator.canShare === "function" &&
      navigator.canShare({ files });

    if (posterFile && canShare([videoFile, posterFile])) {
      try {
        await navigator.share({ files: [videoFile, posterFile], text: shareText, title });
        return;
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        // fall through to single-file share
      }
    }

    if (canShare([videoFile])) {
      try {
        await navigator.share({ files: [videoFile], text: shareText, title });
        return;
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        // fall through to download
      }
    }

    downloadBlob(v.blob, fileName);
    if (v.posterBlob) {
      setTimeout(() => {
        downloadBlob(v.posterBlob!, `my-impact-${recap.year}-poster.jpg`);
      }, 400);
    }
    toast({
      title: "Video downloaded",
      description: "Direct sharing isn't available here — find the video in Downloads and share it from there.",
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: "#1a2e3a", color: "white" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 sm:px-5 py-2.5 border-b border-white/10 flex-shrink-0">
        <p className="text-xs font-bold tracking-[0.2em] text-white/60 uppercase">
          {recap.year} recap
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowMoney(!showMoney)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-white/8 text-white/80 hover:bg-white/15 border border-white/10"
            title={showMoney ? "Showing £ values · click to hide" : "Showing hours only · click to show £"}
          >
            {showMoney ? <Coins size={12} /> : <Clock size={12} />}
            {showMoney ? "£ values" : "Hours only"}
          </button>
          <button
            onClick={close}
            aria-label="Close recap"
            className="p-1.5 rounded-full text-white/70 hover:bg-white/10 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <StepDots steps={steps} current={stepIndex} />

      {/* Tap zones (mobile) — disabled on share card step so controls remain clickable */}
      <div className="relative flex-1 flex flex-col">
        {step?.kind !== "shareCard" ? (
          <>
            <button
              onClick={back}
              aria-label="Previous"
              className="absolute left-0 top-0 bottom-0 w-1/3 z-10"
              style={{ background: "transparent" }}
            />
            <button
              onClick={advance}
              aria-label="Next"
              className="absolute right-0 top-0 bottom-0 w-2/3 z-10"
              style={{ background: "transparent" }}
            />
          </>
        ) : null}
        <AnimatePresence mode="wait">
          <div key={stepIndex} className="flex-1 flex relative" style={{ zIndex: 20 }}>
            {renderStep()}
          </div>
        </AnimatePresence>

        {/* Desktop arrows */}
        <div className="hidden sm:flex items-center justify-between px-6 pb-4 absolute bottom-0 left-0 right-0 z-20 pointer-events-none">
          <button
            onClick={back}
            disabled={stepIndex === 0}
            aria-label="Previous"
            className="pointer-events-auto p-3 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ArrowLeft size={18} />
          </button>
          <button
            onClick={advance}
            disabled={stepIndex >= steps.length - 1}
            aria-label="Next"
            className="pointer-events-auto p-3 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ArrowRight size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

