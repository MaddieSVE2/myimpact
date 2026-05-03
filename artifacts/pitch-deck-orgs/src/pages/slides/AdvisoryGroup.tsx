export default function AdvisoryGroup() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg">
      <div className="absolute top-[-10vh] left-[-10vw] w-[40vw] h-[40vw] rounded-full bg-primary/10 blur-3xl" />
      <div className="absolute bottom-[-10vh] right-[-10vw] w-[35vw] h-[35vw] rounded-full bg-accent/10 blur-3xl" />

      <div className="absolute top-[6vh] left-[6vw] flex items-center gap-[1vw]">
        <span className="font-body text-[1.1vw] font-semibold uppercase tracking-[0.25em] text-primary">
          10 · Advisory group
        </span>
        <div className="w-[6vw] h-[1px] bg-primary/50" />
      </div>

      <div className="absolute top-[14vh] left-[6vw] right-[6vw] grid grid-cols-12 gap-[3vw]">
        <div className="col-span-7">
          <h2 className="font-body font-bold text-[4.6vw] leading-[0.95] tracking-tight text-text" style={{ textWrap: "balance" }}>
            Guided by people
            <span className="block text-primary italic">who know the sector.</span>
          </h2>
          <p className="font-body text-[1.3vw] text-text/75 mt-[3.5vh] leading-relaxed">
            My Impact is overseen by an independent advisory group with deep expertise across civil society, philanthropy, education and community development.
          </p>

          <div className="mt-[5vh] bg-card rounded-2xl border border-text/8 p-[2.2vw]">
            <div className="flex items-start gap-[1.5vw]">
              <div className="shrink-0 w-[5vw] h-[5vw] rounded-2xl bg-primary/15 flex items-center justify-center">
                <span className="font-body font-black text-[2vw] text-primary">DE</span>
              </div>
              <div className="flex-1">
                <p className="font-body text-[0.85vw] uppercase tracking-[0.25em] text-primary mb-[0.8vh]">
                  Chair
                </p>
                <h3 className="font-body font-bold text-[2.2vw] text-text leading-tight">
                  David Emerson CBE
                </h3>
                <p className="font-body text-[1.1vw] text-text/60 mt-[0.5vh]">
                  Chair, My Impact Advisory Group
                </p>
                <p className="font-body text-[1.05vw] text-text/75 mt-[1.8vh] leading-relaxed">
                  Chair of Carnegie UK. Former CEO of the Association of Charitable Foundations for 15 years. Former chair of three UK foundations and charities.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="col-span-5 flex flex-col">
          <p className="font-body text-[0.9vw] uppercase tracking-[0.25em] text-text/55 mb-[2vh]">
            Advisory members
          </p>
          <div className="flex flex-col gap-[1vh]">
            {[
              {
                name: "Lucinda Yeadon",
                role: "Former Leeds City Councillor for Kirkstall Ward (2008–2018), including three years as Deputy Leader",
              },
              {
                name: "Al Garthwaite",
                role: "Councillor representing Headingley",
              },
              {
                name: "Jesse Jackson",
                role: "Loughborough College",
              },
              {
                name: "Heather Arnatt",
                role: "Voluntary Centre Services",
              },
              {
                name: "Abigail Appleton",
                role: "HCA",
              },
              {
                name: "Chris Cowcher",
                role: "Ex-Plunket UK",
              },
              {
                name: "James Tedder",
                role: "Loughborough College",
              },
            ].map(({ name, role }) => (
              <div
                key={name}
                className="px-[1.4vw] py-[1vh] rounded-2xl bg-card border border-text/8 flex items-start gap-[1vw]"
              >
                <span className="w-[0.6vw] h-[0.6vw] rounded-full bg-primary shrink-0 mt-[0.7vh]" />
                <div className="flex-1 min-w-0">
                  <p className="font-body font-bold text-[1.1vw] text-text leading-tight">
                    {name}
                  </p>
                  <p className="font-body text-[0.85vw] text-text/65 leading-snug mt-[0.3vh]">
                    {role}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
