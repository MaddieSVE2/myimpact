import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { Footer } from "@/components/layout/Footer";

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

interface Section {
  id: string;
  title: string;
  content: React.ReactNode;
}

const SECTIONS: Section[] = [
  {
    id: "about-these-terms",
    title: "About these terms",
    content: (
      <>
        <p>
          These terms set out the agreement between you and My Impact CIC (a community interest
          company registered in England and Wales) when you use the My Impact website and apps
          (the "Service"). By creating an account or using the Service, you agree to these terms.
        </p>
        <p style={{ marginTop: 12 }}>
          We've tried to keep them short and in plain English. If anything is unclear, write to{" "}
          <a href="mailto:hello@myimpact.uk" style={{ color: C.orange, fontWeight: 600, textDecoration: "none" }}>hello@myimpact.uk</a>.
        </p>
      </>
    ),
  },
  {
    id: "your-account",
    title: "Your account",
    content: (
      <>
        <p>
          You must be 16 or over to create a My Impact account. You're responsible for keeping
          your sign-in email secure, we use one-time magic links rather than passwords, so anyone
          with access to your inbox can sign in.
        </p>
        <p style={{ marginTop: 12 }}>
          You can stop using the Service at any time. From{" "}
          <Link href="/settings" style={{ color: C.orange, fontWeight: 600, textDecoration: "none" }}>Settings</Link>{" "}
          you can download all your data or permanently delete your account.
        </p>
      </>
    ),
  },
  {
    id: "your-content",
    title: "Your content",
    content: (
      <>
        <p>
          The impact records, journal entries, photos and receipts you save on My Impact stay
          yours. We host them so the Service can show them back to you and calculate your social
          value. We don't sell your content and we don't share it with anyone you haven't chosen
          to share it with (e.g. an organisation you've joined or a public profile slug you
          choose to publish).
        </p>
        <p style={{ marginTop: 12 }}>
          You give us a limited licence to store, display and back up that content for as long
          as your account exists, purely so the Service works. Delete content (or your whole
          account) and the licence ends with it.
        </p>
      </>
    ),
  },
  {
    id: "acceptable-use",
    title: "Acceptable use",
    content: (
      <>
        <p>Please don't use My Impact to:</p>
        <ul style={{ marginTop: 12, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
          <li>Upload anything illegal, abusive, or that breaches someone else's rights.</li>
          <li>Falsify volunteering hours, donations or other impact data.</li>
          <li>Try to break, scrape or interfere with the Service.</li>
          <li>Impersonate someone else or pretend to be from an organisation you don't represent.</li>
        </ul>
        <p style={{ marginTop: 12 }}>
          We may suspend or close accounts that abuse the Service. We'll always try to tell you
          why.
        </p>
      </>
    ),
  },
  {
    id: "ai-features",
    title: "AI features (Sidekick)",
    content: (
      <>
        <p>
          The optional Sidekick AI assistant uses a third-party language model to suggest ideas
          and summarise your impact. When you send a Sidekick message, the relevant prompt and
          (where you've enabled it) recent context from your account are sent to the model
          provider so they can generate a reply. Replies are best-effort guidance, not professional
          advice, please use your own judgement.
        </p>
        <p style={{ marginTop: 12 }}>
          You can turn voice replies on or off, and decline to use Sidekick entirely, from{" "}
          <Link href="/settings" style={{ color: C.orange, fontWeight: 600, textDecoration: "none" }}>Settings</Link>.
        </p>
      </>
    ),
  },
  {
    id: "service-changes",
    title: "Changes to the Service",
    content: (
      <>
        <p>
          My Impact is under active development. Features may change, be added, or be removed
          over time. We'll keep the core promise, that your data stays yours and you can take
          it with you, even as the Service evolves.
        </p>
        <p style={{ marginTop: 12 }}>
          If we make changes that significantly affect your rights, we'll let you know by email
          before they take effect.
        </p>
      </>
    ),
  },
  {
    id: "no-warranty",
    title: "No warranty",
    content: (
      <>
        <p>
          We work hard to keep My Impact running, accurate and secure, but we provide the Service
          "as is". To the extent allowed by law, we don't promise it will be uninterrupted,
          error-free, or that the social value figures will be accurate for any particular
          purpose.
        </p>
      </>
    ),
  },
  {
    id: "liability",
    title: "Liability",
    content: (
      <>
        <p>
          Nothing in these terms limits liability for death or personal injury caused by our
          negligence, for fraud, or anything else that can't be limited by law. Subject to that,
          our total liability to you in any 12-month period is capped at £100. We aren't liable
          for indirect or consequential losses.
        </p>
      </>
    ),
  },
  {
    id: "ending-the-agreement",
    title: "Ending the agreement",
    content: (
      <>
        <p>
          You can close your account at any time from Settings. We can suspend or close your
          account if you breach these terms, or if we're required to by law. If we close your
          account we'll usually email you first, except where we can't (for example, where doing
          so would prejudice an investigation).
        </p>
        <p style={{ marginTop: 12 }}>
          The clauses about your content, liability and governing law survive the end of this
          agreement.
        </p>
      </>
    ),
  },
  {
    id: "governing-law",
    title: "Governing law",
    content: (
      <>
        <p>
          These terms are governed by the law of England and Wales. Disputes will be heard by the
          courts of England and Wales, except where mandatory consumer protection law in your
          country of residence applies instead.
        </p>
      </>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    content: (
      <>
        <p>
          Questions, feedback, or notices about these terms: <a href="mailto:hello@myimpact.uk" style={{ color: C.orange, fontWeight: 600, textDecoration: "none" }}>hello@myimpact.uk</a>.
        </p>
      </>
    ),
  },
];

export default function Terms() {
  useEffect(() => {
    window.scrollTo(0, 0);
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
            <span className="mi-dot" /> Terms of Service
          </div>
          <h1 className="mi-fraunces" style={{
            fontSize: "clamp(38px, 6vw, 62px)", fontWeight: 900, color: "white",
            lineHeight: 1.05, marginBottom: 20, letterSpacing: -2,
          }}>
            The plain-English{" "}
            <span style={{ color: C.orange, fontStyle: "italic" }}>terms.</span>
          </h1>
          <p style={{ fontSize: "clamp(16px, 2vw, 19px)", color: "rgba(255,255,255,0.7)", lineHeight: 1.7, maxWidth: 600 }}>
            What you can expect from us, and what we ask from you, when you use My Impact.
          </p>
          <p style={{ marginTop: 20, fontSize: 13, color: "rgba(255,255,255,0.4)", letterSpacing: 0.3 }}>
            Last updated: 7 May 2026
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
                <div style={{ fontSize: 15, color: "var(--brand-muted-text)", lineHeight: 1.8, paddingLeft: 46 }}>
                  {section.content}
                </div>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      <Footer />
    </div>
  );
}
