export default function Methodology() {
  return (
    <div className="slide relative w-screen h-screen overflow-hidden bg-bg">
      <div className="absolute top-[8vh] left-[6vw] flex items-center gap-[1vw]">
        <span className="font-body text-[1.2vw] font-semibold uppercase tracking-[0.25em] text-primary">
          06 · The method
        </span>
        <div className="w-[6vw] h-[1px] bg-primary/50" />
      </div>

      <div className="absolute top-[18vh] left-[6vw] right-[8vw] grid grid-cols-12 gap-[3vw]">
        <div className="col-span-6">
          <h2 className="font-display font-bold text-[5vw] leading-[0.95] tracking-tight text-text" style={{ textWrap: "balance" }}>
            Built on real
            <span className="text-primary italic"> evidence.</span>
          </h2>
          <p className="font-body text-[1.5vw] text-text/75 mt-[5vh] leading-relaxed">
            Powered by the Social Value Engine — the same proxy values used by UK councils, universities and charities for social value reporting.
          </p>
          <div className="mt-[5vh] flex items-center gap-[2vw]">
            <div>
              <p className="font-display font-black text-[3vw] leading-none text-primary">SVE</p>
              <p className="font-body text-[1vw] uppercase tracking-[0.2em] text-text/60 mt-[1vh]">Proxy values</p>
            </div>
            <div className="w-[1px] h-[6vh] bg-text/20" />
            <div>
              <p className="font-display font-black text-[3vw] leading-none text-accent">UN</p>
              <p className="font-body text-[1vw] uppercase tracking-[0.2em] text-text/60 mt-[1vh]">SDG mapping</p>
            </div>
          </div>
        </div>

        <div className="col-span-6 bg-card rounded-2xl p-[3vw] border border-text/8">
          <p className="font-body text-[1vw] uppercase tracking-[0.25em] text-muted mb-[3vh]">
            Location-aware suggestions
          </p>
          <h3 className="font-display font-bold text-[2.5vw] text-text leading-tight">
            Real local charities, every time.
          </h3>
          <p className="font-body text-[1.3vw] text-text/70 mt-[3vh] leading-relaxed">
            Postcode lookup routes users to verified local charities — OSCR for Scotland, the Charity Commission for England and Wales, with an AI fallback for niche causes.
          </p>
          <div className="mt-[4vh] flex items-center gap-[1.5vw]">
            <div className="px-[1.2vw] py-[0.8vh] bg-primary/10 text-primary rounded-full font-body text-[1.1vw] font-semibold">
              OSCR
            </div>
            <div className="px-[1.2vw] py-[0.8vh] bg-accent/15 text-text rounded-full font-body text-[1.1vw] font-semibold">
              Charity Commission
            </div>
            <div className="px-[1.2vw] py-[0.8vh] bg-text text-bg rounded-full font-body text-[1.1vw] font-semibold">
              postcodes.io
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
