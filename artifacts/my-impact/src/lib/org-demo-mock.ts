// Mock data for the demo organisation dashboard (org id "demo-org-0000000000000").
// The shape mirrors what a future server-backed activity feed will return so the
// UI can swap to real data without re-design.

export const DEMO_ORG_ID = "demo-org-0000000000000";
export const DEMO_INVITE_CODE = "DEMO-0000";
export const DEMO_ORG_NAME = "Demo Organisation";
export const DEMO_ORG_TYPE = "corporate";
export const DEMO_ORG_CONTACT_EMAIL = "organisation@organisation.org";

export type ActivityCategory =
  | "Environment"
  | "Community"
  | "Health"
  | "Education"
  | "Sport & Active"
  | "Fundraising"
  | "Mentoring"
  | "Arts & Culture"
  | "Animal Welfare"
  | "Emergency Response";

export interface DemoMember {
  id: string;
  name: string;
  email: string;
  role: "manager" | "member";
  joinedAt: string; // ISO date
  region: string;
  postcode: string;
}

export interface DemoPendingRequest {
  id: string;
  name: string;
  email: string;
  requestedAt: string; // ISO date
}

export interface DemoActivity {
  id: string;
  memberId: string;
  occurredAt: string; // ISO date
  category: ActivityCategory;
  activity: string;
  description: string;
  hours: number;
  socialValueGBP: number;
  verified: boolean;
}

const CORE_MEMBERS: DemoMember[] = [
  { id: "m-001", name: "Sam Patel",        email: "sam.patel@demo-organisation.org",              role: "manager", joinedAt: "2025-01-12", region: "North West",              postcode: "M1 1AE" },
  { id: "m-002", name: "Aisha Khan",       email: "aisha.khan@example.com",                       role: "member",  joinedAt: "2025-02-04", region: "North West",              postcode: "M14 5EU" },
  { id: "m-003", name: "Tom Reilly",       email: "tom.reilly@example.com",                       role: "member",  joinedAt: "2025-02-21", region: "Yorkshire and The Humber", postcode: "LS1 4AP" },
  { id: "m-004", name: "Priya Sharma",     email: "priya.sharma@example.com",                     role: "member",  joinedAt: "2025-03-08", region: "West Midlands",           postcode: "B1 1BB" },
  { id: "m-005", name: "James O'Connor",   email: "james.oconnor@example.com",                    role: "member",  joinedAt: "2025-03-30", region: "London",                  postcode: "E1 6RF" },
  { id: "m-006", name: "Maya Hughes",      email: "maya.hughes@example.com",                      role: "member",  joinedAt: "2025-04-14", region: "South East",              postcode: "RH10 1QQ" },
  { id: "m-007", name: "Daniel Brookes",   email: "daniel.brookes@example.com",                   role: "member",  joinedAt: "2025-05-02", region: "South West",              postcode: "BS1 4DJ" },
  { id: "m-008", name: "Leila Ahmadi",     email: "leila.ahmadi@example.com",                     role: "member",  joinedAt: "2025-05-19", region: "North West",              postcode: "M60 2LA" },
  { id: "m-009", name: "Chloe Bennett",    email: "chloe.bennett@example.com",                    role: "member",  joinedAt: "2025-06-11", region: "North East",              postcode: "NE1 7RU" },
  { id: "m-demo", name: "Demo User",       email: "demo@demo.org",                                role: "member",  joinedAt: "2025-07-01", region: "Yorkshire and The Humber", postcode: "LS2 8DT" },
  { id: "m-011", name: "Rachel Osei",       email: "rachel.osei@example.com",                      role: "member",  joinedAt: "2025-01-15", region: "Yorkshire and The Humber", postcode: "LS15 8AA" },
  { id: "m-012", name: "Kieran Walsh",      email: "kieran.walsh@example.com",                     role: "member",  joinedAt: "2025-01-22", region: "North West",              postcode: "M22 4ER" },
  { id: "m-013", name: "Fatima Begum",      email: "fatima.begum@example.com",                     role: "member",  joinedAt: "2025-02-01", region: "West Midlands",           postcode: "B12 0JX" },
  { id: "m-014", name: "Marcus Webb",       email: "marcus.webb@example.com",                      role: "member",  joinedAt: "2025-02-10", region: "London",                  postcode: "SE1 7PB" },
  { id: "m-015", name: "Sioned Davies",     email: "sioned.davies@example.com",                    role: "member",  joinedAt: "2025-02-18", region: "Wales",                   postcode: "CF10 1EP" },
  { id: "m-016", name: "Nneka Okafor",      email: "nneka.okafor@example.com",                     role: "member",  joinedAt: "2025-03-01", region: "South East",              postcode: "GU1 4BY" },
  { id: "m-017", name: "Ben Holroyd",       email: "ben.holroyd@example.com",                      role: "member",  joinedAt: "2025-03-12", region: "Yorkshire and The Humber", postcode: "BD1 1EW" },
  { id: "m-018", name: "Amara Diallo",      email: "amara.diallo@example.com",                     role: "member",  joinedAt: "2025-03-20", region: "North West",              postcode: "WN1 1PP" },
  { id: "m-019", name: "Jack Fitzpatrick",  email: "jack.fitzpatrick@example.com",                 role: "member",  joinedAt: "2025-04-02", region: "North East",              postcode: "SR1 3LA" },
  { id: "m-020", name: "Sophie Dyer",       email: "sophie.dyer@example.com",                      role: "member",  joinedAt: "2025-04-10", region: "East Midlands",           postcode: "NG1 5GG" },
  { id: "m-021", name: "Yusuf Al-Rashid",   email: "yusuf.alrashid@example.com",                   role: "member",  joinedAt: "2025-04-18", region: "West Midlands",           postcode: "CV1 2GF" },
  { id: "m-022", name: "Gemma Lawson",      email: "gemma.lawson@example.com",                     role: "member",  joinedAt: "2025-04-25", region: "North West",              postcode: "PR1 2RL" },
  { id: "m-023", name: "Patrick Brennan",   email: "patrick.brennan@example.com",                  role: "member",  joinedAt: "2025-05-06", region: "London",                  postcode: "N1 9GU" },
  { id: "m-024", name: "Thandi Nkosi",      email: "thandi.nkosi@example.com",                     role: "member",  joinedAt: "2025-05-14", region: "South East",              postcode: "TN1 1NX" },
  { id: "m-025", name: "Connor MacPherson", email: "connor.macpherson@example.com",                role: "member",  joinedAt: "2025-05-22", region: "Scotland",                postcode: "G1 1RJ" },
  { id: "m-026", name: "Isabel Ferreira",   email: "isabel.ferreira@example.com",                  role: "member",  joinedAt: "2025-06-01", region: "London",                  postcode: "W1T 3JH" },
  { id: "m-027", name: "Ryan Hawkins",      email: "ryan.hawkins@example.com",                     role: "member",  joinedAt: "2025-06-08", region: "South West",              postcode: "EX1 1GE" },
  { id: "m-028", name: "Nadia Volkov",      email: "nadia.volkov@example.com",                     role: "member",  joinedAt: "2025-06-15", region: "East of England",         postcode: "CB1 2ET" },
  { id: "m-029", name: "Oliver Drummond",   email: "oliver.drummond@example.com",                  role: "member",  joinedAt: "2025-07-01", region: "North West",              postcode: "OL1 1JN" },
  { id: "m-030", name: "Mia Tanaka",        email: "mia.tanaka@example.com",                       role: "member",  joinedAt: "2025-07-09", region: "London",                  postcode: "EC1V 9FR" },
  { id: "m-031", name: "Samuel Adeyemi",    email: "samuel.adeyemi@example.com",                   role: "member",  joinedAt: "2025-08-01", region: "West Midlands",           postcode: "WV1 1RP" },
  { id: "m-032", name: "Fiona Llewellyn",   email: "fiona.llewellyn@example.com",                  role: "member",  joinedAt: "2025-09-01", region: "Wales",                   postcode: "SA1 1TW" },
];

export const DEMO_PENDING_REQUESTS: DemoPendingRequest[] = [
  { id: "pr-001", name: "Jordan Blake",    email: "jordan.blake@example.com",   requestedAt: "2026-05-07" },
  { id: "pr-002", name: "Mei-Lin Huang",   email: "mei.huang@external.co.uk",   requestedAt: "2026-05-09" },
];

// Raw activity rows used to build the demo dataset. Tuple form keeps the file
// readable while we ship a credible year of impact spanning 12
// months, 285 members and 10 categories.
type RawActivity = readonly [
  memberId: string,
  occurredAt: string,
  category: ActivityCategory,
  activity: string,
  description: string,
  hours: number,
  socialValueGBP: number,
  verified: boolean,
];

