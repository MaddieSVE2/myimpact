import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { scrollContentToTop } from "@/lib/scroll-utils";

const C = {
  dark: "var(--brand-dark)",
  orange: "var(--brand-orange)",
  cream: "var(--brand-cream)",
};

function useInView(threshold = 0.1) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) setVisible(true); },
      { threshold },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, visible] as const;
}

function FadeIn({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const [ref, visible] = useInView();
  return (
    <div
      ref={ref}
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

interface QA {
  q: string;
  a: React.ReactNode;
}

interface Section {
  id: string;
  title: string;
  qas: QA[];
}

const SECTIONS: Section[] = [
  {
    id: "data-handling",
    title: "Data handling & storage",
    qas: [
      {
        q: "Where is our data stored?",
        a: <p>All personal data is currently hosted on <strong>US-based cloud infrastructure</strong>. Transfers from the UK are covered by appropriate safeguards under UK GDPR. We are planning a migration to UK/EEA-based hosting in a future release.</p>,
      },
      {
        q: "Is data encrypted in transit and at rest?",
        a: <p>Yes. All connections use HTTPS/TLS, and stored data, including database contents and file attachments, is encrypted at rest using industry-standard ciphers.</p>,
      },
      {
        q: "What kinds of data does My Impact hold about our organisation and members?",
        a: (
          <>
            <p>We hold the minimum needed to run the service: account details (email, optional display name), the activities and contributions members log, optional journal entries and attachments, and your organisation's name, type and contact email.</p>
            <p style={{ marginTop: 12 }}>For a full list, see our <Link href="/privacy" style={{ color: C.orange, fontWeight: 600, textDecoration: "none" }}>Privacy Policy</Link>.</p>
          </>
        ),
      },
    ],
  },
  {
    id: "access-control",
    title: "Access control & authentication",
    qas: [
      {
        q: "How do members and admins sign in?",
        a: <p>We use passwordless one-time magic links sent to your verified email, optionally combined with single sign-on through Google or Microsoft. We never store passwords.</p>,
      },
      {
        q: "Who on the My Impact team can access our data?",
        a: <p>Access to production systems is restricted to a small number of named engineers on a least-privilege basis. Access is logged, reviewed periodically, and revoked promptly when no longer needed.</p>,
      },
      {
        q: "Are there role-based permissions inside an organisation account?",
        a: <p>Yes. Organisation accounts distinguish between admins (who can manage settings, members and exports) and members (who can only see their own data). Admins choose who has elevated rights.</p>,
      },
    ],
  },
  {
    id: "tenant-isolation",
    title: "Tenant isolation & confidentiality",
    qas: [
      {
        q: "Is one organisation's data ever visible to another?",
        a: <p>No. Every record is scoped to its owning organisation and member. Database queries enforce these scopes at the application layer, and admins of one organisation cannot see records belonging to another.</p>,
      },
      {
        q: "Can a member's individual records be seen by their organisation's admins?",
        a: <p>Members control what they share. Aggregated, anonymised totals are visible to admins by default; identifiable individual records are only visible where the member has explicitly opted in (for example, by submitting an entry to a shared challenge).</p>,
      },
      {
        q: "Will My Impact use our data to benchmark against other customers?",
        a: <p>We may publish anonymised, aggregated statistics about overall service usage. We do not name or identify customers in benchmarks without written permission.</p>,
      },
    ],
  },
  {
    id: "sub-processors",
    title: "Sub-processors & third parties",
    qas: [
      {
        q: "Who are your sub-processors?",
        a: (
          <>
            <p>We use a small set of named, trusted processors, each bound by a data processing agreement:</p>
            <ul style={{ marginTop: 12, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 10 }}>
              <li><strong>Managed cloud hosting (USA)</strong>: application hosting and managed PostgreSQL database.</li>
              <li><strong>Resend</strong>: transactional email delivery (magic links, notifications).</li>
              <li><strong>Stripe</strong>: payment processing for paid plans (we never see card details).</li>
              <li><strong>OpenAI</strong>: powers the optional Sidekick AI assistant via enterprise endpoints.</li>
              <li><strong>Sentry</strong>: anonymised error monitoring with sensitive values scrubbed before sending.</li>
            </ul>
            <p style={{ marginTop: 12 }}>The full list with locations and safeguards is on our <Link href="/privacy" style={{ color: C.orange, fontWeight: 600, textDecoration: "none" }}>Privacy Policy</Link>.</p>
          </>
        ),
      },
      {
        q: "Will you tell us before adding a new sub-processor?",
        a: <p>Yes. We maintain a current list of sub-processors and notify organisation admins by email before adding new ones, giving you a reasonable window to object.</p>,
      },
      {
        q: "Do you sell or share data for marketing?",
        a: <p>No. We do not sell personal data, and we do not share it with advertising networks or data brokers.</p>,
      },
    ],
  },
  {
    id: "backups",
    title: "Backups, resilience & continuity",
    qas: [
      {
        q: "How often is data backed up?",
        a: <p>The production database is backed up at least daily, with point-in-time recovery available for recent windows. Backups are encrypted and stored in the same region as the primary database.</p>,
      },
      {
        q: "What is the recovery objective if something goes wrong?",
        a: <p>We target a recovery point objective (RPO) of under 24 hours and a recovery time objective (RTO) of under 24 hours for full service restoration. Most disruptions resolve far faster.</p>,
      },
      {
        q: "Do you have a business continuity plan?",
        a: <p>Yes. We maintain a documented continuity plan covering hosting failure, key-personnel loss, and supplier outage, and we review it at least annually.</p>,
      },
    ],
  },
  {
    id: "incident-response",
    title: "Incident response & breach notification",
    qas: [
      {
        q: "What happens if you discover a security incident?",
        a: <p>We follow a documented incident-response runbook: contain, investigate, remediate, and learn. Affected systems are isolated immediately, the root cause is identified, and changes are made to prevent recurrence.</p>,
      },
      {
        q: "How quickly will you notify us of a personal data breach?",
        a: <p>Where a breach is likely to affect your organisation or its members, we will notify the relevant admin contact without undue delay and in any event within 72 hours of becoming aware, in line with UK GDPR.</p>,
      },
      {
        q: "Do you run security testing?",
        a: <p>Yes. We run automated dependency scanning and static analysis on every change, and review our security posture regularly. Penetration test summaries are available under NDA on request.</p>,
      },
    ],
  },
  {
    id: "compliance",
    title: "Compliance & legal",
    qas: [
      {
        q: "Are you UK GDPR compliant?",
        a: <p>Yes. My Impact CIC is the data controller for personal data you and your members submit, and we operate in line with the UK GDPR and Data Protection Act 2018.</p>,
      },
      {
        q: "Will you sign a Data Processing Agreement (DPA)?",
        a: <p>Yes. We have a standard DPA covering controller-to-processor obligations where applicable. Contact us at <a href="mailto:hello@myimpact.uk" style={{ color: C.orange, fontWeight: 600, textDecoration: "none" }}>hello@myimpact.uk</a> for a copy.</p>,
      },
      {
        q: "Can you complete a security questionnaire for our procurement team?",
        a: <p>Yes. We're happy to complete reasonable due-diligence questionnaires (SIG-lite, supplier security reviews, etc.). Email us with the document and your timeline.</p>,
      },
    ],
  },
  {
    id: "rights-retention",
    title: "Data subject rights, retention & exit",
    qas: [
      {
        q: "How can a member exercise their data rights (access, correction, deletion)?",
        a: <p>Members can download a complete export of their own data, and can permanently delete their account, directly from <Link href="/settings" style={{ color: C.orange, fontWeight: 600, textDecoration: "none" }}>Settings</Link>. We respond to any other UK GDPR request within 30 days.</p>,
      },
      {
        q: "How long do you keep our data?",
        a: <p>We keep personal data for as long as the related account is active. When an account is deleted, personal data is erased within 30 days, except where we are required to retain limited records for legal or accounting reasons.</p>,
      },
      {
        q: "What happens to our data if we leave My Impact?",
        a: <p>You can export your organisation's data on request before closing the account. Once closed, all personal data is deleted in line with the retention policy above.</p>,
      },
    ],
  },
  {
    id: "ai-features",
    title: "AI features (Sidekick)",
    qas: [
      {
        q: "Is anything someone types into Sidekick shared with the AI provider for training?",
        a: <p>No. Sidekick uses enterprise endpoints with zero data retention agreements in place. Inputs and outputs are not used to train the underlying model, and the provider does not retain prompt content beyond what is needed to return a response.</p>,
      },
      {
        q: "Can we disable AI features entirely for our organisation?",
        a: <p>Yes. Organisation admins can switch Sidekick off across the account, and individual members can choose not to use it. With AI features disabled, no prompts or context are ever sent to the AI provider.</p>,
      },
      {
        q: "Could AI output expose sensitive information?",
        a: <p>Sidekick responses are generated from the prompt and the limited context the user explicitly chooses to include (such as their own recent activity totals). It cannot read other members' records, your private settings, or anything outside the user's own scope. We treat AI replies as best-effort guidance, not as authoritative or specialist advice.</p>,
      },
    ],
  },
];

export default function Security() {
  useEffect(() => {
    scrollContentToTop();
  }, []);

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", color: C.dark, overflowX: "hidden" }}>
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
            <span className="mi-dot" /> Security &amp; Privacy
          </div>
          <h1 className="mi-fraunces" style={{
            fontSize: "clamp(38px, 6vw, 62px)", fontWeight: 900, color: "white",
            lineHeight: 1.05, marginBottom: 20, letterSpacing: -2,
          }}>
            How we protect{" "}
            <span style={{ color: C.orange, fontStyle: "italic" }}>your data.</span>
          </h1>
          <p style={{ fontSize: "clamp(16px, 2vw, 19px)", color: "rgba(255,255,255,0.7)", lineHeight: 1.7, maxWidth: 640 }}>
            This page summarises how My Impact protects organisation and member data, from where it's stored, to who can see it, to how we'd handle an incident. If you need a full DPA or our response to a security questionnaire, just <Link href="/contact" style={{ color: C.orange, fontWeight: 700, textDecoration: "none" }}>get in touch</Link>.
          </p>
          <p style={{ marginTop: 20, fontSize: 13, color: "rgba(255,255,255,0.4)", letterSpacing: 0.3 }}>
            Last updated: 9 May 2026
          </p>
        </div>
      </section>

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
                  }}>{i + 1}</div>
                  <h2 style={{
                    fontSize: "clamp(20px, 3vw, 26px)", fontWeight: 700,
                    color: C.dark, letterSpacing: -0.5,
                    fontFamily: "'Outfit', sans-serif", margin: 0,
                  }}>{section.title}</h2>
                </div>
                <div style={{ paddingLeft: 46, display: "flex", flexDirection: "column", gap: 24 }}>
                  {section.qas.map((qa, qi) => (
                    <div key={qi}>
                      <h3 style={{
                        fontSize: 16, fontWeight: 700, color: C.dark,
                        fontFamily: "'Outfit', sans-serif", margin: 0, marginBottom: 8,
                        lineHeight: 1.4,
                      }}>{qa.q}</h3>
                      <div style={{ fontSize: 15, color: "var(--brand-muted-text)", lineHeight: 1.8 }}>
                        {qa.a}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      <section style={{ background: "white", padding: "clamp(56px, 8vw, 80px) 5%" }}>
        <FadeIn>
          <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", gap: "clamp(32px, 5vw, 64px)", alignItems: "center", flexWrap: "wrap" as const }}>
            <div style={{ flex: 1, minWidth: 240 }}>
              <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: C.orange, marginBottom: 12 }}>Need more detail?</p>
              <h2 style={{ fontSize: "clamp(22px, 3.5vw, 32px)", fontWeight: 700, color: C.dark, letterSpacing: -0.5, marginBottom: 14, lineHeight: 1.2, fontFamily: "'Outfit', sans-serif" }}>
                Ask us anything.
              </h2>
              <p style={{ fontSize: 16, color: "var(--brand-muted-text)", lineHeight: 1.7 }}>
                Need our DPA, a completed security questionnaire, or a deeper conversation with our team? We're happy to help, most requests get a response within a couple of working days.
              </p>
            </div>
            <div>
              <Link
                href="/contact"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  background: "var(--brand-dark)", color: "white",
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

    </div>
  );
}
