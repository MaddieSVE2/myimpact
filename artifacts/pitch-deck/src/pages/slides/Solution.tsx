const base = import.meta.env.BASE_URL;

export default function Solution() {
  return (
    <div className="slide relative w-screen h-screen overflow-hidden bg-bg grid grid-cols-12">
      <div className="col-span-6 relative flex flex-col justify-center px-[6vw]">
        <div className="flex items-center gap-[1vw] mb-[4vh]">
          <span className="font-body text-[1.2vw] font-semibold uppercase tracking-[0.25em] text-primary">
            02 · The solution
          </span>
          <div className="w-[5vw] h-[1px] bg-primary/50" />
        </div>

        <h2 className="font-display font-bold text-[5vw] leading-[0.95] tracking-tight text-text" style={{ textWrap: "balance" }}>
          A personal record of
          <span className="block text-primary italic">social value created.</span>
        </h2>

        <p className="font-body text-[1.5vw] text-text/75 mt-[5vh] leading-relaxed max-w-[40vw]">
          Log what you do for your community. We turn it into a verifiable monetary figure, mapped to UN Sustainable Development Goals.
        </p>

        <div className="flex items-center gap-[1.5vw] mt-[5vh]">
          <div className="px-[1.5vw] py-[1vh] bg-text text-bg rounded-full font-body text-[1.05vw] font-semibold">
            Verified methodology
          </div>
          <div className="px-[1.5vw] py-[1vh] border-2 border-text/20 text-text rounded-full font-body text-[1.05vw] font-semibold">
            Mapped to the UN SDGs
          </div>
        </div>
      </div>

      <div className="col-span-6 relative flex items-center justify-center bg-text/[0.03] border-l border-text/8">
        <div className="absolute top-[5vh] left-[3vw] flex items-center gap-[0.8vw]">
          <span className="w-[0.7vw] h-[0.7vw] rounded-full bg-primary" />
          <span className="font-body text-[0.95vw] uppercase tracking-[0.25em] text-text/55">
            Live on myimpact.uk
          </span>
        </div>

        <div className="relative w-[88%] aspect-[16/10] rounded-2xl overflow-hidden shadow-2xl ring-1 ring-text/10 bg-bg">
          <img
            src={`${base}site-calculator.png`}
            crossOrigin="anonymous"
            alt="Screenshot of the My Impact calculator on myimpact.uk"
            className="absolute inset-0 w-full h-full object-cover object-top"
          />
        </div>

        <div className="absolute bottom-[5vh] right-[3vw] bg-bg/95 backdrop-blur px-[2vw] py-[2vh] rounded-2xl shadow-xl border border-text/8 max-w-[20vw]">
          <p className="font-body text-[0.9vw] uppercase tracking-[0.2em] text-muted mb-[0.8vh]">
            Example output
          </p>
          <p className="font-display font-black text-[2.8vw] leading-none text-primary">
            £1,247
          </p>
          <p className="font-body text-[1vw] text-text/70 mt-[1vh] leading-snug">
            Social value, last 12 months
          </p>
        </div>
      </div>
    </div>
  );
}
