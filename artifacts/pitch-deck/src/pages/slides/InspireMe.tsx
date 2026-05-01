const base = import.meta.env.BASE_URL;

export default function InspireMe() {
  return (
    <div className="slide relative w-screen h-screen overflow-hidden bg-bg grid grid-cols-12">
      <div className="col-span-5 relative flex flex-col justify-center px-[5vw]">
        <div className="flex items-center gap-[1vw] mb-[4vh]">
          <span className="font-body text-[1.15vw] font-semibold uppercase tracking-[0.25em] text-primary">
            05 · Ideas for you
          </span>
          <div className="w-[4vw] h-[1px] bg-primary/50" />
        </div>

        <h2 className="font-display font-bold text-[4.6vw] leading-[0.95] tracking-tight text-text" style={{ textWrap: "balance" }}>
          Ideas,
          <span className="block text-primary italic">picked for you.</span>
        </h2>

        <p className="font-body text-[1.4vw] text-text/75 mt-[4vh] leading-relaxed">
          We turn your interests, situation and free time into a personal shortlist of activities, each one priced by social value created.
        </p>

        <div className="mt-[5vh] grid grid-cols-1 gap-y-[2vh]">
          <div className="flex items-baseline gap-[1vw]">
            <div className="w-[0.8vw] h-[0.8vw] rounded-full bg-primary mt-[0.5vh] flex-shrink-0" />
            <p className="font-body text-[1.2vw] text-text/85">
              Tailored to <span className="font-semibold">your</span> interests and time
            </p>
          </div>
          <div className="flex items-baseline gap-[1vw]">
            <div className="w-[0.8vw] h-[0.8vw] rounded-full bg-accent mt-[0.5vh] flex-shrink-0" />
            <p className="font-body text-[1.2vw] text-text/85">
              Estimated annual social value per activity
            </p>
          </div>
          <div className="flex items-baseline gap-[1vw]">
            <div className="w-[0.8vw] h-[0.8vw] rounded-full bg-sky mt-[0.5vh] flex-shrink-0" />
            <p className="font-body text-[1.2vw] text-text/85">
              Local opportunities near you, where available
            </p>
          </div>
        </div>
      </div>

      <div className="col-span-7 relative flex items-center justify-center bg-text/[0.04] border-l border-text/8 px-[3vw]">
        <div className="absolute top-[5vh] left-[3vw] flex items-center gap-[0.8vw]">
          <span className="w-[0.7vw] h-[0.7vw] rounded-full bg-primary animate-pulse" />
          <span className="font-body text-[0.95vw] uppercase tracking-[0.25em] text-text/55">
            Live on myimpact.uk
          </span>
        </div>

        <div className="relative w-full max-w-[44vw] rounded-2xl overflow-hidden shadow-2xl ring-1 ring-text/10 bg-bg">
          <div className="flex items-center gap-[0.5vw] px-[1.2vw] py-[1.2vh] bg-text/5 border-b border-text/10">
            <span className="w-[0.7vw] h-[0.7vw] rounded-full bg-[#FF5F57]" />
            <span className="w-[0.7vw] h-[0.7vw] rounded-full bg-[#FEBC2E]" />
            <span className="w-[0.7vw] h-[0.7vw] rounded-full bg-[#28C840]" />
            <div className="ml-[1.5vw] flex-1 px-[1vw] py-[0.5vh] bg-bg rounded-md font-body text-[0.85vw] text-text/55">
              myimpact.uk/suggestions
            </div>
          </div>
          <div className="relative" style={{ aspectRatio: "16 / 10" }}>
            <img
              src={`${base}site-suggestions.png`}
              crossOrigin="anonymous"
              alt="Screenshot of the personalised Ideas for you page on myimpact.uk"
              className="absolute inset-y-0 left-0 h-full"
              style={{ width: "103%", maxWidth: "none", objectFit: "cover", objectPosition: "left top" }}
            />
          </div>
        </div>

        <div className="absolute bottom-[5vh] right-[3vw] bg-bg/95 backdrop-blur px-[2vw] py-[2vh] rounded-2xl shadow-xl border border-text/8 max-w-[18vw]">
          <p className="font-body text-[0.85vw] uppercase tracking-[0.2em] text-muted mb-[0.8vh]">
            Top suggestion
          </p>
          <p className="font-display font-black text-[2.2vw] leading-none text-primary">
            +£20,748
          </p>
          <p className="font-body text-[0.95vw] text-text/70 mt-[1vh] leading-snug">
            est. annual value, 3 hrs/week
          </p>
        </div>
      </div>
    </div>
  );
}
