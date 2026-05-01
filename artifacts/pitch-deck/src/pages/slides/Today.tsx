const base = import.meta.env.BASE_URL;

export default function Today() {
  return (
    <div className="slide relative w-screen h-screen overflow-hidden bg-bg grid grid-cols-12">
      <div className="col-span-5 relative bg-text flex items-center justify-center p-[3vw]">
        <div className="absolute top-[5vh] left-[3vw] flex items-center gap-[0.8vw]">
          <span className="w-[0.7vw] h-[0.7vw] rounded-full bg-primary animate-pulse" />
          <span className="font-body text-[0.95vw] uppercase tracking-[0.25em] text-bg/55">
            Live now
          </span>
        </div>
        <div className="relative w-full aspect-[16/10] rounded-2xl overflow-hidden shadow-2xl ring-1 ring-bg/10">
          <img
            src={`${base}site-about.png`}
            crossOrigin="anonymous"
            alt="Screenshot of the About page on myimpact.uk"
            className="absolute inset-0 w-full h-full object-cover object-top"
          />
        </div>
      </div>

      <div className="col-span-7 flex flex-col justify-center px-[5vw]">
        <div className="flex items-center gap-[1vw] mb-[4vh]">
          <span className="font-body text-[1.2vw] font-semibold uppercase tracking-[0.25em] text-primary">
            07 · Where we are
          </span>
          <div className="w-[5vw] h-[1px] bg-primary/50" />
        </div>

        <h2 className="font-display font-bold text-[5vw] leading-[0.95] tracking-tight text-text" style={{ textWrap: "balance" }}>
          Live, today.
        </h2>
        <p className="font-body text-[1.5vw] text-text/75 mt-[3vh] leading-relaxed max-w-[42vw]">
          Pilots running with universities, charities and community organisations across the UK.
        </p>

        <div className="mt-[6vh] grid grid-cols-2 gap-x-[3vw] gap-y-[2.5vh]">
          <div className="flex items-baseline gap-[1vw]">
            <div className="w-[0.6vw] h-[0.6vw] rounded-full bg-primary mt-[1vh]" />
            <p className="font-body text-[1.3vw] text-text/85 leading-relaxed">
              Magic-link login
            </p>
          </div>
          <div className="flex items-baseline gap-[1vw]">
            <div className="w-[0.6vw] h-[0.6vw] rounded-full bg-accent mt-[1vh]" />
            <p className="font-body text-[1.3vw] text-text/85 leading-relaxed">
              Public profile pages
            </p>
          </div>
          <div className="flex items-baseline gap-[1vw]">
            <div className="w-[0.6vw] h-[0.6vw] rounded-full bg-sky mt-[1vh]" />
            <p className="font-body text-[1.3vw] text-text/85 leading-relaxed">
              Organisation portal
            </p>
          </div>
          <div className="flex items-baseline gap-[1vw]">
            <div className="w-[0.6vw] h-[0.6vw] rounded-full bg-primary mt-[1vh]" />
            <p className="font-body text-[1.3vw] text-text/85 leading-relaxed">
              AI activity analyser
            </p>
          </div>
        </div>

        <div className="mt-[6vh] inline-flex items-center gap-[1vw] px-[2vw] py-[1.5vh] bg-text rounded-full self-start">
          <div className="w-[0.8vw] h-[0.8vw] rounded-full bg-primary" />
          <a
            href="https://myimpact.uk"
            target="_blank"
            rel="noopener noreferrer"
            className="font-body text-[1.3vw] font-semibold text-bg"
          >
            myimpact.uk
          </a>
        </div>
      </div>
    </div>
  );
}
