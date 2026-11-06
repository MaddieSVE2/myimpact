import { contributionRate, PERSONAL_DEV_RATE_PER_HOUR, VOLUNTEER_RATE } from "./contributionModel.js";

export interface Activity {
  id: string;
  name: string;
  shortName: string;
  category: string;
  group: string;
  proxy: string;
  proxyYear: string;
  unit: string;
  unitLabel: string;
  friendlyQuestion: string;
  defaultQuantity: number;
  valuePerUnit: number;
  sdg: string;
  sdgColor: string;
  description: string;
}

export const ACTIVITIES: Activity[] = [
  // ── Environment ───────────────────────────────────────────────────────────
  {
    id: "recycling",
    name: "Reducing household waste through recycling",
    shortName: "Recycling at home",
    category: "Environment",
    group: "Nature & Environment",
    proxy: "Standard UK landfill tax avoided per recycling bin collected (HMRC, 2026) — £130.75/tonne × 0.01 tonnes per bin",
    proxyYear: "2026",
    unit: "bin",
    unitLabel: "Bins recycled per year",
    friendlyQuestion: "How many full recycling bins do you put out per year?",
    defaultQuantity: 26,
    valuePerUnit: 1.31,
    sdg: "Responsible Consumption and Production",
    sdgColor: "#BF8B2E",
    description: "Recycling paper, plastic, glass and other materials at home to reduce landfill.",
  },
  {
    id: "food_waste",
    name: "Reducing food waste at home",
    shortName: "Cutting food waste",
    category: "Environment",
    group: "Nature & Environment",
    proxy: "Cost of wasted food for an average UK household (Eco Experts, 2024)",
    proxyYear: "2024",
    unit: "household",
    unitLabel: "Households",
    friendlyQuestion: "This counts for your household — just confirm you do this.",
    defaultQuantity: 1,
    valuePerUnit: 631.0,
    sdg: "Responsible Consumption and Production",
    sdgColor: "#BF8B2E",
    description: "Meal planning, composting, and using leftovers to cut food waste.",
  },
  {
    id: "eco_transport",
    name: "Using sustainable transport (cycling/walking)",
    shortName: "Cycling or walking",
    category: "Environment",
    group: "Nature & Environment",
    proxy: "Difference between car and bicycle mileage rates (HMRC, 2026)",
    proxyYear: "2026",
    unit: "mile_per_year",
    unitLabel: "miles",
    friendlyQuestion: "Roughly how many miles do you travel by foot or bike each year instead of driving?",
    defaultQuantity: 310,
    valuePerUnit: 0.35,
    sdg: "Sustainable Cities and Communities",
    sdgColor: "#F99D26",
    description: "Walking or cycling instead of driving or using public transport.",
  },
  {
    id: "tree_planting",
    name: "Tree planting and green space projects",
    shortName: "Planting trees",
    category: "Environment",
    group: "Nature & Environment",
    proxy: "Average cumulative benefit over 50 years of planting a tree (Greenblue Urban, Street Tree Cost Benefit Analysis, 2018)",
    proxyYear: "2018",
    unit: "tree",
    unitLabel: "trees",
    friendlyQuestion: "How many trees have you helped plant this year?",
    defaultQuantity: 5,
    valuePerUnit: 1060,
    sdg: "Life on Land",
    sdgColor: "#56C02B",
    description: "Planting trees or maintaining green spaces in your local community.",
  },
  {
    id: "community_garden",
    name: "Community garden or allotment volunteering",
    shortName: "Community gardening",
    category: "Environment",
    group: "Nature & Environment",
    proxy: "Hourly value of volunteering (Nicol Economics for Power to Change, 2020)",
    proxyYear: "2020",
    unit: "hour",
    unitLabel: "hours",
    friendlyQuestion: "How many hours do you spend on community gardening or allotment work each year?",
    defaultQuantity: 50,
    valuePerUnit: 15,
    sdg: "Life on Land",
    sdgColor: "#56C02B",
    description: "Tending community gardens or allotments to produce food and create green spaces.",
  },
  {
    id: "wildlife_conservation",
    name: "Nature and wildlife conservation volunteering",
    shortName: "Wildlife conservation",
    category: "Environment",
    group: "Nature & Environment",
    proxy: "Hourly value of volunteering (Nicol Economics for Power to Change, 2020)",
    proxyYear: "2020",
    unit: "hour",
    unitLabel: "hours",
    friendlyQuestion: "How many hours do you give to conservation work each year?",
    defaultQuantity: 20,
    valuePerUnit: 15,
    sdg: "Life on Land",
    sdgColor: "#56C02B",
    description: "Wildlife surveys, habitat management, or nature reserve volunteering.",
  },
  {
    id: "energy_saving",
    name: "Reducing home energy use",
    shortName: "Cutting home energy use",
    category: "Environment",
    group: "Nature & Environment",
    proxy: "Value of improving a home's energy efficiency to EPC band C (English Housing Survey, 2023)",
    proxyYear: "2023",
    unit: "household",
    unitLabel: "Households",
    friendlyQuestion: "This counts for your household — just confirm you do this.",
    defaultQuantity: 1,
    valuePerUnit: 280,
    sdg: "Affordable and Clean Energy",
    sdgColor: "#FCC30B",
    description: "Reducing energy consumption at home through efficiency measures or renewable energy.",
  },
  {
    id: "litter_picking",
    name: "Litter picking and community clean-ups",
    shortName: "Litter picking",
    category: "Environment",
    group: "Nature & Environment",
    proxy: "GMCA Welfare cost from significant litter accumulation in residential areas (high value) (2024)",
    proxyYear: "2024",
    unit: "session",
    unitLabel: "sessions",
    friendlyQuestion: "How many litter picking or community clean-up sessions do you take part in each year?",
    defaultQuantity: 6,
    valuePerUnit: 78.0,
    sdg: "Sustainable Cities and Communities",
    sdgColor: "#F99D26",
    description: "Picking up litter in parks, streets, beaches, or waterways to keep communities clean.",
  },
  // ── Community ─────────────────────────────────────────────────────────────
  {
    id: "charity_books",
    name: "Donating books and clothes to charity shops",
    shortName: "Donating to charity shops",
    category: "Community",
    group: "Community",
    proxy: "Value of a bag of donated items to a charity shop (British Heart Foundation estimate)",
    proxyYear: "",
    unit: "bag",
    unitLabel: "bags",
    friendlyQuestion: "How many bags of books or clothes have you donated this year?",
    defaultQuantity: 4,
    valuePerUnit: 20,
    sdg: "Sustainable Cities and Communities",
    sdgColor: "#F99D26",
    description: "Donating reusable items to charity shops to support reuse and raise funds.",
  },
  {
    id: "food_bank",
    name: "Volunteering at a food bank",
    shortName: "Food bank volunteering",
    category: "Community",
    group: "Community",
    proxy: "Hourly value of volunteering (Nicol Economics for Power to Change, 2020)",
    proxyYear: "2020",
    unit: "hour",
    unitLabel: "hours",
    friendlyQuestion: "How many hours do you volunteer at a food bank each year?",
    defaultQuantity: 36,
    valuePerUnit: 15,
    sdg: "Zero Hunger",
    sdgColor: "#DDA63A",
    description: "Sorting, packing and distributing food parcels to people in need.",
  },
  {
    id: "veterans_breakfast",
    name: "Volunteering at community social clubs",
    shortName: "Community social clubs",
    category: "Community",
    group: "Community",
    proxy: "Impact of severe loneliness on health (DCMS, Loneliness monetisation report, 2020)",
    proxyYear: "2020",
    unit: "person",
    unitLabel: "people",
    friendlyQuestion: "How many people do you help through community social club volunteering each year?",
    defaultQuantity: 5,
    valuePerUnit: 109.0,
    sdg: "Good Health and Well-Being",
    sdgColor: "#4C9F38",
    description: "Volunteering at community social clubs, breakfast clubs, or companionship groups to reduce isolation.",
  },
  {
    id: "fundraising",
    name: "Fundraising for charities or community causes",
    shortName: "Fundraising",
    category: "Community",
    group: "Community",
    proxy: "Hourly value of volunteering (Nicol Economics for Power to Change, 2020)",
    proxyYear: "2020",
    unit: "hour",
    unitLabel: "hours",
    friendlyQuestion: "How many hours do you spend fundraising each year, including school or community events?",
    defaultQuantity: 10,
    valuePerUnit: 15,
    sdg: "Reduced Inequalities",
    sdgColor: "#DD1367",
    description: "Organising or taking part in sponsored events, charity runs, school charity days, or other fundraising — for any cause.",
  },
  {
    id: "sports_coaching",
    name: "Coaching or organising community sports",
    shortName: "Sports coaching",
    category: "Community",
    group: "Community",
    proxy: "Value of participation in sport and physical activity for fairly active adults (Sport England, 2024)",
    proxyYear: "2024",
    unit: "participant",
    unitLabel: "people",
    friendlyQuestion: "How many people do you help get active through coaching or organising sport?",
    defaultQuantity: 10,
    valuePerUnit: 1200,
    sdg: "Good Health and Well-Being",
    sdgColor: "#4C9F38",
    description: "Coaching, refereeing or organising community sports clubs and events.",
  },
  {
    id: "charity_volunteering",
    name: "General volunteering for a charity",
    shortName: "General charity volunteering",
    category: "Community",
    group: "Community",
    proxy: "Weekly wellbeing value from formal volunteering, £19.23 per volunteer per week (Volunteer Scotland Technical Report, 2025 — weekly equivalent of £1,000/year for weekly formal volunteers)",
    proxyYear: "2025",
    unit: "week",
    unitLabel: "weeks per year",
    friendlyQuestion: "How many weeks per year do you volunteer formally for a charity or community organisation? (Use this as a catch-all only for volunteering not already counted under a more specific activity above.)",
    defaultQuantity: 40,
    valuePerUnit: 19.23,
    sdg: "Reduced Inequalities",
    sdgColor: "#DD1367",
    description: "Regular formal volunteering time for any registered charity or community organisation — use this as a catch-all for activities not captured by a more specific option above. Avoid counting the same hours already logged under another activity.",
  },
  {
    id: "arts_volunteering",
    name: "Community arts or creative volunteering",
    shortName: "Arts & creative groups",
    category: "Community",
    group: "Community",
    proxy: "Value of participating in arts activities (Wheatley and Bickerton, Valuing subjective well-being benefits from leisure activities, 2022)",
    proxyYear: "2022",
    unit: "person",
    unitLabel: "people",
    friendlyQuestion: "How many people do you help engage with arts, music, drama, or creative activities?",
    defaultQuantity: 5,
    valuePerUnit: 1500,
    sdg: "Good Health and Well-Being",
    sdgColor: "#4C9F38",
    description: "Volunteering with community arts, theatre, music or creative groups.",
  },
  {
    id: "job_club",
    name: "Job club or employment support participation",
    shortName: "Job club / employment group",
    category: "Community",
    group: "Community",
    proxy: "Hourly value of volunteering (Nicol Economics for Power to Change, 2020)",
    proxyYear: "2020",
    unit: "hour",
    unitLabel: "hours",
    friendlyQuestion: "How many hours do you spend at a job club, employment support group, or skills workshop each year?",
    defaultQuantity: 30,
    valuePerUnit: 15,
    sdg: "Decent Work and Economic Growth",
    sdgColor: "#A21942",
    description: "Attending a job club, volunteering-to-work programme, or employment skills group to build skills and connections while helping others in the same boat.",
  },
  // ── Caring ────────────────────────────────────────────────────────────────
  {
    id: "elderly_visiting",
    name: "Visiting elderly or isolated people",
    shortName: "Visiting isolated people",
    category: "Community",
    group: "Caring",
    proxy: "Impact of loneliness on wellbeing, from mild loneliness to none (DCMS, Loneliness monetisation report, 2020)",
    proxyYear: "2020",
    unit: "person",
    unitLabel: "people",
    friendlyQuestion: "How many people do you visit or check in on regularly?",
    defaultQuantity: 2,
    valuePerUnit: 6429,
    sdg: "Good Health and Well-Being",
    sdgColor: "#4C9F38",
    description: "Regularly visiting elderly or isolated individuals to provide companionship.",
  },
  {
    id: "helping_neighbours",
    name: "Helping neighbours and informal community support",
    shortName: "Helping neighbours",
    category: "Community",
    group: "Caring",
    proxy: "Value of talking to neighbours regularly (Pro Bono Economics, The Economics of Community Asset Transfers, 2020)",
    proxyYear: "2020",
    unit: "person",
    unitLabel: "people helped",
    friendlyQuestion: "How many neighbours or community members do you help on a regular basis?",
    defaultQuantity: 2,
    valuePerUnit: 2972,
    sdg: "Good Health and Well-Being",
    sdgColor: "#4C9F38",
    description: "Informal help for neighbours — shopping, errands, companionship, odd jobs, or just checking in on someone regularly.",
  },
  {
    id: "befriending",
    name: "Befriending or informal companionship support",
    shortName: "Befriending someone",
    category: "Community",
    group: "Caring",
    proxy: "Impact of loneliness on wellbeing, from mild loneliness to none (DCMS, Loneliness monetisation report, 2020)",
    proxyYear: "2020",
    unit: "person",
    unitLabel: "people",
    friendlyQuestion: "How many people do you provide regular companionship or befriending support to?",
    defaultQuantity: 1,
    valuePerUnit: 6429,
    sdg: "Good Health and Well-Being",
    sdgColor: "#4C9F38",
    description: "Providing regular informal companionship, phone calls, or social support to reduce someone's isolation.",
  },
  {
    id: "family_caring",
    name: "Caring for a family member or someone in need",
    shortName: "Caring for family",
    category: "Health",
    group: "Caring",
    proxy: "Hourly cost of paid home care, as the value of unpaid care (DHSC, Market Sustainability and Improvement Fund provider fee reporting, 2025 to 2026)",
    proxyYear: "2025",
    unit: "hour",
    unitLabel: "hours",
    friendlyQuestion: "Roughly how many hours a year do you spend giving unpaid care?",
    defaultQuantity: 260,
    valuePerUnit: 25.05,
    sdg: "Good Health and Well-Being",
    sdgColor: "#4C9F38",
    description: "Providing regular unpaid care, personal support, or assistance to a family member, friend, or neighbour who needs help due to illness, disability, or age. This also covers career break scenarios where you stepped back from work to care full-time — including childcare, eldercare, or caring for a dependent adult.",
  },
  {
    id: "career_break_medical_coordination",
    name: "Managing care and life admin",
    shortName: "Managing care and life admin",
    category: "Health",
    group: "Caring",
    proxy: "National Living Wage rate — value of unpaid administrative time (GOV.UK, 2026/27), £12.71/hour",
    proxyYear: "2026",
    unit: "hour",
    unitLabel: "hours",
    friendlyQuestion: "How many hours per year do you spend managing care admin — appointments, referrals, school liaison, benefits, or other coordination on behalf of dependants?",
    defaultQuantity: 100,
    valuePerUnit: 12.71,
    sdg: "Good Health and Well-Being",
    sdgColor: "#4C9F38",
    description: "Coordinating and managing medical appointments, healthcare decisions, school liaison, benefits, and life admin for dependants — including during a career break. Reflects the real economic value of unpaid administrative time.",
  },
  {
    id: "career_break_school_liaison",
    name: "Supporting children to be healthy, happy and active",
    shortName: "Supporting children's wellbeing",
    category: "Education",
    group: "Caring",
    proxy: "Annual wellbeing value for active children aged 11–16, £4,100 per child per year (Sport England, Social value research summary, Active Lives data)",
    proxyYear: "",
    unit: "child",
    unitLabel: "children",
    friendlyQuestion: "How many children do you actively support to be healthy, happy and engaged in activities — through sports, clubs, school involvement, or daily care?",
    defaultQuantity: 1,
    valuePerUnit: 4100.0,
    sdg: "Good Health and Well-Being",
    sdgColor: "#4C9F38",
    description: "Supporting children's physical, emotional, and social wellbeing — including sports, activities, school engagement, and daily care. Especially relevant during career breaks spent raising or supporting children.",
  },
  // ── Health ────────────────────────────────────────────────────────────────
  {
    id: "blood_donation",
    name: "Donating blood",
    shortName: "Blood donation",
    category: "Health",
    group: "Health",
    proxy: "Price of a unit of standard red cells to NHS hospitals (NHS Blood and Transplant price list, 2026/27)",
    proxyYear: "2026",
    unit: "donation",
    unitLabel: "donations",
    friendlyQuestion: "How many times do you donate blood each year?",
    defaultQuantity: 3,
    valuePerUnit: 196.07,
    sdg: "Good Health and Well-Being",
    sdgColor: "#4C9F38",
    description: "Regularly donating blood to help save lives and support the NHS.",
  },
  {
    id: "mental_health_support",
    name: "Supporting mental health as a volunteer",
    shortName: "Mental health support",
    category: "Health",
    group: "Health",
    proxy: "NHS cost of a common mental disorder, per person per year (UCL and CS-N0W, Health impacts of net-zero housing in England, 2025)",
    proxyYear: "2025",
    unit: "person",
    unitLabel: "people",
    friendlyQuestion: "How many people do you support with their mental health?",
    defaultQuantity: 2,
    valuePerUnit: 2840,
    sdg: "Good Health and Well-Being",
    sdgColor: "#4C9F38",
    description: "Volunteering with mental health organisations, crisis lines or peer support groups.",
  },
  // ── Education ─────────────────────────────────────────────────────────────
  {
    id: "youth_mentoring",
    name: "Mentoring young people",
    shortName: "Mentoring young people",
    category: "Education",
    group: "Education",
    proxy: "Value of improved self-esteem from mentoring (Northumbria Coalition Against Crime, Odysseus Mentoring Project)",
    proxyYear: "",
    unit: "young_person",
    unitLabel: "young people",
    friendlyQuestion: "How many young people do you mentor?",
    defaultQuantity: 2,
    valuePerUnit: 1240.0,
    sdg: "Quality Education",
    sdgColor: "#C5192D",
    description: "Providing guidance and support to young people to help them reach their potential.",
  },
  {
    id: "tutoring",
    name: "Tutoring or teaching skills",
    shortName: "Tutoring or teaching",
    category: "Education",
    group: "Education",
    proxy: "Value of undertaking a part-time course (MeasureUp, Adult Learning for Work, 2024)",
    proxyYear: "2024",
    unit: "person",
    unitLabel: "people",
    friendlyQuestion: "How many people do you tutor or teach?",
    defaultQuantity: 3,
    valuePerUnit: 1100,
    sdg: "Quality Education",
    sdgColor: "#C5192D",
    description: "Helping others learn new skills through informal tutoring or coaching.",
  },
  {
    id: "literacy_support",
    name: "Literacy or homework volunteering",
    shortName: "Literacy support",
    category: "Education",
    group: "Education",
    proxy: "Value to an individual of improving literacy skills",
    proxyYear: "",
    unit: "person",
    unitLabel: "people",
    friendlyQuestion: "How many people do you help with reading, writing, or homework each year?",
    defaultQuantity: 2,
    valuePerUnit: 1500.0,
    sdg: "Quality Education",
    sdgColor: "#C5192D",
    description: "Supporting reading, writing or homework in schools, libraries, or community groups.",
  },
  {
    id: "digital_coaching",
    name: "Digital skills coaching",
    shortName: "Digital skills coaching",
    category: "Education",
    group: "Education",
    proxy: "Value of confidence in using the internet (Just Economics, Valuing Digital Inclusion, 2014)",
    proxyYear: "2014",
    unit: "person",
    unitLabel: "people",
    friendlyQuestion: "How many people do you help get online or improve their digital skills each year?",
    defaultQuantity: 3,
    valuePerUnit: 240,
    sdg: "Reduced Inequalities",
    sdgColor: "#DD1367",
    description: "Teaching digital skills to people who are excluded — elderly residents, job seekers, or anyone offline.",
  },
  {
    id: "employability_coaching",
    name: "Career and employability coaching",
    shortName: "Employability coaching",
    category: "Education",
    group: "Education",
    proxy: "Hourly value of volunteering (Nicol Economics for Power to Change, 2020)",
    proxyYear: "2020",
    unit: "hour",
    unitLabel: "hours",
    friendlyQuestion: "How many hours of career coaching, CV help, or interview prep do you give each year?",
    defaultQuantity: 10,
    valuePerUnit: 15,
    sdg: "Decent Work and Economic Growth",
    sdgColor: "#A21942",
    description: "Helping young people with CVs, interview skills, work experience, and career planning.",
  },
  {
    id: "coding_education_child",
    name: "Teaching coding to children",
    shortName: "Teaching coding to children",
    category: "Education",
    group: "Education",
    proxy: "Value of extra-curricular activities for children aged 10 to 14 (DCMS and Frontier Economics, Impact of culture and heritage on wellbeing, 2024)",
    proxyYear: "2024",
    unit: "child",
    unitLabel: "children",
    friendlyQuestion: "How many children do you teach coding to regularly (in an ongoing, sustained way) each year?",
    defaultQuantity: 5,
    valuePerUnit: 122,
    sdg: "Quality Education",
    sdgColor: "#C5192D",
    description: "Sustained teaching of coding to children in school clubs, community groups, or similar settings — supporting digital literacy and future career prospects.",
  },
  {
    id: "coding_camp_week",
    name: "Running a coding or STEM camp",
    shortName: "Coding or STEM camp",
    category: "Education",
    group: "Education",
    proxy: "Average price of a week at a holiday club in Great Britain (Coram Family and Childcare, Holiday Childcare Survey, 2026)",
    proxyYear: "2026",
    unit: "child_week",
    unitLabel: "child-weeks",
    friendlyQuestion: "How many child-weeks of coding or STEM camp do you run or volunteer at each year? (Count this for intensive multi-day residential or holiday camps only — not regular club sessions.)",
    defaultQuantity: 10,
    valuePerUnit: 190.77,
    sdg: "Quality Education",
    sdgColor: "#C5192D",
    description: "Running or volunteering at intensive coding or STEM camps for children — typically residential or multi-day holiday programmes, distinct from regular school-term clubs.",
  },
  {
    id: "stem_workshop",
    name: "Delivering a STEM or coding workshop",
    shortName: "STEM coding workshop",
    category: "Education",
    group: "Education",
    proxy: "Cost of an educational workshop at a primary school (EcoActive, 2026)",
    proxyYear: "2026",
    unit: "workshop",
    unitLabel: "workshops",
    friendlyQuestion: "How many standalone full-day STEM or coding workshops do you deliver each year? (Count only one-off or occasional sessions — not regular clubs or camp programmes.)",
    defaultQuantity: 3,
    valuePerUnit: 103,
    sdg: "Quality Education",
    sdgColor: "#C5192D",
    description: "Delivering standalone full-day STEM or coding workshops — one-off or occasional events to inspire and educate young people, distinct from regular clubs or camp programmes.",
  },
  {
    id: "dofe",
    name: "Duke of Edinburgh's Award",
    shortName: "Duke of Edinburgh's Award",
    category: "Education",
    group: "Education",
    proxy: "Hourly value of volunteering (Nicol Economics for Power to Change, 2020)",
    proxyYear: "2020",
    unit: "hour",
    unitLabel: "volunteering hours logged",
    friendlyQuestion: "How many volunteering hours have you logged as part of your Duke of Edinburgh's Award (any level)?",
    defaultQuantity: 26,
    valuePerUnit: 15,
    sdg: "Quality Education",
    sdgColor: "#C5192D",
    description: "Volunteering, physical activity, and skill development as part of the Duke of Edinburgh's Award programme (Bronze, Silver, or Gold).",
  },
  // ── Military / Forces service activities ──────────────────────────────────
  {
    id: "military_community_reconstruction",
    name: "Community reconstruction and development support",
    shortName: "Community reconstruction",
    category: "Community",
    group: "Military & Forces",
    proxy: "Hourly value of volunteering (Nicol Economics for Power to Change, 2020)",
    proxyYear: "2020",
    unit: "hour",
    unitLabel: "hours",
    friendlyQuestion: "How many hours did you spend on community reconstruction or development work?",
    defaultQuantity: 200,
    valuePerUnit: 15,
    sdg: "Sustainable Cities and Communities",
    sdgColor: "#F99D26",
    description: "Supporting rebuilding and development of local communities — includes infrastructure support, local services, and civic projects delivered in operational or post-conflict environments.",
  },
  {
    id: "military_population_liaison",
    name: "Population liaison and cross-cultural community engagement",
    shortName: "Population liaison / CIMIC",
    category: "Community",
    group: "Military & Forces",
    proxy: "Hourly value of volunteering (Nicol Economics for Power to Change, 2020)",
    proxyYear: "2020",
    unit: "hour",
    unitLabel: "hours",
    friendlyQuestion: "How many hours did you spend on community liaison or cross-cultural engagement work?",
    defaultQuantity: 100,
    valuePerUnit: 15,
    sdg: "Peace, Justice and Strong Institutions",
    sdgColor: "#00689D",
    description: "Building relationships with local communities, acting as a bridge between organisations and the public, and supporting cross-cultural communication and understanding.",
  },
  {
    id: "military_personnel_training",
    name: "Training and mentoring other personnel",
    shortName: "Training and mentoring personnel",
    category: "Education",
    group: "Military & Forces",
    proxy: "Value of undertaking a part-time course (MeasureUp, Adult Learning for Work, 2024)",
    proxyYear: "2024",
    unit: "person",
    unitLabel: "people trained",
    friendlyQuestion: "How many people have you trained, instructed, or mentored through your role?",
    defaultQuantity: 8,
    valuePerUnit: 1100,
    sdg: "Quality Education",
    sdgColor: "#C5192D",
    description: "Delivering training, instruction, and mentoring to colleagues, junior personnel, or members of the public — including operational skills, safety training, and professional development.",
  },
  {
    id: "military_first_aid",
    name: "Emergency first aid delivery",
    shortName: "Emergency first aid",
    category: "Health",
    group: "Military & Forces",
    proxy: "Cost of an A&E attendance with complex investigation or treatment (The King's Fund)",
    proxyYear: "",
    unit: "person",
    unitLabel: "people helped",
    friendlyQuestion: "How many people have you provided emergency first aid to?",
    defaultQuantity: 5,
    valuePerUnit: 406.0,
    sdg: "Good Health and Well-Being",
    sdgColor: "#4C9F38",
    description: "Providing emergency first aid, medical triage, or health support in field, operational, or community settings.",
  },
  {
    id: "military_logistics",
    name: "Logistics and operational coordination",
    shortName: "Logistics coordination",
    category: "Community",
    group: "Military & Forces",
    proxy: "Hourly value of volunteering (Nicol Economics for Power to Change, 2020)",
    proxyYear: "2020",
    unit: "hour",
    unitLabel: "hours",
    friendlyQuestion: "How many hours did you spend on logistics planning and coordination?",
    defaultQuantity: 150,
    valuePerUnit: 15,
    sdg: "Decent Work and Economic Growth",
    sdgColor: "#A21942",
    description: "Planning, coordinating, and managing logistics, supplies, and operational resources to support teams and community projects.",
  },

  // ── Sport & Active ────────────────────────────────────────────────────────
  {
    id: "sport_coaching",
    name: "Volunteering as a sports coach or instructor",
    shortName: "Sports coaching",
    category: "Sport & Active",
    group: "Sport & Leisure",
    proxy: "Hourly value of volunteering (Nicol Economics for Power to Change, 2020)",
    proxyYear: "2020",
    unit: "hour",
    unitLabel: "hours",
    friendlyQuestion: "How many hours did you spend coaching or instructing sport this year?",
    defaultQuantity: 50,
    valuePerUnit: 15,
    sdg: "Good Health and Well-Being",
    sdgColor: "#4C9F38",
    description: "Coaching, instructing, or leading sport and physical activity sessions as a volunteer.",
  },
  {
    id: "sport_officiating",
    name: "Officiating at sporting events",
    shortName: "Sports officiating",
    category: "Sport & Active",
    group: "Sport & Leisure",
    proxy: "Hourly value of volunteering (Nicol Economics for Power to Change, 2020)",
    proxyYear: "2020",
    unit: "hour",
    unitLabel: "hours",
    friendlyQuestion: "How many hours did you spend officiating (refereeing, judging, marshalling) this year?",
    defaultQuantity: 20,
    valuePerUnit: 15,
    sdg: "Good Health and Well-Being",
    sdgColor: "#4C9F38",
    description: "Refereeing, judging, timekeeping, or marshalling at amateur or community sporting events.",
  },
  {
    id: "sport_admin",
    name: "Volunteering as a sports club administrator",
    shortName: "Sports club admin",
    category: "Sport & Active",
    group: "Sport & Leisure",
    proxy: "Hourly value of volunteering (Nicol Economics for Power to Change, 2020)",
    proxyYear: "2020",
    unit: "hour",
    unitLabel: "hours",
    friendlyQuestion: "How many hours did you spend on club administration and organising this year?",
    defaultQuantity: 30,
    valuePerUnit: 15,
    sdg: "Good Health and Well-Being",
    sdgColor: "#4C9F38",
    description: "Managing memberships, fixtures, finance, or communications for a sports club or team.",
  },
  {
    id: "sport_active_travel",
    name: "Leading walks, runs, or cycling groups",
    shortName: "Walk / run / ride leading",
    category: "Sport & Active",
    group: "Sport & Leisure",
    proxy: "Hourly value of volunteering (Nicol Economics for Power to Change, 2020)",
    proxyYear: "2020",
    unit: "hour",
    unitLabel: "hours",
    friendlyQuestion: "How many hours did you spend leading group walks, runs, or cycling sessions this year?",
    defaultQuantity: 24,
    valuePerUnit: 15,
    sdg: "Good Health and Well-Being",
    sdgColor: "#4C9F38",
    description: "Organising and leading group physical activity such as parkrun volunteering, cycling clubs, or guided walks.",
  },

  // ── Fundraising ───────────────────────────────────────────────────────────
  {
    id: "fundraising_events",
    name: "Organising or volunteering at fundraising events",
    shortName: "Fundraising events",
    category: "Fundraising",
    group: "Fundraising & Giving",
    proxy: "Hourly value of volunteering (Nicol Economics for Power to Change, 2020)",
    proxyYear: "2020",
    unit: "hour",
    unitLabel: "hours",
    friendlyQuestion: "How many hours did you spend organising or working at fundraising events this year?",
    defaultQuantity: 20,
    valuePerUnit: 15,
    sdg: "No Poverty",
    sdgColor: "#E5243B",
    description: "Planning, staffing, or supporting charity events — bake sales, sponsored runs, galas, auctions, and similar.",
  },
  {
    id: "fundraising_collection",
    name: "Collecting for charity (street, door-to-door, or online)",
    shortName: "Charity collection",
    category: "Fundraising",
    group: "Fundraising & Giving",
    proxy: "Hourly value of volunteering (Nicol Economics for Power to Change, 2020)",
    proxyYear: "2020",
    unit: "hour",
    unitLabel: "hours",
    friendlyQuestion: "How many hours did you spend collecting donations this year?",
    defaultQuantity: 10,
    valuePerUnit: 15,
    sdg: "No Poverty",
    sdgColor: "#E5243B",
    description: "Volunteering time to collect donations on behalf of a charity, in person or through online appeals.",
  },
  {
    id: "fundraising_challenge",
    name: "Taking part in a sponsored challenge event",
    shortName: "Sponsored challenge",
    category: "Fundraising",
    group: "Fundraising & Giving",
    proxy: "Hourly value of volunteering (Nicol Economics for Power to Change, 2020)",
    proxyYear: "2020",
    unit: "hour",
    unitLabel: "hours",
    friendlyQuestion: "How many hours did you spend training for and completing a sponsored challenge this year?",
    defaultQuantity: 40,
    valuePerUnit: 15,
    sdg: "No Poverty",
    sdgColor: "#E5243B",
    description: "Running a marathon, cycling a sportive, climbing a mountain, or completing another challenge to raise money for charity.",
  },

  // ── Mentoring ─────────────────────────────────────────────────────────────
  {
    id: "mentoring_youth",
    name: "Mentoring young people",
    shortName: "Youth mentoring",
    category: "Mentoring",
    group: "Mentoring & Coaching",
    proxy: "Hourly value of volunteering (Nicol Economics for Power to Change, 2020)",
    proxyYear: "2020",
    unit: "hour",
    unitLabel: "hours",
    friendlyQuestion: "How many hours did you spend mentoring young people this year?",
    defaultQuantity: 30,
    valuePerUnit: 15,
    sdg: "Quality Education",
    sdgColor: "#C5192D",
    description: "Providing one-to-one or small-group guidance to young people on careers, life skills, or personal development.",
  },
  {
    id: "mentoring_professional",
    name: "Professional or career mentoring",
    shortName: "Career mentoring",
    category: "Mentoring",
    group: "Mentoring & Coaching",
    proxy: "Hourly value of volunteering (Nicol Economics for Power to Change, 2020)",
    proxyYear: "2020",
    unit: "hour",
    unitLabel: "hours",
    friendlyQuestion: "How many hours did you spend mentoring colleagues, peers, or community members on their careers this year?",
    defaultQuantity: 20,
    valuePerUnit: 15,
    sdg: "Decent Work and Economic Growth",
    sdgColor: "#A21942",
    description: "Supporting others with career development, job searching, interview skills, or professional networking.",
  },
  {
    id: "mentoring_enterprise",
    name: "Business or enterprise mentoring",
    shortName: "Enterprise mentoring",
    category: "Mentoring",
    group: "Mentoring & Coaching",
    proxy: "Hourly value of volunteering (Nicol Economics for Power to Change, 2020)",
    proxyYear: "2020",
    unit: "hour",
    unitLabel: "hours",
    friendlyQuestion: "How many hours did you spend advising or mentoring entrepreneurs or small business owners this year?",
    defaultQuantity: 15,
    valuePerUnit: 15,
    sdg: "Decent Work and Economic Growth",
    sdgColor: "#A21942",
    description: "Advising start-ups, social enterprises, or small businesses as a volunteer mentor or business adviser.",
  },

  // ── Arts & Culture ────────────────────────────────────────────────────────
  {
    id: "arts_performance",
    name: "Volunteering for arts and cultural events",
    shortName: "Arts volunteering",
    category: "Arts & Culture",
    group: "Arts & Culture",
    proxy: "Hourly value of volunteering (Nicol Economics for Power to Change, 2020)",
    proxyYear: "2020",
    unit: "hour",
    unitLabel: "hours",
    friendlyQuestion: "How many hours did you volunteer at arts or cultural events this year?",
    defaultQuantity: 20,
    valuePerUnit: 15,
    sdg: "Sustainable Cities and Communities",
    sdgColor: "#F99D26",
    description: "Stewarding, front-of-house, or technical volunteering at theatres, music festivals, galleries, or cultural events.",
  },
  {
    id: "arts_heritage",
    name: "Preserving heritage and cultural sites",
    shortName: "Heritage volunteering",
    category: "Arts & Culture",
    group: "Arts & Culture",
    proxy: "Hourly value of volunteering (Nicol Economics for Power to Change, 2020)",
    proxyYear: "2020",
    unit: "hour",
    unitLabel: "hours",
    friendlyQuestion: "How many hours did you spend volunteering at heritage sites, museums, or archives this year?",
    defaultQuantity: 25,
    valuePerUnit: 15,
    sdg: "Sustainable Cities and Communities",
    sdgColor: "#F99D26",
    description: "Guiding, conservation work, archiving, or administration at museums, historic sites, or cultural organisations.",
  },
  {
    id: "arts_community_creative",
    name: "Leading community arts or creative workshops",
    shortName: "Community arts workshops",
    category: "Arts & Culture",
    group: "Arts & Culture",
    proxy: "Hourly value of volunteering (Nicol Economics for Power to Change, 2020)",
    proxyYear: "2020",
    unit: "hour",
    unitLabel: "hours",
    friendlyQuestion: "How many hours did you spend leading community art, craft, music, or creative sessions this year?",
    defaultQuantity: 24,
    valuePerUnit: 15,
    sdg: "Sustainable Cities and Communities",
    sdgColor: "#F99D26",
    description: "Running or facilitating workshops in painting, music, drama, writing, or crafts for community groups.",
  },

  // ── Animal Welfare ────────────────────────────────────────────────────────
  {
    id: "animal_shelter",
    name: "Volunteering at an animal shelter or rescue",
    shortName: "Animal shelter volunteering",
    category: "Animal Welfare",
    group: "Animal Welfare",
    proxy: "Hourly value of volunteering (Nicol Economics for Power to Change, 2020)",
    proxyYear: "2020",
    unit: "hour",
    unitLabel: "hours",
    friendlyQuestion: "How many hours did you volunteer at an animal shelter, rescue, or sanctuary this year?",
    defaultQuantity: 40,
    valuePerUnit: 15,
    sdg: "Life on Land",
    sdgColor: "#56C02B",
    description: "Caring for, exercising, or rehoming animals at a shelter, rescue centre, or sanctuary.",
  },
  {
    id: "animal_fostering",
    name: "Fostering animals",
    shortName: "Animal fostering",
    category: "Animal Welfare",
    group: "Animal Welfare",
    proxy: "Hourly value of volunteering (Nicol Economics for Power to Change, 2020)",
    proxyYear: "2020",
    unit: "hour",
    unitLabel: "hours",
    friendlyQuestion: "How many hours did you spend fostering animals this year?",
    defaultQuantity: 100,
    valuePerUnit: 15,
    sdg: "Life on Land",
    sdgColor: "#56C02B",
    description: "Providing temporary care for animals until they find permanent homes.",
  },
  {
    id: "animal_wildlife",
    name: "Wildlife conservation and habitat monitoring",
    shortName: "Wildlife conservation",
    category: "Animal Welfare",
    group: "Animal Welfare",
    proxy: "Hourly value of volunteering (Nicol Economics for Power to Change, 2020)",
    proxyYear: "2020",
    unit: "hour",
    unitLabel: "hours",
    friendlyQuestion: "How many hours did you spend on wildlife monitoring, conservation surveys, or habitat management this year?",
    defaultQuantity: 20,
    valuePerUnit: 15,
    sdg: "Life on Land",
    sdgColor: "#56C02B",
    description: "Citizen science surveys, wildlife monitoring, bird ringing, or habitat restoration for conservation organisations.",
  },

  // ── Emergency Response ────────────────────────────────────────────────────
  {
    id: "emergency_response_volunteer",
    name: "Emergency response volunteering",
    shortName: "Emergency response",
    category: "Emergency Response",
    group: "Emergency & Rescue",
    proxy: "Hourly value of volunteering (Nicol Economics for Power to Change, 2020)",
    proxyYear: "2020",
    unit: "hour",
    unitLabel: "hours",
    friendlyQuestion: "How many hours did you volunteer in emergency response activities this year?",
    defaultQuantity: 50,
    valuePerUnit: 15,
    sdg: "Good Health and Well-Being",
    sdgColor: "#4C9F38",
    description: "Volunteering with mountain rescue, flood response, coastguard, or other emergency response services.",
  },
  {
    id: "emergency_lifeboat",
    name: "Lifeboat crew or rescue boat volunteering",
    shortName: "Lifeboat volunteering",
    category: "Emergency Response",
    group: "Emergency & Rescue",
    proxy: "Hourly value of volunteering (Nicol Economics for Power to Change, 2020)",
    proxyYear: "2020",
    unit: "hour",
    unitLabel: "hours",
    friendlyQuestion: "How many hours did you spend on lifeboat or rescue boat duties this year?",
    defaultQuantity: 60,
    valuePerUnit: 15,
    sdg: "Good Health and Well-Being",
    sdgColor: "#4C9F38",
    description: "Crewing, training, or maintaining lifeboats and rescue vessels as a volunteer, including RNLI and independent services.",
  },
  {
    id: "emergency_civil_resilience",
    name: "Community emergency planning and resilience",
    shortName: "Community resilience",
    category: "Emergency Response",
    group: "Emergency & Rescue",
    proxy: "Hourly value of volunteering (Nicol Economics for Power to Change, 2020)",
    proxyYear: "2020",
    unit: "hour",
    unitLabel: "hours",
    friendlyQuestion: "How many hours did you spend on community resilience planning or preparedness activities this year?",
    defaultQuantity: 15,
    valuePerUnit: 15,
    sdg: "Sustainable Cities and Communities",
    sdgColor: "#F99D26",
    description: "Planning and preparing communities for emergencies — flood wardens, community emergency groups, or civil resilience volunteers.",
  },
];

