export default function CommercialOpportunity() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg">
      <div className="absolute top-0 right-0 w-[40vw] h-[40vw] rounded-full bg-primary/10 blur-3xl" />

      <div className="absolute top-[6vh] left-[6vw] flex items-center gap-[1vw]">
        <span className="font-body text-[1.1vw] font-semibold uppercase tracking-[0.25em] text-primary">
          09 · How organisations use it
        </span>
        <div className="w-[6vw] h-[1px] bg-primary/50" />
      </div>

      <div className="absolute top-[14vh] left-[6vw] right-[8vw]">
        <h2 className="font-body font-bold text-[4.6vw] leading-[0.95] tracking-tight text-text" style={{ textWrap: "balance" }}>
          How organisations
          <span className="block text-primary italic">use My Impact.</span>
        </h2>
        <p className="font-body text-[1.3vw] text-text/70 mt-[2.5vh] max-w-[62vw] leading-relaxed">
          Four ways organisations put My Impact to work, to recognise the people who quietly make a difference, evidence their impact, and strengthen their employer brand.
        </p>
      </div>

      <div className="absolute bottom-[6vh] left-[6vw] right-[6vw] grid grid-cols-2 gap-x-[3.5vw] gap-y-[3.5vh]">
        <div className="flex gap-[1.4vw]">
          <div className="shrink-0 w-[3.8vw] h-[3.8vw] rounded-2xl bg-primary/10 flex items-center justify-center">
            <span className="font-body font-black text-[1.9vw] text-primary leading-none">★</span>
          </div>
          <div>
            <h3 className="font-body font-bold text-[1.7vw] text-text leading-tight">Employee recognition</h3>
            <p className="font-body text-[1.1vw] text-text/65 mt-[1vh] leading-relaxed">
              Surface the contribution your people make outside their job description, and acknowledge it openly.
            </p>
          </div>
        </div>

        <div className="flex gap-[1.4vw]">
          <div className="shrink-0 w-[3.8vw] h-[3.8vw] rounded-2xl bg-accent/15 flex items-center justify-center">
            <span className="font-body font-black text-[1.9vw] text-accent leading-none">✎</span>
          </div>
          <div>
            <h3 className="font-body font-bold text-[1.7vw] text-text leading-tight">Student support</h3>
            <p className="font-body text-[1.1vw] text-text/65 mt-[1vh] leading-relaxed">
              Help students turn volunteering, mentoring and caring into something they can put on a CV or UCAS form.
            </p>
          </div>
        </div>

        <div className="flex gap-[1.4vw]">
          <div className="shrink-0 w-[3.8vw] h-[3.8vw] rounded-2xl bg-text/8 flex items-center justify-center">
            <span className="font-body font-black text-[1.9vw] text-text leading-none">◧</span>
          </div>
          <div>
            <h3 className="font-body font-bold text-[1.7vw] text-text leading-tight">CSR and impact reporting</h3>
            <p className="font-body text-[1.1vw] text-text/65 mt-[1vh] leading-relaxed">
              Connect everyday contribution to your CSR commitments, with a single source of truth for trustees, funders and annual reports.
            </p>
          </div>
        </div>

        <div className="flex gap-[1.4vw]">
          <div className="shrink-0 w-[3.8vw] h-[3.8vw] rounded-2xl bg-primary/10 flex items-center justify-center">
            <span className="font-body font-black text-[1.9vw] text-primary leading-none">✦</span>
          </div>
          <div>
            <h3 className="font-body font-bold text-[1.7vw] text-text leading-tight">Employer branding</h3>
            <p className="font-body text-[1.1vw] text-text/65 mt-[1vh] leading-relaxed">
              Show prospective hires the difference your people make, backed by an accredited UK methodology.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