// ── Human-written description pools (one per category) ───────────────────
const _DESCS: Record<ActivityCategory, string[]> = {
  "Environment": [
    "Pulled himalayan balsam from the riverbank at Lyme Park with a team of nine, clearing 200m of footpath edge.",
    "Planted 60 native wildflower plugs along the verge on Otley Road as part of the council's pollinator corridor project.",
    "Collected three bin bags of litter from Endcliffe Park, covering the main path loop and the children's play area.",
    "Helped lay a new permeable gravel path at Meanwood Valley Urban Farm, barrowing 15 loads across a wet afternoon.",
    "Removed invasive rhododendron from the woodland edge at Hardcastle Crags, opening up light for ground-level flora.",
    "Assisted the rangers at Ilkley Moor with a heather-cutting session, using hand-shears to maintain the upland heath.",
    "Joined a river-dipping survey on the Aire at Cottingley, recording invertebrate species to track water quality trends.",
    "Built a dry-stone wall section at Malham Tarn Field Centre, repairing a 4-metre collapse in the lower pasture boundary.",
    "Spread woodchip mulch around 40 newly planted trees on the Spen Valley Greenway to reduce moisture loss.",
    "Helped install three new bat boxes in the nature reserve at Potteric Carr, working alongside the site's ecological officer throughout.",
  ],
  "Community": [
    "Staffed the Wednesday citizens advice drop-in at Chapeltown Community Centre, helping 14 people with housing and benefit queries.",
    "Drove an elderly resident to her hospital appointment and waited to bring her home, covering a 28-mile round trip.",
    "Helped set up and run a community iftar dinner for 80 people at the Hamara Centre in Beeston.",
    "Served meals at the Saturday hot-food van on Briggate, handing out 55 portions to people sleeping rough.",
    "Supported a digital-inclusion drop-in at Seacroft Library, helping six older residents set up NHS App accounts.",
    "Marshalled a Diwali street parade in Manningham, keeping 300 spectators safely on the pavement for two hours.",
    "Helped repaint the waiting room at the Leeds Urban Mission night shelter, finishing two coats in a single shift.",
    "Ran a bingo afternoon at St George's Crypt for 22 guests, organising prizes and keeping the session moving.",
    "Assisted the team at Zarach delivering 12 bed bundles to families who had been sleeping on the floor.",
    "Bagged and sorted 200 kg of donated clothing at the Beeston Hill community clothes bank ahead of distribution day.",
  ],
  "Health": [
    "Led a chair-yoga session for 11 residents at Greenacres care home, running through a 45-minute seated routine.",
    "Volunteered at a free NHS Health Check event in Harehills, guiding 30 attendees through the registration process.",
    "Ran a couch-to-5K training group session in Roundhay Park, coaching eight beginners through their second week.",
    "Provided emotional listening support at a Mind drop-in in Morley, sitting with four clients during an afternoon session.",
    "Assisted a physiotherapist at a community gym class for cardiac-rehab patients, spotting and encouraging participants.",
    "Helped set up and tidy the venue for a men's mental-health breakfast in Armley that drew 19 people.",
    "Supported a health visitor's postnatal group in Harehills, helping three new parents with baby-weighing and note-taking.",
    "Led a guided walk for a walking-for-wellbeing group in Temple Newsam, navigating a 4-mile route with eight participants.",
    "Assisted at a hearing-check clinic at Pudsey Civic Hall, directing 25 elderly attendees to the testing booths.",
    "Helped facilitate a quit-smoking workshop at Kirkgate Market community room, supporting the facilitator with materials for 14 attendees.",
  ],
  "Education": [
    "Ran a mock interview morning for 12 Year 11 students at Crossley Heath School, giving individual feedback to each.",
    "Supported a science lesson at Farnley Academy, helping a class of 28 pupils set up and run titration experiments.",
    "Delivered a financial literacy workshop to 20 sixth-formers at Lawnswood School covering budgeting and student finance.",
    "Heard reading with five KS1 pupils at Bramley St Peter's Primary for three 20-minute one-to-one slots.",
    "Helped 14 adult learners at Swarthmore Education Centre practise written English ahead of their ESOL Level 2 exam.",
    "Ran a coding club session for 10 Year 7 students at Notre Dame Catholic College, building text-based adventure games in Scratch.",
    "Assisted a maths teacher at Roundhay School during a GCSE revision morning, circulating the room for two hours.",
    "Gave a careers talk to 35 Year 10 students at Temple Moor High School about working in the environmental sector.",
    "Helped a group of eight adult learners at Shine complete their City & Guilds portfolio evidence forms.",
    "Supported a school library audit at Pudsey Grangefield, cataloguing 300 books ahead of a shelf-relocation project.",
  ],
  "Sport & Active": [
    "Marshalled the 5K start funnel at Woodhouse Moor parkrun, counting 312 finishers through the finish gate.",
    "Helped set up and take down the equipment for a disability football session at the John Charles Centre for Sport.",
    "Assisted the junior coaching team at Horsforth Swimming Club with a Saturday-morning session for 24 under-12 swimmers.",
    "Acted as a water-station volunteer at the Leeds 10K, distributing cups to runners at the kilometre-8 point.",
    "Refereed three junior basketball matches at Pudsey Leisure Centre, keeping score and managing time-outs.",
    "Supported a sitting volleyball taster day at Aireborough Leisure Centre, helping set up the nets and explaining rules to 15 newcomers.",
    "Assisted a local cycling club at a Try Cycling open day on the Otley Road cycle path, fitting helmets and guiding 18 beginners.",
    "Helped run a junior tennis holiday camp at Roundhay Tennis Club, managing drills for a group of 10 children aged 8–11.",
    "Acted as a timekeeper at the Yorkshire Veterans Athletics Championships at Don Valley Bowl, recording splits for 40 competitors.",
    "Supported the setup and umpiring at a schools' cricket competition at Headingley, overseeing four 20-over matches.",
  ],
  "Fundraising": [
    "Helped pack and distribute 340 food parcels at the regional food bank depot ahead of the Christmas period.",
    "Stood outside Tesco Extra in Seacroft for three hours with a charity bucket, raising £218 for St Gemma's Hospice.",
    "Organised the raffle table at a Macmillan coffee morning at Wetherby Town Hall, selling 150 tickets over two hours.",
    "Cycled 40 miles on a static bike at Leeds Kirkgate Market as part of a sponsored event for Martin House.",
    "Helped man the tombola stall at a Leeds Mind summer fair, taking in £175 across a four-hour shift.",
    "Baked 48 portions of flapjack and staffed a bake-sale table at the Merrion Centre for the Trussell Trust.",
    "Took part in a sponsored silence for eight hours at work, raising £310 for the Children's Heart Surgery Fund.",
    "Helped count and bank the proceeds from a 24-hour sponsored walk, processing £1,240 in cash and cheques.",
    "Ran a quiz night for 60 guests at the Brudenell Social Club, raising £420 for the British Red Cross.",
    "Wrapped gifts at a John Lewis Leeds charity wrapping station across a four-hour slot, collecting £165 in donations.",
  ],
  "Mentoring": [
    "Held a one-to-one career-planning session with a care leaver applying for their first apprenticeship.",
    "Met with a Year 12 mentee at Cockburn School to review her UCAS personal statement and suggest specific rewrites.",
    "Provided a 90-minute skills-coaching call to a recent graduate struggling to convert interviews into job offers.",
    "Supported a mentee from the Ahead Partnership programme through a practice presentation before his employer assessment day.",
    "Reviewed a business plan with a mentee on the Prince's Trust Enterprise programme, focusing on cashflow projections.",
    "Helped a mentee draft three tailored cover letters for roles in the NHS administration graduate scheme.",
    "Attended a mentee's first day at a new job as a familiar face, meeting for coffee before they went in.",
    "Facilitated a group mentoring session with four Young Enterprise students refining their company pitch for regionals.",
    "Worked through a structured goal-setting exercise with a mentee returning to work after a two-year career break.",
    "Supported a mentee through a difficult conversation with their line manager by running a role-play rehearsal beforehand.",
  ],
  "Arts & Culture": [
    "Supported the set build for a community theatre production at the Carriageworks, painting backdrops for three hours.",
    "Helped hang 22 artworks for an open exhibition at the East Street Arts Patrick Studios, including labelling and lighting.",
    "Assisted the Leeds Playhouse outreach team at a drama workshop for 16 young people in Gipton.",
    "Photographed a community mural unveiling on Roundhay Road, delivering 80 edited images to the project coordinator.",
    "Helped a group of 10 dementia patients at Airedale Hospital create individual collage pieces during an arts-on-prescription session.",
    "Ran a lino-printing taster for 14 participants at the Inkwell Arts centre in Chapeltown.",
    "Assisted with front-of-house duties at Leeds International Film Festival, scanning tickets and directing audiences for three screenings.",
    "Helped install a community mosaic on the underpass wall at Armley, grouting 30 tile sections over a single afternoon.",
    "Operated the sound desk for a schools concert at Leeds Town Hall, managing levels for seven junior choirs.",
    "Coordinated a poetry-writing drop-in at Leeds Central Library, supporting 11 participants through a structured workshop.",
  ],
  "Animal Welfare": [
    "Walked four dogs at the RSPCA shelter in Salford, giving each a 45-minute off-lead run in the exercise paddock.",
    "Helped a local hedgehog rescue clean and weigh 18 hoglets before their overnight feed schedule.",
    "Assisted the veterinary nurse at an RSPCA small-animal clinic in Armley, restraining cats and rabbits for basic checks.",
    "Mucked out six stable stalls at a riding-for-disabled charity near Harrogate, laying fresh bedding for the afternoon session.",
    "Staffed a pet-microchipping event at Morrisons in Morley, handling paperwork for 27 dogs over a three-hour slot.",
    "Helped construct a new rabbit enclosure at a sanctuary in Otley, assembling pre-cut panels and fitting the wire mesh.",
    "Supported a cat-trapping exercise in Beeston for a TNR programme, monitoring five cage traps over a four-hour evening shift.",
    "Cleaned and restocked kennels at Dogs Trust Leeds, including scrubbing 12 runs and replenishing bedding and water.",
    "Assisted at a community animal welfare advice stall at Kirkstall Festival, answering questions and handing out leaflets to 40 visitors.",
    "Helped transport three rescued greyhounds to a foster carer in Bradford, loading, securing, and settling the dogs.",
  ],
  "Emergency Response": [
    "Operated the registration desk at a simulated multi-agency flood exercise, processing 60 volunteer check-ins.",
    "Staffed a rest centre for 20 displaced residents during a gas-main incident in Holbeck, providing refreshments and welfare support.",
    "Assisted the search coordination team at a missing-person exercise on Ilkley Moor, acting as a radio relay runner.",
    "Helped set up a decontamination station during a HART training exercise at Leeds Bradford Airport, laying out 12 equipment pallets.",
    "Acted as a casualty role-player at a major-incident training day, following a scenario script through four triage stages.",
    "Supported the logistics team at a Red Cross emergency-response exercise, driving a welfare van on three supply runs.",
    "Helped brief 25 new community first responders at a Yorkshire Ambulance Service induction day, sharing kit and protocols.",
    "Operated a welfare tent at a severe-weather community hub in Gipton, distributing hot drinks and blankets to 35 visitors.",
    "Assisted with traffic management at a chemical-spill training exercise in Wakefield, managing cones and signage for two hours.",
    "Helped pack and check 40 emergency grab-bags at a voluntary resilience group meeting in Harrogate.",
  ],
};

