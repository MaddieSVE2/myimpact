import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";
import "./_group.css";

const stories = [
  { name: "Aisha", age: "21, Glasgow", quote: "After uni I felt like my efforts weren't being seen. I was running a community art project but had no way to show what it was actually worth. MyImpact changed that. I could finally put a number on the pride, engagement, and connection we were creating.", value: "£4,230", what: "Community art project, 6 months", image: "community.webp" },
  { name: "Ben", age: "36, Hull", quote: "I'm not in work right now and people make assumptions. But I run a tech drop-in for older people every week. I'm reducing isolation, building digital skills, bringing people together. MyImpact shows that what I do has real, measurable worth.", value: "£7,860", what: "Weekly tech hub, 12 months", image: "digital-mentoring.webp" },
  { name: "Chloe", age: "17, Cardiff", quote: "Call me a snowflake if you want. I call me someone who pulled 300kg of plastic out of a river. MyImpact tracked every hour, every kilo, and showed me the environmental and community value. That data got the council on board.", value: "£3,150", what: "River clean-up crew, 8 months", image: "litter-picking.webp" },
  { name: "Marcus", age: "38, Catterick", quote: "After 14 years in the infantry, I didn't know how to talk about what I'd done in a way civilians would get. My Impact's Sidekick helped me put it in plain language: not 'patrol commander' but 'led a team of 8 under operational pressure across 3 countries'. That reframe got me interviews I wasn't getting before.", value: "£11,240", what: "Forces leaver, 14 years' service", image: "veteran.webp" },
  { name: "Priya", age: "44, Bristol", quote: "Eight years out of the workforce, and every CV advice website told me to explain the gap. My Impact helped me reframe it entirely. I wasn't absent. I was coordinating care for two children and an elderly parent across multiple health and education systems. That's a full-time job. Now my CV says so.", value: "£9,610", what: "Career break returner, 8 years", image: "caring.webp" },
];

function StoryCard({ story }: { story: (typeof stories)[number] }) {
  return (
    <article style={{ borderRadius: 20, overflow: "hidden", border: "1px solid rgba(0,0,0,.07)", display: "flex", flexDirection: "column", height: "100%", background: "white" }}>
      <div aria-hidden="true" style={{ height: 156, background: "var(--mi-cream)", display: "flex", alignItems: "flex-end", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>
        <img src={`/__mockup/images/social-value/${story.image}`} alt="" style={{ width: 154, height: 154, objectFit: "contain", display: "block" }} />
      </div>
      <div style={{ padding: "24px 24px 16px", flex: 1 }}>
        <p style={{ fontFamily: "Outfit, sans-serif", fontSize: 18, fontWeight: 700, margin: 0 }}>{story.name}</p>
        <p style={{ fontSize: 12, color: "var(--mi-orange)", fontWeight: 600, margin: "2px 0 0" }}>{story.age}</p>
        <p style={{ fontSize: 14, color: "var(--mi-muted)", lineHeight: 1.65, margin: "10px 0 0", fontStyle: "italic" }}>&ldquo;{story.quote}&rdquo;</p>
      </div>
      <div style={{ padding: "12px 24px", background: "var(--mi-cream)", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
        <p style={{ fontFamily: "Outfit, sans-serif", fontSize: 24, fontWeight: 900, color: "var(--mi-orange)", margin: 0 }}>{story.value}</p>
        <p style={{ fontSize: 12, color: "var(--mi-subtle)", textAlign: "right", maxWidth: 130, lineHeight: 1.4, margin: 0 }}>{story.what}</p>
      </div>
    </article>
  );
}

export function Current() {
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = stories.length;
  const go = (direction: 1 | -1) => setCurrent((value) => (value + direction + count) % count);

  useEffect(() => {
    if (paused) return;
    const timer = window.setInterval(() => go(1), 5500);
    return () => window.clearInterval(timer);
  }, [paused]);

  const offsetFor = (index: number) => {
    let offset = ((index - current) % count + count) % count;
    if (offset > Math.floor(count / 2)) offset -= count;
    return offset;
  };

  return (
    <main className="sv-stage" style={{ padding: "72px 6%" }}>
      <div style={{ maxWidth: 1120, margin: "0 auto" }}>
        <p style={{ color: "var(--mi-orange)", fontSize: 12, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", margin: "0 0 12px" }}>Illustrative examples</p>
        <h1 style={{ fontFamily: "Outfit, sans-serif", fontSize: 42, lineHeight: 1.15, letterSpacing: "-.5px", margin: "0 0 42px", maxWidth: 500 }}>What does social value look like?</h1>
        <p style={{ fontSize: 14, color: "var(--mi-muted)", lineHeight: 1.6, margin: "0 0 12px", maxWidth: 620 }}>These examples are illustrative and show the kinds of contributions people make. Values are calculated using our standard SROI methodology. They are not verified testimonials.</p>

        <div onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} style={{ position: "relative" }}>
          <div style={{ position: "relative", overflow: "hidden" }}>
            <div aria-hidden="true" style={{ visibility: "hidden", width: "33.33%", margin: "0 33.33%" }}><StoryCard story={stories[current]} /></div>
            {stories.map((story, index) => {
              const offset = offsetFor(index);
              const centered = offset === 0;
              const side = Math.abs(offset) === 1;
              return (
                <motion.div key={story.name} aria-hidden={!centered} animate={{ x: `${offset * 100}%`, opacity: centered || side ? 1 : 0, filter: side ? "opacity(.28)" : "opacity(1)" }} transition={{ duration: .42 }} style={{ position: "absolute", inset: "0 auto 0 33.33%", width: "33.33%", cursor: side ? "pointer" : "default" }} onClick={() => side && go(offset > 0 ? 1 : -1)}>
                  <StoryCard story={story} />
                </motion.div>
              );
            })}
          </div>
          <button data-testid="button-previous" aria-label="Previous" onClick={() => go(-1)} style={{ position: "absolute", top: "50%", left: -18, transform: "translateY(-50%)", width: 36, height: 36, borderRadius: "50%", border: "1px solid #ddd", background: "white", display: "grid", placeItems: "center" }}><ChevronLeft size={17} /></button>
          <button data-testid="button-next" aria-label="Next" onClick={() => go(1)} style={{ position: "absolute", top: "50%", right: -18, transform: "translateY(-50%)", width: 36, height: 36, borderRadius: "50%", border: "1px solid #ddd", background: "white", display: "grid", placeItems: "center" }}><ChevronRight size={17} /></button>
        </div>
      </div>
    </main>
  );
}
