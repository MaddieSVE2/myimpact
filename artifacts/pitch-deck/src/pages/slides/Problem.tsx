export default function Problem() {
  return (
    <div className="slide relative w-screen h-screen overflow-hidden bg-bg">
      <div className="absolute top-0 right-0 w-[35vw] h-[35vw] rounded-full bg-primary/8 blur-3xl" />
      <div className="absolute bottom-[-10vh] left-[-5vw] w-[28vw] h-[28vw] rounded-full bg-accent/10 blur-3xl" />

      <div className="absolute top-[8vh] left-[6vw] flex items-center gap-[1vw]">
        <span className="font-body text-[1.2vw] font-semibold uppercase tracking-[0.25em] text-primary">
          01 · The problem
        </span>
        <div className="w-[6vw] h-[1px] bg-primary/50" />
      </div>

      <div className="absolute top-[20vh] left-[6vw] right-[8vw]">
        <h2 className="font-display font-bold text-[6vw] leading-[0.95] tracking-tight text-text" style={{ textWrap: "balance" }}>
          Most of what people give to
          <span className="text-muted/70"> their communities </span>
          is invisible.
        </h2>
      </div>

      <div className="absolute bottom-[10vh] left-[6vw] right-[8vw] grid grid-cols-3 gap-[3vw]">
        <div>
          <p className="font-display font-bold text-[4vw] leading-none text-primary">
            CV
          </p>
          <p className="font-body text-[1.4vw] text-text/75 mt-[2vh] leading-relaxed">
            Volunteering, mentoring and caring rarely make it onto a CV or transcript.
          </p>
        </div>
        <div>
          <p className="font-display font-bold text-[4vw] leading-none text-primary">
            £
          </p>
          <p className="font-body text-[1.4vw] text-text/75 mt-[2vh] leading-relaxed">
            Communities create real economic value — but no one is counting it.
          </p>
        </div>
        <div>
          <p className="font-display font-bold text-[4vw] leading-none text-primary">
            ∞
          </p>
          <p className="font-body text-[1.4vw] text-text/75 mt-[2vh] leading-relaxed">
            Organisations underestimate the impact their people are already creating.
          </p>
        </div>
      </div>
    </div>
  );
}