// ── Synthetic cohort: m-033 … m-285 ──────────────────────────────────────
// Deterministically generated so the demo always renders the same 285 members.
const _SF = [
  "Alex","Jordan","Morgan","Casey","Taylor","Riley","Cameron","Avery","Skyler","Peyton",
  "Reese","Finley","Hayden","Quinn","Sawyer","Rowan","Emery","Elliot","Logan","River",
  "Sage","Zara","Nadia","Priya","Amara","Fatou","Yemi","Kofi","Aarav","Rahul",
  "Luca","Marco","Sofia","Elena","Mira","Anya","Jess","Sam","Max","Jamie",
];
const _SL = [
  "Clarke","Davies","Evans","Fletcher","Grant","Hayes","Irving","Jennings","Kennedy","Lambert",
  "Mason","Norton","Owen","Parker","Reid","Stevens","Turner","Underwood","Vincent","Walker",
  "Adeyemi","Balogun","Diallo","Emmanuel","Ferreira","Gupta","Hassan","Islam","Joshi","Kapoor",
  "Lim","Mensah","Nwosu","Osei","Patel","Rahman","Singh","Tran","Ullah","Vasquez",
];
const _SR = [
  "North West","Yorkshire and The Humber","West Midlands","London","South East",
  "South West","East Midlands","North East","East of England","Wales","Scotland",
];
const _SC: ActivityCategory[] = [
  "Environment","Community","Health","Education","Sport & Active",
  "Fundraising","Mentoring","Arts & Culture","Animal Welfare","Emergency Response",
];
const _SA = [
  "Volunteering session","Team fundraiser","Community event helper","Skills workshop",
  "Mentoring session","Awareness campaign","Environmental project","Charity run",
  "Community garden day","Digital skills support",
];
const _SJM = [
  "2025-01","2025-02","2025-03","2025-04","2025-05",
  "2025-06","2025-07","2025-08","2025-09","2025-10",
];
const _SAM = [
  "2025-02","2025-03","2025-04","2025-05","2025-06",
  "2025-07","2025-08","2025-09","2025-10","2025-11","2025-12",
];
const _S26M = ["2026-01","2026-02","2026-03","2026-04","2026-05"];
const SYNTHETIC_COHORT: { member: DemoMember; activities: RawActivity[] }[] =
  Array.from({ length: 253 }, (_, k) => {
    const n        = k + 33;
    const id       = `m-${String(n).padStart(3, "0")}`;
    const first    = _SF[k % _SF.length]!;
    const last     = _SL[Math.floor(k / _SF.length) % _SL.length]!;
    const region   = _SR[k % _SR.length]!;
    const jm       = _SJM[k % _SJM.length]!;
    const jd       = String(1 + (k % 27)).padStart(2, "0");
    const cat      = _SC[k % _SC.length]!;
    const cat2     = _SC[(k + 3) % _SC.length]!;
    const cat3     = _SC[(k + 6) % _SC.length]!;
    const cat4     = _SC[(k + 1) % _SC.length]!;
    const am       = _SAM[k % _SAM.length]!;
    const ad       = String(3 + (k % 25)).padStart(2, "0");
    const am2      = _S26M[k % _S26M.length]!;
    const ad2      = String(4 + (k % 24)).padStart(2, "0");
    const am3      = _SAM[(k + 5) % _SAM.length]!;
    const ad3      = String(6 + (k % 22)).padStart(2, "0");
    const am4      = _S26M[(k + 2) % _S26M.length]!;
    const ad4      = String(5 + (k % 22)).padStart(2, "0");
    const hours    = 3 + (k % 6);
    const hours2   = 3 + (k % 5);
    const hours3   = 3 + (k % 4);
    const hours4   = 2 + (k % 4);
    const value    = 700 + (k % 8) * 150;
    const value2   = 700 + (k % 7) * 130;
    const value3   = 450 + (k % 6) * 100;
    const value4   = 400 + (k % 5) * 100;
    const actName  = _SA[k % _SA.length]!;
    const actName2 = _SA[(k + 5) % _SA.length]!;
    const actName3 = _SA[(k + 3) % _SA.length]!;
    const actName4 = _SA[(k + 7) % _SA.length]!;
    const _SPC = [
      "M1","LS1","B1","E1","RH10","BS1","NE1","NG1","CV1","G1",
      "PR1","N1","TN1","W1T","EX1","CB1","OL1","EC1V","WV1","SA1",
    ];
    const pcd = `${_SPC[k % _SPC.length]!} ${1 + (k % 9)}${String.fromCharCode(65 + (k % 26))}${String.fromCharCode(65 + ((k + 3) % 26))}`;
    return {
      member: {
        id,
        name: `${first} ${last}`,
        email: `${first.toLowerCase()}.${last.toLowerCase()}${n}@example.com`,
        role: "member",
        joinedAt: `${jm}-${jd}`,
        region,
        postcode: pcd,
      },
      activities: [
        [
          id, `${am}-${ad}`, cat, actName,
          _DESCS[cat][k % _DESCS[cat].length],
          hours, value, true,
        ] as unknown as RawActivity,
        [
          id, `${am2}-${ad2}`, cat2, actName2,
          _DESCS[cat2][Math.floor(k / 2) % _DESCS[cat2].length],
          hours2, value2, true,
        ] as unknown as RawActivity,
        [
          id, `${am3}-${ad3}`, cat3, actName3,
          _DESCS[cat3][Math.floor(k / 3) % _DESCS[cat3].length],
          hours3, value3, true,
        ] as unknown as RawActivity,
        [
          id, `${am4}-${ad4}`, cat4, actName4,
          _DESCS[cat4][Math.floor(k / 4) % _DESCS[cat4].length],
          hours4, value4, true,
        ] as unknown as RawActivity,
      ],
    };
  });

export const DEMO_MEMBERS: DemoMember[] = [
  ...CORE_MEMBERS,
  ...SYNTHETIC_COHORT.map(s => s.member),
];

