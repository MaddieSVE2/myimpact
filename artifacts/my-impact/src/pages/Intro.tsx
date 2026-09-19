import { SECTION_MAX_WIDTH } from "@/lib/layout";
import React, { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import { PageMeta } from "@/components/PageMeta";
import { HOME_META, FAQ_ITEMS, HOMEPAGE_JSON_LD } from "@/lib/page-metadata";
import { useWizard } from "@/lib/wizard-context";
import { useIsMobile } from "@/hooks/use-mobile";
import RecapBanner from "@/components/RecapBanner";
import CalendarHomeWidget from "@/components/CalendarHomeWidget";
import { useAuth } from "@/lib/auth-context";
import { QuickLog } from "@/components/QuickLog";
import { OrgPromptsSection } from "@/components/OrgPromptsSection";
import { ManagerHome } from "@/components/ManagerHome";
import { isInRecapWindow, isRecapViewed, getRecapYear } from "@/lib/recap-utils";
import { useListRecurringTemplates, getListRecurringTemplatesQueryKey } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { HOME_CATEGORY_ARTWORK } from "@/lib/branded-artwork";
import { BrandedArtwork } from "@/components/BrandedArtwork";
import { OrgMemberActionCards } from "@/components/OrgMemberActionCards";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface MyOrgResponse {
  org: {
    id: string;
    name: string;
    type: string;
    role: string;
    dataSharingMode: "explicit_submission" | "consented_logging";
  } | null;
}

interface ActiveSurveyLite {
  id: string;
  windowKey: string;
}

interface OrgChallengeLite {
  id: string;
  name: string;
}

interface PromptsResponseLite {
  inOrg: boolean;
  surveys: ActiveSurveyLite[];
  challenges: OrgChallengeLite[];
}

interface JournalEntryLite {
  id: string;
  type: string;
  reflectionText?: string;
  periodLabel?: string;
  createdAt: string;
}

interface JournalResponseLite {
  entries: JournalEntryLite[];
}

function firstNameFrom(displayName: string | null | undefined): string | null {
  const trimmed = displayName?.trim();
  if (!trimmed) return null;
  const first = trimmed.split(/\s+/)[0];
  return first || null;
}

const C = {
  dark: "var(--brand-dark)",
  orange: "var(--brand-orange)",
  olive: "var(--brand-olive)",
  slate: "var(--brand-slate)",
  lightBlue: "var(--brand-light-blue)",
  cream: "var(--brand-cream)",
  offBlack: "var(--brand-off-black)",
};

function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) setVisible(true); },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, visible] as const;
}

function FadeIn({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const [ref, visible] = useInView(0.1);
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(28px)",
        transition: `opacity 0.7s ease ${delay}s, transform 0.7s ease ${delay}s`,
        height: "100%",
      }}
    >
      {children}
    </div>
  );
}

function Counter({ end, prefix = "", suffix = "", duration = 1800 }: { end: number; prefix?: string; suffix?: string; duration?: number }) {
  const [ref, visible] = useInView(0.3);
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!visible) return;
    let start = 0;
    const step = end / (duration / 16);
    const timer = setInterval(() => {
      start += step;
      if (start >= end) { setCount(end); clearInterval(timer); }
      else setCount(Math.floor(start));
    }, 16);
    return () => clearInterval(timer);
  }, [visible, end, duration]);
  return <span ref={ref}>{prefix}{count.toLocaleString()}{suffix}</span>;
}

const TESTIMONIALS = [
  {
    name: "Aisha",
    age: "21, Glasgow",
    quote: "After uni I felt like my efforts weren't being seen. I was running a community art project but had no way to show what it was actually worth. MyImpact changed that. I could finally put a number on the pride, engagement, and connection we were creating.",
    value: "£4,230",
    what: "Community art project, 6 months",
    image: "community.webp",
  },
  {
    name: "Ben",
    age: "36, Hull",
    quote: "I'm not in work right now and people make assumptions. But I run a tech drop-in for older people every week. I'm reducing isolation, building digital skills, bringing people together. MyImpact shows that what I do has real, measurable worth.",
    value: "£7,860",
    what: "Weekly tech hub, 12 months",
    image: "digital-mentoring.webp",
  },
  {
    name: "Chloe",
    age: "17, Cardiff",
    quote: "Call me a NEET if you want. I call me someone who pulled 300kg of plastic out of a river. MyImpact tracked every hour, every kilo, and showed me the environmental and community value. That data got the council on board.",
    value: "£3,150",
    what: "River clean-up crew, 8 months",
    image: "litter-picking.webp",
  },
  {
    name: "Marcus",
    age: "38, Catterick",
    quote: "After 14 years in the infantry, I didn't know how to talk about what I'd done in a way civilians would get. My Impact's Sidekick helped me put it in plain language: not 'patrol commander' but 'led a team of 8 under operational pressure across 3 countries'. That reframe got me interviews I wasn't getting before.",
    value: "£11,240",
    what: "Forces leaver, 14 years' service",
    image: "veteran.webp",
  },
  {
    name: "Priya",
    age: "44, Bristol",
    quote: "Eight years out of the workforce, and every CV advice website told me to explain the gap. My Impact helped me reframe it entirely. I wasn't absent. I was coordinating care for two children and an elderly parent across multiple health and education systems. That's a full-time job. Now my CV says so.",
    value: "£9,610",
    what: "Career break returner, 8 years",
    image: "caring.webp",
  },
];

