export default function CommercialOpportunity() {
  return (
    <div className="slide relative w-screen h-screen overflow-hidden bg-bg">
      <div className="absolute top-0 right-0 w-[40vw] h-[40vw] rounded-full bg-primary/10 blur-3xl" />

      <div className="absolute top-[6vh] left-[6vw] flex items-center gap-[1vw]">
        <span className="font-body text-[1.1vw] font-semibold uppercase tracking-[0.25em] text-primary">
          05 · The opportunity
        </span>
        <div className="w-[6vw] h-[1px] bg-primary/50" />
      </div>

      <div className="absolute top-[14vh] left-[6vw] right-[8vw]">
        <h2 className="font-display font-bold text-[5vw] leading-[0.95] tracking-tight text-text" style={{ textWrap: "balance" }}>
          A commercial case
          <span className="block text-primary italic">organisations can act on.</span>
        </h2>
        <p className="font-body text-[1.4vw] text-text/70 mt-[3vh] max-w-[55vw] leading-relaxed">
          My Impact gives organisations the evidence they already need: for funders, for procurement, for retention, and for recruitment.
        </p>
      </div>

      <div className="absolute bottom-[8vh] left-[6vw] right-[6vw] grid grid-cols-2 gap-x-[3vw] gap-y-[3vh]">
        <div className="flex gap-[1.5vw]">
          <div className="shrink-0 w-[4vw] h-[4vw] rounded-2xl bg-primary/10 flex items-center justify-center">
            <span className="font-display font-black text-[2vw] text-primary leading-none">£</span>
          </div>
          <div>
            <h3 className="font-display font-bold text-[1.7vw] text-text leading-tight">Win contracts and grants</h3>
            <p className="font-body text-[1.15vw] text-text/65 mt-[1vh] leading-relaxed">
              Quantified social value strengthens bids under the Public Services (Social Value) Act and ESG-linked funding rounds.
            </p>
          </div>
        </div>

        <div className="flex gap-[1.5vw]">
          <div className="shrink-0 w-[4vw] h-[4vw] rounded-2xl bg-accent/15 flex items-center justify-center">
            <span className="font-display font-black text-[2vw] text-accent leading-none">↺</span>
          </div>
          <div>
            <h3 className="font-display font-bold text-[1.7vw] text-text leading-tight">Retain members and staff</h3>
            <p className="font-body text-[1.15vw] text-text/65 mt-[1vh] leading-relaxed">
              People stay where their contribution is seen. Personal impact dashboards make recognition tangible and shareable.
            </p>
          </div>
        </div>

        <div className="flex gap-[1.5vw]">
          <div className="shrink-0 w-[4vw] h-[4vw] rounded-2xl bg-sky/30 flex items-center justify-center">
            <span className="font-display font-black text-[2vw] text-text leading-none">★</span>
          </div>
          <div>
            <h3 className="font-display font-bold text-[1.7vw] text-text leading-tight">Recruit with credibility</h3>
            <p className="font-body text-[1.15vw] text-text/65 mt-[1vh] leading-relaxed">
              Show prospective volunteers, students or employees the real-world value they will create, backed by an accredited methodology.
            </p>
          </div>
        </div>

        <div className="flex gap-[1.5vw]">
          <div className="shrink-0 w-[4vw] h-[4vw] rounded-2xl bg-text/8 flex items-center justify-center">
            <span className="font-display font-black text-[2vw] text-text leading-none">◧</span>
          </div>
          <div>
            <h3 className="font-display font-bold text-[1.7vw] text-text leading-tight">Report with confidence</h3>
            <p className="font-body text-[1.15vw] text-text/65 mt-[1vh] leading-relaxed">
              One source of truth for trustees, funders, regulators and annual reports. No more chasing spreadsheets each quarter.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
