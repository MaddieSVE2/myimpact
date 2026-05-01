export default function ForOrganisations() {
  return (
    <div className="slide relative w-screen h-screen overflow-hidden bg-text">
      <div className="absolute top-0 left-0 w-[40vw] h-[40vw] rounded-full bg-primary/15 blur-3xl" />
      <div className="absolute bottom-0 right-0 w-[30vw] h-[30vw] rounded-full bg-accent/10 blur-3xl" />

      <div className="absolute top-[6vh] left-[6vw] flex items-center gap-[1vw]">
        <span className="font-body text-[1.1vw] font-semibold uppercase tracking-[0.25em] text-primary">
          04 · For organisations
        </span>
        <div className="w-[6vw] h-[1px] bg-primary/50" />
      </div>

      <div className="absolute top-[14vh] left-[6vw] right-[8vw]">
        <h2 className="font-display font-bold text-[5vw] leading-[0.95] tracking-tight text-bg max-w-[60vw]" style={{ textWrap: "balance" }}>
          See the social value
          <span className="text-primary italic"> your people create.</span>
        </h2>
        <p className="font-body text-[1.4vw] text-bg/75 mt-[3vh] max-w-[55vw] leading-relaxed">
          A branded portal for charities, universities, employers and membership organisations — turning everyday contribution into reportable impact.
        </p>
      </div>

      <div className="absolute bottom-[18vh] left-[6vw] right-[6vw] grid grid-cols-4 gap-[1.5vw]">
        <div className="bg-bg/8 backdrop-blur border border-bg/15 rounded-2xl p-[1.5vw]">
          <p className="font-display font-black text-[3vw] leading-none text-primary">£</p>
          <p className="font-display font-bold text-[1.4vw] text-bg mt-[1.5vh] leading-tight">Aggregate value</p>
          <p className="font-body text-[1vw] text-bg/70 mt-[1vh] leading-relaxed">Live total across every member.</p>
        </div>
        <div className="bg-bg/8 backdrop-blur border border-bg/15 rounded-2xl p-[1.5vw]">
          <p className="font-display font-black text-[3vw] leading-none text-accent">↗</p>
          <p className="font-display font-bold text-[1.4vw] text-bg mt-[1.5vh] leading-tight">Monthly trends</p>
          <p className="font-body text-[1vw] text-bg/70 mt-[1vh] leading-relaxed">Track impact over time.</p>
        </div>
        <div className="bg-bg/8 backdrop-blur border border-bg/15 rounded-2xl p-[1.5vw]">
          <p className="font-display font-black text-[3vw] leading-none text-sky">◎</p>
          <p className="font-display font-bold text-[1.4vw] text-bg mt-[1.5vh] leading-tight">Regional spread</p>
          <p className="font-body text-[1vw] text-bg/70 mt-[1vh] leading-relaxed">Where impact happens.</p>
        </div>
        <div className="bg-primary rounded-2xl p-[1.5vw]">
          <p className="font-display font-black text-[3vw] leading-none text-text">PDF</p>
          <p className="font-display font-bold text-[1.4vw] text-bg mt-[1.5vh] leading-tight">Funder-ready reports</p>
          <p className="font-body text-[1vw] text-bg/85 mt-[1vh] leading-relaxed">Exportable for stakeholders.</p>
        </div>
      </div>

      <div className="absolute bottom-[6vh] left-[6vw] right-[6vw] flex items-center gap-[2vw]">
        <span className="font-body text-[0.95vw] uppercase tracking-[0.25em] text-bg/55">Built for</span>
        <span className="font-display italic text-[1.3vw] text-bg/85">Charities</span>
        <span className="text-bg/30">·</span>
        <span className="font-display italic text-[1.3vw] text-bg/85">Universities</span>
        <span className="text-bg/30">·</span>
        <span className="font-display italic text-[1.3vw] text-bg/85">Employers</span>
        <span className="text-bg/30">·</span>
        <span className="font-display italic text-[1.3vw] text-bg/85">Membership bodies</span>
        <span className="text-bg/30">·</span>
        <span className="font-display italic text-[1.3vw] text-bg/85">Local authorities</span>
      </div>
    </div>
  );
}
