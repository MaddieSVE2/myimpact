const base = import.meta.env.BASE_URL;

export default function Solution() {
  return (
    <div className="slide relative w-screen h-screen overflow-hidden bg-bg grid grid-cols-12">
      <div className="col-span-7 relative flex flex-col justify-center px-[6vw]">
        <div className="flex items-center gap-[1vw] mb-[4vh]">
          <span className="font-body text-[1.2vw] font-semibold uppercase tracking-[0.25em] text-primary">
            02 · The solution
          </span>
          <div className="w-[5vw] h-[1px] bg-primary/50" />
        </div>

        <h2 className="font-display font-bold text-[5.5vw] leading-[0.95] tracking-tight text-text" style={{ textWrap: "balance" }}>
          A personal record of
          <span className="block text-primary italic">social value created.</span>
        </h2>

        <p className="font-body text-[1.6vw] text-text/75 mt-[5vh] leading-relaxed max-w-[40vw]">
          Log what you do for your community. We turn it into a verifiable monetary figure, mapped to UN Sustainable Development Goals.
        </p>

        <div className="flex items-center gap-[2vw] mt-[6vh]">
          <div className="px-[1.5vw] py-[1vh] bg-text text-bg rounded-full font-body text-[1.1vw] font-semibold">
            Verified methodology
          </div>
          <div className="px-[1.5vw] py-[1vh] border-2 border-text/20 text-text rounded-full font-body text-[1.1vw] font-semibold">
            Mapped to the UN SDGs
          </div>
        </div>
      </div>

      <div className="col-span-5 relative">
        <img
          src={`${base}hands.png`}
          crossOrigin="anonymous"
          alt="Hands holding a seedling"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-l from-transparent to-bg/30" />
        <div className="absolute bottom-[6vh] right-[3vw] left-[3vw] bg-bg/95 backdrop-blur p-[3vh] rounded-2xl">
          <p className="font-body text-[1vw] uppercase tracking-[0.2em] text-muted mb-[1vh]">
            Example output
          </p>
          <p className="font-display font-black text-[3.5vw] leading-none text-primary">
            £1,247
          </p>
          <p className="font-body text-[1.2vw] text-text/70 mt-[1.5vh]">
            Social value created, last 12 months
          </p>
        </div>
      </div>
    </div>
  );
}
