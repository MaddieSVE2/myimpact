const base = import.meta.env.BASE_URL;

export default function Title() {
  return (
    <div className="slide relative w-screen h-screen overflow-hidden bg-text">
      <img
        src={`${base}hero.png`}
        crossOrigin="anonymous"
        alt="People volunteering in a community garden"
        className="absolute inset-0 w-full h-full object-cover opacity-70"
      />
      <div className="absolute inset-0 bg-gradient-to-tr from-text/90 via-text/60 to-text/30" />

      <div className="absolute top-[6vh] left-[6vw]">
        <img
          src={`${base}myimpact-logo.png`}
          crossOrigin="anonymous"
          alt="My Impact"
          className="h-[8vh] w-auto"
        />
      </div>

      <div className="absolute bottom-[10vh] left-[6vw] right-[8vw]">
        <p className="font-body text-[1.2vw] uppercase tracking-[0.3em] text-accent mb-[3vh]">
          Powered by The Social Value Engine
        </p>
        <h1 className="font-display font-black text-[7.5vw] leading-[0.95] tracking-tight text-bg" style={{ textWrap: "balance" }}>
          You already make a difference.
          <span className="block">
            Now <span className="italic text-primary">prove it.</span>
          </span>
        </h1>
        <p className="font-body text-[1.5vw] text-bg/85 mt-[4vh] max-w-[55vw] leading-relaxed">
          My Impact calculates what your community contribution is worth, in pounds, so you can finally see the difference you make.
        </p>
      </div>

      <div className="absolute bottom-[6vh] right-[6vw] text-right">
        <p className="font-body text-[1vw] uppercase tracking-[0.25em] text-bg/60">
          Pitch deck · 2026
        </p>
        <p className="font-display italic font-semibold text-[1.5vw] text-bg">
          myimpact.uk
        </p>
      </div>
    </div>
  );
}
