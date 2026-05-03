export default function Methodology() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg">
      <div className="absolute top-[-10vh] right-[-5vw] w-[40vw] h-[40vw] rounded-full bg-accent/12 blur-3xl" />
      <div className="absolute bottom-[-10vh] left-[-5vw] w-[35vw] h-[35vw] rounded-full bg-primary/8 blur-3xl" />

      <div className="absolute top-[6vh] left-[6vw] flex items-center gap-[1vw]">
        <span className="font-body text-[1.1vw] font-semibold uppercase tracking-[0.25em] text-primary">
          09 · The method
        </span>
        <div className="w-[6vw] h-[1px] bg-primary/50" />
      </div>

      <div className="absolute top-[15vh] left-[6vw] right-[6vw] grid grid-cols-12 gap-[3vw]">
        <div className="col-span-7">
          <h2 className="font-body font-bold text-[5vw] leading-[0.95] tracking-tight text-text" style={{ textWrap: "balance" }}>
            Grounded in
            <span className="text-primary italic"> evidence.</span>
          </h2>
          <p className="font-body text-[1.35vw] text-text/75 mt-[3.5vh] leading-relaxed">
            Powered by the Social Value Engine, the UK's accredited platform for social value measurement. The same proxy values used by councils, universities and national charities, mapped to the UN Sustainable Development Goals.
          </p>
          <p className="font-body text-[1.15vw] text-text/65 mt-[2.5vh] leading-relaxed">
            My Impact brings that proven methodology to individuals and small organisations for the first time, in plain language, in a few clicks.
          </p>

          <div className="mt-[4vh] flex items-center gap-[2vw]">
            <div>
              <p className="font-body font-black text-[2.8vw] leading-none text-primary">SVE</p>
              <p className="font-body text-[0.95vw] uppercase tracking-[0.2em] text-text/60 mt-[1vh]">Proxy values</p>
            </div>
            <div className="w-[1px] h-[5vh] bg-text/20" />
            <div>
              <p className="font-body font-black text-[2.8vw] leading-none text-accent">UN</p>
              <p className="font-body text-[0.95vw] uppercase tracking-[0.2em] text-text/60 mt-[1vh]">SDG mapping</p>
            </div>
            <div className="w-[1px] h-[5vh] bg-text/20" />
            <a
              href="https://www.socialvalueengine.com"
              target="_blank"
              rel="noopener noreferrer"
              className="font-body text-[1.05vw] font-semibold text-text/80 hover:text-primary transition-colors"
            >
              socialvalueengine.com
            </a>
          </div>
        </div>

        <div className="col-span-5 flex flex-col gap-[2vh]">
          <div className="bg-card rounded-2xl p-[2vw] border border-text/8">
            <p className="font-body text-[0.9vw] uppercase tracking-[0.2em] text-muted mb-[1.2vh]">
              Trusted by
            </p>
            <p className="font-body font-bold text-[1.55vw] text-text leading-tight">
              UK councils, universities and national charities
            </p>
            <p className="font-body text-[1vw] text-text/65 mt-[1.2vh] leading-relaxed">
              For social value reporting, procurement and impact measurement.
            </p>
          </div>

          <div className="bg-text rounded-2xl p-[2vw]">
            <p className="font-body text-[0.9vw] uppercase tracking-[0.2em] text-bg/55 mb-[1.2vh]">
              Location-aware suggestions
            </p>
            <p className="font-body font-bold text-[1.55vw] text-bg leading-tight">
              Real local charities, every time.
            </p>
            <p className="font-body text-[1vw] text-bg/70 mt-[1.2vh] leading-relaxed">
              Postcode lookup routes users to verified local charities. OSCR for Scotland, the Charity Commission for England and Wales, with an AI fallback for niche causes.
            </p>
            <div className="mt-[2vh] flex flex-wrap items-center gap-[0.6vw]">
              <div className="px-[0.9vw] py-[0.5vh] bg-primary/15 text-primary rounded-full font-body text-[0.9vw] font-semibold">
                OSCR
              </div>
              <div className="px-[0.9vw] py-[0.5vh] bg-accent/20 text-accent rounded-full font-body text-[0.9vw] font-semibold">
                Charity Commission
              </div>
              <div className="px-[0.9vw] py-[0.5vh] bg-bg/10 text-bg rounded-full font-body text-[0.9vw] font-semibold">
                postcodes.io
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
