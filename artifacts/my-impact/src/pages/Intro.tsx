import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";

const C = {
  dark: "#01343F",
  orange: "#F06127",
  teal: "#0A7877",
  green: "#94A53A",
  cream: "#F7F5EF",
  offBlack: "#0D1B1E",
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
    <div style={{ fontFamily: "'DM Sans', sans-serif", color: C.offBlack, overflowX: "hidden" }}>
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
          background: radial-gradient(circle, ${C.teal}40 0%, transparent 70%);
          pointer-events: none;
        }
        .mi-hero::after {
          content: '';
          position: absolute;
          bottom: -20%; left: -10%;
          width: 50vw; height: 50vw;
          border-radius: 50%;
          background: radial-gradient(circle, ${C.orange}25 0%, transparent 70%);
          pointer-events: none;
        }
        .mi-fraunces { font-family: 'Fraunces', Georgia, serif; }
        .mi-btn-primary {
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
        .mi-btn-primary:hover { transform: translateY(-2px); box-shadow: 0 8px 28px ${C.orange}40; }
        .mi-btn-ghost {
          background: transparent;
          color: white;
          padding: 14px 32px;
          border-radius: 100px;
          font-weight: 600;
          font-size: 15px;
          border: 1px solid rgba(255,255,255,0.25);
          cursor: pointer;
          transition: all 0.25s;
          text-decoration: none;
          display: inline-block;
        }
        .mi-btn-ghost:hover { border-color: rgba(255,255,255,0.55); background: rgba(255,255,255,0.06); }
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
        .mi-dot { width: 6px; height: 6px; border-radius: 50%; background: ${C.green}; animation: miPulse 2s infinite; display: inline-block; }
        .mi-count-card { padding: 28px 24px; border-radius: 16px; background: ${C.cream}; border: 1px solid rgba(0,0,0,0.04); transition: all 0.3s; }
        .mi-count-card:hover { transform: translateY(-4px); box-shadow: 0 12px 40px rgba(0,0,0,0.06); }
        .mi-story-card { border-radius: 20px; overflow: hidden; border: 1px solid rgba(0,0,0,0.07); transition: all 0.3s; }
        .mi-story-card:hover { transform: translateY(-4px); box-shadow: 0 16px 48px rgba(0,0,0,0.08); }
        .mi-how-step { display: flex; gap: 28px; padding: 36px 0; border-bottom: 1px solid rgba(0,0,0,0.07); }
        .mi-how-step:last-child { border-bottom: none; }
        .mi-org-card { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.09); border-radius: 16px; padding: 28px 24px; }
        .mi-cta-section { background: ${C.teal}; padding: clamp(60px,8vw,100px) 5%; text-align: center; position: relative; overflow: hidden; }
        .mi-cta-section::before { content: ''; position: absolute; top: -50%; right: -30%; width: 60vw; height: 60vw; border-radius: 50%; background: radial-gradient(circle, rgba(255,255,255,0.08) 0%, transparent 70%); }
        .mi-btn-white { background: white; color: ${C.dark}; padding: 16px 40px; border-radius: 100px; font-weight: 700; font-size: 16px; border: none; cursor: pointer; transition: all 0.25s; display: inline-flex; align-items: center; gap: 8px; text-decoration: none; }
        .mi-btn-white:hover { transform: translateY(-2px); box-shadow: 0 8px 30px rgba(0,0,0,0.15); }
        @media (max-width: 768px) {
          .mi-proof-grid { grid-template-columns: 1fr !important; gap: 24px !important; }
          .mi-cv-grid { grid-template-columns: 1fr !important; gap: 32px !important; }
          .mi-how-step { flex-direction: column; gap: 12px; }
        }
      `}</style>

      {/* ── HERO ── */}
      <section className="mi-hero">
        <div style={{ position: "relative", zIndex: 2, padding: "0 5% 80px", maxWidth: 860 }}>
          <div
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.13)",
              backdropFilter: "blur(8px)",
              padding: "8px 18px", borderRadius: 100,
              color: "#EABD1E", fontSize: 12, fontWeight: 700,
              letterSpacing: 1.5, textTransform: "uppercase",
              marginBottom: 28,
            }}
          >
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
            You already make<br />
            a difference.<br />
            Now{" "}
            <span style={{ color: C.orange, fontStyle: "italic" }}>prove it.</span>
          </h1>

          <p style={{ fontSize: "clamp(17px, 2vw, 20px)", color: "rgba(255,255,255,0.65)", lineHeight: 1.65, maxWidth: 560, marginBottom: 40 }}>
            Every time you volunteer, help someone, or show up for your community, you create{" "}
            <strong style={{ color: "rgba(255,255,255,0.9)" }}>real social value</strong>. My Impact calculates what that's worth —{" "}
            <strong style={{ color: "rgba(255,255,255,0.9)" }}>in pounds</strong> — so you can finally see the difference you make.
          </p>

          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
            <Link href="/wizard/actions" className="mi-btn-primary">
              Calculate my impact →
            </Link>
            <a href="#how" className="mi-btn-ghost">See how it works</a>
          </div>
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
              <span style={{ color: C.teal, fontStyle: "italic" }}>GDP.</span>
            </p>
            <p style={{ fontSize: 18, color: "#4A5568", lineHeight: 1.75, maxWidth: 640 }}>
              The economy measures your productivity. Your employer measures your outputs. But neither of them counts
              what you do for free — the hours you give, the people you help, the communities you strengthen.
              My Impact gives that a number. A real one, backed by the same{" "}
              <strong>Social Value Engine methodology</strong> used by local councils, housing associations, and the NHS.
            </p>
          </div>
        </FadeIn>
      </section>

      {/* ── WHAT COUNTS ── */}
      <section style={{ background: "white", padding: "clamp(60px, 10vw, 120px) 5%" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <FadeIn>
            <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: C.teal, marginBottom: 12 }}>What we count</p>
            <p className="mi-fraunces" style={{ fontSize: "clamp(26px, 4vw, 42px)", fontWeight: 700, color: C.dark, letterSpacing: -1, marginBottom: 48, maxWidth: 480, lineHeight: 1.15 }}>
              Everything you already do counts.
            </p>
          </FadeIn>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 20 }}>
            {[
              { emoji: "🌱", title: "Environment", desc: "Recycling, cutting food waste, cycling instead of driving, planting trees — every action adds up." },
              { emoji: "🤝", title: "Community", desc: "Food bank volunteering, befriending older people, social clubs, community events and fundraising." },
              { emoji: "📚", title: "Education", desc: "Mentoring young people, tutoring, running youth groups, supporting others to learn new skills." },
              { emoji: "💛", title: "Giving", desc: "Money donated to charity, time given to good causes, and contributing to fundraising efforts." },
            ].map((c, i) => (
              <FadeIn key={c.title} delay={i * 0.08}>
                <div className="mi-count-card">
                  <div style={{ width: 48, height: 48, borderRadius: 12, background: C.cream, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, marginBottom: 16, border: `1px solid rgba(0,0,0,0.05)` }}>
                    {c.emoji}
                  </div>
                  <h3 className="mi-fraunces" style={{ fontSize: 20, fontWeight: 700, color: C.dark, marginBottom: 8 }}>{c.title}</h3>
                  <p style={{ fontSize: 15, color: "#5A6572", lineHeight: 1.6 }}>{c.desc}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── PROOF STATS ── */}
      <section style={{ background: C.dark, padding: "clamp(60px, 10vw, 120px) 5%" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div
            className="mi-proof-grid"
            style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 32, textAlign: "center", marginBottom: 48 }}
          >
            {[
              { prefix: "£", end: 888, suffix: "", label: "Average social value calculated per user per year" },
              { prefix: "", end: 20, suffix: "+", label: "Verified activity types from the SVE proxy library" },
              { prefix: "", end: 100, suffix: "%", label: "Based on Social Value Engine accredited methodology" },
            ].map((s, i) => (
              <FadeIn key={i} delay={i * 0.1}>
                <div style={{ color: "white" }}>
                  <div className="mi-fraunces" style={{ fontSize: "clamp(40px, 5.5vw, 68px)", fontWeight: 900, color: C.orange, letterSpacing: -2 }}>
                    <Counter prefix={s.prefix} end={s.end} suffix={s.suffix} />
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
            <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: C.teal, marginBottom: 12 }}>Real people</p>
            <p className="mi-fraunces" style={{ fontSize: "clamp(26px, 4vw, 42px)", fontWeight: 700, color: C.dark, letterSpacing: -1, marginBottom: 48, lineHeight: 1.15 }}>
              See what others discovered.
            </p>
          </FadeIn>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))", gap: 24 }}>
            {[
              { name: "Amara", age: "19, Manchester", quote: "I volunteered at my local food bank every weekend and ran a youth club, but I had no idea it was worth this much. Now I put it on every application I make.", value: "£1,240", what: "Food bank + youth mentoring" },
              { name: "Josh", age: "22, Bristol", quote: "I used my My Impact report in my graduate scheme interview. It gave me something concrete to talk about beyond just saying 'I do a bit of volunteering'.", value: "£960", what: "Cycling + community volunteering" },
              { name: "Priya", age: "16, Edinburgh", quote: "It's in my UCAS personal statement. My teacher said it's one of the most original things she's seen — and she could actually see the methodology behind the number.", value: "£640", what: "Recycling + mentoring younger pupils" },
            ].map((s, i) => (
              <FadeIn key={s.name} delay={i * 0.1}>
                <div className="mi-story-card">
                  <div style={{ padding: "28px 24px 20px" }}>
                    <p className="mi-fraunces" style={{ fontSize: 20, fontWeight: 700, color: C.dark }}>{s.name}</p>
                    <p style={{ fontSize: 13, color: C.teal, fontWeight: 600, marginTop: 2 }}>{s.age}</p>
                    <p style={{ fontSize: 15, color: "#4A5568", lineHeight: 1.65, marginTop: 12, fontStyle: "italic" }}>"{s.quote}"</p>
                  </div>
                  <div style={{ padding: "14px 24px", background: C.cream, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <p className="mi-fraunces" style={{ fontSize: 26, fontWeight: 900, color: C.green }}>{s.value}</p>
                    <p style={{ fontSize: 13, color: "#5A6572", textAlign: "right", maxWidth: 140, lineHeight: 1.4 }}>{s.what}</p>
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how" style={{ background: C.cream, padding: "clamp(60px, 10vw, 120px) 5%" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <FadeIn>
            <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: C.teal, marginBottom: 12 }}>How it works</p>
            <p className="mi-fraunces" style={{ fontSize: "clamp(26px, 4vw, 42px)", fontWeight: 700, color: C.dark, letterSpacing: -1, marginBottom: 48, lineHeight: 1.15 }}>
              Three steps. Five minutes.
            </p>
          </FadeIn>
          <div>
            {[
              { n: "01", title: "Tell us about you", desc: "Share where you live and what you care about. Takes about 30 seconds — we use this to personalise your activities and suggestions." },
              { n: "02", title: "Log your activities", desc: "Pick from our library of 20+ activities drawn from the Social Value Engine proxy database. Tick what you already do — volunteering, eco-actions, donating, mentoring, and more." },
              { n: "03", title: "See your social value", desc: "Get a credible, shareable breakdown of your social impact in pounds, aligned to the UN Sustainable Development Goals — ready for CVs, UCAS, or funding applications." },
            ].map((s, i) => (
              <FadeIn key={s.n} delay={i * 0.1}>
                <div className="mi-how-step">
                  <div className="mi-fraunces" style={{ fontSize: 52, fontWeight: 900, color: `${C.teal}25`, lineHeight: 1, minWidth: 68 }}>{s.n}</div>
                  <div>
                    <h3 className="mi-fraunces" style={{ fontSize: 22, fontWeight: 700, color: C.dark, marginBottom: 8 }}>{s.title}</h3>
                    <p style={{ fontSize: 16, color: "#5A6572", lineHeight: 1.65 }}>{s.desc}</p>
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── CV / CREDENTIALS ── */}
      <section style={{ background: "white", padding: "clamp(60px, 10vw, 100px) 5%" }}>
        <div className="mi-cv-grid" style={{ maxWidth: 1000, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 60, alignItems: "center" }}>
          <FadeIn>
            <div>
              <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: C.teal, marginBottom: 12 }}>Your proof</p>
              <h2 className="mi-fraunces" style={{ fontSize: "clamp(26px, 4vw, 38px)", fontWeight: 700, color: C.dark, letterSpacing: -1, marginBottom: 20, lineHeight: 1.15 }}>
                Put your impact where it counts.
              </h2>
              <p style={{ fontSize: 17, color: "#4A5568", lineHeight: 1.7, marginBottom: 12 }}>
                Whether it's your UCAS personal statement, a job interview, or a DofE portfolio — My Impact gives you a number to back up what you already do.
              </p>
              <p style={{ fontSize: 17, color: "#4A5568", lineHeight: 1.7 }}>
                Not a vague claim. A credible, methodology-backed social value figure that recruiters and admissions teams recognise.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 28 }}>
                {["DofE", "UCAS Personal Statement", "Job interviews", "Graduate schemes", "Funding applications"].map((tag, i) => (
                  <span
                    key={tag}
                    style={{
                      padding: "7px 16px", borderRadius: 100, fontSize: 13, fontWeight: 600,
                      background: i === 0 ? C.dark : i === 1 ? C.teal : i === 2 ? C.green : i === 3 ? C.orange : C.cream,
                      color: i === 4 ? C.dark : "white",
                      border: i === 4 ? `1px solid rgba(0,0,0,0.08)` : "none",
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </FadeIn>

          <FadeIn delay={0.15}>
            <div style={{ background: C.dark, borderRadius: 24, padding: 32, color: "white" }}>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "rgba(255,255,255,0.4)", marginBottom: 8 }}>My annual social value</p>
              <p className="mi-fraunces" style={{ fontSize: 56, fontWeight: 900, color: C.orange, letterSpacing: -2, lineHeight: 1, marginBottom: 24 }}>£1,240</p>
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                {[
                  { label: "Direct impact", val: "£740" },
                  { label: "Contribution", val: "£310" },
                  { label: "Donations", val: "£120" },
                  { label: "Personal dev", val: "£70" },
                ].map(m => (
                  <div key={m.label}>
                    <p style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 2, textTransform: "uppercase", letterSpacing: 1 }}>{m.label}</p>
                    <p className="mi-fraunces" style={{ fontSize: 22, fontWeight: 700, color: "white" }}>{m.val}</p>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.08)", fontSize: 11, color: "rgba(255,255,255,0.25)", letterSpacing: 1 }}>
                POWERED BY SOCIAL VALUE ENGINE METHODOLOGY
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── FOR ORGS ── */}
      <section id="orgs" style={{ background: C.dark, padding: "clamp(60px, 10vw, 100px) 5%" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <FadeIn>
            <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: C.teal, marginBottom: 12 }}>For organisations</p>
            <h2 className="mi-fraunces" style={{ fontSize: "clamp(26px, 4vw, 42px)", fontWeight: 700, color: "white", letterSpacing: -1, lineHeight: 1.15 }}>
              Built for schools, charities<br />and local authorities.
            </h2>
            <p style={{ fontSize: 17, color: "rgba(255,255,255,0.5)", maxWidth: 560, lineHeight: 1.65, marginTop: 16, marginBottom: 40 }}>
              Schools, youth organisations, charities, and local authorities get a companion dashboard with aggregated, anonymised data — ready for reporting, funding bids, and programme evaluation.
            </p>
          </FadeIn>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 20 }}>
            {[
              { title: "Evidence outcomes", desc: "Credible social value data from the same methodology used by councils and housing associations." },
              { title: "Set challenges", desc: "Create group challenges and track collective impact across a cohort, school, or programme." },
              { title: "Export and report", desc: "Download data for commissioners, trustees, or Ofsted. Feeds directly into SVE for SROI analysis." },
              { title: "Keep it safe", desc: "GDPR-compliant, pseudonymised, under-16 consent flows built in. Designed with safeguarding first." },
            ].map((c, i) => (
              <FadeIn key={c.title} delay={i * 0.08}>
                <div className="mi-org-card">
                  <h3 className="mi-fraunces" style={{ color: C.orange, fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{c.title}</h3>
                  <p style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>{c.desc}</p>
                </div>
              </FadeIn>
            ))}
          </div>
          <FadeIn delay={0.2}>
            <div style={{ marginTop: 40 }}>
              <Link href="/org" className="mi-btn-primary">
                Explore the org portal →
              </Link>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="mi-cta-section">
        <FadeIn>
          <div style={{ maxWidth: 600, margin: "0 auto", position: "relative", zIndex: 2, textAlign: "center" }}>
            <h2 className="mi-fraunces" style={{ fontSize: "clamp(30px, 5vw, 46px)", fontWeight: 900, color: "white", letterSpacing: -1, marginBottom: 16, lineHeight: 1.1 }}>
              Ready to see what you're worth?
            </h2>
            <p style={{ fontSize: 18, color: "rgba(255,255,255,0.75)", marginBottom: 36, lineHeight: 1.6 }}>
              It takes five minutes to calculate your social value. Find out what you've already been doing is really worth.
            </p>
            <Link href="/wizard/actions" className="mi-btn-white">
              Calculate my impact →
            </Link>
          </div>
        </FadeIn>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ background: C.offBlack, padding: "40px 5%", textAlign: "center" }}>
        <p className="mi-fraunces" style={{ fontSize: 20, fontWeight: 900, color: "white", marginBottom: 6 }}>
          My<span style={{ color: C.orange }}>Impact</span>
        </p>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", marginBottom: 20 }}>Your impact, counted.</p>
        <div style={{ display: "flex", justifyContent: "center", gap: 24, flexWrap: "wrap", marginBottom: 20 }}>
          {["About", "How it works", "For organisations", "Privacy", "Contact"].map(l => (
            <a key={l} href="#" style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", textDecoration: "none" }}>{l}</a>
          ))}
        </div>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.2)" }}>
          Powered by Social Value Engine methodology · SVI Accredited · UK data centres
        </p>
      </footer>
    </div>
  );
}
