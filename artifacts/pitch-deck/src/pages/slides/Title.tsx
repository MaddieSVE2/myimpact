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

      <div className="absolute top-[6vh] left-[6vw] flex items-center gap-[1vw]">
        <div className="w-[1vw] h-[1vw] rounded-full bg-primary" />
        <span className="font-body text-[1.3vw] font-medium uppercase tracking-[0.25em] text-bg/85">
          My Impact
        </span>
      </div>

      <div className="absolute bottom-[10vh] left-[6vw] right-[8vw]">
        <p className="font-body text-[1.4vw] uppercase tracking-[0.3em] text-primary mb-[3vh]">
          Pitch deck · 2026
        </p>
        <h1 className="font-display font-black text-[8vw] leading-[0.92] tracking-tight text-bg" style={{ textWrap: "balance" }}>
          You already make a
          <span className="block text-primary italic">difference.</span>
        </h1>
        <p className="font-body text-[1.6vw] text-bg/85 mt-[4vh] max-w-[55vw] leading-relaxed">
          My Impact turns everyday community contributions into a measurable financial figure — backed by the Social Value Engine.
        </p>
      </div>

      <div className="absolute bottom-[6vh] right-[6vw] text-right">
        <p className="font-body text-[1vw] uppercase tracking-[0.25em] text-bg/60">
          Powered by
        </p>
        <p className="font-display font-semibold text-[1.5vw] text-bg">
          The Social Value Engine
        </p>
      </div>
    </div>
  );
}
