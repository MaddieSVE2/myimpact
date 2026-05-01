export default function HowItWorks() {
  return (
    <div className="slide relative w-screen h-screen overflow-hidden bg-bg">
      <div className="absolute top-[8vh] left-[6vw] flex items-center gap-[1vw]">
        <span className="font-body text-[1.2vw] font-semibold uppercase tracking-[0.25em] text-primary">
          03 · How it works
        </span>
        <div className="w-[6vw] h-[1px] bg-primary/50" />
      </div>

      <h2 className="absolute top-[16vh] left-[6vw] right-[8vw] font-display font-bold text-[5vw] leading-[1] tracking-tight text-text" style={{ textWrap: "balance" }}>
        Three steps from
        <span className="text-primary italic"> contribution </span>
        to <span className="text-primary italic">measurable impact.</span>
      </h2>

      <div className="absolute bottom-[10vh] left-[6vw] right-[6vw] grid grid-cols-3 gap-[2vw]">
        <div className="bg-card p-[3vw] rounded-2xl border border-text/8">
          <div className="flex items-center justify-between mb-[3vh]">
            <span className="font-display font-black text-[5vw] leading-none text-primary">
              01
            </span>
            <div className="w-[4vw] h-[4vw] rounded-full bg-primary/10 flex items-center justify-center">
              <div className="w-[1.5vw] h-[1.5vw] rounded-full bg-primary" />
            </div>
          </div>
          <h3 className="font-display font-bold text-[2vw] text-text leading-tight">
            Tell us your situation
          </h3>
          <p className="font-body text-[1.3vw] text-text/70 mt-[2vh] leading-relaxed">
            Student, carer, jobseeker, professional or retired. Pick the journey that fits.
          </p>
        </div>

        <div className="bg-card p-[3vw] rounded-2xl border border-text/8">
          <div className="flex items-center justify-between mb-[3vh]">
            <span className="font-display font-black text-[5vw] leading-none text-primary">
              02
            </span>
            <div className="w-[4vw] h-[4vw] rounded-full bg-accent/15 flex items-center justify-center">
              <div className="w-[1.5vw] h-[1.5vw] rounded-full bg-accent" />
            </div>
          </div>
          <h3 className="font-display font-bold text-[2vw] text-text leading-tight">
            Log what you actually do
          </h3>
          <p className="font-body text-[1.3vw] text-text/70 mt-[2vh] leading-relaxed">
            Volunteering, mentoring, fundraising, caring. Pick from a curated list or describe it freely.
          </p>
        </div>

        <div className="bg-text p-[3vw] rounded-2xl">
          <div className="flex items-center justify-between mb-[3vh]">
            <span className="font-display font-black text-[5vw] leading-none text-primary">
              03
            </span>
            <div className="w-[4vw] h-[4vw] rounded-full bg-primary/20 flex items-center justify-center">
              <div className="w-[1.5vw] h-[1.5vw] rounded-full bg-primary" />
            </div>
          </div>
          <h3 className="font-display font-bold text-[2vw] text-bg leading-tight">
            See your impact in pounds
          </h3>
          <p className="font-body text-[1.3vw] text-bg/75 mt-[2vh] leading-relaxed">
            A live total in £, broken down by activity and mapped to the UN Sustainable Development Goals.
          </p>
        </div>
      </div>
    </div>
  );
}
