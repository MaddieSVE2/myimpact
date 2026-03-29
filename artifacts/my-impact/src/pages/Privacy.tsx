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

interface Section {
  id: string;
  title: string;
  content: React.ReactNode;
}

const SECTIONS: Section[] = [
  {
    id: "who-we-are",
    title: "Who we are",
    content: (
      <>
        <p>My Impact is operated by My Impact CIC, a community interest company registered in England and Wales. We are the data controller for all personal data processed through this service.</p>
        <p style={{ marginTop: 12 }}>If you have any questions about this policy or how we handle your data, please contact us at <a href="mailto:maddie@socialvalueengine.com" style={{ color: "var(--brand-orange)", fontWeight: 600, textDecoration: "none" }}>maddie@socialvalueengine.com</a>.</p>
      </>
    ),
  },
  {
    id: "data-collected",
    title: "What data we collect",
    content: (
      <>
        <p>We collect the minimum data necessary to provide the My Impact service. This includes:</p>
        <ul style={{ marginTop: 12, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 10 }}>
          <li><strong>Account information</strong> — your email address and, optionally, a display name, when you create an account.</li>
          <li><strong>Profile information</strong> — details you choose to share about your situation (e.g. student, carer, armed forces) to personalise your experience. This is always optional.</li>
          <li><strong>Impact data</strong> — the activities, actions, and contributions you log, along with associated hours and dates.</li>
          <li><strong>Journal entries</strong> — any written reflections you save against your impact records.</li>
          <li><strong>Usage data</strong> — anonymised, aggregated analytics about how pages are used, to help us improve the service. We do not use advertising trackers.</li>
          <li><strong>Organisation data</strong> — if you register an organisation, we collect your organisation's name, type, and contact email.</li>
        </ul>
        <p style={{ marginTop: 12 }}>We do not collect payment information. My Impact is free to use.</p>
      </>
    ),
  },
  {
    id: "how-we-use-data",
    title: "How we use your data",
    content: (
      <>
        <p>We use your data solely to provide and improve the My Impact service. Specifically:</p>
        <ul style={{ marginTop: 12, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 10 }}>
          <li>To calculate and display your social value impact score.</li>
          <li>To save your history and allow you to track progress over time.</li>
          <li>To personalise the wizard and suggestions to your situation.</li>
          <li>To generate PDF impact reports on your request.</li>
          <li>To send transactional emails (e.g. account confirmation, organisation registration confirmation).</li>
          <li>To operate the organisation dashboard with aggregated, anonymised member data.</li>
          <li>To diagnose bugs and improve the reliability of the service.</li>
        </ul>
        <p style={{ marginTop: 12 }}>We do not sell your data. We do not use your data for advertising. We do not share your data with third parties except as described under "Third-party services" below.</p>
      </>
    ),
  },
  {
    id: "legal-basis",
    title: "Legal basis for processing",
    content: (
      <>
        <p>We process your personal data under the following legal bases, as defined by the UK GDPR:</p>
        <ul style={{ marginTop: 12, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 10 }}>
          <li><strong>Contract</strong> — processing necessary to provide the service you have signed up for.</li>
          <li><strong>Legitimate interests</strong> — improving and securing the service, where these interests are not overridden by your rights.</li>
          <li><strong>Consent</strong> — for any optional data or communications where we ask for your explicit agreement.</li>
        </ul>
      </>
    ),
  },
  {
    id: "data-storage",
    title: "Data storage and security",
    content: (
      <>
        <p>All personal data is stored and processed in <strong>UK data centres</strong>. We do not transfer your data outside the UK or European Economic Area.</p>
        <p style={{ marginTop: 12 }}>We use industry-standard security measures including:</p>
        <ul style={{ marginTop: 12, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 10 }}>
          <li>Encrypted connections (HTTPS/TLS) for all data in transit.</li>
          <li>Encrypted storage for data at rest.</li>
          <li>Secure, hashed storage of passwords — we never store passwords in plain text.</li>
          <li>Access controls limiting who within our team can access personal data.</li>
        </ul>
        <p style={{ marginTop: 12 }}>We retain your data for as long as your account is active, or as necessary to provide the service. If you delete your account, we will delete your personal data within 30 days, except where we are required by law to retain it longer.</p>
      </>
    ),
  },
  {
    id: "cookies",
    title: "Cookies",
    content: (
      <>
        <p>My Impact uses a small number of cookies that are strictly necessary for the service to function:</p>
        <ul style={{ marginTop: 12, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 10 }}>
          <li><strong>Session cookie</strong> — keeps you logged in while you use the app. Expires when you close your browser or log out.</li>
          <li><strong>Wizard state cookie</strong> — remembers your progress through the impact calculator so you don't lose your work.</li>
        </ul>
        <p style={{ marginTop: 12 }}>We do not use advertising cookies, social media tracking pixels, or third-party analytics cookies that follow you across the web. Our usage analytics are anonymised and processed in-house.</p>
        <p style={{ marginTop: 12 }}>Because we only use strictly necessary cookies, we do not require a cookie consent banner.</p>
      </>
    ),
  },
  {
    id: "third-parties",
    title: "Third-party services",
    content: (
      <>
        <p>We use a small number of trusted third-party services to operate My Impact:</p>
        <ul style={{ marginTop: 12, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 10 }}>
          <li><strong>Social Value Engine</strong> — we use their accredited SROI methodology and values to calculate impact scores. We do not share your personal data with them.</li>
          <li><strong>Transactional email</strong> — we use a UK-based email delivery service to send account and notification emails. Your email address is shared only to deliver emails you have requested.</li>
          <li><strong>Hosting infrastructure</strong> — our servers and database are hosted in UK data centres under strict data processing agreements.</li>
        </ul>
        <p style={{ marginTop: 12 }}>All third-party processors we work with are bound by data processing agreements and are required to handle your data in accordance with UK GDPR.</p>
      </>
    ),
  },
  {
    id: "your-rights",
    title: "Your rights under UK GDPR",
    content: (
      <>
        <p>As a UK resident, you have the following rights regarding your personal data:</p>
        <ul style={{ marginTop: 12, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 10 }}>
          <li><strong>Right to access</strong> — you can request a copy of the personal data we hold about you.</li>
          <li><strong>Right to rectification</strong> — you can ask us to correct inaccurate or incomplete data.</li>
          <li><strong>Right to erasure</strong> — you can ask us to delete your personal data ("right to be forgotten").</li>
          <li><strong>Right to restriction</strong> — you can ask us to restrict how we process your data in certain circumstances.</li>
          <li><strong>Right to portability</strong> — you can request your data in a structured, commonly used, machine-readable format.</li>
          <li><strong>Right to object</strong> — you can object to processing based on legitimate interests.</li>
          <li><strong>Rights related to automated decision-making</strong> — you have the right not to be subject to decisions made solely by automated means that have a significant effect on you.</li>
        </ul>
        <p style={{ marginTop: 12 }}>To exercise any of these rights, please contact us at <a href="mailto:maddie@socialvalueengine.com" style={{ color: "var(--brand-orange)", fontWeight: 600, textDecoration: "none" }}>maddie@socialvalueengine.com</a>. We will respond within 30 days.</p>
        <p style={{ marginTop: 12 }}>If you are unhappy with how we handle your data, you have the right to lodge a complaint with the <a href="https://ico.org.uk" target="_blank" rel="noopener noreferrer" style={{ color: "var(--brand-orange)", fontWeight: 600, textDecoration: "none" }}>Information Commissioner's Office (ICO)</a>.</p>
      </>
    ),
  },
  {
    id: "changes",
    title: "Changes to this policy",
    content: (
      <>
        <p>We may update this privacy policy from time to time. When we make significant changes, we will notify registered users by email and update the "Last updated" date at the top of this page.</p>
        <p style={{ marginTop: 12 }}>We encourage you to review this policy periodically to stay informed about how we protect your data.</p>
      </>
    ),
  },
];

