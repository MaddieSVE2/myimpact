import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { Footer } from "@/components/layout/Footer";

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
      }}
    >
      {children}
    </div>
  );
}

const IMPACT_CATEGORIES = [
  {
    icon: "🌿",
    title: "Environment",
    description: "Actions that reduce waste, lower carbon footprints, protect natural habitats, and promote sustainable living.",
    color: "#4a7c59",
  },
  {
    icon: "❤️",
    title: "Health",
    description: "Activities that support physical and mental wellbeing, for yourself, your family, or others in your community.",
    color: "#c0392b",
  },
  {
    icon: "🤝",
    title: "Community",
    description: "Volunteering, mentoring, local organising, and any effort that strengthens the social fabric where you live.",
    color: "#2980b9",
  },
  {
    icon: "📚",
    title: "Education",
    description: "Teaching, tutoring, fundraising for schools, and anything that helps others learn and grow.",
    color: "#8e44ad",
  },
];

export default function About() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", color: C.dark, overflowX: "hidden" }}>

      {/* ── HERO ── */}
      <section className="mi-hero" style={{ minHeight: "auto", paddingBottom: 80, paddingTop: 80 }}>
        <div style={{
          position: "relative", zIndex: 2, padding: "0 5%",
          maxWidth: 900, width: "100%", margin: "0 auto",
          display: "grid", gridTemplateColumns: "1fr auto",
          gap: "clamp(40px, 6vw, 80px)", alignItems: "center",
        }}>
          <div style={{ maxWidth: 620 }}>
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
              <span className="mi-dot" /> About My Impact
            </div>

            <h1
              className="mi-fraunces"
              style={{
                fontSize: "clamp(38px, 6vw, 68px)",
                fontWeight: 900, color: "white",
                lineHeight: 1.05, marginBottom: 20, letterSpacing: -2,
              }}
            >
              Built to make the{" "}
              <span style={{ color: C.orange, fontStyle: "italic" }}>invisible</span>{" "}
              visible.
            </h1>

            <p style={{ fontSize: "clamp(16px, 2vw, 19px)", color: "rgba(255,255,255,0.7)", lineHeight: 1.7 }}>
              Millions of people volunteer, care for others, and act for the environment every single day, and none of it shows up anywhere. My Impact gives that work a number, so you can finally see the difference you make.
            </p>
          </div>

          {/* Stat callout panel */}
          <div className="mi-about-stat-panel" style={{
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.12)",
            backdropFilter: "blur(12px)",
            borderRadius: 20,
            padding: "clamp(24px, 3vw, 40px)",
            minWidth: 220,
            display: "flex", flexDirection: "column", gap: 24,
          }}>
            {[
              { value: "£2,847", label: "Average social value created per volunteer per year", colour: C.orange },
              { value: "900m", label: "Hours volunteered across the UK annually", colour: "rgba(255,255,255,0.85)" },
              { value: "0%", label: "Of that value is currently tracked by the people who create it", colour: C.olive },
            ].map(stat => (
              <div key={stat.label}>
                <p style={{ fontSize: "clamp(28px, 3.5vw, 42px)", fontWeight: 900, color: stat.colour, margin: 0, lineHeight: 1.1, fontFamily: "'Outfit', sans-serif" }}>
                  {stat.value}
                </p>
                <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.45, marginTop: 6, maxWidth: 200 }}>
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── MISSION ── */}
      <section style={{ background: C.cream, padding: "clamp(60px, 10vw, 100px) 5%" }}>
        <FadeIn>
          <div style={{ maxWidth: 960, margin: "0 auto" }}>
            <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: C.orange, marginBottom: 16 }}>Our mission</p>
            <p
              style={{ fontSize: "clamp(26px, 4vw, 48px)", fontWeight: 700, color: C.dark, lineHeight: 1.2, marginBottom: 28, letterSpacing: -1, fontFamily: "'Outfit', sans-serif" }}
            >
              Every act of goodness has a value. We think you deserve to know what yours is.
            </p>
            <p style={{ fontSize: 18, color: "var(--brand-muted-text)", lineHeight: 1.8, maxWidth: 700 }}>
              My Impact is a free tool for anyone who contributes to society but has never had a way to measure it. Whether you give a few hours a week or devote your life to others, you create real social value. This platform helps you understand, track, and share it.
            </p>
          </div>
        </FadeIn>
      </section>

      {/* ── METHODOLOGY ── */}
      <section style={{ background: "white", padding: "clamp(60px, 10vw, 100px) 5%" }}>
        <FadeIn>
          <div style={{ maxWidth: 960, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "clamp(40px, 6vw, 80px)", alignItems: "center" }}>
            <div>
              <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: C.orange, marginBottom: 16 }}>Methodology</p>
              <h2
                style={{ fontSize: "clamp(24px, 3.5vw, 40px)", fontWeight: 700, color: C.dark, lineHeight: 1.2, marginBottom: 20, letterSpacing: -0.5, fontFamily: "'Outfit', sans-serif" }}
              >
                Powered by accredited SROI methodology
              </h2>
              <p style={{ fontSize: 16, color: "var(--brand-muted-text)", lineHeight: 1.8, marginBottom: 20 }}>
                Every monetary value in My Impact is calculated using the <strong>Social Return on Investment (SROI)</strong> framework, a globally recognised, evidence-based approach to measuring social, environmental, and economic value.
              </p>
              <p style={{ fontSize: 16, color: "var(--brand-muted-text)", lineHeight: 1.8, marginBottom: 28 }}>
                Our impact values are provided by the{" "}
                <a
                  href="https://www.socialvalueengine.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: C.orange, fontWeight: 700, textDecoration: "none", borderBottom: `2px solid ${C.orange}` }}
                >
                  Social Value Engine
                </a>
                {" "}, the UK's accredited platform for social value measurement. Their values are research-backed, regularly updated, and used by charities, government bodies, and businesses across the UK.
              </p>
              <a
                href="https://www.socialvalueengine.com"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  background: C.dark, color: "white",
                  padding: "12px 24px", borderRadius: 8,
                  fontSize: 14, fontWeight: 700, textDecoration: "none",
                  transition: "opacity 0.2s",
                }}
              >
                Learn about Social Value Engine →
              </a>
            </div>
            <div style={{
              background: C.cream,
              borderRadius: 16,
              padding: "clamp(28px, 4vw, 48px)",
            }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: C.dark, marginBottom: 16, letterSpacing: 0.5 }}>Why the numbers are credible</p>
              {[
                { label: "Evidence-based", detail: "Values derived from peer-reviewed research and real-world data." },
                { label: "SROI accredited", detail: "Aligned with Social Value International's accreditation standards." },
                { label: "UK-specific", detail: "Data reflects the UK economy and public sector costs." },
                { label: "Regularly updated", detail: "Values are reviewed and refreshed as new evidence emerges." },
              ].map(({ label, detail }) => (
                <div key={label} style={{ display: "flex", gap: 14, marginBottom: 20 }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: "50%",
                    background: C.orange, flexShrink: 0, marginTop: 2,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <svg width="11" height="8" viewBox="0 0 11 8" fill="none">
                      <path d="M1 4l3 3 6-6" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div>
                    <p style={{ fontWeight: 700, fontSize: 14, color: C.dark, marginBottom: 2 }}>{label}</p>
                    <p style={{ fontSize: 13, color: "var(--brand-muted-text)", lineHeight: 1.5 }}>{detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </FadeIn>
      </section>

      {/* ── IMPACT CATEGORIES ── */}
      <section style={{ background: C.dark, padding: "clamp(60px, 10vw, 100px) 5%" }}>
        <FadeIn>
          <div style={{ maxWidth: 960, margin: "0 auto" }}>
            <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: C.orange, marginBottom: 16 }}>What counts as impact</p>
            <h2
              style={{ fontSize: "clamp(24px, 3.5vw, 40px)", fontWeight: 700, color: "white", lineHeight: 1.2, marginBottom: 16, letterSpacing: -0.5, fontFamily: "'Outfit', sans-serif" }}
            >
              Four categories. Hundreds of actions.
            </h2>
            <p style={{ fontSize: 16, color: "rgba(255,255,255,0.6)", lineHeight: 1.7, maxWidth: 620, marginBottom: 48 }}>
              My Impact recognises meaningful contributions across four domains of social value. If you do something good, chances are it fits.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 24 }}>
              {IMPACT_CATEGORIES.map(({ icon, title, description, color }) => (
                <FadeIn key={title} delay={0.1}>
                  <div style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 12,
                    padding: "clamp(20px, 3vw, 32px)",
                    height: "100%",
                    boxSizing: "border-box",
                  }}>
                    <div style={{ fontSize: 32, marginBottom: 14 }}>{icon}</div>
                    <p style={{ fontSize: 16, fontWeight: 700, color: "white", marginBottom: 10 }}>{title}</p>
                    <p style={{ fontSize: 14, color: "rgba(255,255,255,0.6)", lineHeight: 1.65 }}>{description}</p>
                  </div>
                </FadeIn>
              ))}
            </div>
          </div>
        </FadeIn>
      </section>


      {/* ── CTA ── */}
      <section style={{
        background: C.orange,
        padding: "clamp(60px, 10vw, 100px) 5%",
        textAlign: "center",
      }}>
        <FadeIn>
          <div style={{ maxWidth: 600, margin: "0 auto" }}>
            <h2 style={{ fontSize: "clamp(28px, 4.5vw, 48px)", fontWeight: 900, color: "white", letterSpacing: -1, marginBottom: 16, lineHeight: 1.1, fontFamily: "'Outfit', sans-serif" }}>
              Start measuring your impact
            </h2>
            <p style={{ fontSize: 17, color: "rgba(255,255,255,0.85)", marginBottom: 36, lineHeight: 1.6 }}>
              It takes about three minutes. No account needed.
            </p>
            <Link href="/wizard/actions" className="mi-btn-white">
              Calculate my impact →
            </Link>
          </div>
        </FadeIn>
      </section>

      <Footer />
    </div>
  );
}
