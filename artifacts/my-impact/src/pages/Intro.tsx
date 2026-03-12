import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";

const C = {
  dark: "#213547",      // primary dark — hero/proof/orgs background
  orange: "#E8633A",    // main accent — CTAs, highlights, section labels, "prove it"
  olive: "#B5BE2E",     // secondary — pound values, story values
  slate: "#7E8FAD",     // tertiary — step numbers, hours
  lightBlue: "#A8C8DA", // card icon backgrounds, soft fills
  cream: "#F7F5EF",     // light section backgrounds
  offBlack: "#0D1B1E",  // footer background
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

export default function Intro() {
  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", color: C.dark, overflowX: "hidden" }}>
      <style>{`
        .mi-hero {
          min-height: calc(100vh - 4rem);
          background: ${C.dark};
          position: relative;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }
        .mi-hero::before {
          content: '';
          position: absolute;
          top: -40%; right: -20%;
          width: 80vw; height: 80vw;
          border-radius: 50%;
          background: radial-gradient(circle, ${C.orange}28 0%, transparent 70%);
          pointer-events: none;
        }
        .mi-hero::after {
          content: '';
          position: absolute;
          bottom: -20%; left: -10%;
          width: 50vw; height: 50vw;
          border-radius: 50%;
          background: radial-gradient(circle, ${C.lightBlue}22 0%, transparent 70%);
          pointer-events: none;
        }
        .mi-fraunces { font-family: 'Fraunces', Georgia, serif; }
        .mi-section-label { font-size: 12px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: ${C.orange}; margin-bottom: 12px; }
        .mi-section-title { font-family: 'Fraunces', Georgia, serif; font-size: clamp(26px, 4vw, 42px); font-weight: 700; color: ${C.dark}; letter-spacing: -1px; margin-bottom: 48px; max-width: 500px; line-height: 1.15; }
        .mi-btn-hero {
          background: ${C.orange};
          color: white;
          padding: 14px 32px;
          border-radius: 100px;
          font-weight: 700;
          font-size: 15px;
          text-decoration: none;
          border: none;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          transition: all 0.25s;
        }
        .mi-btn-hero:hover { transform: translateY(-2px); box-shadow: 0 8px 28px ${C.orange}50; }
        .mi-scroll-hint {
          position: absolute;
          bottom: 28px; left: 50%;
          transform: translateX(-50%);
          display: flex; flex-direction: column; align-items: center; gap: 8px;
          z-index: 5;
        }
        .mi-scroll-hint span { color: rgba(255,255,255,0.3); font-size: 11px; letter-spacing: 2px; text-transform: uppercase; }
        .mi-scroll-line { width: 1px; height: 40px; background: linear-gradient(to bottom, rgba(255,255,255,0.3), transparent); animation: miScrollDown 2s infinite; }
        @keyframes miScrollDown { 0% { opacity: 1; transform: scaleY(1); } 100% { opacity: 0; transform: scaleY(0.3) translateY(20px); } }
        @keyframes miPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        .mi-dot { width: 6px; height: 6px; border-radius: 50%; background: ${C.olive}; animation: miPulse 2s infinite; display: inline-block; flex-shrink: 0; }
        .mi-count-card { padding: 28px 24px; border-radius: 16px; background: ${C.cream}; border: 1px solid rgba(0,0,0,0.04); transition: all 0.3s; height: 100%; box-sizing: border-box; }
        .mi-count-card:hover { transform: translateY(-4px); box-shadow: 0 12px 40px rgba(0,0,0,0.06); }
        .mi-story-card { border-radius: 20px; overflow: hidden; border: 1px solid rgba(0,0,0,0.07); transition: all 0.3s; height: 100%; display: flex; flex-direction: column; }
        .mi-story-card:hover { transform: translateY(-4px); box-shadow: 0 16px 48px rgba(0,0,0,0.08); }
        .mi-how-step { display: flex; gap: 28px; padding: 36px 0; border-bottom: 1px solid rgba(0,0,0,0.07); }
        .mi-how-step:last-child { border-bottom: none; }
        .mi-org-card { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.09); border-radius: 16px; padding: 28px 24px; height: 100%; box-sizing: border-box; position: relative; }
        .mi-cta-section { background: ${C.orange}; padding: clamp(60px,8vw,100px) 5%; text-align: center; position: relative; overflow: hidden; }
        .mi-cta-section::before { content: ''; position: absolute; top: -50%; right: -30%; width: 60vw; height: 60vw; border-radius: 50%; background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%); }
        .mi-btn-white { background: white; color: ${C.dark}; padding: 16px 40px; border-radius: 100px; font-weight: 700; font-size: 16px; border: none; cursor: pointer; transition: all 0.25s; display: inline-flex; align-items: center; gap: 8px; text-decoration: none; }
        .mi-btn-white:hover { transform: translateY(-2px); box-shadow: 0 8px 30px rgba(0,0,0,0.2); }
        @media (max-width: 768px) {
          .mi-proof-grid { grid-template-columns: 1fr !important; gap: 24px !important; }
          .mi-cv-grid { grid-template-columns: 1fr !important; gap: 32px !important; }
          .mi-how-step { flex-direction: column; gap: 12px; }
          .mi-counts-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>
      {/* ── HERO ── */}
      <section className="mi-hero">
        {/* Faces image — blended into right side of hero */}
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
              opacity: 0.18,
              mixBlendMode: "luminosity",
            }}
          />
        </div>

        <div style={{ position: "relative", zIndex: 2, padding: "0 5% 80px", maxWidth: 860 }}>
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
            <span className="mi-dot" /> Powered by the Social Value Engine
          </div>

          <h1
            className="mi-fraunces"
            style={{
              fontSize: "clamp(42px, 7vw, 78px)",
              fontWeight: 900, color: "white",
              lineHeight: 1.05, marginBottom: 24, letterSpacing: -2,
            }}
          >
            You already make a difference.<br />
            Now{" "}
            <span style={{ color: C.orange, fontStyle: "italic" }}>prove it.</span>
          </h1>

          <p style={{ fontSize: "clamp(17px, 2vw, 20px)", color: "rgba(255,255,255,0.65)", lineHeight: 1.65, maxWidth: 560, marginBottom: 40 }}>
            Every time you volunteer, help someone, or show up for your community, you create{" "}
            <strong style={{ color: "rgba(255,255,255,0.9)" }}>real social value</strong>. My Impact calculates what that's worth —{" "}
            <strong style={{ color: "rgba(255,255,255,0.9)" }}>in pounds</strong> — so you can finally see the difference you make.
          </p>

          <Link href="/wizard/actions" className="mi-btn-hero">
            Calculate my impact →
          </Link>
        </div>

        <div className="mi-scroll-hint">
          <span>Scroll</span>
          <div className="mi-scroll-line" />
        </div>
      </section>
      {/* ── GDP STATEMENT ── */}
      <section style={{ background: C.cream, padding: "clamp(60px, 10vw, 120px) 5%" }}>
        <FadeIn>
          <div style={{ maxWidth: 960, margin: "0 auto" }}>
            <p className="mi-fraunces" style={{ fontSize: "clamp(28px, 4.5vw, 52px)", fontWeight: 700, color: C.dark, lineHeight: 1.2, marginBottom: 24, letterSpacing: -1 }}>
              Your worth isn't measured in{" "}
              <span style={{ color: C.orange, fontStyle: "italic" }}>GDP.</span>
            </p>
            <p style={{ fontSize: 18, color: "#4A5568", lineHeight: 1.75, maxWidth: 680 }}>
              The economy doesn't count the hours you spend mentoring someone, looking after a relative, picking litter off a riverbank, or running a community group. But that work matters. It holds communities together. And until now, there's been no way for you to see what it's actually worth. We built My Impact to change that.
            </p>
          </div>
        </FadeIn>
      </section>
      {/* ── WHAT COUNTS ── */}
      <section id="how" style={{ background: "white", padding: "clamp(60px, 10vw, 120px) 5%" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <FadeIn>
            <p className="mi-section-label">What counts</p>
            <p className="mi-section-title">If it helps people or planet, it counts.</p>
          </FadeIn>
          <div className="mi-counts-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20, alignItems: "stretch" }}>
            {[
              { icon: "🤝", bg: `${C.lightBlue}55`, title: "Volunteering", desc: "Giving your time to a charity, club, food bank, or community project." },
              { icon: "💚", bg: `${C.olive}28`, title: "Caring", desc: "Looking after a family member, supporting a friend through a tough time, or mentoring someone younger." },
              { icon: "🌱", bg: `${C.olive}28`, title: "Environment", desc: "Litter picks, tree planting, cycling instead of driving, reducing waste." },
              { icon: "🏘️", bg: `${C.orange}1A`, title: "Community", desc: "Organising events, running a club, being a good neighbour, showing up for your area." },
              { icon: "📢", bg: `${C.lightBlue}55`, title: "Campaigning", desc: "Raising awareness, standing up for what matters, driving change on issues you care about." },
              { icon: "🎓", bg: `${C.orange}1A`, title: "Peer support", desc: "Helping others learn, tutoring, leading a study group, sharing skills, supporting someone's wellbeing." },
            ].map((c, i) => (
              <FadeIn key={c.title} delay={i * 0.08}>
                <div className="mi-count-card">
                  <div style={{ width: 48, height: 48, borderRadius: 12, background: c.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, marginBottom: 16 }}>
                    {c.icon}
                  </div>
                  <h3 className="mi-fraunces" style={{ fontSize: 20, fontWeight: 700, color: C.dark, marginBottom: 8 }}>{c.title}</h3>
                  <p style={{ fontSize: 15, color: "#5A6572", lineHeight: 1.6 }}>{c.desc}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>
      {/* ── PROOF IN NUMBERS ── */}
      <section style={{ background: C.dark, padding: "clamp(60px, 10vw, 120px) 5%" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <FadeIn>
            <div style={{ textAlign: "center", marginBottom: 56 }}>
              <p className="mi-section-label" style={{ color: C.orange }}>The difference we make</p>
              <h2 className="mi-fraunces" style={{ fontSize: "clamp(26px, 4vw, 40px)", color: "white", fontWeight: 700, letterSpacing: -1 }}>
                It adds up faster than you think.
              </h2>
            </div>
          </FadeIn>
          <div
            className="mi-proof-grid"
            style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 32, textAlign: "center" }}
          >
            {[
              { prefix: "£", end: 2847, suffix: "", label: "Average social value created per regular volunteer per year" },
              { prefix: "", end: 900, suffix: "m", label: "Hours volunteered across the UK each year" },
              { prefix: "", end: 0, suffix: "%", label: "Of that value is currently tracked by the people who create it" },
            ].map((s, i) => (
              <FadeIn key={i} delay={i * 0.12}>
                <div>
                  <div className="mi-fraunces" style={{ fontSize: "clamp(40px, 5.5vw, 68px)", fontWeight: 900, color: C.orange, letterSpacing: -2 }}>
                    {s.end === 0 ? `${s.prefix}0${s.suffix}` : <Counter prefix={s.prefix} end={s.end} suffix={s.suffix} />}
                  </div>
                  <p style={{ fontSize: 15, color: "rgba(255,255,255,0.5)", marginTop: 10, lineHeight: 1.5, maxWidth: 220, margin: "10px auto 0" }}>{s.label}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>
      {/* ── STORIES ── */}
      <section id="stories" style={{ background: "white", padding: "clamp(60px, 10vw, 120px) 5%" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <FadeIn>
            <p className="mi-section-label">Real stories</p>
            <p className="mi-section-title">What does social value look like?</p>
          </FadeIn>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))", gap: 24, alignItems: "stretch" }}>
            {[
              {
                name: "Aisha",
                age: "21, Glasgow",
                quote: "After uni I felt like my efforts weren't being seen. I was running a community art project but had no way to show what it was actually worth. MyImpact changed that — I could finally put a number on the pride, engagement, and connection we were creating.",
                value: "£4,230",
                what: "Community art project, 6 months",
              },
              {
                name: "Ben",
                age: "36, Hull",
                quote: "I'm not in work right now and people make assumptions. But I run a tech drop-in for older people every week. I'm reducing isolation, building digital skills, bringing people together. MyImpact shows that what I do has real, measurable worth.",
                value: "£7,860",
                what: "Weekly tech hub, 12 months",
              },
              {
                name: "Chloe",
                age: "17, Cardiff",
                quote: "Call me a snowflake if you want. I call me someone who pulled 300kg of plastic out of a river. MyImpact tracked every hour, every kilo, and showed me the environmental and community value. That data got the council on board.",
                value: "£3,150",
                what: "River clean-up crew, 8 months",
              },
            ].map((s, i) => (
              <FadeIn key={s.name} delay={i * 0.12}>
                <div className="mi-story-card">
                  <div style={{ padding: "28px 24px 20px" }}>
                    <p className="mi-fraunces" style={{ fontSize: 20, fontWeight: 700, color: C.dark }}>{s.name}</p>
                    <p style={{ fontSize: 13, color: C.orange, fontWeight: 600, marginTop: 2 }}>{s.age}</p>
                    <p style={{ fontSize: 15, color: "#4A5568", lineHeight: 1.65, marginTop: 12, fontStyle: "italic" }}>"{s.quote}"</p>
                  </div>
                  <div style={{ padding: "14px 24px", background: C.cream, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <p className="mi-fraunces border-t-[#f06127] border-r-[#f06127] border-b-[#f06127] border-l-[#f06127] text-[#f06127]" style={{ fontSize: 26, fontWeight: 900, color: C.olive }}>{s.value}</p>
                    <p style={{ fontSize: 13, color: "#5A6572", textAlign: "right", maxWidth: 150, lineHeight: 1.4 }}>{s.what}</p>
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>
      {/* ── CV / PROOF ── */}
      <section style={{ background: "white", padding: "clamp(60px, 10vw, 100px) 5%" }}>
        <div className="mi-cv-grid" style={{ maxWidth: 1000, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 60, alignItems: "center" }}>
          <FadeIn>
            <div>
              <h2 className="mi-fraunces" style={{ fontSize: "clamp(26px, 4vw, 38px)", fontWeight: 700, color: C.dark, letterSpacing: -1, marginBottom: 20, lineHeight: 1.15 }}>
                Your impact is your proof.
              </h2>
              <p style={{ fontSize: 17, color: "#4A5568", lineHeight: 1.7, marginBottom: 16 }}>
                Employers want evidence. Funders want outcomes. Commissioners want data. My Impact gives you something most people don't have: a verified, quantified record of the difference you make.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 10, marginTop: 28 }}>
                {[
                  { label: "CVs and job applications", bg: `${C.orange}18`, color: C.orange },
                  { label: "Funding bids", bg: `${C.olive}28`, color: C.dark },
                  { label: "UCAS & DofE", bg: `${C.lightBlue}55`, color: C.dark },
                  { label: "Annual reports", bg: `${C.orange}18`, color: C.orange },
                  { label: "Social media", bg: `${C.olive}28`, color: C.dark },
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
              <p style={{ fontSize: 12, fontWeight: 700, color: C.orange, letterSpacing: 1.5, textTransform: "uppercase" as const, marginBottom: 20 }}>Sample Impact Card</p>
              <p className="mi-fraunces" style={{ fontSize: 28, fontWeight: 900, color: C.dark, marginBottom: 4 }}>Chloe M.</p>
              <p style={{ fontSize: 14, color: "#5A6572", marginBottom: 20 }}>Sept 2025 – Apr 2026</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div style={{ background: "white", borderRadius: 12, padding: "16px 18px" }}>
                  <p style={{ fontSize: 13, color: "#5A6572", marginBottom: 4 }}>Total social value</p>
                  <p className="mi-fraunces" style={{ fontSize: 28, fontWeight: 900, color: C.olive }}>£3,150</p>
                </div>
                <div style={{ background: "white", borderRadius: 12, padding: "16px 18px" }}>
                  <p style={{ fontSize: 13, color: "#5A6572", marginBottom: 4 }}>Hours contributed</p>
                  <p className="mi-fraunces" style={{ fontSize: 28, fontWeight: 900, color: C.slate }}>187</p>
                </div>
              </div>
              <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" as const }}>
                <span style={{ padding: "4px 12px", borderRadius: 100, background: `${C.olive}28`, fontSize: 12, fontWeight: 600, color: C.dark }}>🌱 Environment</span>
                <span style={{ padding: "4px 12px", borderRadius: 100, background: `${C.lightBlue}55`, fontSize: 12, fontWeight: 600, color: C.dark }}>🏘️ Community</span>
              </div>
              <p style={{ marginTop: 16, fontSize: 11, color: "rgba(0,0,0,0.3)" }}>Powered by Social Value Engine methodology</p>
            </div>
          </FadeIn>
        </div>
      </section>
      {/* ── FOR ORGANISATIONS ── */}
      <section id="orgs" style={{ background: C.dark, padding: "clamp(60px, 10vw, 100px) 5%" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <FadeIn>
            <p className="mi-section-label" style={{ color: C.orange }}>For organisations</p>
            <h2 className="mi-fraunces" style={{ fontSize: "clamp(26px, 4vw, 40px)", color: "white", fontWeight: 700, letterSpacing: -1, maxWidth: 500, lineHeight: 1.15 }}>
              See the value your people create.
            </h2>
            <p style={{ fontSize: 17, color: "rgba(255,255,255,0.55)", maxWidth: 560, lineHeight: 1.65, marginTop: 16, marginBottom: 40 }}>
              Schools, youth organisations, charities, and local authorities get a companion dashboard with aggregated, anonymised data — ready for reporting, funding bids, and programme evaluation.
            </p>
          </FadeIn>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 20, alignItems: "stretch" }}>
            {[
              { title: "Evidence outcomes", desc: "Credible social value data from the same methodology used by councils and housing associations.", comingSoon: false },
              { title: "Set challenges", desc: "Create group challenges and track collective impact across a cohort, school, or programme.", comingSoon: true },
              { title: "Export and report", desc: "Download data for commissioners, trustees, or Ofsted. Feeds directly into SVE for SROI analysis.", comingSoon: true },
              { title: "Keep it safe", desc: "GDPR-compliant, pseudonymised, under-16 consent flows built in. Designed with safeguarding first.", comingSoon: false },
            ].map((c, i) => (
              <FadeIn key={c.title} delay={i * 0.08}>
                <div className="mi-org-card">
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                    <h3 className="mi-fraunces" style={{ color: C.orange, fontSize: 18, fontWeight: 700 }}>{c.title}</h3>
                    {c.comingSoon && (
                      <span style={{
                        flexShrink: 0,
                        fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase",
                        background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)",
                        color: "rgba(255,255,255,0.45)", borderRadius: 100, padding: "3px 9px", whiteSpace: "nowrap",
                      }}>
                        Coming soon
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>{c.desc}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>
      {/* ── CTA ── */}
      <section className="mi-cta-section">
        <FadeIn>
          <div style={{ maxWidth: 600, margin: "0 auto", position: "relative", zIndex: 2 }}>
            <h2 className="mi-fraunces" style={{ fontSize: "clamp(30px, 5vw, 46px)", fontWeight: 900, color: "white", letterSpacing: -1, marginBottom: 16, lineHeight: 1.1 }}>
              Ready to see what you're worth?
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
      {/* ── FOOTER ── */}
      <footer style={{ background: C.offBlack, padding: "40px 5%", textAlign: "center" }}>
        <img
          src={`${import.meta.env.BASE_URL}images/myimpact.png`}
          alt="My Impact"
          style={{ height: 40, marginBottom: 16, display: "inline-block" }}
        />
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", marginBottom: 20 }}>The difference I make.</p>
        <div style={{ display: "flex", justifyContent: "center", gap: 24, flexWrap: "wrap" as const, marginBottom: 20 }}>
          {["About", "Privacy", "Contact"].map(l => (
            <a key={l} href="#" style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", textDecoration: "none" }}>{l}</a>
          ))}
          <Link href="/org" style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", textDecoration: "none" }}>For organisations</Link>
        </div>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.2)" }}>
          Powered by Social Value Engine methodology · UK data centres
        </p>
      </footer>
    </div>
  );
}