export const CATEGORIES = [...new Set(ACTIVITIES.map((a) => a.category))].sort();
export const GROUPS = [...new Set(ACTIVITIES.map((a) => a.group))];

interface CustomActivityInput {
  activityId: string;
  name: string;
  quantity: number;
  hoursPerYear: number;
  valuePerUnit: number;
  unit: string;
  proxy: string;
  proxyYear: string;
  sdg: string;
  sdgColor: string;
}

/**
 * Activities valued per person (or child) supported over a year, and yearly
 * household habits. The web app keeps the same lists in
 * artifacts/my-impact/src/lib/one-off-logging.ts (a test checks they match).
 */
export const YEARLY_PER_PERSON_ACTIVITY_IDS: ReadonlySet<string> = new Set([
  "befriending",
  "helping_neighbours",
  "career_break_school_liaison",
  "coding_education_child",
  "mental_health_support",
  "literacy_support",
  "youth_mentoring",
  "elderly_visiting",
  "digital_coaching",
  "arts_volunteering",
  "tutoring",
  "veterans_breakfast",
  "sports_coaching",
]);
export const YEARLY_HOUSEHOLD_ACTIVITY_IDS: ReadonlySet<string> = new Set(["food_waste", "energy_saving"]);
/** Entry kinds that record a single occasion. */
export const ONE_OFF_KINDS: ReadonlySet<string> = new Set(["quick_log", "recurring_confirmation"]);