const RAW_ACTIVITIES: RawActivity[] = [
  // January
  ["m-001", "2025-01-09", "Community",          "New year volunteer briefing",  "Ran the kickoff briefing for the year's volunteer cohort.",                                3,   195, true],
  ["m-002", "2025-01-12", "Environment",        "Canal towpath clean-up",        "Cleared 1.2km of the Mersey towpath with 12 volunteers. Nine bin bags collected.",        4,   220, true],
  ["m-003", "2025-01-18", "Sport & Active",     "Junior parkrun marshalling",    "Marshalled corner three of the Saturday junior 2K parkrun, supporting 80+ young runners.", 2,   140, true],
  ["m-004", "2025-01-21", "Education",          "Year 4 reading mentor",         "Weekly one-to-one reading session at St Mary's Primary.",                                  1.5, 180, true],
  ["m-005", "2025-01-25", "Community",          "Repair café host",              "Hosted the monthly repair café and fixed two small appliances brought in by neighbours.",  3,   165, true],
  ["m-007", "2025-01-29", "Health",             "Care home visits",              "Spent the afternoon doing manicures and conversation at Oakleigh care home.",              2.5, 175, true],

  // February
  ["m-002", "2025-02-04", "Environment",        "Community tree planting",       "Planted 30 native saplings on a degraded verge by the canal.",                              5,   430, true],
  ["m-006", "2025-02-08", "Animal Welfare",     "Dog shelter dog-walking",       "Walked four shelter dogs and helped with kennel cleaning at the local rescue.",            4,   220, true],
  ["m-009", "2025-02-12", "Arts & Culture",     "Community choir lead",          "Led the weekly community choir rehearsal. 22 attendees.",                                  2,   180, true],
  ["m-008", "2025-02-15", "Mentoring",          "Apprenticeship 1:1 mentor",     "One-to-one apprenticeship mentoring session covering CV and interview prep.",               1.5, 165, true],
  ["m-003", "2025-02-19", "Sport & Active",     "Cycling buddy ride",            "Co-led a confidence-building cycling group ride for new riders around the local park.",     3,   195, true],
  ["m-005", "2025-02-22", "Fundraising",        "Quiz night fundraiser",         "Hosted a quiz night that raised £540 for the youth centre's outreach programme.",           4,   540, true],
  ["m-007", "2025-02-26", "Health",             "Hospital radio shift",          "Hosted the lunchtime hospital radio show, taking song requests from three wards.",          3,   200, true],
  ["m-001", "2025-02-28", "Community",          "Trustee board meeting",         "Attended the quarterly trustee board with full reporting pack prep.",                       3,   240, true],

  // March
  ["m-004", "2025-03-04", "Education",          "STEM workshop assistant",       "Helped run a hands-on robotics workshop for 22 girls aged 10-12.",                          4,   480, true],
  ["m-002", "2025-03-08", "Community",          "Soup kitchen evening",          "Cooked and served around 70 hot meals at the city-centre soup kitchen.",                    4,   380, true],
  ["m-006", "2025-03-12", "Environment",        "Wildflower seeding",            "Sowed pollinator-friendly wildflower mix across two verges.",                              3,   210, true],
  ["m-008", "2025-03-15", "Education",          "Refugee English class",         "Taught a beginner conversational English class to six newly arrived refugees.",            2,   240, true],
  ["m-009", "2025-03-19", "Mentoring",          "Creative writing mentor",       "Mentored two young people on their short story submissions.",                              2,   220, true],
  ["m-005", "2025-03-22", "Emergency Response", "First aid cover at gala",       "Provided first-aid cover at a youth football tournament. Minor incidents only.",          5,   400, true],
  ["m-003", "2025-03-26", "Health",             "Mental-health walk lead",       "Co-led a peer walking group for adults managing low mood.",                                2.5, 200, true],
  ["m-007", "2025-03-29", "Sport & Active",     "Couch-to-5K coach",             "Led week five of Couch-to-5K, supporting 14 new runners.",                                  1.5, 140, true],

  // April
  ["m-007", "2025-04-13", "Fundraising",        "London Marathon run",           "Ran the London Marathon raising £3,240 for the youth trust.",                              5,  3240, true],
  ["m-002", "2025-04-16", "Environment",        "Park bench restoration",        "Sanded and re-varnished four weather-damaged park benches with a small crew.",            4,   220, true],
  ["m-004", "2025-04-19", "Mentoring",          "School governor meeting",       "Attended termly governors meeting at the local primary school.",                            2.5, 250, true],
  ["m-006", "2025-04-22", "Animal Welfare",     "Hedgehog rescue volunteering",  "Cared for three injured hedgehogs at the local wildlife rescue.",                          3,   180, true],
  ["m-008", "2025-04-26", "Education",          "Adult literacy tutor",          "Tutored two adults working towards Functional Skills English level 1.",                    2,   240, true],
  ["m-009", "2025-04-29", "Arts & Culture",     "Open-mic host",                 "Hosted the monthly open-mic night supporting nine local performers.",                       3,   240, true],
  ["m-demo","2025-04-05", "Environment",        "Beach litter pick",             "Joined a Surfers Against Sewage clean of Filey beach. 14kg of plastic collected.",        4,   220, true],

  // May
  ["m-005", "2025-05-03", "Community",          "Mayfest festival stewarding",   "Stewarded the entrance gate at Mayfest, welcoming around 600 attendees.",                  6,   480, true],
  ["m-001", "2025-05-07", "Mentoring",          "New volunteer onboarding",      "Inducted four new volunteers across two evenings, including safeguarding training.",       4,   440, true],
  ["m-003", "2025-05-11", "Sport & Active",     "Inclusive football coach",      "Coached a weekly inclusive 5-a-side football session for adults with disabilities.",       2,   180, true],
  ["m-004", "2025-05-15", "Education",          "GCSE maths catch-up",           "Ran a small-group GCSE maths revision session for five Year 11s.",                          2,   260, true],
  ["m-008", "2025-05-19", "Mentoring",          "Care leaver mentor",            "Monthly mentoring session with a young care leaver setting up their first tenancy.",       2,   240, true],
  ["m-006", "2025-05-23", "Environment",        "Hedgerow planting day",         "Helped plant 60 metres of native hedgerow on a community farm.",                            5,   430, false],
  ["m-009", "2025-05-26", "Arts & Culture",     "Community mural project",       "Worked on the community mural at the youth centre. Second weekend of three.",             6,   420, true],
  ["m-002", "2025-05-30", "Community",          "Befriending visit",             "Tea and a chat with an isolated older neighbour as part of the befriending scheme.",       2,   180, true],

  // June
  ["m-007", "2025-06-04", "Sport & Active",     "Cycle sportive 80km",         "Completed an 80km charity sportive raising £1,420 for cycling-without-age.",               6,  1420, true],
  ["m-005", "2025-06-08", "Emergency Response", "Flood response sandbagging",    "Helped the local resilience team fill and place 200+ sandbags during heavy rain.",         5,   420, true],
  ["m-002", "2025-06-12", "Environment",        "Reservoir conservation day",    "Cleared invasive Himalayan balsam across 1.5km of reservoir bank.",                        6,   400, true],
  ["m-006", "2025-06-15", "Animal Welfare",     "Rescue admin & socials",        "Updated the rescue's adoption records and ran social media for the week.",                  3,   180, false],
  ["m-008", "2025-06-19", "Education",          "Coding club helper",            "Helped 10 teenagers build their first Python game at the after-school coding club.",       2,   260, true],
  ["m-004", "2025-06-23", "Mentoring",          "University application coach",  "Reviewed personal statements with three Year 12 students.",                                 3,   330, true],
  ["m-001", "2025-06-26", "Community",          "Community AGM",                 "Hosted the youth trust's community AGM and member Q&A.",                                   3,   240, true],
  ["m-003", "2025-06-29", "Health",             "Blood donor session support",   "Welcomed donors and served refreshments at the NHS blood donation session.",               4,   280, true],

  // July
  ["m-009", "2025-07-03", "Arts & Culture",     "Summer festival drumming",      "Led a drumming workshop at the city summer festival. 35 participants.",                   3,   270, true],
  ["m-005", "2025-07-07", "Community",          "Community garden harvest",      "Harvested produce and packed share boxes for 18 households.",                              4,   280, true],
  ["m-002", "2025-07-11", "Environment",        "Pond restoration",              "Cleared silt and replanted oxygenators in the community wildlife pond.",                   5,   330, true],
  ["m-007", "2025-07-15", "Sport & Active",     "Triathlon marshalling",         "Marshalled the swim-to-bike transition at the city triathlon.",                            5,   340, true],
  ["m-008", "2025-07-19", "Education",          "Summer reading scheme",         "Hosted the library's summer reading scheme afternoon. 22 children attended.",             3,   330, true],
  ["m-006", "2025-07-23", "Animal Welfare",     "Cat shelter socialisation",     "Spent the afternoon socialising shy cats at the rescue.",                                  3,   180, true],
  ["m-004", "2025-07-27", "Mentoring",          "Refugee youth mentor",          "Weekly mentoring session with a teenage refugee starting Year 11.",                        2,   240, true],
  ["m-demo","2025-07-30", "Sport & Active",     "Park run pacer",                "Paced the 30-minute group at the Saturday parkrun.",                                       1,    70, true],

  // August
  ["m-001", "2025-08-03", "Fundraising",        "Summer fete coordination",      "Coordinated the summer fete which raised £2,180 for the youth trust.",                     8,  2180, true],
  ["m-003", "2025-08-07", "Health",             "Wellbeing walks lead",          "Led two wellbeing walks with the older adults' group.",                                    4,   320, true],
  ["m-005", "2025-08-11", "Community",          "Holiday hunger lunch club",     "Cooked and served lunches to 35 children during the holiday hunger programme.",            5,   620, true],
  ["m-002", "2025-08-15", "Environment",        "Bee hotel build day",           "Built and installed eight bee hotels across community sites.",                              4,   240, false],
  ["m-009", "2025-08-19", "Arts & Culture",     "Heritage walk guide",           "Guided a heritage walk for 16 visitors through the old town.",                              2,   180, true],
  ["m-008", "2025-08-23", "Mentoring",          "Apprentice peer-support",       "Hosted a peer-support session for six apprentices.",                                       2,   240, true],
  ["m-007", "2025-08-27", "Sport & Active",     "Disability cycling lead",       "Led an adapted cycling session for nine adults with mobility needs.",                       3,   240, true],
  ["m-demo","2025-08-30", "Community",          "Community fridge stock-up",     "Restocked the community fridge with rescued supermarket donations.",                        3,   180, true],

  // September
  ["m-004", "2025-09-03", "Education",          "Year 7 transition buddy",       "Buddied a new Year 7 cohort during their first transition week.",                          5,   500, true],
  ["m-006", "2025-09-07", "Environment",        "School eco-club lead",          "Co-led the after-school eco-club's first session of term. 18 pupils.",                    2,   180, true],
  ["m-005", "2025-09-11", "Emergency Response", "Search & rescue training",      "Attended monthly volunteer lowland search & rescue training.",                              4,   320, true],
  ["m-002", "2025-09-15", "Environment",        "River clean-up day",            "Spent the morning clearing plastic from a 1.2km river footpath.",                          4,   240, true],
  ["m-009", "2025-09-19", "Mentoring",          "Creative careers panel",        "Sat on a creative-careers panel for 30 sixth-form students.",                              2,   240, true],
  ["m-001", "2025-09-23", "Mentoring",          "Volunteer 1:1 supervision",     "Held end-of-quarter 1:1s with eight regular volunteers.",                                   6,   720, true],
  ["m-008", "2025-09-27", "Education",          "Homework club lead",            "Led the secondary-school homework club covering maths, English and science.",              2.5, 320, true],
  ["m-003", "2025-09-30", "Health",             "Men's-health drop-in",          "Co-hosted the men's-health drop-in with the GP outreach team.",                            3,   220, true],

  // October
  ["m-007", "2025-10-04", "Fundraising",        "Sponsored half-marathon",       "Ran the autumn half-marathon, raising £980 for the food bank.",                            3,   980, true],
  ["m-002", "2025-10-08", "Community",          "Citizens advice triage",        "Took initial enquiries at the Citizens Advice drop-in.",                                   3,   240, true],
  ["m-006", "2025-10-12", "Animal Welfare",     "Dog re-homing fair",            "Volunteered at a dog re-homing fair. Six successful adoptions on the day.",               5,   400, true],
  ["m-009", "2025-10-16", "Arts & Culture",     "Youth theatre rehearsal",       "Helped run rehearsals for the youth theatre's autumn production.",                          3,   240, true],
  ["m-004", "2025-10-20", "Education",          "Reading volunteer training",    "Trained six new reading volunteers on safeguarding and approach.",                          2,   240, true],
  ["m-005", "2025-10-24", "Community",          "Diwali festival steward",       "Stewarded the local Diwali festival, welcoming around 600 attendees.",                     6,   480, true],
  ["m-008", "2025-10-28", "Mentoring",          "Care-leaver mentoring",         "Monthly check-in with two care-leavers about housing and study.",                          2,   240, true],

  // November
  ["m-001", "2025-11-04", "Fundraising",        "Corporate partner pitch",       "Pitched the 2026 partnership programme to a regional employer. £4,000 confirmed.",        4,  4000, true],
  ["m-002", "2025-11-08", "Environment",        "Allotment build day",           "Helped build raised beds for the new community allotment.",                                5,   330, true],
  ["m-003", "2025-11-12", "Sport & Active",     "Walking-football session",      "Co-ran a walking-football session for over-60s.",                                          2,   160, true],
  ["m-007", "2025-11-16", "Sport & Active",     "Junior cycling coach",          "Coached a junior cycling skills session. 12 participants.",                                2,   180, true],
  ["m-005", "2025-11-20", "Emergency Response", "Storm response check-in",       "Checked on 14 vulnerable households during the storm warning.",                            5,   500, true],
  ["m-009", "2025-11-24", "Arts & Culture",     "Carol service production",      "Helped stage the community carol service. Sound, lighting and refreshments.",            4,   320, false],
  ["m-008", "2025-11-28", "Education",          "Adult digital skills tutor",    "Tutored adults on basic digital skills at the library drop-in.",                            2,   240, true],

  // December
  ["m-006", "2025-12-02", "Animal Welfare",     "Winter feeding stations",       "Built and stocked winter feeding stations for urban wildlife.",                            3,   180, true],
  ["m-004", "2025-12-06", "Education",          "Christmas reading session",     "Hosted a Christmas-themed reading event for 28 primary-school children.",                  3,   360, true],
  ["m-002", "2025-12-10", "Community",          "Community Christmas dinner",    "Helped cook and serve the community Christmas lunch for 120 older residents.",            6,   600, true],
  ["m-005", "2025-12-13", "Community",          "Toy distribution drive",        "Delivered Christmas gift parcels to 14 nominated families.",                                4,   320, true],
  ["m-007", "2025-12-17", "Fundraising",        "Christmas raffle organiser",    "Organised the Christmas raffle which raised £760 for outreach.",                            5,   760, true],
  ["m-001", "2025-12-20", "Community",          "Year-end thank-you event",      "Hosted a year-end thank-you event for 45 volunteers.",                                     5,   400, true],
  ["m-009", "2025-12-22", "Arts & Culture",     "Children's panto matinee",      "Stage-managed the children's pantomime matinee. Full house of 180.",                      5,   420, true],
  ["m-008", "2025-12-27", "Mentoring",          "Winter check-in calls",         "Made winter check-in calls to eight isolated mentees.",                                    3,   330, true],
  ["m-demo","2025-12-30", "Environment",        "Christmas-tree recycling",      "Helped run the community Christmas-tree recycling drop-off.",                              4,   220, true],

  // Extended cohort — m-011 to m-032
  ["m-011", "2025-03-05", "Community",          "Foodbank volunteer",            "Sorted and packed food parcels at the local foodbank.",                                    3,   195, true],
  ["m-011", "2025-07-14", "Education",          "Summer reading scheme",         "Read with children at the library summer reading scheme. 20 children attended.",          2,   220, true],
  ["m-012", "2025-02-19", "Sport & Active",     "Wheelchair rugby support",      "Supported the wheelchair rugby club with match-day logistics and refereeing.",            4,   280, true],
  ["m-012", "2025-06-20", "Environment",        "Community orchard planting",    "Planted 15 heritage fruit trees in the community orchard.",                               4,   300, true],
  ["m-013", "2025-02-28", "Education",          "ESOL teaching assistant",       "Assisted with an ESOL class for 14 adult learners working towards Entry Level 3.",        3,   300, true],
  ["m-013", "2025-08-10", "Mentoring",          "Youth mentoring programme",     "Monthly mentoring session with a disengaged young person covering life skills.",          2,   220, true],
  ["m-014", "2025-03-18", "Community",          "Drop-in centre support",        "Helped run the weekly drop-in centre for people experiencing homelessness.",              4,   360, true],
  ["m-014", "2025-09-24", "Fundraising",        "Charity bake sale",             "Organised and ran a bake sale that raised £420 for the local hospice.",                   3,   420, true],
  ["m-015", "2025-03-08", "Environment",        "Coastal path restoration",      "Cleared gorse and repaired a section of the coastal path with a team of six.",           5,   350, true],
  ["m-015", "2025-10-11", "Arts & Culture",     "Welsh-language drama group",    "Facilitated a Welsh-language drama session for older adults at the community centre.",   2,   180, true],
  ["m-016", "2025-04-06", "Health",             "Cancer support befriending",    "Provided telephone befriending to two people in cancer treatment, one hour each.",        2,   180, true],
  ["m-016", "2025-09-08", "Education",          "Homework club lead",            "Led the secondary-school homework club covering core subjects. 10 pupils.",              2.5, 280, true],
  ["m-017", "2025-03-28", "Sport & Active",     "Junior cricket coaching",       "Coached a junior cricket skills session for 16 children aged 8 to 12.",                  3,   210, true],
  ["m-017", "2025-08-16", "Community",          "Neighbourhood clean-up",        "Organised and led a neighbourhood litter pick with 10 local residents.",                  4,   260, true],
  ["m-018", "2025-04-12", "Mentoring",          "Employability coaching",        "One-to-one employability coaching session with a long-term unemployed client.",           2,   220, true],
  ["m-018", "2025-10-18", "Education",          "Digital inclusion workshop",    "Ran a digital inclusion workshop for older adults at the community centre.",              3,   300, true],
  ["m-019", "2025-05-09", "Emergency Response", "Mountain rescue training",      "Attended monthly mountain rescue team training on casualty care and navigation.",         6,   480, true],
  ["m-019", "2025-11-01", "Community",          "Warm spaces coordinator",       "Set up and ran the community warm space for the first week of winter.",                   4,   320, true],
  ["m-020", "2025-04-17", "Arts & Culture",     "Community photography project", "Led a photography walk for 12 young people exploring their local neighbourhood.",         4,   340, true],
  ["m-020", "2025-09-13", "Environment",        "Nature reserve volunteer",      "Helped maintain the local nature reserve footpaths and clear invasive species.",          4,   280, true],
  ["m-021", "2025-05-10", "Mentoring",          "Enterprise mentoring",          "Mentored two young people in the early stages of setting up their first businesses.",    3,   330, true],
  ["m-021", "2025-11-08", "Community",          "Foodbank coordinator",          "Coordinated the Saturday morning foodbank distribution session.",                          5,   400, true],
  ["m-022", "2025-05-17", "Health",             "Postnatal support group",       "Ran a peer-support session for new parents at the children's centre. 12 attended.",      2,   180, true],
  ["m-022", "2025-10-04", "Education",          "Year 6 transition support",     "Supported Year 6 children with the secondary school transition programme.",              3,   330, true],
  ["m-023", "2025-06-06", "Community",          "Night shelter volunteer",       "Served food and ran activities at the emergency night shelter for rough sleepers.",       5,   450, true],
  ["m-023", "2025-11-14", "Environment",        "Urban rewilding survey",        "Conducted bat and invertebrate surveys for the urban rewilding project.",                4,   280, true],
  ["m-024", "2025-06-14", "Mentoring",          "Back-to-work coaching",         "Coached three women returning to work after career breaks, on CV and interview skills.", 3,   330, true],
  ["m-024", "2025-10-25", "Arts & Culture",     "Community theatre director",    "Directed the community theatre autumn production rehearsals over six sessions.",          5,   420, true],
  ["m-025", "2025-06-07", "Sport & Active",     "Open-water swim safety",        "Safety kayaked for the community open-water swimming group. 20 swimmers.",              4,   280, true],
  ["m-025", "2025-09-20", "Emergency Response", "Flood warden training",         "Completed flood warden certification and led a community risk-assessment walk.",          3,   240, true],
  ["m-026", "2025-07-05", "Education",          "English conversation club",     "Ran a weekly English conversation club for migrants and refugees. 8 attendees.",         2,   240, true],
  ["m-026", "2025-11-22", "Community",          "Mutual aid network coordinator","Coordinated the local mutual aid network response during a housing crisis.",              4,   360, true],
  ["m-027", "2025-07-05", "Environment",        "Moor restoration volunteer",    "Helped with blanket-bog restoration on a moorland conservation day.",                    6,   420, true],
  ["m-027", "2025-10-16", "Animal Welfare",     "Wildlife corridor survey",      "Surveyed hedgerow connectivity for the local wildlife corridor project.",                4,   240, true],
  ["m-028", "2025-07-12", "Health",             "Hospice garden volunteer",      "Maintained the therapeutic garden at the local hospice.",                                3,   240, true],
  ["m-028", "2025-11-07", "Arts & Culture",     "Music therapy support",         "Assisted the music therapist at weekly sessions for residents with dementia.",           2,   200, true],
  ["m-029", "2025-07-19", "Mentoring",          "Care-experienced youth mentor", "Mentored a care-experienced teenager through the first months of independent living.",    2,   240, true],
  ["m-029", "2025-11-15", "Community",          "Digital skills for seniors",    "Led a digital skills workshop for older adults at the library. 14 participants.",         2.5, 280, true],
  ["m-030", "2025-07-26", "Arts & Culture",     "Youth dance workshop",          "Led a contemporary dance workshop for 18 teenagers at the local arts centre.",           3,   270, true],
  ["m-030", "2025-12-06", "Environment",        "Green roof installation",       "Helped install a sedum green roof on the community centre extension.",                   5,   350, true],
  ["m-031", "2025-09-06", "Community",          "Refugee welcome support",       "Helped organise welcome packs and orientation for newly arrived asylum seekers.",         4,   360, true],
  ["m-031", "2025-12-13", "Fundraising",        "Christmas appeal coordinator",  "Coordinated the charity's Christmas gift appeal. 200 gifts collected for 80 families.", 5,   600, true],
  ["m-032", "2025-10-04", "Education",          "School governor",               "Attended the autumn school governors' meeting and led the SEND sub-committee.",           3,   300, true],
  ["m-032", "2025-12-05", "Arts & Culture",     "Community Christmas concert",   "Organised and performed at the community Christmas concert. 200 attendees.",             4,   360, true],

  // 2026 activities — m-011 to m-032
  ["m-011", "2026-03-07", "Community",          "Foodbank volunteer",            "Sorted and packed food parcels at the local foodbank. Busiest Saturday of the year.",    3,   195, true],
  ["m-012", "2026-01-17", "Sport & Active",     "Wheelchair rugby support",      "Supported the wheelchair rugby club with match-day logistics and score recording.",      4,   280, true],
  ["m-013", "2026-02-14", "Education",          "ESOL teaching assistant",       "Assisted with an ESOL class for 16 adult learners working towards Entry Level 3.",       3,   300, true],
  ["m-014", "2026-03-20", "Community",          "Drop-in centre support",        "Helped run the weekly drop-in centre for people experiencing homelessness.",             4,   360, true],
  ["m-015", "2026-01-24", "Environment",        "Coastal path maintenance",      "Cleared gorse and litter from a half-kilometre stretch of the coastal path.",           4,   280, true],
  ["m-016", "2026-02-28", "Health",             "Cancer support befriending",    "Telephone befriending sessions with two people undergoing cancer treatment.",            2,   180, true],
  ["m-017", "2026-04-11", "Sport & Active",     "Junior cricket coaching",       "Coached a spring skills session for 18 children aged 8 to 12.",                         3,   210, true],
  ["m-018", "2026-03-14", "Mentoring",          "Employability coaching",        "Two one-to-one employability coaching sessions with long-term job seekers.",             3,   260, true],
  ["m-019", "2026-01-11", "Emergency Response", "Mountain rescue training",      "Monthly mountain rescue team training focused on winter navigation.",                    6,   480, true],
  ["m-020", "2026-02-07", "Arts & Culture",     "Community photography project", "Led a photography session for 14 young people exploring their neighbourhood.",          4,   340, true],
  ["m-021", "2026-03-28", "Mentoring",          "Enterprise mentoring",          "Mentored three young people on early-stage business planning and finance.",             3,   330, true],
  ["m-022", "2026-04-18", "Health",             "Postnatal support group",       "Peer-support session for new parents at the children's centre. 14 attended.",           2,   180, true],
  ["m-023", "2026-02-21", "Community",          "Night shelter volunteer",       "Served food and ran activities at the emergency night shelter.",                         5,   450, true],
  ["m-024", "2026-03-07", "Mentoring",          "Back-to-work coaching",         "Coached four women returning to work on CV writing and interview technique.",            3,   330, true],
  ["m-025", "2026-01-18", "Sport & Active",     "Open-water swim safety",        "Safety kayaked for the community open-water swimming group. 22 swimmers.",             4,   280, true],
  ["m-026", "2026-02-14", "Education",          "English conversation club",     "Ran the weekly English conversation club for migrants and refugees. 10 attendees.",      2,   240, true],
  ["m-027", "2026-04-04", "Environment",        "Moor restoration volunteer",    "Helped with spring blanket-bog restoration on a moorland conservation day.",            6,   420, true],
  ["m-028", "2026-03-21", "Health",             "Hospice garden volunteer",      "Spring maintenance of the therapeutic garden at the local hospice.",                    3,   240, true],
  ["m-029", "2026-01-25", "Mentoring",          "Care-experienced youth mentor", "Monthly mentoring session with a care-experienced teenager in independent living.",      2,   240, true],
  ["m-030", "2026-02-28", "Arts & Culture",     "Youth dance workshop",          "Led a contemporary dance workshop for 20 teenagers at the local arts centre.",          3,   270, true],
  ["m-031", "2026-04-12", "Community",          "Refugee welcome support",       "Helped organise welcome packs and orientation for newly arrived families.",              4,   360, true],
  ["m-032", "2026-03-14", "Education",          "School governor",               "Spring term governors' meeting covering curriculum review and SEND provision.",          3,   300, true],

  // January 2026
  ["m-001", "2026-01-08", "Community",          "New year volunteer briefing",   "Ran the 2026 kickoff briefing for the volunteer cohort. 18 new starters.",                   3,   210, true],
  ["m-002", "2026-01-11", "Environment",        "Canal towpath clean-up",        "Winter clear of the Mersey towpath. Eight bin bags collected, 1km cleared.",                  4,   220, true],
  ["m-003", "2026-01-17", "Sport & Active",     "Junior parkrun marshalling",    "Marshalled the junior 2K parkrun, supporting 90+ young runners on a cold morning.",           2,   140, true],
  ["m-004", "2026-01-21", "Education",          "Year 4 reading mentor",         "Weekly one-to-one reading session at St Mary's Primary. Fourth term running.",                1.5, 180, true],
  ["m-005", "2026-01-25", "Community",          "Repair café host",              "Hosted January's repair café. Fixed a toaster, two lamps and a vacuum cleaner.",              3,   165, true],
  ["m-008", "2026-01-28", "Mentoring",          "Apprenticeship 1:1 mentor",     "New-year check-in session with two apprentices. Goal-setting for Q1.",                        2,   220, true],

  // February 2026
  ["m-002", "2026-02-03", "Environment",        "Community tree planting",       "Planted 35 native saplings on the community green in partnership with the council.",          5,   460, true],
  ["m-006", "2026-02-07", "Animal Welfare",     "Dog shelter dog-walking",       "Walked six shelter dogs and helped with enrichment activities at the rescue.",                 4,   220, true],
  ["m-009", "2026-02-11", "Arts & Culture",     "Community choir lead",          "Led the weekly community choir rehearsal. 26 attendees, new term starting.",                  2,   190, true],
  ["m-007", "2026-02-15", "Health",             "Care home visits",              "Afternoon of music and conversation at Oakleigh care home.",                                   2.5, 180, true],
  ["m-003", "2026-02-19", "Sport & Active",     "Cycling buddy ride",            "Led a confidence-building group ride for eight new cyclists around the local park.",           3,   200, true],
  ["m-005", "2026-02-22", "Fundraising",        "Quiz night fundraiser",         "Hosted February quiz night raising £620 for the youth centre's spring programme.",             4,   620, true],
  ["m-001", "2026-02-26", "Community",          "Trustee board meeting",         "Attended Q1 trustee board with updated impact metrics and 2026 action plan.",                 3,   250, true],

  // March 2026
  ["m-004", "2026-03-05", "Education",          "STEM workshop assistant",       "Helped run a robotics workshop for 24 girls aged 10–12. Best attendance yet.",               4,   500, true],
  ["m-002", "2026-03-08", "Community",          "Soup kitchen evening",          "Cooked and served around 80 hot meals at the city-centre soup kitchen.",                      4,   400, true],
  ["m-006", "2026-03-12", "Environment",        "Wildflower seeding",            "Sowed pollinator-friendly mix across three verges in collaboration with the council.",         3,   220, true],
  ["m-008", "2026-03-15", "Education",          "Refugee English class",         "Taught beginner conversational English to eight newly arrived refugees.",                      2,   260, true],
  ["m-009", "2026-03-19", "Mentoring",          "Creative writing mentor",       "Mentored three young people on their short story submissions for the regional competition.",   2,   240, true],
  ["m-005", "2026-03-22", "Emergency Response", "First aid cover at gala",       "Provided first-aid cover at the spring youth football tournament.",                           5,   420, true],
  ["m-003", "2026-03-26", "Health",             "Mental-health walk lead",       "Co-led a peer walking group for adults managing low mood. Eleven participants.",               2.5, 210, true],
  ["m-demo","2026-03-29", "Environment",        "Litter pick & river survey",    "Joined a local wildlife trust river-health survey and litter pick. 12kg collected.",          3,   195, true],

  // April 2026
  ["m-007", "2026-04-06", "Fundraising",        "Sponsored 10K run",             "Completed a 10K raising £840 for the youth trust's new bursary fund.",                       2,   840, true],
  ["m-002", "2026-04-10", "Environment",        "Park bench restoration",        "Restored five weather-damaged benches with a four-person crew.",                               5,   260, true],
  ["m-004", "2026-04-14", "Mentoring",          "School governor meeting",       "Attended the spring governors meeting and presented the reading-volunteer impact data.",       2.5, 260, true],
  ["m-006", "2026-04-17", "Animal Welfare",     "Hedgehog rescue volunteering",  "Cared for five injured hedgehogs at the local wildlife rescue.",                               3,   195, true],
  ["m-009", "2026-04-23", "Arts & Culture",     "Open-mic host",                 "Hosted the monthly open-mic night supporting eleven local performers.",                        3,   255, true],
  ["m-001", "2026-04-27", "Mentoring",          "New volunteer onboarding",      "Inducted six new volunteers over two evenings, including safeguarding refresher.",             4,   480, true],

  // May 2026
  ["m-005", "2026-05-03", "Community",          "Mayfest festival stewarding",   "Stewarded the main entrance at Mayfest 2026, welcoming around 750 attendees.",                6,   510, true],
  ["m-003", "2026-05-07", "Sport & Active",     "Inclusive football coach",      "Coached the weekly inclusive 5-a-side session for adults with disabilities.",                  2,   190, true],
  ["m-008", "2026-05-08", "Mentoring",          "Care leaver mentor",            "Monthly mentoring session with a young care leaver now in their second tenancy.",              2,   250, true],
  ["m-demo","2026-05-09", "Community",          "Community market stall",        "Ran the My Impact awareness stall at the local community market. 45 conversations.",          3,   180, true],
];

