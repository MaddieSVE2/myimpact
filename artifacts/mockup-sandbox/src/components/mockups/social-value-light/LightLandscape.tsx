import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Pause, Play } from "lucide-react";
import "./LightLandscape.css";

const stories = [
  { name: "Aisha", age: "21, Glasgow", quote: "After uni I felt like my efforts weren't being seen. I was running a community art project but had no way to show what it was actually worth. MyImpact changed that. I could finally put a number on the pride, engagement, and connection we were creating.", value: "£4,230", what: "Community art project, 6 months", image: "community.webp", tint: "coral" },
  { name: "Ben", age: "36, Hull", quote: "I'm not in work right now and people make assumptions. But I run a tech drop-in for older people every week. I'm reducing isolation, building digital skills, bringing people together. MyImpact shows that what I do has real, measurable worth.", value: "£7,860", what: "Weekly tech hub, 12 months", image: "digital-mentoring.webp", tint: "mint" },
  { name: "Chloe", age: "17, Cardiff", quote: "Call me a snowflake if you want. I call me someone who pulled 300kg of plastic out of a river. MyImpact tracked every hour, every kilo, and showed me the environmental and community value. That data got the council on board.", value: "£3,150", what: "River clean-up crew, 8 months", image: "litter-picking.webp", tint: "sun" },
  { name: "Marcus", age: "38, Catterick", quote: "After 14 years in the infantry, I didn't know how to talk about what I'd done in a way civilians would get. My Impact's Sidekick helped me put it in plain language: not 'patrol commander' but 'led a team of 8 under operational pressure across 3 countries'. That reframe got me interviews I wasn't getting before.", value: "£11,240", what: "Forces leaver, 14 years' service", image: "veteran.webp", tint: "sky" },
  { name: "Priya", age: "44, Bristol", quote: "Eight years out of the workforce, and every CV advice website told me to explain the gap. My Impact helped me reframe it entirely. I wasn't absent. I was coordinating care for two children and an elderly parent across multiple health and education systems. That's a full-time job. Now my CV says so.", value: "£9,610", what: "Career break returner, 8 years", image: "caring.webp", tint: "lilac" },
];

export function LightLandscape() {
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);
  const story = stories[current];
  const go = (direction: 1 | -1) => setCurrent((value) => (value + direction + stories.length) % stories.length);

  useEffect(() => {
    if (paused) return;
    const timer = window.setInterval(() => go(1), 5600);
    return () => window.clearInterval(timer);
  }, [paused]);

  return (
    <main className="sv-light-stage">
      <div className="sv-light-shell">
        <header className="sv-light-heading">
          <div>
            <p className="sv-light-kicker">Illustrative examples <span>—</span> a shared picture</p>
            <h1>What does <em>social value</em><br /> look like?</h1>
          </div>
          <div className="sv-light-intro">
            <p>These examples are illustrative and show the kinds of contributions people make. Values are calculated using our standard SROI methodology. They are not verified testimonials.</p>
          </div>
        </header>

        <section className={`sv-light-landscape tint-${story.tint}`} aria-label="Five illustrative examples of social value" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
          <div className="sv-light-sun" aria-hidden="true" />
          <div className="sv-light-horizon" aria-hidden="true"><i /><i /><i /><i /></div>
          <div className="sv-light-index"><strong>0{current + 1}</strong><span>/ 0{stories.length}</span></div>

          <div className="sv-light-neighbours">
            {stories.map((item, index) => (
              <button key={item.name} className={`sv-light-neighbour ${index === current ? "is-current" : ""}`} onClick={() => setCurrent(index)} tabIndex={index === current ? -1 : 0}>
                <img src={`/__mockup/images/social-value/${item.image}`} alt="" /><span>{item.name}</span>
              </button>
            ))}
          </div>

          <div className="sv-light-art" aria-hidden="true">
            <div className="sv-light-ring ring-one" /><div className="sv-light-ring ring-two" />
            <img key={story.image} src={`/__mockup/images/social-value/${story.image}`} alt="" />
            <span>one contribution<br />at a time</span>
          </div>

          <article className="sv-light-feature" aria-live="polite">
            <div className="sv-light-feature-top"><span className="sv-light-marker" /> <span>In focus</span><span className="sv-light-place">{story.age}</span></div>
            <p className="sv-light-person">{story.name}</p>
            <blockquote>“{story.quote}”</blockquote>
            <div className="sv-light-foot">
              <div><span>Social value recognised</span><strong>{story.value}</strong></div>
              <p>{story.what}</p>
            </div>
          </article>

          <div className="sv-light-controls">
            <button type="button" aria-label="Previous story" onClick={() => go(-1)}><ArrowLeft size={17} /></button>
            <button type="button" aria-label="Next story" onClick={() => go(1)}><ArrowRight size={17} /></button>
            <button type="button" className="sv-light-pause" aria-label={paused ? "Play stories" : "Pause stories"} onClick={() => setPaused((value) => !value)}>{paused ? <Play size={13} /> : <Pause size={13} />}<span>{paused ? "Play" : "Pause"}</span></button>
          </div>
        </section>

        <nav className="sv-light-story-nav" aria-label="Choose an illustrative example">
          {stories.map((item, index) => (
            <button type="button" key={item.name} className={index === current ? "is-active" : ""} aria-current={index === current ? "true" : undefined} onClick={() => setCurrent(index)}>
              <span>{String(index + 1).padStart(2, "0")}</span><strong>{item.name}</strong><small>{item.what}</small>
            </button>
          ))}
        </nav>
      </div>
    </main>
  );
}