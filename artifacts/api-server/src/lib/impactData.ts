export interface Activity {
  id: string;
  name: string;
  shortName: string;
  category: string;
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
  {
    id: "recycling",
    name: "Reducing household waste through recycling",
    shortName: "Recycling at home",
    category: "Environment",
    proxy: "Household savings from avoidable food waste (2015)",
    proxyYear: "2015",
    unit: "household",
    unitLabel: "Households",
    friendlyQuestion: "This counts for your household — just confirm you do this.",
    defaultQuantity: 1,
    valuePerUnit: 631.0,
    sdg: "Responsible Consumption and Production",
    sdgColor: "#BF8B2E",
    description: "Recycling paper, plastic, glass and other materials at home to reduce landfill.",
  },
  {
    id: "food_waste",
    name: "Reducing food waste at home",
    shortName: "Cutting food waste",
    category: "Environment",
    proxy: "Household savings from avoidable food waste (2015)",
    proxyYear: "2015",
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
    proxy: "Value per mile cycled rather than driven (2019)",
    proxyYear: "2019",
    unit: "mile_per_year",
    unitLabel: "miles",
    friendlyQuestion: "Roughly how many miles do you travel by foot or bike each year instead of driving?",
    defaultQuantity: 310,
    valuePerUnit: 0.09,
    sdg: "Sustainable Cities and Communities",
    sdgColor: "#F99D26",
    description: "Walking or cycling instead of driving or using public transport.",
  },
  {
    id: "tree_planting",
    name: "Tree planting and green space projects",
    shortName: "Planting trees",
    category: "Environment",
    proxy: "Average cumulative benefit over 50 years per tree planted (2018)",
    proxyYear: "2018",
    unit: "tree",
    unitLabel: "trees",
    friendlyQuestion: "How many trees have you helped plant this year?",
    defaultQuantity: 5,
    valuePerUnit: 1195.0,
    sdg: "Life on Land",
    sdgColor: "#56C02B",
    description: "Planting trees or maintaining green spaces in your local community.",
  },
  {
    id: "charity_books",
    name: "Donating books and clothes to charity shops",
    shortName: "Donating to charity shops",
    category: "Community",
    proxy: "Recycling - Charity Shop (2013)",
    proxyYear: "2013",
    unit: "bag",
    unitLabel: "bags",
    friendlyQuestion: "How many bags of books or clothes have you donated this year?",
    defaultQuantity: 4,
    valuePerUnit: 52.0,
    sdg: "Sustainable Cities and Communities",
    sdgColor: "#F99D26",
    description: "Donating reusable items to charity shops to support reuse and raise funds.",
  },
  {
    id: "food_bank",
    name: "Volunteering at a food bank",
    shortName: "Food bank volunteering",
    category: "Community",
    proxy: "Value of being supported by a food bank (2018)",
    proxyYear: "2018",
    unit: "session",
    unitLabel: "sessions",
    friendlyQuestion: "How many sessions do you volunteer at a food bank each year?",
    defaultQuantity: 12,
    valuePerUnit: 185.0,
    sdg: "Zero Hunger",
    sdgColor: "#DDA63A",
    description: "Sorting, packing and distributing food parcels to people in need.",
  },
  {
    id: "veterans_breakfast",
    name: "Volunteering at community social clubs",
    shortName: "Community social clubs",
    category: "Community",
    proxy: "Impact of loneliness on well-being",
    proxyYear: "",
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
    id: "youth_mentoring",
    name: "Mentoring young people",
    shortName: "Mentoring young people",
    category: "Education",
    proxy: "Improved self-esteem in mentoring",
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
    proxy: "Adult learning course that made someone more satisfied with their life overall (2012)",
    proxyYear: "2012",
    unit: "person",
    unitLabel: "people",
    friendlyQuestion: "How many people do you tutor or teach?",
    defaultQuantity: 3,
    valuePerUnit: 231.0,
    sdg: "Quality Education",
    sdgColor: "#C5192D",
    description: "Helping others learn new skills through informal tutoring or coaching.",
  },
  {
    id: "fundraising",
    name: "Fundraising for charities",
    shortName: "Fundraising",
    category: "Community",
    proxy: "Improved reputation of organisation/charity (2016)",
    proxyYear: "2016",
    unit: "event",
    unitLabel: "events",
    friendlyQuestion: "How many fundraising events have you organised or taken part in?",
    defaultQuantity: 2,
    valuePerUnit: 185.0,
    sdg: "Reduced Inequalities",
    sdgColor: "#DD1367",
    description: "Organising or taking part in sponsored events, charity runs, or other fundraising.",
  },
  {
    id: "community_garden",
    name: "Community garden or allotment volunteering",
    shortName: "Community gardening",
    category: "Environment",
    proxy: "Ref 4.13 – Voluntary time for green infrastructure/biodiversity/green-space upkeep",
    proxyYear: "",
    unit: "hour",
    unitLabel: "hours",
    friendlyQuestion: "How many hours do you spend on community gardening or allotment work each year?",
    defaultQuantity: 50,
    valuePerUnit: 14.43,
    sdg: "Life on Land",
    sdgColor: "#56C02B",
    description: "Tending community gardens or allotments to produce food and create green spaces.",
  },
  {
    id: "blood_donation",
    name: "Donating blood",
    shortName: "Blood donation",
    category: "Health",
    proxy: "Value of blood donation to NHS",
    proxyYear: "",
    unit: "donation",
    unitLabel: "donations",
    friendlyQuestion: "How many times do you donate blood each year?",
    defaultQuantity: 3,
    valuePerUnit: 120.0,
    sdg: "Good Health and Well-Being",
    sdgColor: "#4C9F38",
    description: "Regularly donating blood to help save lives and support the NHS.",
  },
  {
    id: "mental_health_support",
    name: "Supporting mental health as a volunteer",
    shortName: "Mental health support",
    category: "Health",
    proxy: "Average unit cost to the NHS of treating someone with depression (2024)",
    proxyYear: "2024",
    unit: "person",
    unitLabel: "people",
    friendlyQuestion: "How many people do you support with their mental health?",
    defaultQuantity: 2,
    valuePerUnit: 2856.0,
    sdg: "Good Health and Well-Being",
    sdgColor: "#4C9F38",
    description: "Volunteering with mental health organisations, crisis lines or peer support groups.",
  },
  {
    id: "sports_coaching",
    name: "Coaching or organising community sports",
    shortName: "Sports coaching",
    category: "Community",
    proxy: "Contribution of sport to wellbeing (2015)",
    proxyYear: "2015",
    unit: "participant",
    unitLabel: "people",
    friendlyQuestion: "How many people do you help get active through coaching or organising sport?",
    defaultQuantity: 10,
    valuePerUnit: 50.0,
    sdg: "Good Health and Well-Being",
    sdgColor: "#4C9F38",
    description: "Coaching, refereeing or organising community sports clubs and events.",
  },
  {
    id: "elderly_visiting",
    name: "Visiting elderly or isolated people",
    shortName: "Visiting isolated people",
    category: "Community",
    proxy: "Cost of loneliness (2015)",
    proxyYear: "2015",
    unit: "person",
    unitLabel: "people",
    friendlyQuestion: "How many people do you visit or check in on regularly?",
    defaultQuantity: 2,
    valuePerUnit: 763.0,
    sdg: "Good Health and Well-Being",
    sdgColor: "#4C9F38",
    description: "Regularly visiting elderly or isolated individuals to provide companionship.",
  },
  {
    id: "energy_saving",
    name: "Reducing home energy use",
    shortName: "Cutting home energy use",
    category: "Environment",
    proxy: "Energy savings from having floor insulation (soft furnishings)",
    proxyYear: "",
    unit: "household",
    unitLabel: "Households",
    friendlyQuestion: "This counts for your household — just confirm you do this.",
    defaultQuantity: 1,
    valuePerUnit: 75.0,
    sdg: "Affordable and Clean Energy",
    sdgColor: "#FCC30B",
    description: "Reducing energy consumption at home through efficiency measures or renewable energy.",
  },
  {
    id: "charity_volunteering",
    name: "General volunteering for a charity",
    shortName: "Charity volunteering",
    category: "Community",
    proxy: "Number of voluntary hours donated to support VCSEs",
    proxyYear: "",
    unit: "hour",
    unitLabel: "hours",
    friendlyQuestion: "How many hours do you give to charity volunteering each year?",
    defaultQuantity: 40,
    valuePerUnit: 17.0,
    sdg: "Reduced Inequalities",
    sdgColor: "#DD1367",
    description: "Regular volunteering time for any registered charity or community organisation.",
  },
  {
    id: "wildlife_conservation",
    name: "Wildlife or nature conservation volunteering",
    shortName: "Wildlife conservation",
    category: "Environment",
    proxy: "Ref 4.13 – Voluntary time for green infrastructure/biodiversity/green-space upkeep",
    proxyYear: "",
    unit: "hour",
    unitLabel: "hours",
    friendlyQuestion: "How many hours do you give to conservation work each year?",
    defaultQuantity: 20,
    valuePerUnit: 14.43,
    sdg: "Life on Land",
    sdgColor: "#56C02B",
    description: "Wildlife surveys, habitat management, or nature reserve volunteering.",
  },
  {
    id: "disaster_relief",
    name: "Disaster relief or emergency volunteering",
    shortName: "Emergency volunteering",
    category: "Community",
    proxy: "Number of voluntary hours donated to support VCSEs",
    proxyYear: "",
    unit: "hour",
    unitLabel: "hours",
    friendlyQuestion: "How many hours do you give to emergency or disaster relief volunteering each year?",
    defaultQuantity: 20,
    valuePerUnit: 17.0,
    sdg: "Sustainable Cities and Communities",
    sdgColor: "#F99D26",
    description: "Volunteering to support emergency services or community resilience during crises.",
  },
  {
    id: "rspb_donation",
    name: "Supporting wildlife charities (RSPB/WWF etc.)",
    shortName: "Supporting wildlife charities",
    category: "Environment",
    proxy: "Value of biodiversity conservation",
    proxyYear: "",
    unit: "membership_year",
    unitLabel: "years",
    friendlyQuestion: "How many years have you supported a wildlife charity like RSPB or WWF?",
    defaultQuantity: 1,
    valuePerUnit: 85.0,
    sdg: "Life on Land",
    sdgColor: "#56C02B",
    description: "Supporting wildlife or environmental charities through membership or donations.",
  },
];