export const DEMO_ACTIVITIES: DemoActivity[] = [
  ...RAW_ACTIVITIES,
  ...SYNTHETIC_COHORT.flatMap(s => s.activities),
].map((r, i) => ({
  id: `a-${String(i + 1).padStart(3, "0")}`,
  memberId: r[0],
  occurredAt: r[1],
  category: r[2],
  activity: r[3],
  description: r[4],
  hours: r[5],
  socialValueGBP: r[6],
  verified: r[7],
}));

export function getDemoMember(id: string): DemoMember | undefined {
  return DEMO_MEMBERS.find(m => m.id === id);
}

// Each activity category maps to its primary UN Sustainable Development Goal.
// Numbers, labels and colours follow the official SDG identity set.
export interface SdgInfo { number: number; label: string; color: string }
export const SDG_BY_CATEGORY: Record<ActivityCategory, SdgInfo> = {
  Environment:          { number: 13, label: "Climate Action",                   color: "#3F7E44" },
  Community:            { number: 11, label: "Sustainable Cities & Communities", color: "#FD9D24" },
  Health:               { number: 3,  label: "Good Health & Wellbeing",          color: "#4C9F38" },
  Education:            { number: 4,  label: "Quality Education",                color: "#C5192D" },
  "Sport & Active":     { number: 3,  label: "Good Health & Wellbeing",          color: "#4C9F38" },
  Fundraising:          { number: 1,  label: "No Poverty",                       color: "#E5243B" },
  Mentoring:            { number: 10, label: "Reduced Inequalities",             color: "#DD1367" },
  "Arts & Culture":     { number: 4,  label: "Quality Education",                color: "#C5192D" },
  "Animal Welfare":     { number: 15, label: "Life on Land",                     color: "#56C02B" },
  "Emergency Response": { number: 16, label: "Peace, Justice & Strong Institutions", color: "#00689D" },
};