/** Volunteering time for one-off entries: the hourly proxy the hour-based activities use. */
export const ONE_OFF_HOURLY_VALUE = 15;
const ONE_OFF_HOURLY_PROXY =
  "Hourly value of volunteering, £15 an hour (a single occasion; the yearly value per person supported is counted in yearly estimates)";
const ALREADY_COUNTED = " (already counted for this household this year)";

/** How one standard activity was valued in a saved entry. */
export interface StoredActivityPricing {
  valuePerUnit: number;
  unit: string;
  unitLabel: string;
  proxy: string;
  proxyYear: string;
}

/**
 * The values a saved entry was calculated with. Proxies and the National
 * Living Wage change over time and a saved entry keeps its values, so
 * anything rebuilt from one (an organisation's copy of a shared report, a
 * corrected one-off entry) is valued the same way.
 */
export interface RecordPricing {
  /** Time contributed, £ an hour. */
  volunteerRate: number;
  /** Standard activities' stored valuations, by activity id. */
  activities: ReadonlyMap<string, StoredActivityPricing>;
}

/** A saved result's pricing. Anything it doesn't record is valued at today's values. */
export function pricingFromResult(resultJson: unknown): RecordPricing {
  const r = resultJson && typeof resultJson === "object" ? (resultJson as Record<string, unknown>) : {};
  const activities = new Map<string, StoredActivityPricing>();
  for (const b of Array.isArray(r.activityBreakdowns) ? r.activityBreakdowns : []) {
    if (!b || typeof b !== "object") continue;
    const x = b as Record<string, unknown>;
    const id = typeof x.activityId === "string" ? x.activityId : "";
    const valuePerUnit = Number(x.valuePerUnit);
    if (!ACTIVITIES.some((a) => a.id === id) || !(valuePerUnit > 0) || typeof x.unit !== "string") continue;
    const proxy = typeof x.proxy === "string" ? x.proxy : "";
    activities.set(id, {
      valuePerUnit,
      unit: x.unit,
      unitLabel: typeof x.unitLabel === "string" ? x.unitLabel : x.unit,
      proxy: proxy.endsWith(ALREADY_COUNTED) ? proxy.slice(0, -ALREADY_COUNTED.length) : proxy,
      proxyYear: typeof x.proxyYear === "string" ? x.proxyYear : "",
    });
  }
  return { volunteerRate: contributionRate(r), activities };
}

