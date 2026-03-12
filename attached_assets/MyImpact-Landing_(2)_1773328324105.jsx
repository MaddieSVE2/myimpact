import { useState, useEffect, useRef } from "react";

const COLORS = {
  dark: "#01343F",
  teal: "#0A7877",
  green: "#94A53A",
  yellow: "#EABD1E",
  cream: "#F7F5EF",
  white: "#FFFFFF",
  offBlack: "#0D1B1E",
};

function useInView(threshold = 0.15) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true); }, { threshold });
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, visible];
}

function FadeIn({ children, delay = 0, className = "" }) {
  const [ref, visible] = useInView(0.1);
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(32px)",
        transition: `opacity 0.7s ease ${delay}s, transform 0.7s ease ${delay}s`,
      }}
    >
      {children}
    </div>
  );
}

function Counter({ end, suffix = "", prefix = "", duration = 2000 }) {
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

export default function MyImpactLanding() {
  const [mobileMenu, setMobileMenu] = useState(false);

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", color: COLORS.offBlack, overflowX: "hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,400;0,500;0,700&family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,700;0,9..144,900;1,9..144,400&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }

        .hero-section {
          min-height: 100vh;
          background: ${COLORS.dark};
          position: relative;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        .hero-section::before {
          content: '';
          position: absolute;
          top: -40%; right: -20%;
          width: 80vw; height: 80vw;
          border-radius: 50%;
          background: radial-gradient(circle, ${COLORS.teal}30 0%, transparent 70%);
          pointer-events: none;
        }
        .hero-section::after {
          content: '';
          position: absolute;
          bottom: -20%; left: -10%;
          width: 50vw; height: 50vw;
          border-radius: 50%;
          background: radial-gradient(circle, ${COLORS.green}20 0%, transparent 70%);
          pointer-events: none;
        }

        .nav { display: flex; align-items: center; justify-content: space-between; padding: 20px 5%; position: relative; z-index: 10; }
        .nav-logo { font-family: 'Fraunces', serif; font-size: 24px; font-weight: 900; color: white; letter-spacing: -0.5px; }
        .nav-logo span { color: ${COLORS.yellow}; }
        .nav-links { display: flex; gap: 32px; align-items: center; }
        .nav-links a { color: rgba(255,255,255,0.7); text-decoration: none; font-size: 15px; font-weight: 500; transition: color 0.2s; }
        .nav-links a:hover { color: white; }
        .nav-cta { background: ${COLORS.yellow}; color: ${COLORS.dark}; padding: 10px 24px; border-radius: 100px; font-weight: 700; font-size: 14px; text-decoration: none; transition: transform 0.2s, box-shadow 0.2s; display: inline-block; border: none; cursor: pointer; }
        .nav-cta:hover { transform: translateY(-2px); box-shadow: 0 4px 20px ${COLORS.yellow}40; }

        .hero-content { flex: 1; display: flex; flex-direction: column; justify-content: center; padding: 0 5% 80px; position: relative; z-index: 2; max-width: 900px; }
        .hero-tag { display: inline-flex; align-items: center; gap: 8px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12); backdrop-filter: blur(8px); padding: 8px 18px; border-radius: 100px; color: ${COLORS.yellow}; font-size: 13px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 28px; width: fit-content; }
        .hero-tag .dot { width: 6px; height: 6px; border-radius: 50%; background: ${COLORS.green}; animation: pulse 2s infinite; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

        .hero-h1 { font-family: 'Fraunces', serif; font-size: clamp(42px, 7vw, 80px); font-weight: 900; color: white; line-height: 1.05; margin-bottom: 24px; letter-spacing: -2px; }
        .hero-h1 .highlight { color: ${COLORS.yellow}; font-style: italic; }
        .hero-h1 .teal { color: ${COLORS.teal}; }

        .hero-sub { font-size: clamp(17px, 2vw, 20px); color: rgba(255,255,255,0.65); line-height: 1.6; max-width: 560px; margin-bottom: 40px; }
        .hero-sub strong { color: rgba(255,255,255,0.9); font-weight: 700; }

        .hero-actions { display: flex; gap: 16px; flex-wrap: wrap; align-items: center; }
        .btn-primary { background: ${COLORS.yellow}; color: ${COLORS.dark}; padding: 16px 36px; border-radius: 100px; font-weight: 700; font-size: 16px; text-decoration: none; transition: all 0.25s; border: none; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; }
        .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 8px 30px ${COLORS.yellow}35; }
        .btn-ghost { background: transparent; color: white; padding: 16px 36px; border-radius: 100px; font-weight: 600; font-size: 16px; text-decoration: none; border: 1px solid rgba(255,255,255,0.2); transition: all 0.25s; cursor: pointer; }
        .btn-ghost:hover { border-color: rgba(255,255,255,0.5); background: rgba(255,255,255,0.05); }

        .scroll-hint { position: absolute; bottom: 30px; left: 50%; transform: translateX(-50%); z-index: 5; display: flex; flex-direction: column; align-items: center; gap: 8px; }
        .scroll-hint span { color: rgba(255,255,255,0.3); font-size: 12px; letter-spacing: 2px; text-transform: uppercase; }
        .scroll-line { width: 1px; height: 40px; background: linear-gradient(to bottom, rgba(255,255,255,0.3), transparent); animation: scrollDown 2s infinite; }
        @keyframes scrollDown { 0% { opacity: 1; transform: scaleY(1); } 100% { opacity: 0; transform: scaleY(0.3) translateY(20px); } }

        /* GDP Section */
        .gdp-section { background: ${COLORS.cream}; padding: clamp(60px, 10vw, 120px) 5%; }
        .gdp-inner { max-width: 1000px; margin: 0 auto; }
        .gdp-quote { font-family: 'Fraunces', serif; font-size: clamp(28px, 4.5vw, 52px); font-weight: 700; color: ${COLORS.dark}; line-height: 1.2; margin-bottom: 24px; letter-spacing: -1px; }
        .gdp-quote .em { color: ${COLORS.teal}; font-style: italic; }
        .gdp-body { font-size: 18px; color: #4A5568; line-height: 1.7; max-width: 640px; }

        /* What counts grid */
        .counts-section { background: white; padding: clamp(60px, 10vw, 120px) 5%; }
        .counts-inner { max-width: 1100px; margin: 0 auto; }
        .section-label { font-size: 13px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: ${COLORS.teal}; margin-bottom: 16px; }
        .section-title { font-family: 'Fraunces', serif; font-size: clamp(28px, 4vw, 44px); font-weight: 700; color: ${COLORS.dark}; letter-spacing: -1px; margin-bottom: 48px; max-width: 500px; line-height: 1.15; }
        .counts-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 20px; }
        .count-card { padding: 32px 28px; border-radius: 16px; background: ${COLORS.cream}; border: 1px solid rgba(0,0,0,0.04); transition: all 0.3s; }
        .count-card:hover { transform: translateY(-4px); box-shadow: 0 12px 40px rgba(0,0,0,0.06); }
        .count-icon { width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 22px; margin-bottom: 16px; }
        .count-card h3 { font-family: 'Fraunces', serif; font-size: 20px; font-weight: 700; color: ${COLORS.dark}; margin-bottom: 8px; }
        .count-card p { font-size: 15px; color: #5A6572; line-height: 1.55; }

        /* Proof section */
        .proof-section { background: ${COLORS.dark}; padding: clamp(60px, 10vw, 120px) 5%; }
        .proof-inner { max-width: 1100px; margin: 0 auto; }
        .proof-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 32px; text-align: center; margin-bottom: 60px; }
        .proof-stat { color: white; }
        .proof-stat .number { font-family: 'Fraunces', serif; font-size: clamp(36px, 5vw, 64px); font-weight: 900; color: ${COLORS.yellow}; letter-spacing: -2px; }
        .proof-stat .label { font-size: 15px; color: rgba(255,255,255,0.5); margin-top: 8px; }

        /* Stories */
        .stories-section { background: white; padding: clamp(60px, 10vw, 120px) 5%; }
        .stories-inner { max-width: 1100px; margin: 0 auto; }
        .stories-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 24px; }
        .story-card { border-radius: 20px; overflow: hidden; border: 1px solid rgba(0,0,0,0.06); transition: all 0.3s; }
        .story-card:hover { transform: translateY(-4px); box-shadow: 0 16px 48px rgba(0,0,0,0.08); }
        .story-top { padding: 32px 28px 24px; }
        .story-name { font-family: 'Fraunces', serif; font-size: 20px; font-weight: 700; color: ${COLORS.dark}; }
        .story-age { font-size: 14px; color: ${COLORS.teal}; font-weight: 600; margin-top: 2px; }
        .story-quote { font-size: 15px; color: #4A5568; line-height: 1.6; margin-top: 12px; font-style: italic; }
        .story-bottom { padding: 16px 28px; background: ${COLORS.cream}; display: flex; justify-content: space-between; align-items: center; }
        .story-val { font-family: 'Fraunces', serif; font-size: 24px; font-weight: 900; color: ${COLORS.green}; }
        .story-what { font-size: 13px; color: #5A6572; }

        /* How it works */
        .how-section { background: ${COLORS.cream}; padding: clamp(60px, 10vw, 120px) 5%; }
        .how-inner { max-width: 1000px; margin: 0 auto; }
        .how-steps { display: flex; flex-direction: column; gap: 0; }
        .how-step { display: flex; gap: 28px; padding: 36px 0; border-bottom: 1px solid rgba(0,0,0,0.06); }
        .how-step:last-child { border-bottom: none; }
        .step-num { font-family: 'Fraunces', serif; font-size: 48px; font-weight: 900; color: ${COLORS.teal}20; line-height: 1; min-width: 60px; }
        .step-content h3 { font-family: 'Fraunces', serif; font-size: 22px; font-weight: 700; color: ${COLORS.dark}; margin-bottom: 8px; }
        .step-content p { font-size: 16px; color: #5A6572; line-height: 1.6; }

        /* CV section */
        .cv-section { background: white; padding: clamp(60px, 10vw, 100px) 5%; }
        .cv-inner { max-width: 1000px; margin: 0 auto; display: grid; grid-template-columns: 1fr 1fr; gap: 60px; align-items: center; }
        .cv-text h2 { font-family: 'Fraunces', serif; font-size: clamp(28px, 4vw, 40px); font-weight: 700; color: ${COLORS.dark}; letter-spacing: -1px; margin-bottom: 20px; line-height: 1.15; }
        .cv-text p { font-size: 17px; color: #4A5568; line-height: 1.65; margin-bottom: 16px; }
        .cv-tags { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 24px; }
        .cv-tag { padding: 8px 18px; border-radius: 100px; font-size: 14px; font-weight: 600; }

        /* Orgs section */
        .orgs-section { background: ${COLORS.dark}; padding: clamp(60px, 10vw, 100px) 5%; }
        .orgs-inner { max-width: 1000px; margin: 0 auto; }
        .orgs-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 24px; margin-top: 40px; }
        .org-card { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 28px 24px; }
        .org-card h3 { font-family: 'Fraunces', serif; color: ${COLORS.yellow}; font-size: 18px; margin-bottom: 8px; }
        .org-card p { font-size: 14px; color: rgba(255,255,255,0.55); line-height: 1.55; }

        /* CTA section */
        .cta-section { background: ${COLORS.teal}; padding: clamp(60px, 8vw, 100px) 5%; text-align: center; position: relative; overflow: hidden; }
        .cta-section::before { content: ''; position: absolute; top: -50%; right: -30%; width: 60vw; height: 60vw; border-radius: 50%; background: radial-gradient(circle, rgba(255,255,255,0.08) 0%, transparent 70%); }
        .cta-inner { max-width: 600px; margin: 0 auto; position: relative; z-index: 2; }
        .cta-inner h2 { font-family: 'Fraunces', serif; font-size: clamp(32px, 5vw, 48px); font-weight: 900; color: white; letter-spacing: -1px; margin-bottom: 16px; line-height: 1.1; }
        .cta-inner p { font-size: 18px; color: rgba(255,255,255,0.75); margin-bottom: 36px; line-height: 1.6; }
        .btn-white { background: white; color: ${COLORS.dark}; padding: 16px 40px; border-radius: 100px; font-weight: 700; font-size: 16px; border: none; cursor: pointer; transition: all 0.25s; display: inline-flex; align-items: center; gap: 8px; }
        .btn-white:hover { transform: translateY(-2px); box-shadow: 0 8px 30px rgba(0,0,0,0.15); }

        /* Footer */
        .footer { background: ${COLORS.offBlack}; padding: 40px 5%; text-align: center; }
        .footer-logo { font-family: 'Fraunces', serif; font-size: 20px; font-weight: 900; color: white; margin-bottom: 8px; }
        .footer-logo span { color: ${COLORS.yellow}; }
        .footer-sub { font-size: 13px; color: rgba(255,255,255,0.3); margin-bottom: 20px; }
        .footer-links { display: flex; justify-content: center; gap: 24px; flex-wrap: wrap; }
        .footer-links a { font-size: 13px; color: rgba(255,255,255,0.4); text-decoration: none; }
        .footer-links a:hover { color: rgba(255,255,255,0.7); }
        .trust-line { font-size: 12px; color: rgba(255,255,255,0.25); margin-top: 20px; }

        @media (max-width: 768px) {
          .nav-links { display: none; }
          .proof-grid { grid-template-columns: 1fr; gap: 24px; }
          .cv-inner { grid-template-columns: 1fr; gap: 32px; }
          .how-step { flex-direction: column; gap: 12px; }
          .step-num { min-width: auto; }
        }
      `}</style>

      {/* ===== HERO ===== */}
      <section className="hero-section">
        <nav className="nav">
          <div className="nav-logo">my<span>.</span>impact</div>
          <div className="nav-links">
            <a href="#how">How it works</a>
            <a href="#stories">Stories</a>
            <a href="#orgs">Organisations</a>
            <button className="nav-cta">Get early access</button>
          </div>
        </nav>
        <div className="hero-content">
          <div className="hero-tag"><span className="dot"></span> Coming soon</div>
          <h1 className="hero-h1">
            You already make a difference.<br />
            Now <span className="highlight">prove it.</span>
          </h1>
          <p className="hero-sub">
            Every time you volunteer, help someone, or show up for your community, you create <strong>real social value</strong>. MyImpact calculates what that's worth — <strong>in pounds</strong> — so you can finally see the difference you make.
          </p>
          <div className="hero-actions">
            <button className="btn-primary">Get early access →</button>
            <button className="btn-ghost">See how it works</button>
          </div>
        </div>
        <div className="scroll-hint">
          <span>Scroll</span>
          <div className="scroll-line" />
        </div>
      </section>

      {/* ===== GDP STATEMENT ===== */}
      <section className="gdp-section">
        <FadeIn>
          <div className="gdp-inner">
            <p className="gdp-quote">
              Your worth isn't measured in <span className="em">GDP.</span>
            </p>
            <p className="gdp-body">
              The economy doesn't count the hours you spend mentoring someone, looking after a relative, picking litter off a riverbank, or running a community group. But that work matters. It holds communities together. And until now, there's been no way for you to see what it's actually worth. We built MyImpact to change that.
            </p>
          </div>
        </FadeIn>
      </section>

      {/* ===== WHAT COUNTS ===== */}
      <section className="counts-section" id="how">
        <div className="counts-inner">
          <FadeIn>
            <div className="section-label">What counts</div>
            <h2 className="section-title">If it helps people or planet, it counts.</h2>
          </FadeIn>
          <div className="counts-grid">
            {[
              { icon: "🤝", bg: `${COLORS.teal}15`, title: "Volunteering", desc: "Giving your time to a charity, club, food bank, or community project." },
              { icon: "💚", bg: `${COLORS.green}20`, title: "Caring", desc: "Looking after a family member, supporting a friend through a tough time, or mentoring someone younger." },
              { icon: "🌱", bg: `${COLORS.green}20`, title: "Environment", desc: "Litter picks, tree planting, cycling instead of driving, reducing waste." },
              { icon: "🏘️", bg: `${COLORS.yellow}20`, title: "Community", desc: "Organising events, running a club, being a good neighbour, showing up for your area." },
              { icon: "📢", bg: `${COLORS.teal}15`, title: "Campaigning", desc: "Raising awareness, standing up for what matters, driving change on issues you care about." },
              { icon: "🎓", bg: `${COLORS.yellow}20`, title: "Peer support", desc: "Helping others learn, tutoring, leading a study group, sharing skills, supporting someone's wellbeing." },
            ].map((c, i) => (
              <FadeIn key={i} delay={i * 0.08}>
                <div className="count-card">
                  <div className="count-icon" style={{ background: c.bg }}>{c.icon}</div>
                  <h3>{c.title}</h3>
                  <p>{c.desc}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ===== PROOF IN NUMBERS ===== */}
      <section className="proof-section">
        <div className="proof-inner">
          <FadeIn>
            <div style={{ textAlign: "center", marginBottom: 48 }}>
              <div className="section-label" style={{ color: COLORS.yellow }}>The difference we make</div>
              <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: "clamp(28px, 4vw, 40px)", color: "white", fontWeight: 700, letterSpacing: -1 }}>
                It adds up faster than you think.
              </h2>
            </div>
          </FadeIn>
          <div className="proof-grid">
            <FadeIn delay={0.1}>
              <div className="proof-stat">
                <div className="number">£<Counter end={2847} /></div>
                <div className="label">Average social value created per regular volunteer per year</div>
              </div>
            </FadeIn>
            <FadeIn delay={0.2}>
              <div className="proof-stat">
                <div className="number"><Counter end={900} suffix="m" /></div>
                <div className="label">Hours volunteered across the UK each year</div>
              </div>
            </FadeIn>
            <FadeIn delay={0.3}>
              <div className="proof-stat">
                <div className="number"><Counter end={0} suffix="%" /></div>
                <div className="label">Of that value is currently tracked by the people who create it</div>
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* ===== STORIES ===== */}
      <section className="stories-section" id="stories">
        <div className="stories-inner">
          <FadeIn>
            <div className="section-label">Real stories</div>
            <h2 className="section-title">What does social value look like?</h2>
          </FadeIn>
          <div className="stories-grid">
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
                age: "19, Hull",
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
              <FadeIn key={i} delay={i * 0.12}>
                <div className="story-card">
                  <div className="story-top">
                    <div className="story-name">{s.name}</div>
                    <div className="story-age">{s.age}</div>
                    <p className="story-quote">"{s.quote}"</p>
                  </div>
                  <div className="story-bottom">
                    <div className="story-val">{s.value}</div>
                    <div className="story-what">{s.what}</div>
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ===== HOW IT WORKS ===== */}
      <section className="how-section">
        <div className="how-inner">
          <FadeIn>
            <div className="section-label">How it works</div>
            <h2 className="section-title">Three minutes. That's it.</h2>
          </FadeIn>
          <div className="how-steps">
            {[
              { num: "01", title: "Log what you did", desc: "Helped at a food bank? Visited your nan? Picked up litter? Tell us what you did and how long it took. It takes about 30 seconds." },
              { num: "02", title: "We calculate the value", desc: "MyImpact maps your activity to real financial proxies — the same methodology used by councils and charities to measure social value. Your contribution gets a pound figure." },
              { num: "03", title: "See your impact grow", desc: "Your personal dashboard tracks everything over time. Watch your total social value add up, hit milestones, and unlock badges as you go." },
              { num: "04", title: "Share your proof", desc: "Generate Impact Cards — shareable visuals showing your social value. Perfect for CVs, funding applications, UCAS statements, DofE portfolios, or just showing people what you're about." },
            ].map((s, i) => (
              <FadeIn key={i} delay={i * 0.1}>
                <div className="how-step">
                  <div className="step-num">{s.num}</div>
                  <div className="step-content">
                    <h3>{s.title}</h3>
                    <p>{s.desc}</p>
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ===== CV / PROOF ===== */}
      <section className="cv-section">
        <div className="cv-inner">
          <FadeIn>
            <div className="cv-text">
              <h2>Your impact is your proof.</h2>
              <p>
                Employers want evidence. Funders want outcomes. Commissioners want data. MyImpact gives you something most people don't have: a verified, quantified record of the difference you make.
              </p>
              <p>
                Not a vague paragraph in an application. An actual number, backed by real methodology.
              </p>
              <div className="cv-tags">
                <span className="cv-tag" style={{ background: `${COLORS.teal}12`, color: COLORS.teal }}>CVs and job applications</span>
                <span className="cv-tag" style={{ background: `${COLORS.green}18`, color: COLORS.dark }}>Funding bids</span>
                <span className="cv-tag" style={{ background: `${COLORS.yellow}25`, color: COLORS.dark }}>UCAS & DofE</span>
                <span className="cv-tag" style={{ background: `${COLORS.teal}12`, color: COLORS.teal }}>Annual reports</span>
                <span className="cv-tag" style={{ background: `${COLORS.green}18`, color: COLORS.dark }}>Social media</span>
              </div>
            </div>
          </FadeIn>
          <FadeIn delay={0.15}>
            <div style={{
              background: COLORS.cream,
              borderRadius: 20,
              padding: "36px 32px",
              border: `1px solid rgba(0,0,0,0.04)`,
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.teal, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 20 }}>Sample Impact Card</div>
              <div style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 900, color: COLORS.dark, marginBottom: 4 }}>Chloe M.</div>
              <div style={{ fontSize: 14, color: "#5A6572", marginBottom: 20 }}>Sept 2025 – Apr 2026</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div style={{ background: "white", borderRadius: 12, padding: "16px 18px" }}>
                  <div style={{ fontSize: 13, color: "#5A6572" }}>Total social value</div>
                  <div style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 900, color: COLORS.green }}>£3,150</div>
                </div>
                <div style={{ background: "white", borderRadius: 12, padding: "16px 18px" }}>
                  <div style={{ fontSize: 13, color: "#5A6572" }}>Hours contributed</div>
                  <div style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 900, color: COLORS.teal }}>187</div>
                </div>
              </div>
              <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span style={{ padding: "4px 12px", borderRadius: 100, background: `${COLORS.green}18`, fontSize: 12, fontWeight: 600, color: COLORS.dark }}>🌱 Environment</span>
                <span style={{ padding: "4px 12px", borderRadius: 100, background: `${COLORS.teal}12`, fontSize: 12, fontWeight: 600, color: COLORS.dark }}>🏘️ Community</span>
              </div>
              <div style={{ marginTop: 16, fontSize: 11, color: "rgba(0,0,0,0.3)" }}>Powered by Social Value Engine methodology</div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ===== ORGANISATIONS ===== */}
      <section className="orgs-section" id="orgs">
        <div className="orgs-inner">
          <FadeIn>
            <div className="section-label" style={{ color: COLORS.yellow }}>For organisations</div>
            <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: "clamp(28px, 4vw, 40px)", color: "white", fontWeight: 700, letterSpacing: -1, maxWidth: 500, lineHeight: 1.15 }}>
              See the value your people create.
            </h2>
            <p style={{ fontSize: 17, color: "rgba(255,255,255,0.55)", maxWidth: 560, lineHeight: 1.65, marginTop: 16 }}>
              Schools, youth organisations, charities, and local authorities get a companion dashboard with aggregated, anonymised data — ready for reporting, funding bids, and programme evaluation.
            </p>
          </FadeIn>
          <div className="orgs-grid">
            {[
              { title: "Evidence outcomes", desc: "Credible social value data from the same methodology used by councils and housing associations." },
              { title: "Set challenges", desc: "Create group challenges and track collective impact across a cohort, school, or programme." },
              { title: "Export and report", desc: "Download data for commissioners, trustees, or Ofsted. Feeds directly into SVE for SROI analysis." },
              { title: "Keep it safe", desc: "GDPR-compliant, pseudonymised, under-16 consent flows built in. Designed with safeguarding first." },
            ].map((c, i) => (
              <FadeIn key={i} delay={i * 0.1}>
                <div className="org-card">
                  <h3>{c.title}</h3>
                  <p>{c.desc}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ===== CTA ===== */}
      <section className="cta-section">
        <FadeIn>
          <div className="cta-inner">
            <h2>Ready to see what you're worth?</h2>
            <p>MyImpact is launching soon. Get early access and be one of the first to turn your positive actions into proof.</p>
            <button className="btn-white">Get early access →</button>
          </div>
        </FadeIn>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="footer">
        <div className="footer-logo">my<span>.</span>impact</div>
        <div className="footer-sub">Your impact, counted.</div>
        <div className="footer-links">
          <a href="#">About</a>
          <a href="#">How it works</a>
          <a href="#">For organisations</a>
          <a href="#">Privacy</a>
          <a href="#">Contact</a>
        </div>
        <div className="trust-line">Powered by Social Value Engine methodology · SVI Accredited · UK data centres</div>
      </footer>
    </div>
  );
}
