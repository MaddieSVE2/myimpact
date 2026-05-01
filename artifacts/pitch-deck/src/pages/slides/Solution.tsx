export default function Solution() {
  return (
    <div className="slide relative w-screen h-screen overflow-hidden bg-bg">
      <div className="absolute top-[-15vh] right-[-10vw] w-[45vw] h-[45vw] rounded-full bg-primary/10 blur-3xl" />
      <div className="absolute bottom-[-15vh] left-[-10vw] w-[35vw] h-[35vw] rounded-full bg-accent/8 blur-3xl" />

      <div className="absolute top-[7vh] left-[6vw] flex items-center gap-[1vw]">
        <span className="font-body text-[1.15vw] font-semibold uppercase tracking-[0.25em] text-primary">
          02 · The solution
        </span>
        <div className="w-[5vw] h-[1px] bg-primary/50" />
      </div>

      <div className="absolute top-[15vh] left-[6vw] right-[8vw]">
        <h2 className="font-display font-bold text-[6.4vw] leading-[0.95] tracking-tight text-text" style={{ textWrap: "balance" }}>
          Make the invisible
          <span className="block text-primary italic">visible.</span>
        </h2>
        <p className="font-body text-[1.5vw] text-text/75 mt-[3.5vh] leading-relaxed max-w-[58vw]">
          A platform to measure what matters, motivate consistent action, and inspire what comes next.
        </p>
      </div>

      <div className="absolute bottom-[7vh] left-[6vw] right-[6vw] grid grid-cols-3 gap-[2vw]">
        <div className="bg-card p-[2.5vw] rounded-2xl border border-text/8 flex flex-col">
          <div className="flex items-center justify-between mb-[2.5vh]">
            <div className="w-[4vw] h-[4vw] rounded-2xl bg-primary/15 flex items-center justify-center">
              <span className="font-display font-black text-[2.2vw] text-primary leading-none">£</span>
            </div>
            <span className="font-body text-[0.85vw] uppercase tracking-[0.25em] text-text/45">
              Pillar 01
            </span>
          </div>
          <h3 className="font-display font-bold text-[2vw] text-text leading-tight">
            Measure
          </h3>
          <p className="font-body text-[1.15vw] text-text/70 mt-[1.5vh] leading-relaxed">
            Turn everyday volunteering, mentoring and caring into a verifiable figure in pounds, mapped to the UN SDGs.
          </p>
        </div>

        <div className="bg-text p-[2.5vw] rounded-2xl flex flex-col">
          <div className="flex items-center justify-between mb-[2.5vh]">
            <div className="w-[4vw] h-[4vw] rounded-2xl bg-primary/20 flex items-center justify-center">
              <span className="font-display font-black text-[2vw] text-primary leading-none">★</span>
            </div>
            <span className="font-body text-[0.85vw] uppercase tracking-[0.25em] text-bg/45">
              Pillar 02
            </span>
          </div>
          <h3 className="font-display font-bold text-[2vw] text-bg leading-tight">
            Motivate
          </h3>
          <p className="font-body text-[1.15vw] text-bg/75 mt-[1.5vh] leading-relaxed">
            Milestones, badges and a private journal that turn one good deed into a habit you can see grow.
          </p>
        </div>

        <div className="bg-card p-[2.5vw] rounded-2xl border border-text/8 flex flex-col">
          <div className="flex items-center justify-between mb-[2.5vh]">
            <div className="w-[4vw] h-[4vw] rounded-2xl bg-accent/20 flex items-center justify-center">
              <span className="font-display font-black text-[2vw] text-accent leading-none">✦</span>
            </div>
            <span className="font-body text-[0.85vw] uppercase tracking-[0.25em] text-text/45">
              Pillar 03
            </span>
          </div>
          <h3 className="font-display font-bold text-[2vw] text-text leading-tight">
            Inspire
          </h3>
          <p className="font-body text-[1.15vw] text-text/70 mt-[1.5vh] leading-relaxed">
            Personalised ideas and an AI sidekick that surface your next step and put your impact into words.
          </p>
        </div>
      </div>
    </div>
  );
}
