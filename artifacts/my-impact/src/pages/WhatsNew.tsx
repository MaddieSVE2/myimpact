// What's New page, rolling changelog of user-visible features.
//
// Convention: when shipping a user-visible feature, add a card to the
// LATEST release at the top of RELEASES below. Older releases stay in
// place and render as collapsible "Previous updates" entries, so the page
// reads as a rolling history. If the latest release is more than a month
// or two old, prepend a new release object (with a fresh `id`, `date`,
// `title`, `intro`, and `groups`) and the hero will pick up the new date
// automatically.
//
// Keep copy plain-English and short (one sentence). Use `lucide-react`
// icons consistent with the existing style. Group items under one of the
// existing badges ("For you", "Tools", "Organisations", "All users") via
// `BADGE_COLORS`, or add a new badge if it genuinely fits better.
import { useEffect, useState } from "react";
import { Link } from "wouter";
import {
  Wand2, BookMarked, FileDown, Smartphone, Building2, Users, LayoutDashboard,
  Mail, Contrast, Lightbulb, Zap, Monitor, PoundSterling, RefreshCw, Pencil,
  Heart, ToggleRight, ScanSearch, Share2, History, Award, UserPlus, NotebookPen,
  ShieldCheck, MessageSquare, Map, Activity, Globe, Lock, Wrench,
  Languages, Mic, Film,
  ChevronUp, ChevronDown,
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

interface Release {
  id: string;
  date: string;
  title: string;
  intro: string;
  groups: ReleaseGroup[];
}

const BADGE_COLORS = {
  forYou: "var(--brand-orange)",
  tools: "#2980b9",
  orgs: "#4a7c59",
  all: "#8e44ad",
};

const RELEASES: Release[] = [
  {
    id: "may-2026",
    date: "May 2026",
    title: "What's new",
    intro: "Since March we've added more ways to shape your wizard journey, given you a public profile to share, expanded milestones to discover, levelled up the organisation experience, and polished plenty of corners across the app.",
    groups: [
      {
        heading: "Your impact, your way",
        badge: "For you",
        badgeColor: BADGE_COLORS.forYou,
        items: [
          {
            icon: <Heart className="w-5 h-5" />,
            title: "Interests-led outcome suggestions",
            desc: "The wizard now tailors its activity suggestions to the causes you care about most, so the path you're offered actually matches what motivates you.",
          },
          {
            icon: <ToggleRight className="w-5 h-5" />,
            title: "Pick your AI mode up front",
            desc: "The AI mode toggle has moved to the very start of the wizard, so you choose how much help you want before you begin rather than partway through.",
          },
          {
            icon: <ScanSearch className="w-5 h-5" />,
            title: "Clearer match transparency",
            desc: "When the Sidekick matches what you've described, you can see exactly how it got there and confirm or adjust the proxy volume before it's saved.",
          },
          {
            icon: <Mic className="w-5 h-5" />,
            title: "Talk to your Sidekick",
            desc: "Tap the mic and have a real conversation with the Sidekick instead of typing, perfect when you're out and about or just want to think out loud.",
          },
        ],
      },
      {
        heading: "Your personal tools",
        badge: "Tools",
        badgeColor: BADGE_COLORS.tools,
        items: [
          {
            icon: <Share2 className="w-5 h-5" />,
            title: "Public profile sharing page",
            desc: "Share a lightweight public version of your impact with anyone, perfect for a CV, application, or a quick link to a friend.",
          },
          {
            icon: <History className="w-5 h-5" />,
            title: "Reopen any past report",
            desc: "Every report you've generated is now available from your History, open it again, share it, or download it whenever you need.",
          },
          {
            icon: <Award className="w-5 h-5" />,
            title: "Milestones with secret badges",
            desc: "Badges have been renamed to Milestones and expanded with hidden ones to discover as you keep contributing.",
          },
          {
            icon: <UserPlus className="w-5 h-5" />,
            title: "Invite a friend",
            desc: "Share My Impact with someone who'd love it, and unlock the new \"Spread the Word\" milestone for doing it.",
          },
          {
            icon: <NotebookPen className="w-5 h-5" />,
            title: "Refreshed journal prompts",
            desc: "Reflection prompts have been rewritten to feel warmer and more thought-provoking, so journalling feels less like homework.",
          },
          {
            icon: <Film className="w-5 h-5" />,
            title: "Your year in review video",
            desc: "Generate a short, shareable highlights video of your year on My Impact, your hours, your milestones, and the difference you've made.",
          },
        ],
      },
      {
        heading: "For organisations",
        badge: "Organisations",
        badgeColor: BADGE_COLORS.orgs,
        items: [
          {
            icon: <ShieldCheck className="w-5 h-5" />,
            title: "Organisation admin panel",
            desc: "Manage members, roles and organisation settings from a single dedicated admin panel, no more digging through different screens.",
          },
          {
            icon: <Map className="w-5 h-5" />,
            title: "OpenStreetMap on the dashboard",
            desc: "See where your members' activity is happening on a real map view built into the organisation dashboard.",
          },
          {
            icon: <Activity className="w-5 h-5" />,
            title: "Activity timeline & animated stats",
            desc: "A new timeline chart shows activity over time, and headline stats now animate in for a dashboard that genuinely feels alive.",
          },
        ],
      },
      {
        heading: "Improvements for everyone",
        badge: "All users",
        badgeColor: BADGE_COLORS.all,
        items: [
          {
            icon: <Mail className="w-5 h-5" />,
            title: "New Contact form & Privacy page",
            desc: "Get in touch with us through a proper contact form, and read up on how we handle your data on a dedicated Privacy page.",
          },
          {
            icon: <MessageSquare className="w-5 h-5" />,
            title: "In-app feedback mode",
            desc: "Spotted something? Switch on feedback mode and flag any element of any page, no need to leave the app or remember where you saw it.",
          },
          {
            icon: <Globe className="w-5 h-5" />,
            title: "Plain-language UN Sustainable Development Goals",
            desc: "Every SDG now comes with a clear, jargon-free explanation so you know what each goal really means for your work.",
          },
          {
            icon: <Lock className="w-5 h-5" />,
            title: "Choose what gets shared socially",
            desc: "You're now in control of whether milestone unlocks turn into shareable social cards, opt in only when you want to celebrate.",
          },
          {
            icon: <Languages className="w-5 h-5" />,
            title: "Cymraeg / Welsh language",
            desc: "Switch the whole app, including your monthly recap email and Sidekick replies, into Welsh from your account settings.",
          },
          {
            icon: <Wrench className="w-5 h-5" />,
            title: "Lots of small fixes",
            desc: "Activity lists are deduplicated, free-text matching is more accurate, local activity links work properly, and military and DofE content shows up where it should.",
          },
        ],
      },
    ],
  },
  {
    id: "march-2026",
    date: "March 2026",
    title: "What's new",
    intro: "A look at everything we've been building to make My Impact more useful, more personal, and more powerful, for you and the organisations you're part of.",
    groups: [
      {
        heading: "Your impact, your way",
        badge: "For you",
        badgeColor: BADGE_COLORS.forYou,
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
        badgeColor: BADGE_COLORS.tools,
        items: [
          {
            icon: <BookMarked className="w-5 h-5" />,
            title: "Journal entries created for you",
            desc: "After logging an activity, a journal card is automatically generated to help you reflect, you can edit or delete it anytime.",
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
        badgeColor: BADGE_COLORS.orgs,
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
        badgeColor: BADGE_COLORS.all,
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

function ReleaseGroups({ groups }: { groups: ReleaseGroup[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "clamp(56px, 8vw, 80px)" }}>
      {groups.map((group) => (
        <div key={group.heading}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 32, flexWrap: "wrap" }}>
            <span style={{
              padding: "5px 14px", borderRadius: 100,
              fontSize: 12, fontWeight: 700, letterSpacing: 0.5,
              background: `${group.badgeColor}22`,
              color: group.badgeColor,
              border: `1px solid ${group.badgeColor}44`,
            }}>
              {group.badge}
            </span>
            <h3 style={{
              fontSize: "clamp(20px, 3vw, 28px)", fontWeight: 700,
              color: C.dark, letterSpacing: -0.5,
              fontFamily: "'Outfit', sans-serif", margin: 0,
            }}>
              {group.heading}
            </h3>
          </div>

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
  );
}

export default function WhatsNew() {
  const latest = RELEASES[0];
  const previous = RELEASES.slice(1);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const togglePrev = (id: string) => {
    setOpenId((curr) => (curr === id ? null : id));
  };

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
            <span className="mi-dot" /> {latest.date}
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
            {latest.intro}
          </p>
        </div>
      </section>

      {/* ── LATEST RELEASE ── */}
      <section style={{ background: C.cream, padding: "clamp(56px, 8vw, 96px) 5% clamp(40px, 6vw, 64px)" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <ReleaseGroups groups={latest.groups} />
        </div>
      </section>

      {/* ── PREVIOUS UPDATES ── */}
      {previous.length > 0 && (
        <section style={{ background: C.cream, padding: "0 5% clamp(56px, 8vw, 96px)" }}>
          <div style={{ maxWidth: 900, margin: "0 auto" }}>
            <div style={{
              borderTop: "1px solid rgba(0,0,0,0.08)",
              paddingTop: "clamp(40px, 6vw, 64px)",
            }}>
              <h2 style={{
                fontSize: "clamp(22px, 3.2vw, 30px)", fontWeight: 800,
                color: C.dark, letterSpacing: -0.5,
                fontFamily: "'Outfit', sans-serif", margin: 0, marginBottom: 10,
              }}>
                Previous updates
              </h2>
              <p style={{ fontSize: 15, color: "var(--brand-muted-text)", margin: 0, marginBottom: 28, lineHeight: 1.6 }}>
                Catch up on everything we've shipped in earlier releases.
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {previous.map((rel) => {
                  const open = openId === rel.id;
                  return (
                    <div
                      key={rel.id}
                      style={{
                        background: "white",
                        borderRadius: 14,
                        border: "1px solid rgba(0,0,0,0.06)",
                        overflow: "hidden",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => togglePrev(rel.id)}
                        aria-expanded={open}
                        style={{
                          width: "100%",
                          background: "transparent",
                          border: "none",
                          textAlign: "left",
                          padding: "20px 24px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 16,
                          cursor: "pointer",
                          color: C.dark,
                          fontFamily: "inherit",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                          <span style={{
                            padding: "4px 12px", borderRadius: 100,
                            fontSize: 11, fontWeight: 700, letterSpacing: 1,
                            textTransform: "uppercase",
                            background: `${C.orange}1f`,
                            color: C.orange,
                            border: `1px solid ${C.orange}3a`,
                          }}>
                            {rel.date}
                          </span>
                          <span style={{ fontSize: 16, fontWeight: 700, color: C.dark }}>
                            {rel.title}
                          </span>
                        </div>
                        {open ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                      </button>

                      {open && (
                        <div style={{ padding: "8px 24px 28px", borderTop: "1px solid rgba(0,0,0,0.06)" }}>
                          <p style={{ fontSize: 14, color: "var(--brand-muted-text)", lineHeight: 1.65, margin: "16px 0 28px" }}>
                            {rel.intro}
                          </p>
                          <ReleaseGroups groups={rel.groups} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      )}

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

    </div>
  );
}
