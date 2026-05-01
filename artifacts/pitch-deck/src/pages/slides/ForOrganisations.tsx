export default function ForOrganisations() {
  return (
    <div className="slide relative w-screen h-screen overflow-hidden bg-text">
      <div className="absolute top-0 left-0 w-[40vw] h-[40vw] rounded-full bg-primary/15 blur-3xl" />
      <div className="absolute bottom-0 right-0 w-[30vw] h-[30vw] rounded-full bg-accent/10 blur-3xl" />

      <div className="absolute top-[8vh] left-[6vw] flex items-center gap-[1vw]">
        <span className="font-body text-[1.2vw] font-semibold uppercase tracking-[0.25em] text-primary">
          05 · For organisations
        </span>
        <div className="w-[6vw] h-[1px] bg-primary/50" />
      </div>

      <div className="absolute top-[18vh] left-[6vw] right-[8vw]">
        <h2 className="font-display font-bold text-[5.5vw] leading-[0.95] tracking-tight text-bg max-w-[60vw]" style={{ textWrap: "balance" }}>
          A live dashboard of
          <span className="text-primary italic"> aggregate impact.</span>
        </h2>
      </div>

      <div className="absolute bottom-[8vh] left-[6vw] right-[6vw] grid grid-cols-4 gap-[2vw]">
        <div className="bg-bg/8 backdrop-blur border border-bg/15 rounded-2xl p-[2vw]">
          <p className="font-display font-black text-[3.5vw] leading-none text-primary">£</p>
          <p className="font-display font-bold text-[1.6vw] text-bg mt-[2vh] leading-tight">Total social value</p>
          <p className="font-body text-[1.1vw] text-bg/70 mt-[1vh] leading-relaxed">Live aggregate from every member.</p>
        </div>
        <div className="bg-bg/8 backdrop-blur border border-bg/15 rounded-2xl p-[2vw]">
          <p className="font-display font-black text-[3.5vw] leading-none text-accent">↗</p>
          <p className="font-display font-bold text-[1.6vw] text-bg mt-[2vh] leading-tight">Monthly trends</p>
          <p className="font-body text-[1.1vw] text-bg/70 mt-[1vh] leading-relaxed">Track contribution over time.</p>
        </div>
        <div className="bg-bg/8 backdrop-blur border border-bg/15 rounded-2xl p-[2vw]">
          <p className="font-display font-black text-[3.5vw] leading-none text-sky">◎</p>
          <p className="font-display font-bold text-[1.6vw] text-bg mt-[2vh] leading-tight">Regional spread</p>
          <p className="font-body text-[1.1vw] text-bg/70 mt-[1vh] leading-relaxed">Where impact is happening.</p>
        </div>
        <div className="bg-primary rounded-2xl p-[2vw]">
          <p className="font-display font-black text-[3.5vw] leading-none text-text">PDF</p>
          <p className="font-display font-bold text-[1.6vw] text-bg mt-[2vh] leading-tight">Funder-ready reports</p>
          <p className="font-body text-[1.1vw] text-bg/85 mt-[1vh] leading-relaxed">Exportable for stakeholders.</p>
        </div>
      </div>
    </div>
  );
}