function TestimonialCard({ s }: { s: typeof TESTIMONIALS[0] }) {
  return (
    <div style={{
      borderRadius: 20, overflow: "hidden", border: "1px solid rgba(0,0,0,0.07)",
      display: "flex", flexDirection: "column", height: "100%",
    }}>
      <div
        aria-hidden="true"
        style={{
          height: 156,
          background: C.cream,
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
          overflow: "hidden",
          flexShrink: 0,
        }}
      >
        <img
          src={`${import.meta.env.BASE_URL}images/social-value/${s.image}`}
          alt=""
          loading="lazy"
          style={{ width: 154, height: 154, objectFit: "contain", display: "block" }}
        />
      </div>
      <div style={{ padding: "24px 24px 16px", flex: 1 }}>
        <p style={{ fontFamily: "'Outfit', sans-serif", fontSize: 18, fontWeight: 700, color: C.dark, margin: 0 }}>{s.name}</p>
        <p style={{ fontSize: 12, color: "var(--brand-orange-text)", fontWeight: 600, marginTop: 2, marginBottom: 0 }}>{s.age}</p>
        <p style={{ fontSize: 14, color: "var(--brand-muted-text)", lineHeight: 1.65, marginTop: 10, fontStyle: "italic", marginBottom: 0 }}>"{s.quote}"</p>
      </div>
      <div style={{ padding: "12px 24px", background: C.cream, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
        <p style={{ fontFamily: "'Outfit', sans-serif", fontSize: 24, fontWeight: 900, color: C.orange, margin: 0 }}>{s.value}</p>
        <p style={{ fontSize: 12, color: "var(--brand-subtle-text)", textAlign: "right", maxWidth: 130, lineHeight: 1.4, margin: 0 }}>{s.what}</p>
      </div>
    </div>
  );
}

const SVE_LINK = (
  <a
    href="https://www.socialvalueengine.com"
    target="_blank"
    rel="noopener noreferrer"
    style={{ color: "var(--brand-orange)", textDecoration: "underline", textUnderlineOffset: 3 }}
  >
    Social Value Engine
  </a>
);

type RichFAQItem = { q: string; a: string; aNode?: React.ReactNode };

const RICH_FAQ_ITEMS: RichFAQItem[] = FAQ_ITEMS.map((item, i) => {
  if (i === 1) {
    return {
      ...item,
      aNode: <>We use the {SVE_LINK}, accredited by Social Value International, combined with the SROI framework. Each activity is matched to a peer-reviewed monetary value across four pillars: activity impact, time contributed, donations, and personal growth. Every value is sourced from peer-reviewed research and UK-specific datasets.</>,
    };
  }
  if (i === 4) {
    return {
      ...item,
      aNode: <>The {SVE_LINK} (SVE) is accredited by Social Value International and used across public, private, education, housing, charity, and voluntary-sector organisations. My Impact uses SVE proxy values so every monetary figure is grounded in evidence-based, peer-reviewed research aligned with HM Treasury Green Book methodology.</>,
    };
  }
  return item;
});

function HomeFAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {RICH_FAQ_ITEMS.map((item, i) => {
        const isOpen = openIndex === i;
        return (
          <div
            key={i}
            style={{
              background: "white",
              borderRadius: 12,
              border: `1px solid ${isOpen ? "rgba(232,99,58,0.3)" : "rgba(0,0,0,0.07)"}`,
              overflow: "hidden",
              transition: "border-color 0.2s",
            }}
          >
            <button
              type="button"
              aria-expanded={isOpen}
              aria-controls={`faq-answer-${i}`}
              id={`faq-question-${i}`}
              onClick={() => setOpenIndex(isOpen ? null : i)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 16,
                padding: "18px 20px",
                background: "transparent",
                border: "none",
                textAlign: "left",
                cursor: "pointer",
                color: "var(--brand-dark)",
              }}
            >
              <span style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.35, fontFamily: "'Outfit', sans-serif" }}>
                {item.q}
              </span>
              <ChevronDown
                aria-hidden="true"
                style={{
                  flexShrink: 0,
                  width: 18,
                  height: 18,
                  color: "var(--brand-orange)",
                  transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                  transition: "transform 0.25s",
                }}
              />
            </button>
            {isOpen && (
              <div
                id={`faq-answer-${i}`}
                role="region"
                aria-labelledby={`faq-question-${i}`}
                style={{
                  padding: "0 20px 18px",
                  fontSize: 15,
                  color: "var(--brand-muted-text)",
                  lineHeight: 1.7,
                }}
              >
                {item.aNode ?? item.a}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TestimonialsCarousel() {
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);
  const n = TESTIMONIALS.length;
  const isMobile = useIsMobile();

  const go = (dir: 1 | -1) => setCurrent(c => (c + dir + n) % n);

  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => go(1), 5500);
    return () => clearInterval(t);
  }, [paused]);

  // Compute each card's offset from the center, normalised to [-floor(n/2), floor(n/2)]
  const getOffset = (i: number): number => {
    let off = ((i - current) % n + n) % n;
    if (off > Math.floor(n / 2)) off -= n;
    return off;
  };

  const arrowStyle: React.CSSProperties = {
    position: "absolute", top: "50%", transform: "translateY(-50%)",
    zIndex: 10, width: 36, height: 36, borderRadius: "50%",
    border: "1.5px solid rgba(0,0,0,0.13)", background: "white",
    display: "flex", alignItems: "center", justifyContent: "center",
    cursor: "pointer", color: C.dark, boxShadow: "0 1px 6px rgba(0,0,0,0.10)",
    transition: "background 0.18s",
  };

  // On mobile: full-width single card; on desktop: 33.33% three-column layout
  const cardWidth = isMobile ? "100%" : "33.33%";
  const cardLeft  = isMobile ? "0%"   : "33.33%";

  return (
    <div
      style={{ position: "relative" }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Overflow clip, cards slide individually, not as a group */}
      <div style={{ position: "relative", overflow: "hidden" }}>
        {/* Phantom centre card, establishes container height, never seen */}
        <div
          style={{
            visibility: "hidden",
            width: cardWidth,
            margin: isMobile ? "0" : "0 33.33%",
            pointerEvents: "none",
          }}
          aria-hidden="true"
        >
          <TestimonialCard s={TESTIMONIALS[current]} />
        </div>

        {/* Each card has a stable key = its data index.
            It animates its own x/opacity when current changes. */}
        {TESTIMONIALS.map((s, i) => {
          const offset = getOffset(i);
          const isCenter = offset === 0;
          const isSide   = Math.abs(offset) === 1;

          // On mobile: hide all non-center cards completely.
          // Side cards are dimmed with filter (not opacity) so axe's
          // color-contrast check reads the real text colors; they are
          // decorative previews and marked aria-hidden below.
          const opacity = isCenter ? 1 : isMobile || !isSide ? 0 : 1;
          const filter = isSide && !isMobile ? "opacity(0.28)" : "opacity(1)";

          return (
            <motion.div
              key={i}
              aria-hidden={!isCenter}
              animate={{
                x: `${offset * 100}%`,
                opacity,
                filter,
              }}
              transition={{ duration: 0.42, ease: [0.4, 0, 0.2, 1] }}
              onClick={() => {
                if (!isMobile) {
                  if (offset === 1) go(1);
                  if (offset === -1) go(-1);
                }
              }}
              style={{
                position: "absolute", top: 0, height: "100%",
                left: cardLeft, width: cardWidth,
                cursor: !isMobile && isSide ? "pointer" : "default",
                pointerEvents: isMobile && !isCenter ? "none" : "auto",
              }}
            >
              <TestimonialCard s={s} />
            </motion.div>
          );
        })}
      </div>

      {/* Arrows */}
      <button
        onClick={() => go(-1)} aria-label="Previous"
        style={{ ...arrowStyle, left: -18 }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = C.cream; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "white"; }}
      >
        <ChevronLeft size={17} />
      </button>
      <button
        onClick={() => go(1)} aria-label="Next"
        style={{ ...arrowStyle, right: -18 }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = C.cream; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "white"; }}
      >
        <ChevronRight size={17} />
      </button>

      {/* Dot indicators */}
      <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 20 }}>
        {TESTIMONIALS.map((_, i) => (
          <button
            key={i}
            onClick={() => setCurrent(i)}
            aria-label={`Go to story ${i + 1}`}
            style={{
              width: i === current ? 38 : 24, height: 24,
              border: "none", padding: 0, cursor: "pointer",
              background: "transparent",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.3s",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: i === current ? 20 : 6, height: 6, borderRadius: 3,
                background: i === current ? C.orange : "rgba(0,0,0,0.15)",
                transition: "all 0.3s",
              }}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Intro() {
  const { interests, situations } = useWizard();
  const { isLoggedIn, isLoading: authLoading, user } = useAuth();
  const isVeteran = situations.includes('armed_forces') || interests.includes('military');

  const showRecapBanner =
    isLoggedIn && isInRecapWindow() && !isRecapViewed(getRecapYear());

  const templatesQuery = useListRecurringTemplates({
    query: { enabled: isLoggedIn, queryKey: getListRecurringTemplatesQueryKey() },
  });
  const hasQuickLogContent =
    isLoggedIn && (templatesQuery.data?.templates?.length ?? 0) > 0;

  const myOrgQuery = useQuery<MyOrgResponse>({
    queryKey: ["my-org"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/org/my`, { credentials: "include" });
      if (!res.ok) return { org: null };
      return res.json();
    },
    enabled: isLoggedIn,
    retry: false,
  });

  const orgRole = myOrgQuery.data?.org?.role;
  const isOrgMember = !!myOrgQuery.data?.org && orgRole !== "manager";
  const isOrgManager = !!myOrgQuery.data?.org && orgRole === "manager";

  const orgPromptsQuery = useQuery<PromptsResponseLite>({
    queryKey: ["org-prompts"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/org/prompts`, { credentials: "include" });
      if (!res.ok) return { inOrg: false, surveys: [], challenges: [] };
      return res.json();
    },
    enabled: isLoggedIn && isOrgMember,
    retry: false,
  });

  const activeSurveys = orgPromptsQuery.data?.surveys ?? [];
  const activeChallenges = orgPromptsQuery.data?.challenges ?? [];
  const hasActivePulse = isOrgMember && activeSurveys.length > 0;
  const challengeHref = `/challenges`;

  // While auth is resolving, or, for a logged-in user, while we're still
  // checking whether they belong to an org, render a neutral placeholder so
  // we never flash the marketing hero or briefly show the wrong CTA set.
  const heroResolving =
    authLoading || (isLoggedIn && myOrgQuery.isLoading);

  const firstName = firstNameFrom(user?.displayName);

  // Pick up where you left off: surface the user's most recent activity card
  // that's still missing a reflection ("draft"), so they can continue it.
  const journalQuery = useQuery<JournalResponseLite>({
    queryKey: ["journal-recent"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/journal`, { credentials: "include" });
      if (!res.ok) return { entries: [] };
      return res.json();
    },
    enabled: isLoggedIn,
    retry: false,
  });

  const draftEntry = (journalQuery.data?.entries ?? [])
    .find(e => e.type === "activity" && !(e.reflectionText && e.reflectionText.trim().length > 0));

  const overdueTemplate = (templatesQuery.data?.templates ?? []).find(t => t.isDue);

  // When the home page is opened with a hash (e.g. /#org-prompts-section
  // from the org-member top nav), scroll the matching section into view
  // once it's actually rendered. Wouter doesn't do this for us.
  useEffect(() => {
    const hash = typeof window !== "undefined" ? window.location.hash.replace(/^#/, "") : "";
    if (!hash) return;
    let attempts = 0;
    const tryScroll = () => {
      const el = document.getElementById(hash);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      attempts += 1;
      if (attempts < 20) setTimeout(tryScroll, 120);
    };
    tryScroll();
  }, [isLoggedIn, isOrgMember, hasActivePulse]);

  // Priority of personalised primary CTA: overdue regular activity beats
  // a draft reflection beats the generic "Calculate" call-to-action.
  type PersonalCta =
    | { kind: "overdue"; label: string; href: string; testId: string; onClick?: (e: React.MouseEvent) => void }
    | { kind: "draft"; label: string; href: string; testId: string }
    | null;

  let personalCta: PersonalCta = null;
  if (overdueTemplate) {
    personalCta = {
      kind: "overdue",
      label: `Log ${overdueTemplate.label} →`,
      href: "#quick-log-section",
      testId: "welcome-cta-log-overdue",
      onClick: (e) => {
        const target = document.getElementById("quick-log-section");
        if (target) {
          e.preventDefault();
          target.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      },
    };
  } else if (draftEntry) {
    const periodLabel = draftEntry.periodLabel?.trim();
    personalCta = {
      kind: "draft",
      label: periodLabel ? `Continue your journal draft: ${periodLabel} →` : "Continue your journal draft →",
      href: `/journal#entry-${draftEntry.id}`,
      testId: "welcome-cta-continue-draft",
    };
  }

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", color: "var(--brand-dark)", overflowX: "hidden" }}>
      <PageMeta
        title={HOME_META.title}
        description={HOME_META.description}
        canonical={HOME_META.canonical}
        jsonLd={HOMEPAGE_JSON_LD}
      />
      {/* ── CALENDAR UPCOMING + POST-EVENT PROMPTS (logged-in only) ── */}
      {isLoggedIn ? <CalendarHomeWidget /> : null}
      {/* ── ANNUAL RECAP DISCOVERY ── */}
      {showRecapBanner && !isOrgManager && <RecapBanner variant="hero" />}
      {/* ── HERO ──
          Logged-out: marketing pitch as before.
          Logged-in: personalised welcome + quick CTAs in the same vertical slot.
          While auth is still loading, render a neutral placeholder so we don't
          flash the marketing hero to a logged-in user. */}
      {heroResolving ? (
        <section className="mi-hero" aria-hidden="true" />
      ) : isLoggedIn && isOrgManager && myOrgQuery.data?.org ? (
        <ManagerHome
          orgId={myOrgQuery.data.org.id}
          orgName={myOrgQuery.data.org.name}
          firstName={firstName}
        />
      ) : isLoggedIn ? (
        <section className="mi-hero" data-testid="welcome-home">
          <div style={{
            position: "absolute", top: 0, right: 0, bottom: 0,
            width: "55%", zIndex: 1, pointerEvents: "none",
            maskImage: "linear-gradient(to right, transparent 0%, rgba(0,0,0,0.4) 30%, rgba(0,0,0,0.7) 100%)",
            WebkitMaskImage: "linear-gradient(to right, transparent 0%, rgba(0,0,0,0.4) 30%, rgba(0,0,0,0.7) 100%)",
          }}>
            <img
              src={`${import.meta.env.BASE_URL}images/faces.png`}
              alt=""
              aria-hidden="true"
              style={{
                width: "100%", height: "100%",
                objectFit: "cover", objectPosition: "center top",
                opacity: 0.10,
                mixBlendMode: "luminosity",
              }}
            />
          </div>

          <div className="mi-hero-inner" style={{ position: "relative", zIndex: 2, maxWidth: SECTION_MAX_WIDTH }}>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.13)",
              backdropFilter: "blur(8px)",
              padding: "8px 18px", borderRadius: 100,
              color: "rgba(255,255,255,0.8)", fontSize: 12, fontWeight: 700,
              letterSpacing: 1.5, textTransform: "uppercase" as const,
              marginBottom: 28,
            }}>
              <span className="mi-dot" /> {isOrgMember && myOrgQuery.data?.org ? myOrgQuery.data.org.name : "My Impact"}
            </div>

            <h1
              className="mi-fraunces"
              data-testid="welcome-heading"
              style={{
                fontSize: "clamp(42px, 7vw, 78px)",
                fontWeight: 900, color: "white",
                lineHeight: 1.05, marginBottom: 16, letterSpacing: -2,
              }}
            >
              Welcome back{firstName ? `, ` : ""}
              {firstName && (
                <span style={{ color: C.orange, fontStyle: "italic" }}>{firstName}</span>
              )}
              <span>.</span>
            </h1>

            <p style={{ fontSize: "clamp(17px, 2vw, 20px)", color: "rgba(255,255,255,0.65)", lineHeight: 1.65, maxWidth: 560, marginBottom: 32 }}>
              Pick up where you left off, or jump straight into something new.
            </p>

            {isOrgMember && (
              <p
                data-testid="welcome-org-pointer"
                style={{ fontSize: 14, color: "rgba(255,255,255,0.6)", margin: "0 0 18px 0", maxWidth: 520, lineHeight: 1.5 }}
              >
                Your four jobs from {myOrgQuery.data?.org?.name ?? "your organisation"} are in the panel below: share volunteering, open a pulse, join a challenge, or update your impact.
              </p>
            )}

            <div
              data-testid="welcome-individual-ctas"
              style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}
            >
              <Link
                href="/log?from=%2F"
                className="mi-btn-hero"
                data-testid="welcome-cta-quick-log"
              >
                Log an activity →
              </Link>
              {personalCta && (
                personalCta.kind === "overdue" ? (
                  <a
                    href={personalCta.href}
                    className={isOrgMember ? "mi-btn-ghost-hero" : "mi-btn-hero"}
                    data-testid={personalCta.testId}
                    onClick={personalCta.onClick}
                  >
                    {personalCta.label}
                  </a>
                ) : (
                  <Link
                    href={personalCta.href}
                    className="mi-btn-ghost-hero"
                    data-testid={personalCta.testId}
                  >
                    {personalCta.label}
                  </Link>
                )
              )}
              <Link
                href="/wizard/actions"
                className="mi-btn-ghost-hero"
                data-testid="welcome-cta-calculate"
              >
                Calculate my impact →
              </Link>
              <Link
                href="/journal"
                className="mi-btn-ghost-hero"
                data-testid="welcome-cta-journal"
              >
                View my journal
              </Link>
              <Link
                href="/suggestions"
                className="mi-btn-ghost-hero"
                data-testid="welcome-cta-inspire"
              >
                Give me ideas
              </Link>
            </div>
          </div>
        </section>
      ) : (
      <section className="mi-hero">
        {/* Faces image, blended into right side of hero */}
        <div style={{
          position: "absolute", top: 0, right: 0, bottom: 0,
          width: "55%", zIndex: 1, pointerEvents: "none",
          maskImage: "linear-gradient(to right, transparent 0%, rgba(0,0,0,0.4) 30%, rgba(0,0,0,0.7) 100%)",
          WebkitMaskImage: "linear-gradient(to right, transparent 0%, rgba(0,0,0,0.4) 30%, rgba(0,0,0,0.7) 100%)",
        }}>
          <img
            src={`${import.meta.env.BASE_URL}images/faces.png`}
            alt=""
            aria-hidden="true"
            style={{
              width: "100%", height: "100%",
              objectFit: "cover", objectPosition: "center top",
              opacity: 0.10,
              mixBlendMode: "luminosity",
            }}
          />
        </div>

        <div className="mi-hero-inner" style={{ position: "relative", zIndex: 2, maxWidth: SECTION_MAX_WIDTH }}>
          <h1
            className="mi-fraunces"
            style={{
              fontSize: "clamp(42px, 7vw, 78px)",
              fontWeight: 900, color: "white",
              lineHeight: 1.05, marginBottom: 16, letterSpacing: -2,
            }}
          >
            You already make a difference.<br />
            Now{" "}
            <span style={{ color: C.orange, fontStyle: "italic" }}>prove it.</span>
          </h1>

          <p style={{ fontSize: "clamp(17px, 2vw, 20px)", color: "rgba(255,255,255,0.65)", lineHeight: 1.65, maxWidth: 560, marginBottom: 40 }}>
            Every time you volunteer, help someone, or show up for your community, you create{" "}
            <strong style={{ color: "rgba(255,255,255,0.9)" }}>real social value</strong>. My Impact calculates what that's worth, in pounds, so you can finally see the difference you make.
          </p>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center" }}>
            <Link href="/wizard/actions" className="mi-btn-hero">
              Calculate my impact →
            </Link>
            <Link
              href="/suggestions"
              className="mi-btn-ghost-hero"
            >
              Give me ideas
            </Link>
          </div>
          <p style={{ marginTop: 20, fontSize: 13, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>
            Measuring the impact of a group or programme?{" "}
            <Link
              href="/organisations"
              style={{ color: "rgba(255,255,255,0.75)", textDecoration: "underline", textUnderlineOffset: 3 }}
            >
              See the organisation dashboard →
            </Link>
          </p>
        </div>


      </section>
      )}
      {/* ── YOUR ORGANISATION: unified 4-job panel (members only) ──
          Mirrors the /org member view so the four key jobs are obvious
          on the home page too. Order matches /org: Share, Pulse,
          Challenges, Calculate/update. Hidden for managers and
          non-members. */}
      {isLoggedIn && isOrgMember && myOrgQuery.data?.org && (
        <section
          data-testid="home-org-jobs"
          style={{ background: C.cream, padding: "48px 5%" }}
        >
          <div style={{ maxWidth: SECTION_MAX_WIDTH, margin: "0 auto" }}>
            <h2
              className="mi-fraunces"
              style={{ fontSize: "clamp(22px, 3vw, 28px)", fontWeight: 700, color: "#0E1922", marginBottom: 8 }}
            >
              Your organisation
            </h2>
            <p style={{ fontSize: 14, color: "#5b6770", lineHeight: 1.6, marginBottom: 28, maxWidth: 720 }}>
              You're a member of <strong style={{ color: "#0E1922" }}>{myOrgQuery.data.org.name}</strong>. Record your activity for yourself first, then share it with your organisation when prompted or through your agreed automatic-sharing settings.
            </p>
            <OrgMemberActionCards
              orgName={myOrgQuery.data.org.name}
              sharingMode={myOrgQuery.data.org.dataSharingMode}
              pulseCount={activeSurveys.length}
              challengeCount={activeChallenges.length}
              pulseHref="#org-prompts-section"
              challengeHref={challengeHref}
              testIdPrefix="home"
              onPulseClick={(event) => {
                const target = document.getElementById("org-prompts-section");
                if (target) {
                  event.preventDefault();
                  target.scrollIntoView({ behavior: "smooth", block: "start" });
                }
              }}
            />
          </div>
        </section>
      )}
      {/* ── FOR YOUR ORGANISATION (member-only prompts) ──
          OrgPromptsSection renders nothing (no DOM, no wrapper) for
          non-members, managers, and members with no open prompts, so
          there is no layout impact for those users. */}
      {isLoggedIn && (
        <div id="org-prompts-section">
          <OrgPromptsSection variant="full" />
        </div>
      )}
      {/* ── QUICK LOG (logged-in users with active recurring templates only,
          hidden for org managers since their home is org-focused) ── */}
      {hasQuickLogContent && !isOrgManager && (
        <section id="quick-log-section" style={{ background: "white", padding: "32px 5% 0", scrollMarginTop: 80 }}>
          <div style={{ maxWidth: 720, margin: "0 auto" }}>
            <QuickLog showManageLink />
          </div>
        </section>
      )}
      {!isLoggedIn && !authLoading && (
      <>
      {/* ── GDP STATEMENT ── */}
      <section style={{ background: C.cream, padding: "clamp(28px, 4vw, 48px) 5% clamp(60px, 10vw, 120px)" }}>
        <FadeIn>
          <div style={{ maxWidth: SECTION_MAX_WIDTH, margin: "0 auto" }}>
            <p style={{ fontSize: "clamp(28px, 4.5vw, 52px)", fontWeight: 700, color: C.dark, lineHeight: 1.2, marginBottom: 24, letterSpacing: -1, fontFamily: "'Outfit', sans-serif" }}>
              Your worth isn't measured in{" "}
              <span style={{ color: C.orange, fontStyle: "italic" }}>GDP.</span>
            </p>
            <p style={{ fontSize: 18, color: "var(--brand-muted-text)", lineHeight: 1.75, maxWidth: 680 }}>
              The economy doesn't count the hours you spend mentoring someone, looking after a relative, picking litter off a riverbank, or running a community group. But that work matters. It holds communities together. And until now, there's been no way for you to see what it's actually worth. We built My Impact to change that.
            </p>
          </div>
        </FadeIn>
      </section>
      {/* ── WHAT COUNTS ── */}
      <section id="how" style={{ background: "white", padding: "clamp(60px, 10vw, 120px) 5%" }}>
        <div style={{ maxWidth: SECTION_MAX_WIDTH, margin: "0 auto" }}>
          <FadeIn>
            <p className="mi-section-label">What counts</p>
            <h2 className="mi-section-title" style={{ marginTop: 0 }}>If it helps people or planet, it counts.</h2>
          </FadeIn>
          <div className="mi-counts-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20, alignItems: "stretch" }}>
            {[
              { icon: "🤝", artwork: HOME_CATEGORY_ARTWORK.volunteering, bg: "var(--brand-light-blue-chip)", title: "Volunteering", desc: "Giving your time to a charity, club, food bank, or community project." },
              { icon: "💚", artwork: HOME_CATEGORY_ARTWORK.caring, bg: "var(--brand-olive-chip)", title: "Caring", desc: "Looking after a family member, supporting a friend through a tough time, or mentoring someone younger." },
              { icon: "🌱", artwork: HOME_CATEGORY_ARTWORK.environment, bg: "var(--brand-olive-chip)", title: "Environment", desc: "Litter picks, tree planting, cycling instead of driving, reducing waste." },
              { icon: "🏘️", artwork: HOME_CATEGORY_ARTWORK.community, bg: "var(--brand-orange-chip)", title: "Community", desc: "Organising events, running a club, being a good neighbour, showing up for your area." },
              { icon: "📢", artwork: HOME_CATEGORY_ARTWORK.campaigning, bg: "var(--brand-light-blue-chip)", title: "Campaigning", desc: "Raising awareness, standing up for what matters, driving change on issues you care about." },
              { icon: "🎓", artwork: HOME_CATEGORY_ARTWORK.peerSupport, bg: "var(--brand-orange-chip)", title: "Peer support", desc: "Helping others learn, tutoring, leading a study group, sharing skills, supporting someone's wellbeing." },
            ].map((c, i) => (
              <FadeIn key={c.title} delay={i * 0.08}>
                <div className="mi-count-card">
                  <div style={{ width: 68, height: 68, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, marginBottom: 14 }}>
                    <BrandedArtwork
                      file={c.artwork}
                      fallback={c.icon}
                      className="w-16 h-16 flex items-center justify-center"
                      imageClassName="w-full h-full object-contain"
                    />
                  </div>
                  <h3 style={{ fontSize: 18, fontWeight: 700, color: C.dark, marginBottom: 8, fontFamily: "'Outfit', sans-serif" }}>{c.title}</h3>
                  <p style={{ fontSize: 15, color: "var(--brand-subtle-text)", lineHeight: 1.6 }}>{c.desc}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>
      {/* ── PROOF IN NUMBERS ── */}
      <section style={{ background: C.dark, padding: "clamp(60px, 10vw, 120px) 5%" }}>
        <div style={{ maxWidth: SECTION_MAX_WIDTH, margin: "0 auto" }}>
          <FadeIn>
            <div style={{ textAlign: "center", marginBottom: 56 }}>
              <p className="mi-section-label" style={{ color: C.orange }}>The difference we make</p>
              <h2 style={{ fontSize: "clamp(26px, 4vw, 40px)", color: "white", fontWeight: 700, letterSpacing: -1, fontFamily: "'Outfit', sans-serif" }}>
                It adds up faster than you think.
              </h2>
            </div>
          </FadeIn>
          <div
            className="mi-proof-grid"
            style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 32, textAlign: "center" }}
          >
            {[
              { prefix: "£", end: 24.69, suffix: "bn", label: "Estimated economic and social impact of formal volunteering in England in 2021/22" },
              { prefix: "", end: 12, suffix: "m", label: "People in England who formally volunteered at least once in 2021/22" },
              { prefix: "£", end: 2012, suffix: "", label: "Average estimated economic and social impact per formal volunteer" },
            ].map((s, i) => (
              <FadeIn key={i} delay={i * 0.12}>
                <div>
                  <div style={{ fontSize: "clamp(40px, 5.5vw, 68px)", fontWeight: 900, color: C.orange, letterSpacing: -2, fontFamily: "'Outfit', sans-serif" }}>
                    <Counter prefix={s.prefix} end={s.end} suffix={s.suffix} />
                  </div>
                  <p style={{ fontSize: 15, color: "rgba(255,255,255,0.5)", marginTop: 10, lineHeight: 1.5, maxWidth: 220, margin: "10px auto 0" }}>{s.label}</p>
                </div>
              </FadeIn>
            ))}
          </div>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.62)", lineHeight: 1.6, margin: "32px auto 0", maxWidth: 680, textAlign: "center" }}>
            Source:{" "}
            <a
              href="https://www.gov.uk/government/publications/estimating-the-economic-and-social-value-of-volunteering/estimating-the-economic-and-social-value-of-volunteering"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "rgba(255,255,255,0.9)", textDecoration: "underline", textUnderlineOffset: 2 }}
            >
              Department for Culture, Media and Sport, Estimating the economic and social value of volunteering
            </a>
            . Estimates cover adult formal volunteering in England, 2021/22.
          </p>
        </div>
      </section>
      {/* ── STORIES ── */}
      <section id="stories" style={{ background: "white", padding: "clamp(60px, 10vw, 120px) 5%" }}>
        <div style={{ maxWidth: SECTION_MAX_WIDTH, margin: "0 auto" }}>
          <FadeIn>
            <p className="mi-section-label">Illustrative examples</p>
            <p className="mi-section-title">What does social value look like?</p>
            <p style={{ fontSize: 14, color: "var(--brand-muted-text)", lineHeight: 1.6, marginTop: 4, marginBottom: 12, maxWidth: 620 }}>
              These examples are illustrative and show the kinds of contributions people make. Values are calculated using our standard SROI methodology. They are not verified testimonials.
            </p>
          </FadeIn>
          <div style={{ paddingBottom: 40 }}>
            <TestimonialsCarousel />
          </div>
        </div>
      </section>
      {/* ── CV / PROOF ── */}
      <section style={{ background: "white", padding: "clamp(60px, 10vw, 100px) 5%" }}>
        <div className="mi-cv-grid" style={{ maxWidth: SECTION_MAX_WIDTH, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 60, alignItems: "center" }}>
          <FadeIn>
            <div>
              <h2 style={{ fontSize: "clamp(26px, 4vw, 38px)", fontWeight: 700, color: C.dark, letterSpacing: -1, marginBottom: 20, lineHeight: 1.15, fontFamily: "'Outfit', sans-serif" }}>
                Turn your contribution into evidence.
              </h2>
              <p style={{ fontSize: 17, color: "var(--brand-muted-text)", lineHeight: 1.7, marginBottom: 16 }}>
                Employers want evidence. Funders want outcomes. Commissioners want data. My Impact gives you a documented, quantified record of the difference you make — built on peer-reviewed social value methodology.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 10, marginTop: 28 }}>
                {[
                  { label: "CVs and job applications", bg: "var(--brand-orange-chip)", color: C.orange },
                  { label: "Funding bids", bg: "var(--brand-olive-chip)", color: C.dark },
                  ...(!isVeteran ? [{ label: "UCAS & DofE", bg: "var(--brand-light-blue-chip)", color: C.dark }] : []),
                  { label: "Annual reports", bg: "var(--brand-orange-chip)", color: C.orange },
                  { label: "Social media", bg: "var(--brand-olive-chip)", color: C.dark },
                ].map(t => (
                  <span key={t.label} style={{ padding: "7px 16px", borderRadius: 100, fontSize: 13, fontWeight: 600, background: t.bg, color: t.color }}>
                    {t.label}
                  </span>
                ))}
              </div>
            </div>
          </FadeIn>

          <FadeIn delay={0.15}>
            <div style={{ background: C.cream, borderRadius: 20, padding: "36px 32px", border: "1px solid rgba(0,0,0,0.04)" }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: "var(--brand-orange-text)", letterSpacing: 1.5, textTransform: "uppercase" as const, marginBottom: 20 }}>Sample Impact Card</p>
              <p style={{ fontSize: 24, fontWeight: 800, color: C.dark, marginBottom: 4, fontFamily: "'Outfit', sans-serif" }}>Chloe M.</p>
              <p style={{ fontSize: 14, color: "var(--brand-subtle-text)", marginBottom: 20 }}>Sept 2025 – Apr 2026</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div style={{ background: "white", borderRadius: 12, padding: "16px 18px" }}>
                  <p style={{ fontSize: 13, color: "var(--brand-subtle-text)", marginBottom: 4 }}>Total social value</p>
                  <p style={{ fontSize: 28, fontWeight: 900, color: C.olive, fontFamily: "'Outfit', sans-serif" }}>£3,150</p>
                </div>
                <div style={{ background: "white", borderRadius: 12, padding: "16px 18px" }}>
                  <p style={{ fontSize: 13, color: "var(--brand-subtle-text)", marginBottom: 4 }}>Hours contributed</p>
                  <p style={{ fontSize: 28, fontWeight: 900, color: C.slate, fontFamily: "'Outfit', sans-serif" }}>187</p>
                </div>
              </div>
              <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" as const }}>
                <span style={{ padding: "4px 12px", borderRadius: 100, background: "var(--brand-olive-chip)", fontSize: 12, fontWeight: 600, color: C.dark }}>🌱 Environment</span>
                <span style={{ padding: "4px 12px", borderRadius: 100, background: "var(--brand-light-blue-chip)", fontSize: 12, fontWeight: 600, color: C.dark }}>🏘️ Community</span>
              </div>
              <p style={{ marginTop: 16, fontSize: 11, color: "rgba(0,0,0,0.3)" }}>Social value calculations use Social Value Engine methodology</p>
            </div>
          </FadeIn>
        </div>
      </section>
      {/* ── FOR ORGANISATIONS (SIGNPOST) ── */}
      <section style={{ background: C.dark, padding: "80px 5%" }}>
        <div style={{ maxWidth: SECTION_MAX_WIDTH, margin: "0 auto", textAlign: "center" }}>
          <FadeIn>
            <h2 style={{ fontSize: "clamp(24px, 4vw, 36px)", color: "white", fontWeight: 700, letterSpacing: -1, lineHeight: 1.15, fontFamily: "'Outfit', sans-serif", marginBottom: 16 }}>
              Represent an organisation?
            </h2>
            <p style={{ fontSize: 17, color: "rgba(255,255,255,0.55)", maxWidth: 600, margin: "0 auto 32px", lineHeight: 1.65 }}>
              Schools, charities, and local authorities use My Impact to measure and report the collective social value created by their people.
            </p>
            <Link
              href="/organisations"
              style={{
                background: "transparent",
                color: "white",
                border: "1.5px solid rgba(255,255,255,0.3)",
                padding: "12px 28px",
                borderRadius: 100,
                fontWeight: 600,
                fontSize: 15,
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "white";
                e.currentTarget.style.background = "rgba(255,255,255,0.1)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.3)";
                e.currentTarget.style.background = "transparent";
              }}
            >
              Explore for organisations →
            </Link>
          </FadeIn>
        </div>
      </section>
      {/* ── FAQ ── */}
      <section style={{ background: C.cream, padding: "clamp(60px, 10vw, 100px) 5%" }}>
        <div style={{ maxWidth: SECTION_MAX_WIDTH, margin: "0 auto" }}>
          <FadeIn>
            <p className="mi-section-label">Frequently asked questions</p>
            <h2 style={{ fontSize: "clamp(24px, 3.5vw, 40px)", fontWeight: 700, color: C.dark, lineHeight: 1.2, marginBottom: 40, letterSpacing: -0.5, fontFamily: "'Outfit', sans-serif" }}>
              Commonly asked questions (and the answers to them)
            </h2>
          </FadeIn>
          <HomeFAQ />
        </div>
      </section>
      {/* ── CTA ── */}
      <section className="mi-cta-section">
        <FadeIn>
          <div style={{ maxWidth: 600, margin: "0 auto", position: "relative", zIndex: 2 }}>
            <h2 style={{ fontSize: "clamp(30px, 5vw, 46px)", fontWeight: 900, color: "white", letterSpacing: -1, marginBottom: 16, lineHeight: 1.1, fontFamily: "'Outfit', sans-serif" }}>
              Ready to see the difference you make?
            </h2>
            <p style={{ fontSize: 18, color: "rgba(255,255,255,0.85)", marginBottom: 36, lineHeight: 1.6 }}>
              My Impact is live. Calculate your social value now and be one of the first to turn your positive actions into proof.
            </p>
            <Link href="/wizard/actions" className="mi-btn-white">
              Calculate my impact →
            </Link>
          </div>
        </FadeIn>
      </section>
      </>
      )}
      {/* Footer is rendered globally in App.tsx (shared <Footer />) —
          do not add a page-level footer here or it will duplicate. */}
    </div>
  );
}
