export default function FieldEvidence() {
  return (
    <div className="slide relative w-screen h-screen overflow-hidden bg-bg">
      <div className="absolute top-[-10vh] right-[-10vw] w-[40vw] h-[40vw] rounded-full bg-accent/12 blur-3xl" />
      <div className="absolute bottom-[-15vh] left-[-10vw] w-[35vw] h-[35vw] rounded-full bg-primary/8 blur-3xl" />

      <div className="absolute top-[6vh] left-[6vw] flex items-center gap-[1vw]">
        <span className="font-body text-[1.1vw] font-semibold uppercase tracking-[0.25em] text-primary">
          07 · Field evidence
        </span>
        <div className="w-[6vw] h-[1px] bg-primary/50" />
      </div>

      <div className="absolute top-[14vh] left-[6vw] right-[8vw]">
        <h2 className="font-display font-bold text-[4.6vw] leading-[0.95] tracking-tight text-text" style={{ textWrap: "balance" }}>
          Tested with real people.
          <span className="block text-primary italic">Here's what they said.</span>
        </h2>
      </div>

      <div className="absolute top-[42vh] left-[6vw] right-[6vw] grid grid-cols-3 gap-[2vw]">
        <div className="bg-card p-[2vw] rounded-2xl border border-text/8 flex flex-col">
          <span className="font-display font-black text-[3.5vw] leading-none text-primary/80">"</span>
          <p className="font-display font-bold text-[1.4vw] text-text leading-snug mt-[1vh] flex-1" style={{ textWrap: "balance" }}>
            I get demotivated easily. The app is really helpful in times like this.
          </p>
          <p className="font-body text-[0.95vw] uppercase tracking-[0.2em] text-text/50 mt-[2.5vh]">
            Participant
          </p>
          <p className="font-body text-[1vw] text-text/70 mt-[0.4vh]">
            New Wortley Community Hub
          </p>
        </div>

        <div className="bg-text p-[2vw] rounded-2xl flex flex-col">
          <span className="font-display font-black text-[3.5vw] leading-none text-primary">"</span>
          <p className="font-display font-bold text-[1.4vw] text-bg leading-snug mt-[1vh] flex-1" style={{ textWrap: "balance" }}>
            I understood my value, but this attached an equitable number I could use and think about.
          </p>
          <p className="font-body text-[0.95vw] uppercase tracking-[0.2em] text-bg/50 mt-[2.5vh]">
            Participant
          </p>
          <p className="font-body text-[1vw] text-bg/70 mt-[0.4vh]">
            Loughborough College
          </p>
        </div>

        <div className="bg-card p-[2vw] rounded-2xl border border-text/8 flex flex-col">
          <span className="font-display font-black text-[3.5vw] leading-none text-accent/80">"</span>
          <p className="font-display font-bold text-[1.4vw] text-text leading-snug mt-[1vh] flex-1" style={{ textWrap: "balance" }}>
            A volunteer carer became visibly moved by her social value calculation and described the figure as deeply meaningful.
          </p>
          <p className="font-body text-[0.95vw] uppercase tracking-[0.2em] text-text/50 mt-[2.5vh]">
            Field trial observation
          </p>
          <p className="font-body text-[1vw] text-text/70 mt-[0.4vh]">
            New Wortley
          </p>
        </div>
      </div>

      <div className="absolute bottom-[6vh] left-[6vw] right-[6vw] flex flex-wrap items-center gap-[1vw]">
        <span className="font-body text-[0.85vw] uppercase tracking-[0.25em] text-text/55">Field trials</span>
        <div className="px-[1.2vw] py-[0.9vh] rounded-full border border-text/15 font-body text-[1vw] text-text/80">
          Loughborough College <span className="text-text/45">· April 2026</span>
        </div>
        <div className="px-[1.2vw] py-[0.9vh] rounded-full border border-text/15 font-body text-[1vw] text-text/80">
          Leeds Youth Justice and Probation <span className="text-text/45">· April 2026</span>
        </div>
        <div className="px-[1.2vw] py-[0.9vh] rounded-full border border-text/15 font-body text-[1vw] text-text/80">
          New Wortley Community Hub <span className="text-text/45">· April 2026</span>
        </div>
      </div>
    </div>
  );
}