export interface ValuationOptions {
  /**
   * A single occasion (Quick Log, a regular activity's occurrence, an
   * emailed activity). Yearly per-person activities are then valued as
   * volunteering time, and yearly household habits count once a year.
   */
  oneOff?: boolean;
  /** Household habits already counted in a one-off entry this calendar year. */
  householdsCountedThisYear?: ReadonlySet<string>;
  /** Value with a saved entry's values, not today's (see pricingFromResult). */
  pricing?: RecordPricing;
}

/** What each of the four values means, shown under its tile. */
export const RESULT_EXPLANATIONS = {
  impact:
    "This is the direct social value created by your activities — calculated using Social Value Engine proxy values based on academic research and government data. Each activity is matched to a recognised outcome and multiplied by how much you did.",
  contribution:
    "This is the value of your time. Every hour you volunteer is worth the National Living Wage (£12.71/hr). This recognises that your time has real economic value when given freely to others.",
  donations:
    "The direct monetary value of the money you've donated to good causes over the last year. Every pound donated creates real change for charities and communities.",
  personalDevelopment:
    "Volunteering doesn't just help others — it builds your skills too. This reflects the employer-valued skills premium from your volunteering hours, based on NCVO's Time Well Spent research (2023), which found employers value volunteering experience at an average £1,500/year — equivalent to £15 per hour.",
};

