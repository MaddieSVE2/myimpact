const base = import.meta.env.BASE_URL;

export default function ForOrganisations() {
  return (
    <div className="slide relative w-screen h-screen overflow-hidden bg-text">
      <div className="absolute top-0 left-0 w-[40vw] h-[40vw] rounded-full bg-primary/15 blur-3xl" />
      <div className="absolute bottom-0 right-0 w-[30vw] h-[30vw] rounded-full bg-accent/10 blur-3xl" />

      <div className="absolute top-[5vh] left-[5vw] flex items-center gap-[1vw]">
        <span className="font-body text-[1.05vw] font-semibold uppercase tracking-[0.25em] text-primary">
          04 · For organisations
        </span>
        <div className="w-[5vw] h-[1px] bg-primary/50" />
      </div>

      <div className="absolute top-[12vh] left-[5vw] right-[5vw] grid grid-cols-12 gap-[2.5vw]">
        <div className="col-span-4 flex flex-col justify-start pt-[1vh]">
          <h2 className="font-display font-bold text-[3.8vw] leading-[0.95] tracking-tight text-bg" style={{ textWrap: "balance" }}>
            See the social value
            <span className="block text-primary italic">your people create.</span>
          </h2>
          <p className="font-body text-[1.15vw] text-bg/75 mt-[3vh] leading-relaxed">
            A branded portal for charities, universities, employers and membership organisations, turning everyday contribution into reportable impact.
          </p>

          <div className="mt-[4vh] grid grid-cols-1 gap-y-[1.5vh]">
            <div className="flex items-baseline gap-[0.8vw]">
              <span className="text-primary font-display font-black text-[1.3vw] leading-none w-[2vw]">£</span>
              <span className="font-body text-[1.05vw] text-bg/85">Aggregate value</span>
            </div>
            <div className="flex items-baseline gap-[0.8vw]">
              <span className="text-accent font-display font-black text-[1.3vw] leading-none w-[2vw]">↗</span>
              <span className="font-body text-[1.05vw] text-bg/85">Monthly trends</span>
            </div>
            <div className="flex items-baseline gap-[0.8vw]">
              <span className="text-sky font-display font-black text-[1.3vw] leading-none w-[2vw]">◎</span>
              <span className="font-body text-[1.05vw] text-bg/85">Regional spread</span>
            </div>
            <div className="flex items-baseline gap-[0.8vw]">
              <span className="text-primary font-display font-black text-[1vw] leading-none w-[2vw]">PDF</span>
              <span className="font-body text-[1.05vw] text-bg/85">Funder-ready reports</span>
            </div>
          </div>
        </div>

        <div className="col-span-8 relative">
          <div className="absolute -top-[3vh] left-0 flex items-center gap-[0.8vw]">
            <span className="w-[0.7vw] h-[0.7vw] rounded-full bg-primary animate-pulse" />
            <span className="font-body text-[0.9vw] uppercase tracking-[0.25em] text-bg/55">
              Example dashboard
            </span>
          </div>
          <div className="relative w-full rounded-2xl overflow-hidden shadow-2xl ring-1 ring-bg/15 bg-bg">
            <div className="flex items-center gap-[0.5vw] px-[1.2vw] py-[1.2vh] bg-text/[0.04] border-b border-text/10">
              <span className="w-[0.7vw] h-[0.7vw] rounded-full bg-[#FF5F57]" />
              <span className="w-[0.7vw] h-[0.7vw] rounded-full bg-[#FEBC2E]" />
              <span className="w-[0.7vw] h-[0.7vw] rounded-full bg-[#28C840]" />
              <div className="ml-[1.5vw] flex-1 px-[1vw] py-[0.5vh] bg-bg rounded-md font-body text-[0.8vw] text-text/55">
                myimpact.uk/org/demo
              </div>
            </div>
            <div className="relative" style={{ aspectRatio: "16 / 10" }}>
              <img
                src={`${base}site-org-dashboard.png`}
                crossOrigin="anonymous"
                alt="Screenshot of an example organisation dashboard on myimpact.uk"
                className="absolute inset-y-0 left-0 h-full"
                style={{ width: "103%", maxWidth: "none", objectFit: "cover", objectPosition: "left top" }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-[4vh] left-[5vw] right-[5vw] flex items-center gap-[1.5vw] flex-wrap">
        <span className="font-body text-[0.85vw] uppercase tracking-[0.25em] text-bg/55">Built for</span>
        <span className="font-display italic text-[1.1vw] text-bg/85">Charities</span>
        <span className="text-bg/30">·</span>
        <span className="font-display italic text-[1.1vw] text-bg/85">Universities</span>
        <span className="text-bg/30">·</span>
        <span className="font-display italic text-[1.1vw] text-bg/85">Employers</span>
        <span className="text-bg/30">·</span>
        <span className="font-display italic text-[1.1vw] text-bg/85">Membership bodies</span>
        <span className="text-bg/30">·</span>
        <span className="font-display italic text-[1.1vw] text-bg/85">Local authorities</span>
      </div>
    </div>
  );
}
