const base = import.meta.env.BASE_URL;

export default function GetInvolved() {
  return (
    <div className="slide relative w-screen h-screen overflow-hidden bg-text">
      <div className="absolute top-[-15vh] right-[-15vw] w-[55vw] h-[55vw] rounded-full bg-primary/20 blur-3xl" />
      <div className="absolute bottom-[-10vh] left-[-10vw] w-[40vw] h-[40vw] rounded-full bg-accent/15 blur-3xl" />

      <div className="absolute top-[6vh] left-[6vw]">
        <img
          src={`${base}myimpact-logo.png`}
          crossOrigin="anonymous"
          alt="My Impact"
          className="h-[8vh] w-auto"
        />
      </div>

      <div className="absolute top-[28vh] left-[6vw] right-[8vw]">
        <p className="font-body text-[1.3vw] uppercase tracking-[0.3em] text-primary mb-[3vh]">
          Get involved
        </p>
        <h2 className="font-display font-black text-[7.5vw] leading-[0.92] tracking-tight text-bg" style={{ textWrap: "balance" }}>
          Show the
          <span className="block text-primary italic">difference you make.</span>
        </h2>
      </div>

      <div className="absolute bottom-[10vh] left-[6vw] right-[6vw] grid grid-cols-2 gap-[3vw]">
        <div>
          <p className="font-body text-[1vw] uppercase tracking-[0.25em] text-bg/55 mb-[2vh]">
            Try it
          </p>
          <a
            href="https://myimpact.uk"
            target="_blank"
            rel="noopener noreferrer"
            className="font-display font-bold text-[2.5vw] text-bg block leading-tight"
          >
            myimpact.uk
          </a>
        </div>
        <div>
          <p className="font-body text-[1vw] uppercase tracking-[0.25em] text-bg/55 mb-[2vh]">
            Partner with us
          </p>
          <a
            href="mailto:maddie@socialvalueengine.com"
            className="font-display font-bold text-[2.5vw] text-primary block leading-tight"
          >
            maddie@socialvalueengine.com
          </a>
        </div>
      </div>
    </div>
  );
}
