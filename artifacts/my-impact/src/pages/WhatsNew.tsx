import { useEffect } from "react";
import { Link } from "wouter";
import { Footer } from "@/components/layout/Footer";
import {
  Wand2, BookMarked, FileDown, Smartphone, Building2, Users, LayoutDashboard,
  Mail, Contrast, Lightbulb, Zap, Monitor, PoundSterling, RefreshCw, Pencil,
} from "lucide-react";

const C = {
  dark: "var(--brand-dark)",
  orange: "var(--brand-orange)",
  olive: "var(--brand-olive)",
  cream: "var(--brand-cream)",
  offBlack: "var(--brand-off-black)",
};

interface ReleaseItem {
  icon: React.ReactNode;
  title: string;
  desc: string;
}

interface ReleaseGroup {
  heading: string;
  badge: string;
  badgeColor: string;
  items: ReleaseItem[];
}

const GROUPS: ReleaseGroup[] = [
  {
    heading: "Your impact, your way",
    badge: "For you",
    badgeColor: C.orange,
    items: [
      {
        icon: <Wand2 className="w-5 h-5" />,
        title: "Describe your volunteering in your own words",
        desc: "The Sidekick AI can now understand plain-English descriptions of what you do and match them to recognised social value activities automatically.",
      },
      {
        icon: <RefreshCw className="w-5 h-5" />,
        title: "Saved progress & recurring activities",
        desc: "The wizard now remembers where you left off, and you can mark activities as something you do regularly without re-entering everything each time.",
      },
      {
        icon: <Sparkle />,
        title: "Personalised experience based on your profile",
        desc: "Once you've set up your profile, the wizard adapts its questions and suggestions to your situation.",
      },
      {
        icon: <Users className="w-5 h-5" />,
        title: "More ways to describe yourself",
        desc: "You can now select multiple situations at once (e.g. student and carer), and we've added new options including Armed Forces, Career Break, and Duke of Edinburgh participants.",
      },
    ],
  },
  {
    heading: "Your personal tools",
    badge: "Tools",
    badgeColor: "#2980b9",
    items: [
      {
        icon: <BookMarked className="w-5 h-5" />,
        title: "Journal entries created for you",
        desc: "After logging an activity, a journal card is automatically generated to help you reflect — you can edit or delete it anytime.",
      },
      {
        icon: <Pencil className="w-5 h-5" />,
        title: "Edit and delete history records",
        desc: "You can now correct or remove past impact records directly from your History page.",
      },
      {
        icon: <FileDown className="w-5 h-5" />,
        title: "Download your impact as a PDF",
        desc: "Share your social value summary as a polished PDF, ready to attach to a LinkedIn profile or job application.",
      },
      {
        icon: <Smartphone className="w-5 h-5" />,
        title: "Install My Impact on your home screen",
        desc: "My Impact can now be added to your phone or tablet home screen like a native app, for quick access anytime.",
      },
    ],
  },
  {
    heading: "For organisations",
    badge: "Organisations",
    badgeColor: "#4a7c59",
    items: [
      {
        icon: <LayoutDashboard className="w-5 h-5" />,
        title: "Organisation dashboard",
        desc: "Schools, charities, local authorities, and universities can now register and view aggregated impact across their members in a dedicated dashboard.",
      },
      {
        icon: <Users className="w-5 h-5" />,
        title: "Bulk invite members & export reports",
        desc: "Org admins can now invite multiple members at once and download PDF impact reports for any time period.",
      },
      {
        icon: <Building2 className="w-5 h-5" />,
        title: "Demo dashboard",
        desc: "Anyone can explore a realistic example of what an organisation dashboard looks like, without needing to register.",
      },
      {
        icon: <Mail className="w-5 h-5" />,
        title: "Confirmation email on registration",
        desc: "Organisations now receive a welcome email when they sign up.",
      },
    ],
  },
  {
    heading: "Improvements for everyone",
    badge: "All users",
    badgeColor: "#8e44ad",
    items: [
      {
        icon: <Contrast className="w-5 h-5" />,
        title: "High contrast mode",
        desc: "A new accessibility option makes the app easier to read for users with visual sensitivities.",
      },
      {
        icon: <Lightbulb className="w-5 h-5" />,
        title: "Inspire me",
        desc: "A button on the home page that shows a random real-world impact story to spark ideas.",
      },
      {
        icon: <Zap className="w-5 h-5" />,
        title: "Faster, smarter Sidekick",
        desc: "The AI assistant now responds more quickly and handles a wider range of questions, including tricky ones about how social value is calculated.",
      },
      {
        icon: <Monitor className="w-5 h-5" />,
        title: "Polished on mobile",
        desc: "A thorough review and fix pass across all mobile screen sizes.",
      },
      {
        icon: <PoundSterling className="w-5 h-5" />,
        title: "Your value per hour",
        desc: "Impact results now show what your contribution is worth per hour, making it easier to communicate your social value.",
      },
    ],
  },
];