export const ALL_CATEGORIES: ActivityCategory[] = Object.keys(SDG_BY_CATEGORY) as ActivityCategory[];

export interface SdgBreakdownPoint extends SdgInfo {
  value: number;
  hours: number;
  activities: number;
  members: number; // distinct members contributing to this SDG
  pct: number; // 0-100, share of social value
}

export function computeSdgBreakdown(activities: DemoActivity[] = DEMO_ACTIVITIES): SdgBreakdownPoint[] {
  const total = activities.reduce((s, a) => s + a.socialValueGBP, 0);
  const map = new Map<number, SdgBreakdownPoint>();
  const memberSets = new Map<number, Set<string>>();
  for (const a of activities) {
    const sdg = SDG_BY_CATEGORY[a.category];
    if (!sdg) continue;
    if (!map.has(sdg.number)) {
      map.set(sdg.number, { ...sdg, value: 0, hours: 0, activities: 0, members: 0, pct: 0 });
      memberSets.set(sdg.number, new Set<string>());
    }
    const p = map.get(sdg.number)!;
    p.value += a.socialValueGBP;
    p.hours += a.hours;
    p.activities += 1;
    memberSets.get(sdg.number)!.add(a.memberId);
  }
  for (const [n, set] of memberSets) {
    const p = map.get(n)!;
    p.members = set.size;
  }
  const arr = Array.from(map.values()).sort((a, b) => b.value - a.value);
  if (total > 0) for (const p of arr) p.pct = Math.round((p.value / total) * 100);
  return arr;
}