export const CATEGORIES = [...new Set(ACTIVITIES.map((a) => a.category))].sort();

export function calculateImpact(
  activities: Array<{ activityId: string; quantity: number; hoursPerYear: number }>,
  donationsGBP: number,
  additionalVolunteerHours: number
) {
  const VOLUNTEER_RATE = 12.21;
  const PERSONAL_DEV_RATE_PERCENT = 0.001333;

  const activityBreakdowns = activities
    .map((sel) => {
      const activity = ACTIVITIES.find((a) => a.id === sel.activityId);
      if (!activity) return null;

      let impactValue = 0;
      if (activity.unit === "hour") {
        impactValue = sel.hoursPerYear * activity.valuePerUnit;
      } else {
        impactValue = sel.quantity * activity.valuePerUnit;
      }

      return {
        activityId: activity.id,
        activityName: activity.name,
        category: activity.category,
        proxy: activity.proxy,
        proxyYear: activity.proxyYear,
        sdg: activity.sdg,
        sdgColor: activity.sdgColor,
        impactValue: Math.round(impactValue * 100) / 100,
        hours: sel.hoursPerYear,
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
  }>;

  const totalActivityHours = activities.reduce((sum, a) => sum + a.hoursPerYear, 0);
  const totalHours = totalActivityHours + additionalVolunteerHours;

  const impactValue = activityBreakdowns.reduce((sum, a) => sum + a.impactValue, 0);
  const contributionValue = totalHours * VOLUNTEER_RATE;
  const donationsValue = donationsGBP;
  const personalDevelopmentValue = totalHours * (totalHours * PERSONAL_DEV_RATE_PERCENT * VOLUNTEER_RATE);
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
    explanations: {
      impact:
        "This is the direct social value created by your activities — calculated using Social Value Engine proxy values based on academic research and government data. Each activity is matched to a recognised outcome and multiplied by how much you did.",
      contribution:
        "This is the value of your time. Every hour you volunteer is worth the National Living Wage (£12.21/hr). This recognises that your time has real economic value when given freely to others.",
      donations:
        "The direct monetary value of the money you've donated to good causes over the last year. Every pound donated creates real change for charities and communities.",
      personalDevelopment:
        "Volunteering doesn't just help others — it builds your skills too. This reflects the learning value gained through your volunteering hours, including communication, leadership, and teamwork skills.",
    },
  };
}