function Sparkle() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3 L13.5 8.5 L19 10 L13.5 11.5 L12 17 L10.5 11.5 L5 10 L10.5 8.5 Z" />
      <path d="M19 3 L19.8 5.2 L22 6 L19.8 6.8 L19 9 L18.2 6.8 L16 6 L18.2 5.2 Z" />
      <path d="M5 17 L5.5 18.5 L7 19 L5.5 19.5 L5 21 L4.5 19.5 L3 19 L4.5 18.5 Z" />
    </svg>
  );
}

export default function WhatsNew() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", color: C.dark, overflowX: "hidden" }}>

      {/* ── HERO ── */}
      <section className="mi-hero" style={{ minHeight: "auto", paddingBottom: 72, paddingTop: 72 }}>
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
            <span className="mi-dot" /> March 2026
          </div>
          <h1
            className="mi-fraunces"
            style={{
              fontSize: "clamp(36px, 6vw, 62px)",
              fontWeight: 900, color: "white",
              lineHeight: 1.05, marginBottom: 20, letterSpacing: -2,
            }}
          >
            What's{" "}
            <span style={{ color: C.orange, fontStyle: "italic" }}>new</span>
          </h1>
          <p style={{ fontSize: "clamp(16px, 2vw, 19px)", color: "rgba(255,255,255,0.7)", lineHeight: 1.7, maxWidth: 580 }}>
            A look at everything we've been building to make My Impact more useful, more personal, and more powerful — for you and the organisations you're part of.
          </p>
        </div>
      </section>

      {/* ── RELEASE GROUPS ── */}
      <section style={{ background: C.cream, padding: "clamp(56px, 8vw, 96px) 5%" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", flexDirection: "column", gap: "clamp(56px, 8vw, 80px)" }}>
          {GROUPS.map((group) => (
            <div key={group.heading}>
              {/* Group header */}
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 32 }}>
                <span style={{
                  padding: "5px 14px", borderRadius: 100,
                  fontSize: 12, fontWeight: 700, letterSpacing: 0.5,
                  background: `${group.badgeColor}22`,
                  color: group.badgeColor,
                  border: `1px solid ${group.badgeColor}44`,
                }}>
                  {group.badge}
                </span>
                <h2 style={{
                  fontSize: "clamp(20px, 3vw, 28px)", fontWeight: 700,
                  color: C.dark, letterSpacing: -0.5,
                  fontFamily: "'Outfit', sans-serif", margin: 0,
                }}>
                  {group.heading}
                </h2>
              </div>

              {/* Items grid */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 380px), 1fr))",
                gap: 16,
              }}>
                {group.items.map((item) => (
                  <div
                    key={item.title}
                    style={{
                      background: "white",
                      borderRadius: 14,
                      padding: "22px 24px",
                      border: "1px solid rgba(0,0,0,0.06)",
                      display: "flex",
                      gap: 16,
                      alignItems: "flex-start",
                    }}
                  >
                    <div style={{
                      width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                      background: `${group.badgeColor}18`,
                      color: group.badgeColor,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {item.icon}
                    </div>
                    <div>
                      <p style={{ fontSize: 15, fontWeight: 700, color: C.dark, marginBottom: 5, lineHeight: 1.3 }}>
                        {item.title}
                      </p>
                      <p style={{ fontSize: 14, color: "var(--brand-muted-text)", lineHeight: 1.65, margin: 0 }}>
                        {item.desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section style={{ background: C.orange, padding: "clamp(60px, 10vw, 100px) 5%", textAlign: "center" }}>
        <div style={{ maxWidth: 600, margin: "0 auto" }}>
          <h2 style={{ fontSize: "clamp(26px, 4.5vw, 44px)", fontWeight: 900, color: "white", letterSpacing: -1, marginBottom: 16, lineHeight: 1.1, fontFamily: "'Outfit', sans-serif" }}>
            Ready to explore everything?
          </h2>
          <p style={{ fontSize: 17, color: "rgba(255,255,255,0.85)", marginBottom: 36, lineHeight: 1.6 }}>
            Everything above is live and waiting for you. It takes about three minutes to calculate your impact.
          </p>
          <Link href="/wizard/actions" className="mi-btn-white">
            Calculate my impact →
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}
