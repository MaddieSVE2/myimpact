export default function Problem() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg">
      <div className="absolute top-[-20vh] left-[-15vw] w-[55vw] h-[55vw] rounded-full bg-primary/6 blur-3xl" />
      <div className="absolute bottom-[-10vh] right-[-8vw] w-[30vw] h-[30vw] rounded-full bg-accent/8 blur-3xl" />

      <div className="absolute top-[8vh] left-[6vw] flex items-center gap-[1vw]">
        <span className="font-body text-[1.2vw] font-semibold uppercase tracking-[0.25em] text-primary">
          01 · The problem
        </span>
        <div className="w-[6vw] h-[1px] bg-primary/50" />
      </div>

      <div className="absolute top-[20vh] left-[6vw] w-[52vw]">
        <h2
          className="font-display font-bold text-[5.6vw] leading-[0.98] tracking-tight text-text"
          style={{ textWrap: "balance" }}
        >
          Good deeds rarely show up
          <span className="block text-text/50">where they count.</span>
        </h2>
        <p className="font-body text-[1.45vw] text-text/75 mt-[4.5vh] leading-relaxed max-w-[44vw]">
          Volunteering, mentoring and caring shape lives every day. They barely
          register on a CV, in a budget, or in an org chart.
        </p>
      </div>

      <div className="absolute top-[18vh] right-[6vw] w-[32vw] bg-card/90 rounded-2xl border border-text/8 p-[2.2vw] backdrop-blur-sm">
        <div className="flex items-center justify-between pb-[2vh] border-b border-text/10">
          <span className="font-body text-[0.95vw] uppercase tracking-[0.25em] text-text/55">
            Where it should land
          </span>
          <span className="font-body text-[0.85vw] uppercase tracking-[0.2em] text-text/40">
            Status
          </span>
        </div>

        <div className="flex items-center justify-between py-[2.2vh] border-b border-text/8">
          <div>
            <p className="font-display font-semibold text-[1.55vw] text-text leading-tight">
              CV and transcript
            </p>
            <p className="font-body text-[1vw] text-text/55 mt-[0.6vh]">
              The hours you give
            </p>
          </div>
          <span className="font-body text-[1vw] uppercase tracking-[0.18em] text-primary/80 font-semibold">
            Missing
          </span>
        </div>

        <div className="flex items-center justify-between py-[2.2vh] border-b border-text/8">
          <div>
            <p className="font-display font-semibold text-[1.55vw] text-text leading-tight">
              Local economy
            </p>
            <p className="font-body text-[1vw] text-text/55 mt-[0.6vh]">
              The value you create
            </p>
          </div>
          <span className="font-body text-[1vw] uppercase tracking-[0.18em] text-primary/80 font-semibold">
            Uncounted
          </span>
        </div>

        <div className="flex items-center justify-between pt-[2.2vh]">
          <div>
            <p className="font-display font-semibold text-[1.55vw] text-text leading-tight">
              Org dashboards
            </p>
            <p className="font-body text-[1vw] text-text/55 mt-[0.6vh]">
              The impact your people make
            </p>
          </div>
          <span className="font-body text-[1vw] uppercase tracking-[0.18em] text-primary/80 font-semibold">
            Hidden
          </span>
        </div>
      </div>

    </div>
  );
}
