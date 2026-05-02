export default function GrantFundingAsk() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg">
      <div className="absolute top-[-10vh] right-[-10vw] w-[45vw] h-[45vw] rounded-full bg-primary/12 blur-3xl" />
      <div className="absolute bottom-[-15vh] left-[-10vw] w-[35vw] h-[35vw] rounded-full bg-accent/10 blur-3xl" />

      <div className="absolute top-[5vh] left-[6vw] flex items-center gap-[1vw]">
        <span className="font-body text-[1.1vw] font-semibold uppercase tracking-[0.25em] text-primary">
          12 · The ask
        </span>
        <div className="w-[6vw] h-[1px] bg-primary/50" />
      </div>

      <div className="absolute top-[11vh] left-[6vw] right-[8vw]">
        <h2 className="font-display font-bold text-[4.2vw] leading-[0.95] tracking-tight text-text" style={{ textWrap: "balance" }}>
          Help us build
          <span className="block text-primary italic">the infrastructure for impact.</span>
        </h2>
        <p className="font-body text-[1.15vw] text-text/75 mt-[2.5vh] max-w-[64vw] leading-snug">
          My Impact is a live platform with real users, an independent advisory group, and field-tested evidence. We are seeking grant funding to scale the product until organisational accounts provide a sustainable commercial foundation.
        </p>
      </div>

      <div className="absolute top-[44vh] left-[6vw] right-[6vw] grid grid-cols-3 gap-[1.8vw]">
        <div className="bg-card p-[1.6vw] rounded-2xl border border-text/8 flex flex-col">
          <div className="w-[2.8vw] h-[2.8vw] rounded-2xl bg-primary/15 flex items-center justify-center mb-[1.2vh]">
            <span className="font-display font-black text-[1.3vw] text-primary">01</span>
          </div>
          <h3 className="font-display font-bold text-[1.4vw] text-text leading-tight">
            Platform development
          </h3>
          <p className="font-body text-[0.95vw] text-text/70 mt-[0.8vh] leading-snug">
            Weekly activity tracking, contextual help, monetary value toggle, and expanded AI prompts.
          </p>
        </div>

        <div className="bg-card p-[1.6vw] rounded-2xl border border-text/8 flex flex-col">
          <div className="w-[2.8vw] h-[2.8vw] rounded-2xl bg-accent/20 flex items-center justify-center mb-[1.2vh]">
            <span className="font-display font-black text-[1.3vw] text-accent">02</span>
          </div>
          <h3 className="font-display font-bold text-[1.4vw] text-text leading-tight">
            Community deployment
          </h3>
          <p className="font-body text-[0.95vw] text-text/70 mt-[0.8vh] leading-snug">
            Place-based pilots with local authority and third sector partners.
          </p>
        </div>

        <div className="bg-card p-[1.6vw] rounded-2xl border border-text/8 flex flex-col">
          <div className="w-[2.8vw] h-[2.8vw] rounded-2xl bg-sky/30 flex items-center justify-center mb-[1.2vh]">
            <span className="font-display font-black text-[1.3vw] text-text">03</span>
          </div>
          <h3 className="font-display font-bold text-[1.4vw] text-text leading-tight">
            Evidence and evaluation
          </h3>
          <p className="font-body text-[0.95vw] text-text/70 mt-[0.8vh] leading-snug">
            Structured field trial expansion, impact reporting, and funder-ready evidence packs.
          </p>
        </div>
      </div>

      <div className="absolute bottom-[4vh] left-[6vw] right-[6vw] grid grid-cols-2 gap-[2vw]">
        <div className="bg-card rounded-2xl border border-text/8 p-[1.8vw]">
          <p className="font-body text-[0.9vw] uppercase tracking-[0.25em] text-primary mb-[1.5vh]">
            What we already have
          </p>
          <ul className="space-y-[0.8vh]">
            {[
              "Live platform",
              "Advisory group chaired by David Emerson CBE",
              "Field trials at three organisations",
              "SVE accreditation",
              "Boston Pride in Place application submitted",
            ].map((item) => (
              <li key={item} className="flex items-baseline gap-[0.8vw]">
                <span className="text-primary font-display font-black text-[0.9vw] leading-none">✓</span>
                <span className="font-body text-[1vw] text-text/80 leading-snug">{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-text rounded-2xl p-[1.8vw]">
          <p className="font-body text-[0.9vw] uppercase tracking-[0.25em] text-primary mb-[1.5vh]">
            What funding unlocks
          </p>
          <ul className="space-y-[0.8vh]">
            {[
              "Product improvements",
              "Place-based pilots",
              "Organisational account pipeline",
              "Long-term sustainability",
            ].map((item) => (
              <li key={item} className="flex items-baseline gap-[0.8vw]">
                <span className="text-primary font-display font-black text-[0.9vw] leading-none">→</span>
                <span className="font-body text-[1vw] text-bg/85 leading-snug">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
