import React, { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { PageMeta } from "@/components/PageMeta";
import { ORGANISATIONS_META } from "@/lib/page-metadata";
import { scrollContentToTop } from "@/lib/scroll-utils";
import { Building2, Heart, Award, ArrowRight, BarChart3, Users, Shield, Sparkles, Handshake, MonitorSmartphone, Target, MessageCircle, Landmark } from "lucide-react";
import { ORGANISATION_FEATURE_ARTWORK } from "@/lib/branded-artwork";
import { BrandedArtwork } from "@/components/BrandedArtwork";

const C = {
  dark: "var(--brand-dark)",
  orange: "var(--brand-orange)",
  olive: "var(--brand-olive)",
  slate: "var(--brand-slate)",
  lightBlue: "var(--brand-light-blue)",
  cream: "var(--brand-cream)",
  offBlack: "var(--brand-off-black)",
};

const CALENDLY_URL =
  "https://calendly.com/hello-myimpact/30min?hide_event_type_details=1&hide_gdpr_banner=1&primary_color=d45105";

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

function CalendlyBooking() {
  return (
    <section
      id="book-demo"
      aria-labelledby="book-demo-title"
      style={{ background: "white", padding: "clamp(60px, 8vw, 96px) 5%", scrollMarginTop: 80 }}
    >
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <h2
            id="book-demo-title"
            style={{
              color: C.dark,
              fontFamily: "'Outfit', sans-serif",
              fontSize: "clamp(30px, 5vw, 46px)",
              fontWeight: 700,
              letterSpacing: -1,
              marginBottom: 12,
            }}
          >
            Book a demo
          </h2>
          <p style={{ color: "var(--brand-muted-text)", fontSize: 17 }}>
            Choose a time with the My Impact team.
          </p>
        </div>
        <iframe
          src={CALENDLY_URL}
          title="Book a My Impact demo"
          style={{ display: "block", width: "100%", minWidth: 320, height: 700, border: 0 }}
        />
        <p style={{ textAlign: "center", marginTop: 16, color: "var(--brand-muted-text)", fontSize: 14 }}>
          If the calendar does not load,{" "}
          <a href={CALENDLY_URL} target="_blank" rel="noopener noreferrer" style={{ color: "var(--brand-orange-text)", fontWeight: 700 }}>
            book directly on Calendly
          </a>
          .
        </p>
      </div>
    </section>
  );
}

export default function Organisations() {
  useEffect(() => {
    const hash = window.location.hash;
    if (hash) {
      requestAnimationFrame(() => document.querySelector(hash)?.scrollIntoView());
    } else {
      scrollContentToTop();
    }
  }, []);

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", color: C.dark, backgroundColor: C.cream, overflowX: "hidden" }}>
      <PageMeta
        title={ORGANISATIONS_META.title}
        description={ORGANISATIONS_META.description}
        canonical={ORGANISATIONS_META.canonical}
      />

      {/* ── HERO ── */}
      <section 
        data-testid="orgs-hero"
        style={{ 
          background: C.dark, 
          padding: "clamp(80px, 12vw, 120px) 5% clamp(60px, 10vw, 100px)",
          position: "relative",
          overflow: "hidden"
        }}
      >
        <div style={{
          position: "absolute", top: "-20%", right: "-10%",
          width: "60vw", height: "60vw", borderRadius: "50%",
          background: "radial-gradient(circle, color-mix(in srgb, var(--brand-orange) 12%, transparent) 0%, transparent 60%)",
          pointerEvents: "none"
        }} />
        <div style={{
          position: "absolute", bottom: "-10%", left: "-10%",
          width: "40vw", height: "40vw", borderRadius: "50%",
          background: "radial-gradient(circle, color-mix(in srgb, var(--brand-light-blue) 12%, transparent) 0%, transparent 60%)",
          pointerEvents: "none"
        }} />

        <div style={{ maxWidth: 1080, margin: "0 auto", position: "relative", zIndex: 2, textAlign: "center" }}>
          <FadeIn>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.13)",
              backdropFilter: "blur(8px)",
              padding: "8px 18px", borderRadius: 100,
              color: "rgba(255,255,255,0.8)", fontSize: 12, fontWeight: 700,
              letterSpacing: 1.5, textTransform: "uppercase",
              marginBottom: 32,
            }}>
              <Building2 size={14} /> My Impact for Organisations
            </div>
            <h1 
              className="mi-fraunces"
              data-testid="orgs-hero-title"
              style={{
                fontSize: "clamp(42px, 7vw, 78px)",
                fontWeight: 900, color: "white",
                lineHeight: 1.05, marginBottom: 24, letterSpacing: -2,
              }}
            >
              Measure the social value your people create.
            </h1>
            <p style={{ 
              fontSize: "clamp(18px, 2vw, 22px)", color: "rgba(255,255,255,0.7)", 
              lineHeight: 1.6, maxWidth: 720, margin: "0 auto 48px" 
            }}>
              Turn individual actions into credible, aggregated social value evidence.
            </p>
            
            <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center", justifyContent: "center" }}>
              <a
                href="#book-demo"
                data-testid="orgs-hero-cta-book-demo"
                style={{
                  background: "var(--brand-orange-solid)",
                  color: "white",
                  padding: "16px 36px",
                  borderRadius: 100,
                  fontWeight: 700,
                  fontSize: 16,
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  transition: "all 0.25s",
                  boxShadow: "0 8px 24px color-mix(in srgb, var(--brand-orange) 30%, transparent)"
                }}
                onMouseEnter={e => e.currentTarget.style.transform = "translateY(-2px)"}
                onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}
              >
                Book a demo <ArrowRight size={18} />
              </a>
              <Link
                href="/org/demo"
                data-testid="orgs-hero-cta-demo"
                style={{
                  background: "transparent",
                  color: "white",
                  border: "1.5px solid rgba(255,255,255,0.3)",
                  padding: "15px 36px",
                  borderRadius: 100,
                  fontWeight: 700,
                  fontSize: 16,
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
                View example dashboard
              </Link>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── SOCIAL PROOF ── */}
      <section style={{ padding: "40px 5%", background: "white", borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", textAlign: "center" }}>
          <FadeIn>
            <p style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "var(--brand-muted-text)", marginBottom: 16 }}>
              Built by the SVI-accredited Social Value Engine
            </p>
            <p style={{ fontSize: 16, color: "var(--brand-subtle-text)", maxWidth: 600, margin: "0 auto", lineHeight: 1.6 }}>
              The Social Value Engine created My Impact, which uses the same peer-reviewed financial proxies to calculate the value of every activity.
            </p>
          </FadeIn>
        </div>
      </section>

      {/* ── THE PROBLEM WE SOLVE ── */}
      <section style={{ padding: "clamp(60px, 10vw, 100px) 5%" }}>
        <div style={{ maxWidth: 1080, margin: "0 auto" }}>
          <FadeIn>
            <h2 style={{ 
              fontSize: "clamp(28px, 4vw, 42px)", color: C.dark, fontWeight: 700, 
              letterSpacing: -1, maxWidth: 600, lineHeight: 1.15, 
              fontFamily: "'Outfit', sans-serif", marginBottom: 60 
            }}>
              Report collective impact without exposing personal data.
            </h2>
          </FadeIn>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 32 }}>
            {[
              {
                icon: BarChart3,
                artwork: ORGANISATION_FEATURE_ARTWORK.reporting,
                title: "Aggregated reporting",
                desc: "See live totals of hours, activities, and calculated social value across your cohort. Export the data for funders and annual reports."
              },
              {
                icon: Shield,
                artwork: ORGANISATION_FEATURE_ARTWORK.privacy,
                title: "Privacy by design",
                desc: "Your dashboard shows the collective impact. Members retain ownership of their personal journals and reflections. We never share raw individual data without explicit consent."
              },
              {
                icon: Users,
                artwork: ORGANISATION_FEATURE_ARTWORK.engagement,
                title: "Engage your community",
                desc: "Set group challenges and pulse surveys. Track the causes your people support."
              }
            ].map((feature, i) => (
              <FadeIn key={feature.title} delay={i * 0.1}>
                <div style={{
                  background: "white",
                  padding: 40,
                  borderRadius: 24,
                  boxShadow: "0 4px 20px rgba(0,0,0,0.03)",
                  border: "1px solid rgba(0,0,0,0.04)",
                  height: "100%",
                  display: "flex",
                  flexDirection: "column"
                }}>
                   <BrandedArtwork
                     file={feature.artwork}
                     fallback={<feature.icon size={28} color={C.orange} />}
                     className="w-16 h-16 flex items-center justify-center mb-5"
                     imageClassName="w-full h-full object-contain"
                   />
                  <h3 style={{ fontSize: 20, fontWeight: 700, color: C.dark, marginBottom: 12, fontFamily: "'Outfit', sans-serif" }}>
                    {feature.title}
                  </h3>
                  <p style={{ fontSize: 16, color: "var(--brand-muted-text)", lineHeight: 1.6, flex: 1 }}>
                    {feature.desc}
                  </p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── DATA SHARING APPROACHES ── */}
      <section style={{ padding: "clamp(60px, 9vw, 88px) 5%", background: "white" }}>
        <div style={{ maxWidth: 1080, margin: "0 auto" }}>
          <FadeIn>
            <div style={{ textAlign: "center", maxWidth: 720, margin: "0 auto 40px" }}>
              <p className="mi-section-label" style={{ color: C.orange }}>Privacy and control</p>
              <h2 style={{
                fontSize: "clamp(28px, 4vw, 42px)",
                color: C.dark,
                fontWeight: 700,
                letterSpacing: -1,
                lineHeight: 1.15,
                fontFamily: "'Outfit', sans-serif",
                marginBottom: 16,
              }}>
                Choose how members share their activities.
              </h2>
              <p style={{ fontSize: 17, color: "var(--brand-muted-text)", lineHeight: 1.6 }}>
                My Impact supports two clear data-sharing approaches. Each keeps personal journals and reflections private.
              </p>
            </div>
          </FadeIn>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 24 }}>
            <FadeIn>
              <article style={{ border: "1px solid rgba(0,0,0,0.08)", borderRadius: 20, padding: 32, height: "100%" }}>
                <Shield size={28} color={C.orange} style={{ marginBottom: 18 }} />
                <h3 style={{ fontSize: 21, fontWeight: 700, color: C.dark, marginBottom: 10, fontFamily: "'Outfit', sans-serif" }}>
                  Explicit submission
                </h3>
                <p style={{ fontSize: 15, color: "var(--brand-muted-text)", lineHeight: 1.6, marginBottom: 20 }}>
                  Members decide which individual activities to submit and can review the details before their organisation receives them.
                </p>
                <Link
                  href="/org/types/explicit-submission"
                  style={{ color: "var(--brand-orange-text)", fontWeight: 700, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}
                >
                  Learn about explicit submission <ArrowRight size={16} />
                </Link>
              </article>
            </FadeIn>

            <FadeIn delay={0.1}>
              <article style={{ border: "1px solid rgba(0,0,0,0.08)", borderRadius: 20, padding: 32, height: "100%" }}>
                <Shield size={28} color={C.lightBlue} style={{ marginBottom: 18 }} />
                <h3 style={{ fontSize: 21, fontWeight: 700, color: C.dark, marginBottom: 10, fontFamily: "'Outfit', sans-serif" }}>
                  Consented logging
                </h3>
                <p style={{ fontSize: 15, color: "var(--brand-muted-text)", lineHeight: 1.6, marginBottom: 20 }}>
                  Activities are shared automatically only after a member gives explicit, recorded consent, which they can withdraw at any time.
                </p>
                <Link
                  href="/org/types/consented-logging"
                  style={{ color: "var(--brand-orange-text)", fontWeight: 700, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}
                >
                  Learn about consented logging <ArrowRight size={16} />
                </Link>
              </article>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* ── OFFER LEVELS ── */}
      <section id="how-we-work-together" style={{ background: C.dark, padding: "clamp(80px, 10vw, 120px) 5%" }}>
        <div style={{ maxWidth: 1080, margin: "0 auto" }}>
          <FadeIn>
            <div style={{ textAlign: "center", marginBottom: 64 }}>
              <p className="mi-section-label" style={{ color: C.lightBlue }}>How we work together</p>
              <h2 style={{ 
                fontSize: "clamp(32px, 5vw, 48px)", color: "white", fontWeight: 700, 
                letterSpacing: -1, maxWidth: 700, margin: "0 auto", lineHeight: 1.15, 
                fontFamily: "'Outfit', sans-serif" 
              }}>
                Choose how you use My Impact.
              </h2>
              <p style={{ fontSize: 18, color: "rgba(255,255,255,0.6)", maxWidth: 600, margin: "24px auto 0", lineHeight: 1.6 }}>
                Choose self-serve, engagement support, or a branded managed service.
              </p>
            </div>
          </FadeIn>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 24 }}>
            {/* Level 1 */}
            <FadeIn delay={0}>
              <div style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 24,
                padding: 40,
                height: "100%",
                display: "flex",
                flexDirection: "column"
              }}>
                <Target size={28} color={C.lightBlue} style={{ marginBottom: 20 }} />
                <h3 style={{ fontSize: 22, fontWeight: 700, color: "white", marginBottom: 12, fontFamily: "'Outfit', sans-serif" }}>
                  Self serve
                </h3>
                <p style={{ fontSize: 15, color: "rgba(255,255,255,0.6)", lineHeight: 1.6, marginBottom: 24, minHeight: 90 }}>
                  Launch a ready-to-use dashboard for a smaller organisation or independent project.
                </p>
                <ul style={{ listStyle: "none", padding: 0, margin: "0 0 32px 0", gap: 12, display: "flex", flexDirection: "column", flex: 1 }}>
                  {[
                    "Instant dashboard access",
                    "Aggregated reporting",
                    "Standard activity categorisation",
                    "Data export for funders"
                  ].map((item, i) => (
                    <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 14, color: "rgba(255,255,255,0.8)", lineHeight: 1.4 }}>
                      <Sparkles size={16} color={C.lightBlue} style={{ flexShrink: 0, marginTop: 2 }} />
                      {item}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/contact"
                  data-testid="cta-self-serve"
                  style={{
                    display: "block", textAlign: "center",
                    background: "rgba(255,255,255,0.1)", color: "white",
                    padding: "14px", borderRadius: 100, fontSize: 15, fontWeight: 600,
                    textDecoration: "none", transition: "all 0.2s"
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.2)"}
                  onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.1)"}
                >
                  Speak with us
                </Link>
              </div>
            </FadeIn>

            {/* Level 2 */}
            <FadeIn delay={0.1}>
              <div style={{
                background: "var(--brand-orange-chip)",
                border: `1px solid ${C.orange}`,
                borderRadius: 24,
                padding: 40,
                height: "100%",
                display: "flex",
                flexDirection: "column",
                position: "relative",
                boxShadow: "0 12px 32px rgba(0,0,0,0.2)"
              }}>
                <div style={{ position: "absolute", top: 20, right: 20, background: C.orange, color: "white", fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 100, textTransform: "uppercase", letterSpacing: 1 }}>
                  Popular
                </div>
                <Handshake size={28} color={C.orange} style={{ marginBottom: 20 }} />
                <h3 style={{ fontSize: 22, fontWeight: 700, color: "white", marginBottom: 12, fontFamily: "'Outfit', sans-serif" }}>
                  Collaborative partnership with engagement support
                </h3>
                <p style={{ fontSize: 15, color: "rgba(255,255,255,0.6)", lineHeight: 1.6, marginBottom: 24, minHeight: 90 }}>
                  Add engagement support, custom challenges, onboarding workshops, and quarterly reviews.
                </p>
                <ul style={{ listStyle: "none", padding: 0, margin: "0 0 32px 0", gap: 12, display: "flex", flexDirection: "column", flex: 1 }}>
                  {[
                    "Everything in Self serve",
                    "Dedicated engagement support",
                    "Custom organisational challenges",
                    "Onboarding workshops",
                    "Quarterly impact reviews"
                  ].map((item, i) => (
                    <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 14, color: "rgba(255,255,255,0.8)", lineHeight: 1.4 }}>
                      <Sparkles size={16} color={C.orange} style={{ flexShrink: 0, marginTop: 2 }} />
                      {item}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/contact"
                  data-testid="cta-collaborative"
                  style={{
                    display: "block", textAlign: "center",
                    background: C.orange, color: "white",
                    padding: "14px", borderRadius: 100, fontSize: 15, fontWeight: 600,
                    textDecoration: "none", transition: "all 0.2s"
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; }}
                >
                  Speak with us
                </Link>
              </div>
            </FadeIn>

            {/* Level 3 */}
            <FadeIn delay={0.2}>
              <div style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 24,
                padding: 40,
                height: "100%",
                display: "flex",
                flexDirection: "column"
              }}>
                <MonitorSmartphone size={28} color={C.olive} style={{ marginBottom: 20 }} />
                <h3 style={{ fontSize: 22, fontWeight: 700, color: "white", marginBottom: 12, fontFamily: "'Outfit', sans-serif" }}>
                  Branded portal and companion mobile app
                </h3>
                <p style={{ fontSize: 15, color: "rgba(255,255,255,0.6)", lineHeight: 1.6, marginBottom: 24, minHeight: 90 }}>
                  Use your own branding, domain, companion app, data integrations, and proxy mappings.
                </p>
                <ul style={{ listStyle: "none", padding: 0, margin: "0 0 32px 0", gap: 12, display: "flex", flexDirection: "column", flex: 1 }}>
                  {[
                    "Everything in Collaborative",
                    "Custom branding and domain",
                    "White-labelled companion app",
                    "Bespoke data integrations",
                    "Custom SVE proxy mappings"
                  ].map((item, i) => (
                    <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 14, color: "rgba(255,255,255,0.8)", lineHeight: 1.4 }}>
                      <Sparkles size={16} color={C.olive} style={{ flexShrink: 0, marginTop: 2 }} />
                      {item}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/contact"
                  data-testid="cta-branded"
                  style={{
                    display: "block", textAlign: "center",
                    background: "rgba(255,255,255,0.1)", color: "white",
                    padding: "14px", borderRadius: 100, fontSize: 15, fontWeight: 600,
                    textDecoration: "none", transition: "all 0.2s"
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.2)"}
                  onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.1)"}
                >
                  Speak with us
                </Link>
              </div>
            </FadeIn>
          </div>
          
          <FadeIn delay={0.3}>
            <p style={{ textAlign: "center", fontSize: 14, color: "rgba(255,255,255,0.4)", marginTop: 32 }}>
              Pricing depends on your organisation's size and support level.
            </p>
          </FadeIn>
        </div>
      </section>

      {/* ── DEMO DASHBOARDS ── */}
      <section style={{ padding: "clamp(60px, 10vw, 100px) 5%" }}>
        <div style={{ maxWidth: 800, margin: "0 auto", textAlign: "center" }}>
          <FadeIn>
            <h2 style={{ 
              fontSize: "clamp(26px, 4vw, 36px)", color: C.dark, fontWeight: 700, 
              letterSpacing: -1, marginBottom: 24, fontFamily: "'Outfit', sans-serif" 
            }}>
              See what your data could look like
            </h2>
            <p style={{ fontSize: 18, color: "var(--brand-muted-text)", marginBottom: 48, lineHeight: 1.6 }}>
              Explore four dashboards with example data.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 16, justifyContent: "center" }}>
              <Link
                href="/org/demo?type=education"
                data-testid="demo-education"
                style={{
                  background: "white",
                  color: C.dark,
                  border: "1px solid rgba(0,0,0,0.1)",
                  padding: "16px 32px",
                  borderRadius: 16,
                  fontWeight: 600,
                  fontSize: 16,
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 12,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
                  transition: "all 0.2s"
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.08)"; }}
                onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.05)"; }}
              >
                <div style={{ background: C.cream, padding: 8, borderRadius: 8, color: C.orange }}>
                  <Award size={20} />
                </div>
                Education example
              </Link>
              
              <Link
                href="/org/demo?type=charity"
                data-testid="demo-charity"
                style={{
                  background: "white",
                  color: C.dark,
                  border: "1px solid rgba(0,0,0,0.1)",
                  padding: "16px 32px",
                  borderRadius: 16,
                  fontWeight: 600,
                  fontSize: 16,
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 12,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
                  transition: "all 0.2s"
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.08)"; }}
                onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.05)"; }}
              >
                <div style={{ background: C.cream, padding: 8, borderRadius: 8, color: C.orange }}>
                  <Heart size={20} />
                </div>
                Charity example
              </Link>

              <Link
                href="/org/demo?type=corporate"
                data-testid="demo-corporate"
                style={{
                  background: "white",
                  color: C.dark,
                  border: "1px solid rgba(0,0,0,0.1)",
                  padding: "16px 32px",
                  borderRadius: 16,
                  fontWeight: 600,
                  fontSize: 16,
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 12,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
                  transition: "all 0.2s"
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.08)"; }}
                onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.05)"; }}
              >
                <div style={{ background: C.cream, padding: 8, borderRadius: 8, color: C.orange }}>
                  <Building2 size={20} />
                </div>
                Corporate example
              </Link>

              <Link
                href="/org/demo?type=public"
                data-testid="demo-public-sector"
                style={{
                  background: "white",
                  color: C.dark,
                  border: "1px solid rgba(0,0,0,0.1)",
                  padding: "16px 32px",
                  borderRadius: 16,
                  fontWeight: 600,
                  fontSize: 16,
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 12,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
                  transition: "all 0.2s"
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.08)"; }}
                onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.05)"; }}
              >
                <div style={{ background: C.cream, padding: 8, borderRadius: 8, color: C.orange }}>
                  <Landmark size={20} />
                </div>
                Public sector example
              </Link>
            </div>
          </FadeIn>
        </div>
      </section>

      <CalendlyBooking />

      {/* ── FINAL CTA ── */}
      <section style={{ background: C.orange, padding: "clamp(60px, 8vw, 100px) 5%", textAlign: "center", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: "-50%", right: "-30%", width: "60vw", height: "60vw", borderRadius: "50%", background: "radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%)" }} />
        <FadeIn>
          <div style={{ maxWidth: 600, margin: "0 auto", position: "relative", zIndex: 2 }}>
            <h2 style={{ fontSize: "clamp(30px, 5vw, 46px)", fontWeight: 900, color: "white", letterSpacing: -1, marginBottom: 16, lineHeight: 1.1, fontFamily: "'Outfit', sans-serif" }}>
              Start measuring your organisation's social value
            </h2>
            <p style={{ fontSize: 18, color: "rgba(255,255,255,0.9)", marginBottom: 36, lineHeight: 1.6 }}>
              Choose a self-serve dashboard or a managed partnership.
            </p>
            <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
              <Link 
                href="/contact" 
                data-testid="final-cta-contact"
                style={{ 
                  background: "white", color: C.dark, padding: "16px 40px", 
                  borderRadius: 100, fontWeight: 700, fontSize: 16, 
                  textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 8,
                  transition: "all 0.25s" 
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 30px rgba(0,0,0,0.2)"; }}
                onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}
              >
                <MessageCircle size={18} /> Speak with us
              </Link>
              <Link 
                href="/org/register" 
                data-testid="final-cta-register"
                style={{ 
                  background: "transparent", color: "white", padding: "16px 40px", 
                  borderRadius: 100, fontWeight: 700, fontSize: 16, border: "1.5px solid rgba(255,255,255,0.4)",
                  textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 8,
                  transition: "all 0.25s" 
                }}
                onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.1)"; e.currentTarget.style.borderColor = "white"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.4)"; }}
              >
                Register now
              </Link>
            </div>
          </div>
        </FadeIn>
      </section>
    </div>
  );
}
