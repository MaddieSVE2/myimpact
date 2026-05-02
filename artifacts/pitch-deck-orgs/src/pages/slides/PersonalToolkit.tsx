export default function PersonalToolkit() {
  return (
    <div className="slide relative w-screen h-screen overflow-hidden bg-bg">
      <div className="absolute top-[8vh] left-[6vw] flex items-center gap-[1vw]">
        <span className="font-body text-[1.2vw] font-semibold uppercase tracking-[0.25em] text-primary">
          06 · Your personal toolkit
        </span>
        <div className="w-[6vw] h-[1px] bg-primary/50" />
      </div>

      <h2 className="absolute top-[16vh] left-[6vw] right-[8vw] font-display font-bold text-[4.6vw] leading-[1] tracking-tight text-text" style={{ textWrap: "balance" }}>
        Your impact,
        <span className="block text-primary italic">built up over time.</span>
      </h2>

      <div className="absolute bottom-[8vh] left-[6vw] right-[6vw] grid grid-cols-3 gap-[2vw]">
        <div className="bg-card p-[2.5vw] rounded-2xl border border-text/8 flex flex-col">
          <div className="flex items-center justify-between mb-[2.5vh]">
            <div className="w-[3.6vw] h-[3.6vw] rounded-2xl bg-primary/15 flex items-center justify-center">
              <span className="font-display font-bold text-[1.8vw] text-primary">✎</span>
            </div>
            <span className="font-body text-[0.85vw] uppercase tracking-[0.2em] text-text/45">
              Reflect
            </span>
          </div>
          <h3 className="font-display font-bold text-[1.9vw] text-text leading-tight">
            Journal
          </h3>
          <p className="font-body text-[1.1vw] text-text/70 mt-[1.5vh] leading-relaxed flex-1">
            A private space to capture what you did, how it felt, and what you learned. Reflections sit alongside each activity.
          </p>

          <div className="mt-[2.5vh] bg-bg rounded-xl border border-text/8 p-[1.2vw]">
            <div className="flex items-center justify-between mb-[1vh]">
              <span className="font-body text-[0.8vw] uppercase tracking-[0.15em] text-text/45">
                Today
              </span>
              <span className="font-body text-[0.8vw] text-primary">+ New entry</span>
            </div>
            <p className="font-display font-bold text-[1.05vw] text-text leading-tight">
              "Helped at the food bank"
            </p>
            <p className="font-body text-[0.9vw] text-text/60 mt-[0.6vh] leading-snug">
              Quieter than usual. The new sorting system felt much faster…
            </p>
          </div>
        </div>

        <div className="bg-text p-[2.5vw] rounded-2xl flex flex-col">
          <div className="flex items-center justify-between mb-[2.5vh]">
            <div className="w-[3.6vw] h-[3.6vw] rounded-2xl bg-primary/20 flex items-center justify-center">
              <span className="font-display font-bold text-[1.8vw] text-primary">★</span>
            </div>
            <span className="font-body text-[0.85vw] uppercase tracking-[0.2em] text-bg/45">
              Earn
            </span>
          </div>
          <h3 className="font-display font-bold text-[1.9vw] text-bg leading-tight">
            Milestones &amp; badges
          </h3>
          <p className="font-body text-[1.1vw] text-bg/75 mt-[1.5vh] leading-relaxed flex-1">
            Recognised milestones at £100, £500, £1,000 and £5,000, alongside badges that quietly reward consistency and breadth.
          </p>

          <div className="mt-[2.5vh] flex items-center gap-[0.8vw]">
            <div className="w-[3vw] h-[3vw] rounded-full bg-primary/20 border-2 border-primary flex items-center justify-center">
              <span className="text-[1.3vw]">🌱</span>
            </div>
            <div className="w-[3vw] h-[3vw] rounded-full bg-accent/25 border-2 border-accent flex items-center justify-center">
              <span className="text-[1.3vw]">🤝</span>
            </div>
            <div className="w-[3vw] h-[3vw] rounded-full bg-sky/30 border-2 border-sky flex items-center justify-center">
              <span className="text-[1.3vw]">📚</span>
            </div>
            <div className="w-[3vw] h-[3vw] rounded-full bg-bg/8 border-2 border-bg/20 flex items-center justify-center">
              <span className="font-display font-bold text-[1.1vw] text-bg/40">?</span>
            </div>
            <div className="w-[3vw] h-[3vw] rounded-full bg-bg/8 border-2 border-bg/20 flex items-center justify-center">
              <span className="font-display font-bold text-[1.1vw] text-bg/40">?</span>
            </div>
          </div>
          <p className="font-body text-[0.85vw] text-bg/55 mt-[1.2vh]">
            3 earned · 2 to discover
          </p>
        </div>

        <div className="bg-card p-[2.5vw] rounded-2xl border border-text/8 flex flex-col">
          <div className="flex items-center justify-between mb-[2.5vh]">
            <div className="w-[3.6vw] h-[3.6vw] rounded-2xl bg-accent/20 flex items-center justify-center">
              <span className="font-display font-bold text-[1.5vw] text-accent">↓</span>
            </div>
            <span className="font-body text-[0.85vw] uppercase tracking-[0.2em] text-text/45">
              Share
            </span>
          </div>
          <h3 className="font-display font-bold text-[1.9vw] text-text leading-tight">
            Export &amp; share
          </h3>
          <p className="font-body text-[1.1vw] text-text/70 mt-[1.5vh] leading-relaxed flex-1">
            Download your impact as a considered PDF report or a shareable PNG image. Add it to a CV, an application, or share it online.
          </p>

          <div className="mt-[2.5vh] flex gap-[0.8vw]">
            <div className="flex-1 bg-bg rounded-xl border border-text/8 p-[1vw] flex items-center gap-[0.8vw]">
              <div className="w-[2.4vw] h-[2.4vw] rounded-lg bg-primary/15 flex items-center justify-center">
                <span className="font-display font-black text-[0.9vw] text-primary">PDF</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-display font-bold text-[1vw] text-text leading-tight">Report</p>
                <p className="font-body text-[0.78vw] text-text/55 leading-tight">my-impact.pdf</p>
              </div>
            </div>
            <div className="flex-1 bg-bg rounded-xl border border-text/8 p-[1vw] flex items-center gap-[0.8vw]">
              <div className="w-[2.4vw] h-[2.4vw] rounded-lg bg-accent/20 flex items-center justify-center">
                <span className="font-display font-black text-[0.9vw] text-accent">PNG</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-display font-bold text-[1vw] text-text leading-tight">Image</p>
                <p className="font-body text-[0.78vw] text-text/55 leading-tight">my-impact.png</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
