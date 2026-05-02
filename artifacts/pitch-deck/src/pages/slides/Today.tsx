const base = import.meta.env.BASE_URL;

export default function Today() {
  return (
    <div className="slide relative w-screen h-screen overflow-hidden bg-bg grid grid-cols-12">
      <div className="col-span-6 relative flex items-center justify-center bg-card border-r border-text/8 px-[3vw]">
        <div className="absolute top-[5vh] left-[3vw] flex items-center gap-[0.8vw]">
          <span className="w-[0.7vw] h-[0.7vw] rounded-full bg-primary animate-pulse" />
          <span className="font-body text-[0.95vw] uppercase tracking-[0.25em] text-text/55">
            Live now
          </span>
        </div>

        <div className="relative w-full max-w-[42vw] rounded-2xl overflow-hidden shadow-2xl ring-1 ring-text/10 bg-bg">
          <div className="flex items-center gap-[0.5vw] px-[1.2vw] py-[1.2vh] bg-text/5 border-b border-text/10">
            <span className="w-[0.7vw] h-[0.7vw] rounded-full bg-[#FF5F57]" />
            <span className="w-[0.7vw] h-[0.7vw] rounded-full bg-[#FEBC2E]" />
            <span className="w-[0.7vw] h-[0.7vw] rounded-full bg-[#28C840]" />
            <div className="ml-[1.5vw] flex-1 px-[1vw] py-[0.5vh] bg-bg rounded-md font-body text-[0.85vw] text-text/55">
              myimpact.uk/about
            </div>
          </div>
          <div className="relative" style={{ aspectRatio: "16 / 9" }}>
            <img
              src={`${base}site-about.png`}
              crossOrigin="anonymous"
              alt="Screenshot of the About page on myimpact.uk"
              className="absolute inset-y-0 left-0 h-full"
              style={{ width: "103%", maxWidth: "none", objectFit: "cover", objectPosition: "left top" }}
            />
          </div>
        </div>
      </div>

      <div className="col-span-6 flex flex-col justify-center px-[5vw]">
        <div className="flex items-center gap-[1vw] mb-[4vh]">
          <span className="font-body text-[1.15vw] font-semibold uppercase tracking-[0.25em] text-primary">
            10 · Where we are
          </span>
          <div className="w-[4vw] h-[1px] bg-primary/50" />
        </div>

        <h2 className="font-display font-bold text-[4.8vw] leading-[0.95] tracking-tight text-text" style={{ textWrap: "balance" }}>
          Up and running.
        </h2>
        <p className="font-body text-[1.4vw] text-text/75 mt-[3vh] leading-relaxed">
          Pilots in progress with universities, charities and community organisations across the UK.
        </p>

        <div className="mt-[5vh] grid grid-cols-2 gap-x-[2vw] gap-y-[2vh]">
          <div className="flex items-baseline gap-[1vw]">
            <div className="w-[0.6vw] h-[0.6vw] rounded-full bg-primary mt-[1vh]" />
            <p className="font-body text-[1.2vw] text-text/85">
              Magic-link login
            </p>
          </div>
          <div className="flex items-baseline gap-[1vw]">
            <div className="w-[0.6vw] h-[0.6vw] rounded-full bg-accent mt-[1vh]" />
            <p className="font-body text-[1.2vw] text-text/85">
              Public profile pages
            </p>
          </div>
          <div className="flex items-baseline gap-[1vw]">
            <div className="w-[0.6vw] h-[0.6vw] rounded-full bg-sky mt-[1vh]" />
            <p className="font-body text-[1.2vw] text-text/85">
              Organisation portal
            </p>
          </div>
          <div className="flex items-baseline gap-[1vw]">
            <div className="w-[0.6vw] h-[0.6vw] rounded-full bg-primary mt-[1vh]" />
            <p className="font-body text-[1.2vw] text-text/85">
              AI activity analyser
            </p>
          </div>
        </div>

        <div className="mt-[5vh] inline-flex items-center gap-[1vw] px-[2vw] py-[1.5vh] bg-text rounded-full self-start">
          <div className="w-[0.8vw] h-[0.8vw] rounded-full bg-primary" />
          <a
            href="https://myimpact.uk"
            target="_blank"
            rel="noopener noreferrer"
            className="font-body text-[1.2vw] font-semibold text-bg"
          >
            myimpact.uk
          </a>
        </div>
      </div>
    </div>
  );
}
