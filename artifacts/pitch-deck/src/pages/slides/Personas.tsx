export default function Personas() {
  return (
    <div className="slide relative w-screen h-screen overflow-hidden bg-bg">
      <div className="absolute top-[8vh] left-[6vw] flex items-center gap-[1vw]">
        <span className="font-body text-[1.2vw] font-semibold uppercase tracking-[0.25em] text-primary">
          04 · Personalised journeys
        </span>
        <div className="w-[6vw] h-[1px] bg-primary/50" />
      </div>

      <div className="absolute top-[16vh] left-[6vw] right-[40vw]">
        <h2 className="font-display font-bold text-[5vw] leading-[0.95] tracking-tight text-text" style={{ textWrap: "balance" }}>
          Six tailored
          <span className="text-primary italic"> personas.</span>
        </h2>
        <p className="font-body text-[1.4vw] text-text/70 mt-[3vh] leading-relaxed">
          Relevant activities, language and proxy values for each lived experience — never a generic form.
        </p>
      </div>

      <div className="absolute bottom-[8vh] left-[6vw] right-[6vw] grid grid-cols-3 gap-[2vw]">
        <div className="border-l-4 border-primary pl-[1.5vw] py-[1vh]">
          <p className="font-display font-bold text-[2.2vw] text-text leading-tight">Volunteer</p>
          <p className="font-body text-[1.2vw] text-text/65 mt-[1vh]">Regular community giving</p>
        </div>
        <div className="border-l-4 border-accent pl-[1.5vw] py-[1vh]">
          <p className="font-display font-bold text-[2.2vw] text-text leading-tight">Student</p>
          <p className="font-body text-[1.2vw] text-text/65 mt-[1vh]">UCAS-ready evidence</p>
        </div>
        <div className="border-l-4 border-sky pl-[1.5vw] py-[1vh]">
          <p className="font-display font-bold text-[2.2vw] text-text leading-tight">Carer</p>
          <p className="font-body text-[1.2vw] text-text/65 mt-[1vh]">Unpaid family support</p>
        </div>
        <div className="border-l-4 border-primary pl-[1.5vw] py-[1vh]">
          <p className="font-display font-bold text-[2.2vw] text-text leading-tight">Veteran</p>
          <p className="font-body text-[1.2vw] text-text/65 mt-[1vh]">Service-to-civilian transition</p>
        </div>
        <div className="border-l-4 border-accent pl-[1.5vw] py-[1vh]">
          <p className="font-display font-bold text-[2.2vw] text-text leading-tight">Apprentice</p>
          <p className="font-body text-[1.2vw] text-text/65 mt-[1vh]">Workplace + community</p>
        </div>
        <div className="border-l-4 border-sky pl-[1.5vw] py-[1vh]">
          <p className="font-display font-bold text-[2.2vw] text-text leading-tight">Jobseeker</p>
          <p className="font-body text-[1.2vw] text-text/65 mt-[1vh]">Skills and confidence</p>
        </div>
      </div>
    </div>
  );
}