// Richer per-category aggregate used by the "Top categories" panel, adds
// distinct member count on top of value/hours/activities.
export interface CategoryBreakdownPoint {
  category: ActivityCategory;
  value: number;
  hours: number;
  activities: number;
  members: number;
}
export function computeCategoryBreakdown(activities: DemoActivity[] = DEMO_ACTIVITIES): CategoryBreakdownPoint[] {
  return ALL_CATEGORIES.map(c => {
    const items = activities.filter(a => a.category === c);
    return {
      category: c,
      value: items.reduce((s, a) => s + a.socialValueGBP, 0),
      hours: items.reduce((s, a) => s + a.hours, 0),
      activities: items.length,
      members: new Set(items.map(a => a.memberId)).size,
    };
  })
  .filter(c => c.activities > 0)
  .sort((a, b) => b.value - a.value);
}

export interface DemoOrgAggregates {
  totalMembers: number;
  activeMembers: number;
  totalActivities: number;
  totalHours: number;
  totalSocialValue: number;
  verifiedSocialValue: number;
  averagePerMember: number;
  byCategory: Array<{ category: ActivityCategory; count: number; hours: number; value: number }>;
}

export function computeDemoAggregates(activities: DemoActivity[] = DEMO_ACTIVITIES): DemoOrgAggregates {
  const totalActivities = activities.length;
  const totalHours = activities.reduce((s, a) => s + a.hours, 0);
  const totalSocialValue = activities.reduce((s, a) => s + a.socialValueGBP, 0);
  const verifiedSocialValue = activities.filter(a => a.verified).reduce((s, a) => s + a.socialValueGBP, 0);
  const memberIds = new Set(activities.map(a => a.memberId));
  const byCategory = ALL_CATEGORIES.map(c => {
    const items = activities.filter(a => a.category === c);
    return {
      category: c,
      count: items.length,
      hours: items.reduce((s, a) => s + a.hours, 0),
      value: items.reduce((s, a) => s + a.socialValueGBP, 0),
    };
  });
  return {
    totalMembers: DEMO_MEMBERS.length,
    activeMembers: memberIds.size,
    totalActivities,
    totalHours,
    totalSocialValue,
    verifiedSocialValue,
    averagePerMember: DEMO_MEMBERS.length ? Math.round(totalSocialValue / DEMO_MEMBERS.length) : 0,
    byCategory,
  };
}

// Aggregate social value & activity counts by month (YYYY-MM) for the trend chart.
export interface MonthlyTrendPoint { month: string; label: string; value: number; activities: number; hours: number }
export function computeMonthlyTrend(activities: DemoActivity[] = DEMO_ACTIVITIES): MonthlyTrendPoint[] {
  const by = new Map<string, MonthlyTrendPoint>();
  for (const a of activities) {
    const month = a.occurredAt.slice(0, 7);
    if (!by.has(month)) {
      const d = new Date(`${month}-01T00:00:00Z`);
      by.set(month, {
        month,
        label: d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" }),
        value: 0, activities: 0, hours: 0,
      });
    }
    const p = by.get(month)!;
    p.value += a.socialValueGBP;
    p.activities += 1;
    p.hours += a.hours;
  }
  return Array.from(by.values()).sort((a, b) => a.month.localeCompare(b.month));
}

