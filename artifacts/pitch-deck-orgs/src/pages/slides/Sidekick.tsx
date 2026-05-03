export default function Sidekick() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg grid grid-cols-12">
      <div className="col-span-6 relative flex flex-col justify-center px-[5vw]">
        <div className="flex items-center gap-[1vw] mb-[4vh]">
          <span className="font-body text-[1.15vw] font-semibold uppercase tracking-[0.25em] text-primary">
            08 · Sidekick
          </span>
          <div className="w-[4vw] h-[1px] bg-primary/50" />
        </div>

        <h2 className="font-body font-bold text-[4.2vw] leading-[0.95] tracking-tight text-text" style={{ textWrap: "balance" }}>
          Your AI
          <span className="block text-primary italic">sidekick.</span>
        </h2>

        <p className="font-body text-[1.4vw] text-text/75 mt-[4vh] leading-relaxed">A context-aware assistant that understands what you do and helps you put it into words.</p>

        <div className="mt-[5vh] grid grid-cols-1 gap-y-[2.5vh]">
          <div className="flex items-start gap-[1.2vw]">
            <div className="w-[2.4vw] h-[2.4vw] rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
              <span className="font-body font-bold text-[1.2vw] text-primary">?</span>
            </div>
            <div>
              <p className="font-body font-bold text-[1.4vw] text-text leading-tight">
                Understand your number
              </p>
              <p className="font-body text-[1.05vw] text-text/65 mt-[0.5vh] leading-snug">
                Ask why your impact is what it is, and what would increase it.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-[1.2vw]">
            <div className="w-[2.4vw] h-[2.4vw] rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
              <span className="font-body font-bold text-[1.2vw] text-accent">✎</span>
            </div>
            <div>
              <p className="font-body font-bold text-[1.4vw] text-text leading-tight">
                Put it into words
              </p>
              <p className="font-body text-[1.05vw] text-text/65 mt-[0.5vh] leading-snug">
                CV bullets, UCAS statements and cover-letter lines, drafted from your real activity.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-[1.2vw]">
            <div className="w-[2.4vw] h-[2.4vw] rounded-full bg-sky/25 flex items-center justify-center flex-shrink-0">
              <span className="font-body font-bold text-[1.2vw] text-sky">→</span>
            </div>
            <div>
              <p className="font-body font-bold text-[1.4vw] text-text leading-tight">
                Know what to do next
              </p>
              <p className="font-body text-[1.05vw] text-text/65 mt-[0.5vh] leading-snug">
                Context-aware suggestions wherever you are in the platform.
              </p>
            </div>
          </div>
        </div>
      </div>
      <div className="col-span-6 relative flex items-end justify-center bg-text/[0.04] border-l border-text/8 px-[3vw] pb-[8vh]">
        <div className="absolute bottom-[3vh] left-[3vw] flex items-center gap-[0.8vw]">
          <span className="w-[0.7vw] h-[0.7vw] rounded-full bg-primary animate-pulse" />
          <span className="font-body text-[0.95vw] uppercase tracking-[0.25em] text-text/55">
            Live on myimpact.uk
          </span>
        </div>

        <div className="relative w-full max-w-[32vw] rounded-2xl overflow-hidden shadow-2xl ring-1 ring-text/10 bg-bg">
          <div className="flex items-center gap-[0.8vw] px-[1.5vw] py-[1.4vh] bg-text border-b border-text/10">
            <div className="w-[2.4vw] h-[2.4vw] rounded-full bg-primary flex items-center justify-center flex-shrink-0">
              <span className="font-body font-bold text-[1.1vw] text-bg">S</span>
            </div>
            <div className="flex-1">
              <p className="font-body font-bold text-[1.1vw] text-bg leading-tight">Sidekick</p>
              <p className="font-body text-[0.8vw] text-bg/60 leading-tight">AI Assistant · online</p>
            </div>
            <span className="w-[0.7vw] h-[0.7vw] rounded-full bg-[#28C840]" />
          </div>

          <div className="p-[1.6vw] space-y-[1.6vh] bg-bg" style={{ minHeight: "44vh" }}>
            <div className="flex justify-end">
              <div className="bg-primary text-bg rounded-2xl rounded-tr-sm px-[1.2vw] py-[1.2vh] max-w-[80%]">
                <p className="font-body text-[1vw] leading-snug">
                  How would I describe my volunteering on a CV?
                </p>
              </div>
            </div>

            <div className="flex justify-start">
              <div className="bg-text/[0.06] text-text rounded-2xl rounded-tl-sm px-[1.2vw] py-[1.2vh] max-w-[88%]">
                <p className="font-body text-[1vw] leading-snug">
                  Based on your logged activities, here is a strong line:
                </p>
                <p className="font-body italic text-[1vw] text-text/85 mt-[0.8vh] leading-snug border-l-2 border-primary pl-[0.7vw]">
                  "Mentored 12 young people across an academic year, contributing an estimated £4,200 of social value through one-to-one sessions on study skills and confidence."
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-[0.5vw] pt-[0.8vh]">
              <span className="px-[0.9vw] py-[0.6vh] rounded-full bg-text/[0.06] border border-text/10 font-body text-[0.85vw] text-text/75">
                Make it shorter
              </span>
              <span className="px-[0.9vw] py-[0.6vh] rounded-full bg-text/[0.06] border border-text/10 font-body text-[0.85vw] text-text/75">
                Try UCAS tone
              </span>
              <span className="px-[0.9vw] py-[0.6vh] rounded-full bg-text/[0.06] border border-text/10 font-body text-[0.85vw] text-text/75">
                Suggest next step
              </span>
            </div>
          </div>

          <div className="border-t border-text/10 bg-bg px-[1.2vw] py-[1.2vh] flex items-center gap-[0.8vw]">
            <div className="flex-1 px-[1vw] py-[0.8vh] bg-text/[0.04] rounded-full font-body text-[0.9vw] text-text/40">
              Ask Sidekick anything…
            </div>
            <div className="w-[2.4vw] h-[2.4vw] rounded-full bg-primary flex items-center justify-center">
              <span className="font-body font-bold text-[1vw] text-bg">↑</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
