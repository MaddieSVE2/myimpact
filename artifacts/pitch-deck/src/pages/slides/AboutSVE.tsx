export default function AboutSVE() {
  return (
    <div className="slide relative w-screen h-screen overflow-hidden bg-bg">
      <div className="absolute top-[-10vh] right-[-5vw] w-[40vw] h-[40vw] rounded-full bg-accent/12 blur-3xl" />
      <div className="absolute bottom-[-10vh] left-[-5vw] w-[35vw] h-[35vw] rounded-full bg-primary/8 blur-3xl" />

      <div className="absolute top-[6vh] left-[6vw] flex items-center gap-[1vw]">
        <span className="font-body text-[1.1vw] font-semibold uppercase tracking-[0.25em] text-primary">
          08 · About the Social Value Engine
        </span>
        <div className="w-[6vw] h-[1px] bg-primary/50" />
      </div>

      <div className="absolute top-[16vh] left-[6vw] right-[8vw] grid grid-cols-12 gap-[3vw]">
        <div className="col-span-7">
          <h2 className="font-display font-bold text-[5vw] leading-[0.95] tracking-tight text-text" style={{ textWrap: "balance" }}>
            The methodology
            <span className="block text-primary italic">behind My Impact.</span>
          </h2>
          <p className="font-body text-[1.4vw] text-text/75 mt-[4vh] leading-relaxed">
            The Social Value Engine is the UK's accredited platform for social value measurement: research-backed, regularly updated, and used by charities, government bodies, and businesses across the country.
          </p>
          <p className="font-body text-[1.3vw] text-text/65 mt-[3vh] leading-relaxed">
            My Impact brings that proven, professional methodology to individuals and small organisations for the first time, in plain language, in a few clicks.
          </p>

          <div className="mt-[5vh] inline-flex items-center gap-[1vw] px-[1.8vw] py-[1.2vh] border-2 border-text/15 rounded-full">
            <div className="w-[0.7vw] h-[0.7vw] rounded-full bg-accent" />
            <a
              href="https://www.socialvalueengine.com"
              target="_blank"
              rel="noopener noreferrer"
              className="font-body text-[1.15vw] font-semibold text-text"
            >
              socialvalueengine.com
            </a>
          </div>
        </div>

        <div className="col-span-5 flex flex-col gap-[2vh]">
          <div className="bg-card rounded-2xl p-[2vw] border border-text/8">
            <p className="font-body text-[0.95vw] uppercase tracking-[0.2em] text-muted mb-[1.5vh]">
              Trusted by
            </p>
            <p className="font-display font-bold text-[1.7vw] text-text leading-tight">
              UK councils, universities and national charities
            </p>
            <p className="font-body text-[1.1vw] text-text/65 mt-[1.5vh] leading-relaxed">
              For social value reporting, procurement and impact measurement.
            </p>
          </div>

          <div className="bg-text rounded-2xl p-[2vw]">
            <p className="font-body text-[0.95vw] uppercase tracking-[0.2em] text-bg/55 mb-[1.5vh]">
              Built on
            </p>
            <p className="font-display font-bold text-[1.7vw] text-bg leading-tight">
              Evidence-based proxy values
            </p>
            <p className="font-body text-[1.1vw] text-bg/70 mt-[1.5vh] leading-relaxed">
              A research-backed library, updated as new evidence emerges.
            </p>
          </div>

          <div className="bg-accent/15 rounded-2xl p-[2vw] border border-accent/25">
            <p className="font-body text-[0.95vw] uppercase tracking-[0.2em] text-text/60 mb-[1.5vh]">
              Mapped to
            </p>
            <p className="font-display font-bold text-[1.7vw] text-text leading-tight">
              UN Sustainable Development Goals
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