// ---------------------------------------------------------------------------
// Challenges (demo org only)
// ---------------------------------------------------------------------------
// Shape mirrors the `ApiChallenge` returned by `/api/challenges/mine` so the
// `OrgChallengesPanel` can render demo data with no rework.
export interface DemoChallenge {
  id: string;
  name: string;
  description: string;
  goalType: "social_value" | "hours";
  target: number;
  startDate: string; // ISO
  endDate: string;   // ISO
  ownerId: string | null;
  orgId: string;
  scope: "org";
  inviteCode: string;
  hasEnded: boolean;
  hasStarted: boolean;
  participantCount: number;
  isOwner: boolean;
  progressTotal: number;
  progressPercent: number;
  isActive: boolean;
}

export const DEMO_CHALLENGES: DemoChallenge[] = [
  {
    id: "demo-ch-001",
    name: "Spring community sprint",
    description: "Hit £3,000 of Community-category social value before the end of June.",
    goalType: "social_value",
    target: 3000,
    progressTotal: 2150,
    progressPercent: 72,
    participantCount: 12,
    startDate: "2026-04-01T00:00:00.000Z",
    endDate: "2026-06-30T23:59:59.000Z",
    ownerId: "m-001",
    orgId: DEMO_ORG_ID,
    scope: "org",
    inviteCode: "DEMO-CH01",
    hasStarted: true,
    hasEnded: false,
    isActive: true,
    isOwner: true,
  },
  {
    id: "demo-ch-002",
    name: "150 environmental hours",
    description: "A combined goal across all members to log 150 hours of environmental work this quarter.",
    goalType: "hours",
    target: 150,
    progressTotal: 92,
    progressPercent: 61,
    participantCount: 11,
    startDate: "2026-05-01T00:00:00.000Z",
    endDate: "2026-07-31T23:59:59.000Z",
    ownerId: "m-001",
    orgId: DEMO_ORG_ID,
    scope: "org",
    inviteCode: "DEMO-CH02",
    hasStarted: true,
    hasEnded: false,
    isActive: true,
    isOwner: true,
  },
  {
    id: "demo-ch-003",
    name: "Reading mentor month",
    description: "Get 7 members signed up as weekly reading mentors at local primary schools.",
    goalType: "social_value",
    target: 1500,
    progressTotal: 870,
    progressPercent: 58,
    participantCount: 7,
    startDate: "2026-05-01T00:00:00.000Z",
    endDate: "2026-05-31T23:59:59.000Z",
    ownerId: "m-001",
    orgId: DEMO_ORG_ID,
    scope: "org",
    inviteCode: "DEMO-CH03",
    hasStarted: true,
    hasEnded: false,
    isActive: true,
    isOwner: true,
  },
  {
    id: "demo-ch-004",
    name: "Winter fundraising drive",
    description: "Reach £5,000 of fundraising activity across the organisation.",
    goalType: "social_value",
    target: 5000,
    progressTotal: 5240,
    progressPercent: 100,
    participantCount: 18,
    startDate: "2025-12-01T00:00:00.000Z",
    endDate: "2026-02-28T23:59:59.000Z",
    ownerId: "m-001",
    orgId: DEMO_ORG_ID,
    scope: "org",
    inviteCode: "DEMO-CH04",
    hasStarted: true,
    hasEnded: true,
    isActive: false,
    isOwner: true,
  },
];

// Mock invite link state: managers can revoke + regenerate. Persisted per-org so demos survive a refresh.
const INVITE_KEY = (orgId: string) => `org-invite-code:${orgId}`;
export function getOrgInviteCode(orgId: string, fallback: string): string {
  try {
    return localStorage.getItem(INVITE_KEY(orgId)) ?? fallback;
  } catch { return fallback; }
}
export function setOrgInviteCode(orgId: string, code: string): void {
  try { localStorage.setItem(INVITE_KEY(orgId), code); } catch { /* ignore */ }
}
export function generateInviteCode(): string {
  const part = () => Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${part()}-${part()}`;
}

// ---------------------------------------------------------------------------
// SSO configs (demo org only), shape mirrors `SsoConfig` from
// `OrgSsoConfig.tsx` so the panel can swap to demo data with no rework.
// ---------------------------------------------------------------------------
export interface DemoSsoConfig {
  id: string;
  provider: "google" | "microsoft";
  domain: string;
  tenantId: string | null;
  enforceSSO: boolean;
  status: "pending" | "verified" | "error";
  lastTestAt: string | null;
}
export const DEMO_SSO_AVAILABLE_PROVIDERS: Array<"google" | "microsoft"> = ["google", "microsoft"];
export const DEMO_SSO_CONFIGS: DemoSsoConfig[] = [
  {
    id: "demo-sso-001",
    provider: "google",
    domain: "demo-organisation.org",
    tenantId: null,
    enforceSSO: true,
    status: "verified",
    lastTestAt: "2026-04-22T09:30:00.000Z",
  },
  {
    id: "demo-sso-002",
    provider: "microsoft",
    domain: "riverside-board.org.uk",
    tenantId: "00000000-1111-2222-3333-444455556666",
    enforceSSO: false,
    status: "pending",
    lastTestAt: null,
  },
];

// ---------------------------------------------------------------------------
// Developer API & webhooks (demo org only)
// ---------------------------------------------------------------------------
export interface DemoApiKey {
  id: string;
  label: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}
export const DEMO_API_KEYS: DemoApiKey[] = [
  {
    id: "demo-key-001",
    label: "Workday hours sync",
    keyPrefix: "mi_orgk_riv_w0rk",
    scopes: ["hours.write", "members.read"],
    lastUsedAt: "2026-05-06T14:12:00.000Z",
    revokedAt: null,
    createdAt: "2025-11-04T10:00:00.000Z",
  },
  {
    id: "demo-key-002",
    label: "Board reporting dashboard",
    keyPrefix: "mi_orgk_riv_b0rd",
    scopes: ["stats.read"],
    lastUsedAt: "2026-05-01T08:45:00.000Z",
    revokedAt: null,
    createdAt: "2026-01-18T09:00:00.000Z",
  },
];

export interface DemoWebhook {
  id: string;
  url: string;
  events: string[];
  enabled: boolean;
  deadAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastError: string | null;
  createdAt: string;
  secretPrefix: string;
}
export const DEMO_WEBHOOKS: DemoWebhook[] = [
  {
    id: "demo-wh-001",
    url: "https://hooks.demo-organisation.org/myimpact",
    events: ["member.joined", "hours.attested", "milestone.earned"],
    enabled: true,
    deadAt: null,
    lastSuccessAt: "2026-05-07T07:14:00.000Z",
    lastFailureAt: null,
    lastError: null,
    createdAt: "2025-12-02T09:00:00.000Z",
    secretPrefix: "whs_riv_a1b2",
  },
  {
    id: "demo-wh-002",
    url: "https://make.com/hooks/riverside-impact-feed",
    events: ["hours.logged"],
    enabled: true,
    deadAt: null,
    lastSuccessAt: "2026-05-05T19:02:00.000Z",
    lastFailureAt: "2026-04-30T03:00:00.000Z",
    lastError: "504 Gateway Timeout (retried)",
    createdAt: "2026-02-09T11:30:00.000Z",
    secretPrefix: "whs_riv_c3d4",
  },
];
export const DEMO_SUPPORTED_WEBHOOK_EVENTS = [
  "member.joined", "hours.logged", "hours.attested", "hours.verified", "milestone.earned",
];

// ---------------------------------------------------------------------------
// Share links (demo org only)
// ---------------------------------------------------------------------------
export interface DemoShareLink {
  id: string;
  slug: string;
  scope: "all" | "summary" | "timeline" | "categories" | "regions";
  funderLabel: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  viewCount: number;
  createdAt: string;
}
export const DEMO_SHARE_LINKS: DemoShareLink[] = [
  {
    id: "demo-sl-001",
    slug: "demo-nlcf-snapshot",
    scope: "all",
    funderLabel: "National Lottery Community Fund",
    expiresAt: "2026-09-30T23:59:59.000Z",
    revokedAt: null,
    viewCount: 23,
    createdAt: "2026-03-12T10:00:00.000Z",
  },
  {
    id: "demo-sl-002",
    slug: "demo-board-q1",
    scope: "summary",
    funderLabel: "Trustee board · Q1 review",
    expiresAt: null,
    revokedAt: null,
    viewCount: 11,
    createdAt: "2026-04-04T09:00:00.000Z",
  },
  {
    id: "demo-sl-003",
    slug: "demo-mersey-partner",
    scope: "categories",
    funderLabel: "Mersey Catchment Partnership",
    expiresAt: "2026-06-30T23:59:59.000Z",
    revokedAt: null,
    viewCount: 6,
    createdAt: "2026-04-22T15:00:00.000Z",
  },
  {
    id: "demo-sl-004",
    slug: "demo-pilot-funder",
    scope: "timeline",
    funderLabel: "Pilot funder (2024 round)",
    expiresAt: null,
    revokedAt: "2026-02-01T09:00:00.000Z",
    viewCount: 41,
    createdAt: "2024-11-10T10:00:00.000Z",
  },
];

// Mock member-removal/anonymisation state, kept in localStorage so the demo
// reflects the manager's actions across navigation.
const REMOVED_KEY = (orgId: string) => `org-removed-members:${orgId}`;
export function getRemovedMemberIds(orgId: string): string[] {
  try {
    const raw = localStorage.getItem(REMOVED_KEY(orgId));
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch { return []; }
}
export function setRemovedMemberIds(orgId: string, ids: string[]): void {
  try { localStorage.setItem(REMOVED_KEY(orgId), JSON.stringify(ids)); } catch { /* ignore */ }
}