export default function Privacy() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", color: C.dark, overflowX: "hidden" }}>

      {/* ── HERO ── */}
      <section className="mi-hero" style={{ minHeight: "auto", paddingBottom: 80, paddingTop: 80 }}>
        <div style={{ position: "relative", zIndex: 2, padding: "0 5%", maxWidth: 900, width: "100%", margin: "0 auto" }}>
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
            <span className="mi-dot" /> Privacy Policy
          </div>

          <h1
            className="mi-fraunces"
            style={{
              fontSize: "clamp(38px, 6vw, 62px)",
              fontWeight: 900, color: "white",
              lineHeight: 1.05, marginBottom: 20, letterSpacing: -2,
            }}
          >
            Your data,{" "}
            <span style={{ color: C.orange, fontStyle: "italic" }}>your rights.</span>
          </h1>

          <p style={{ fontSize: "clamp(16px, 2vw, 19px)", color: "rgba(255,255,255,0.7)", lineHeight: 1.7, maxWidth: 600 }}>
            We believe in being straightforward about what data we collect, how we use it, and what control you have over it. This page explains all of that in plain English.
          </p>

          <p style={{ marginTop: 20, fontSize: 13, color: "rgba(255,255,255,0.4)", letterSpacing: 0.3 }}>
            Last updated: 29 March 2026
          </p>
        </div>
      </section>

      {/* ── POLICY CONTENT ── */}
      <section style={{ background: C.cream, padding: "clamp(60px, 10vw, 100px) 5%" }}>
        <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", flexDirection: "column", gap: "clamp(48px, 7vw, 72px)" }}>
          {SECTIONS.map((section, i) => (
            <FadeIn key={section.id} delay={i * 0.04}>
              <div id={section.id}>
                <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: "50%",
                    background: C.orange,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                    fontSize: 13, fontWeight: 800, color: "white",
                    fontFamily: "'Outfit', sans-serif",
                  }}>
                    {i + 1}
                  </div>
                  <h2 style={{
                    fontSize: "clamp(20px, 3vw, 26px)", fontWeight: 700,
                    color: C.dark, letterSpacing: -0.5,
                    fontFamily: "'Outfit', sans-serif", margin: 0,
                  }}>
                    {section.title}
                  </h2>
                </div>
                <div style={{
                  fontSize: 15, color: "var(--brand-muted-text)", lineHeight: 1.8,
                  paddingLeft: 46,
                }}>
                  {section.content}
                </div>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* ── CONTACT STRIP ── */}
      <section style={{ background: "white", padding: "clamp(56px, 8vw, 80px) 5%" }}>
        <FadeIn>
          <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", gap: "clamp(32px, 5vw, 64px)", alignItems: "center", flexWrap: "wrap" as const }}>
            <div style={{ flex: 1, minWidth: 240 }}>
              <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: C.orange, marginBottom: 12 }}>Questions?</p>
              <h2 style={{ fontSize: "clamp(22px, 3.5vw, 32px)", fontWeight: 700, color: C.dark, letterSpacing: -0.5, marginBottom: 14, lineHeight: 1.2, fontFamily: "'Outfit', sans-serif" }}>
                Talk to us about your data.
              </h2>
              <p style={{ fontSize: 16, color: "var(--brand-muted-text)", lineHeight: 1.7 }}>
                If you have any questions about this policy, want to exercise your rights, or have a concern about how we've handled your data, get in touch and we'll respond within 30 days.
              </p>
            </div>
            <div>
              <Link
                href="/contact"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  background: C.dark, color: "white",
                  padding: "14px 28px", borderRadius: 8,
                  fontSize: 15, fontWeight: 700, textDecoration: "none",
                  whiteSpace: "nowrap" as const,
                }}
              >
                Contact us →
              </Link>
            </div>
          </div>
        </FadeIn>
      </section>

      <Footer />
    </div>
  );
}
