import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Pause, Play } from "lucide-react";
import "./_group.css";
import "./Alternative.css";

const stories = [
  { name: "Aisha", age: "21, Glasgow", quote: "After uni I felt like my efforts weren't being seen. I was running a community art project but had no way to show what it was actually worth. MyImpact changed that. I could finally put a number on the pride, engagement, and connection we were creating.", value: "£4,230", what: "Community art project, 6 months", image: "community.webp" },
  { name: "Ben", age: "36, Hull", quote: "I'm not in work right now and people make assumptions. But I run a tech drop-in for older people every week. I'm reducing isolation, building digital skills, bringing people together. MyImpact shows that what I do has real, measurable worth.", value: "£7,860", what: "Weekly tech hub, 12 months", image: "digital-mentoring.webp" },
  { name: "Chloe", age: "17, Cardiff", quote: "Call me a snowflake if you want. I call me someone who pulled 300kg of plastic out of a river. MyImpact tracked every hour, every kilo, and showed me the environmental and community value. That data got the council on board.", value: "£3,150", what: "River clean-up crew, 8 months", image: "litter-picking.webp" },
  { name: "Marcus", age: "38, Catterick", quote: "After 14 years in the infantry, I didn't know how to talk about what I'd done in a way civilians would get. My Impact's Sidekick helped me put it in plain language: not 'patrol commander' but 'led a team of 8 under operational pressure across 3 countries'. That reframe got me interviews I wasn't getting before.", value: "£11,240", what: "Forces leaver, 14 years' service", image: "veteran.webp" },
  { name: "Priya", age: "44, Bristol", quote: "Eight years out of the workforce, and every CV advice website told me to explain the gap. My Impact helped me reframe it entirely. I wasn't absent. I was coordinating care for two children and an elderly parent across multiple health and education systems. That's a full-time job. Now my CV says so.", value: "£9,610", what: "Career break returner, 8 years", image: "caring.webp" },
];

export function Alternative() {
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
    <main className="sv-alt-stage">
      <div className="sv-alt-shell">
        <header className="sv-alt-heading">
          <div>
            <p className="sv-alt-kicker">Illustrative examples <span>—</span> a shared picture</p>
            <h1>What does <em>social value</em> look like?</h1>
          </div>
          <p className="sv-alt-disclaimer">These examples are illustrative and show the kinds of contributions people make. Values are calculated using our standard SROI methodology. They are not verified testimonials.</p>
        </header>

        <section className="sv-alt-landscape" aria-label="Five illustrative examples of social value" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
          <div className="sv-alt-map-lines" aria-hidden="true"><i /><i /><i /></div>
          <div className="sv-alt-index" aria-label={`Story ${current + 1} of ${stories.length}`}>
            <span className="sv-alt-index-current">0{current + 1}</span><span className="sv-alt-index-slash">/</span><span>0{stories.length}</span>
          </div>

          <div className="sv-alt-neighbours">
            {stories.map((item, index) => (
              <button key={item.name} className={`sv-alt-neighbour sv-alt-neighbour-${index} ${index === current ? "is-current" : ""}`} onClick={() => setCurrent(index)} tabIndex={index === current ? -1 : 0}>
                <img src={`/__mockup/images/social-value/${item.image}`} alt="" />
                <span>{item.name}</span>
              </button>
            ))}
          </div>

          <div className="sv-alt-art" aria-hidden="true">
            <div className="sv-alt-orbit orbit-one" /><div className="sv-alt-orbit orbit-two" />
            <img key={story.image} src={`/__mockup/images/social-value/${story.image}`} alt="" />
            <span className="sv-alt-art-label">one contribution<br />at a time</span>
          </div>

          <article className="sv-alt-feature" aria-live="polite">
            <div className="sv-alt-feature-top"><span className="sv-alt-marker" /> <span>In focus</span></div>
            <p className="sv-alt-person" data-testid={`text-person-${story.name.toLowerCase()}`}>{story.name} <small>{story.age}</small></p>
            <blockquote>“{story.quote}”</blockquote>
            <div className="sv-alt-foot">
              <div>
                <span className="sv-alt-eyebrow">Social value recognised</span>
                <strong data-testid={`value-social-${story.name.toLowerCase()}`}>{story.value}</strong>
              </div>
              <p data-testid={`text-activity-${story.name.toLowerCase()}`}>{story.what}</p>
            </div>
          </article>

          <div className="sv-alt-controls">
            <button type="button" data-testid="button-previous" aria-label="Previous story" onClick={() => go(-1)}><ArrowLeft size={18} /></button>
            <button type="button" data-testid="button-next" aria-label="Next story" onClick={() => go(1)}><ArrowRight size={18} /></button>
            <button type="button" className="sv-alt-pause" data-testid={paused ? "button-play" : "button-pause"} aria-label={paused ? "Play stories" : "Pause stories"} onClick={() => setPaused((value) => !value)}>{paused ? <Play size={14} /> : <Pause size={14} />}<span>{paused ? "Play" : "Pause"}</span></button>
          </div>
        </section>

        <nav className="sv-alt-story-nav" aria-label="Choose an illustrative example">
          {stories.map((item, index) => (
            <button type="button" key={item.name} data-testid={`button-story-${item.name.toLowerCase()}`} className={index === current ? "is-active" : ""} aria-current={index === current ? "true" : undefined} onClick={() => setCurrent(index)}>
              <span className="sv-alt-nav-dot">{String(index + 1).padStart(2, "0")}</span><span>{item.name}</span><small>{item.what}</small>
            </button>
          ))}
        </nav>
      </div>
    </main>
  );
}