export function calculateImpact(
  activities: Array<{ activityId: string; quantity: number; hoursPerYear: number }>,
  donationsGBP: number,
  additionalVolunteerHours: number,
  customActivities: CustomActivityInput[] = [],
  options: ValuationOptions = {},
) {
  // Clamp numeric inputs: treat NaN/negative as zero to prevent corrupted totals
  const safeDonations = Math.max(0, isNaN(donationsGBP) ? 0 : donationsGBP);
  const safeExtraHours = Math.max(0, isNaN(additionalVolunteerHours) ? 0 : additionalVolunteerHours);

  const volunteerRate = options.pricing?.volunteerRate ?? VOLUNTEER_RATE;

  // Hours of household habits already counted this year: not counted again.
  let uncountedHours = 0;
  const activityBreakdowns = activities
    .map((sel) => {
      const activity = ACTIVITIES.find((a) => a.id === sel.activityId);
      if (!activity) return null;

      const asTime = !!options.oneOff && YEARLY_PER_PERSON_ACTIVITY_IDS.has(activity.id);
      const alreadyCounted =
        !!options.oneOff &&
        YEARLY_HOUSEHOLD_ACTIVITY_IDS.has(activity.id) &&
        !!options.householdsCountedThisYear?.has(activity.id);
      if (alreadyCounted) uncountedHours += sel.hoursPerYear;

      // A saved entry's own values when given; a stored hourly value is the
      // rate its time was valued at.
      const stored = options.pricing?.activities.get(activity.id);
      const storedTime = stored?.unit === "hour" ? stored : undefined;
      const priced = asTime
        ? {
            valuePerUnit: storedTime?.valuePerUnit ?? ONE_OFF_HOURLY_VALUE,
            unit: "hour",
            unitLabel: "hours",
            proxy: storedTime?.proxy ?? ONE_OFF_HOURLY_PROXY,
            proxyYear: storedTime?.proxyYear ?? activity.proxyYear,
          }
        : (stored ?? activity);

      let impactValue: number;
      if (alreadyCounted) {
        impactValue = 0;
      } else if (priced.unit === "hour") {
        impactValue = sel.hoursPerYear * priced.valuePerUnit;
      } else {
        impactValue = sel.quantity * priced.valuePerUnit;
      }

      return {
        activityId: activity.id,
        activityName: activity.name,
        category: activity.category,
        proxy: alreadyCounted ? `${priced.proxy}${ALREADY_COUNTED}` : priced.proxy,
        proxyYear: priced.proxyYear,
        sdg: activity.sdg,
        sdgColor: activity.sdgColor,
        impactValue: Math.round(impactValue * 100) / 100,
        hours: alreadyCounted ? 0 : sel.hoursPerYear,
        quantity: asTime ? 1 : sel.quantity,
        valuePerUnit: priced.valuePerUnit,
        unit: priced.unit,
        unitLabel: priced.unitLabel,
      };
    })
    .filter(Boolean) as Array<{
    activityId: string;
    activityName: string;
    category: string;
    proxy: string;
    proxyYear: string;
    sdg: string;
    sdgColor: string;
    impactValue: number;
    hours: number;
    quantity: number;
    valuePerUnit: number;
    unit: string;
    unitLabel: string;
  }>;

  // Process custom activities (user-typed, with SVE proxy matched by AI)
  for (const ca of customActivities) {
    const impactValue =
      ca.unit === "hour"
        ? ca.hoursPerYear * ca.valuePerUnit
        : ca.quantity * ca.valuePerUnit;
    activityBreakdowns.push({
      activityId: ca.activityId,
      activityName: ca.name,
      category: "Custom",
      proxy: ca.proxy,
      proxyYear: ca.proxyYear,
      sdg: ca.sdg || "Good Health and Well-Being",
      sdgColor: ca.sdgColor || "#4C9F38",
      impactValue: Math.round(impactValue * 100) / 100,
      hours: ca.hoursPerYear,
      // Persist the raw pricing inputs alongside the computed value so the
      // History "edit" flow can rebuild the custom activity (and re-value it
      // identically) from the stored result. Older records lack these fields;
      // the client falls back to reconstructing from impactValue.
      quantity: ca.quantity,
      valuePerUnit: ca.valuePerUnit,
      unit: ca.unit,
      unitLabel: ca.unit,
    });
  }

  const totalActivityHours =
    activities.reduce((sum, a) => sum + a.hoursPerYear, 0) -
    uncountedHours +
    customActivities.reduce((sum, a) => sum + a.hoursPerYear, 0);
  const totalHours = totalActivityHours + safeExtraHours;

  const impactValue = activityBreakdowns.reduce((sum, a) => sum + a.impactValue, 0);
  const contributionValue = totalHours * volunteerRate;
  const donationsValue = safeDonations;
  const personalDevelopmentValue = totalHours * PERSONAL_DEV_RATE_PER_HOUR;
  const totalValue = impactValue + contributionValue + donationsValue + personalDevelopmentValue;

  const sdgMap = new Map<string, { sdg: string; sdgColor: string; value: number }>();
  for (const b of activityBreakdowns) {
    if (!sdgMap.has(b.sdg)) {
      sdgMap.set(b.sdg, { sdg: b.sdg, sdgColor: b.sdgColor, value: 0 });
    }
    sdgMap.get(b.sdg)!.value += b.impactValue;
  }
  const sdgBreakdowns = Array.from(sdgMap.values()).map((s) => ({
    ...s,
    value: Math.round(s.value * 100) / 100,
  }));

  return {
    totalValue: Math.round(totalValue * 100) / 100,
    impactValue: Math.round(impactValue * 100) / 100,
    contributionValue: Math.round(contributionValue * 100) / 100,
    donationsValue: Math.round(donationsValue * 100) / 100,
    personalDevelopmentValue: Math.round(personalDevelopmentValue * 100) / 100,
    totalHours,
    activityBreakdowns,
    sdgBreakdowns,
    explanations: RESULT_EXPLANATIONS,
  };
}
