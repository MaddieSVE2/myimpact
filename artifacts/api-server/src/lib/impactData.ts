export interface Activity {
  id: string;
  name: string;
  category: string;
  proxy: string;
  proxyYear: string;
  unit: string;
  unitLabel: string;
  valuePerUnit: number;
  sdg: string;
  sdgColor: string;
  description: string;
}

export const ACTIVITIES: Activity[] = [
  {
    id: "recycling",
    name: "Reducing household waste through recycling",
    category: "Environment",
    proxy: "Cost saved by reducing food waste",
    proxyYear: "2013",
    unit: "household",
    unitLabel: "Number of households",
    valuePerUnit: 145.0,
    sdg: "Responsible Consumption and Production",
    sdgColor: "#BF8B2E",
    description: "Recycling paper, plastic, glass and other materials at home to reduce landfill and environmental impact.",
  },
  {
    id: "food_waste",
    name: "Reducing food waste at home",
    category: "Environment",
    proxy: "Cost saved by reducing food waste",
    proxyYear: "2013",
    unit: "household",
    unitLabel: "Number of households",
    valuePerUnit: 290.0,
    sdg: "Responsible Consumption and Production",
    sdgColor: "#BF8B2E",
    description: "Actively reducing food waste by meal planning, composting, and using leftovers.",
  },
  {
    id: "eco_transport",
    name: "Using sustainable transport (cycling/walking)",
    category: "Environment",
    proxy: "Carbon reduction from modal shift",
    proxyYear: "2020",
    unit: "km_per_year",
    unitLabel: "Kilometres per year",
    valuePerUnit: 0.35,
    sdg: "Sustainable Cities and Communities",
    sdgColor: "#F99D26",
    description: "Choosing to walk or cycle instead of driving or using public transport for regular journeys.",
  },
  {
    id: "tree_planting",
    name: "Tree planting and green space projects",
    category: "Environment",
    proxy: "Value of urban trees",
    proxyYear: "2019",
    unit: "tree",
    unitLabel: "Number of trees planted",
    valuePerUnit: 75.0,
    sdg: "Life on Land",
    sdgColor: "#56C02B",
    description: "Participating in tree planting initiatives or maintaining green spaces in your community.",
  },
  {
    id: "charity_books",
    name: "Donating books and clothes to charity shops",
    category: "Community",
    proxy: "Improved reputation of organisation/charity",
    proxyYear: "2016",
    unit: "bag",
    unitLabel: "Number of bags donated",
    valuePerUnit: 52.0,
    sdg: "Sustainable Cities and Communities",
    sdgColor: "#F99D26",
    description: "Donating reusable items to charity shops to support reuse and raise funds for good causes.",
  },
  {
    id: "food_bank",
    name: "Volunteering at a food bank",
    category: "Community",
    proxy: "Impact of loneliness on well-being",
    proxyYear: "2021",
    unit: "session",
    unitLabel: "Number of sessions volunteered",
    valuePerUnit: 38.5,
    sdg: "Zero Hunger",
    sdgColor: "#DDA63A",
    description: "Helping sort, pack and distribute food parcels to people and families in need.",
  },
  {
    id: "veterans_breakfast",
    name: "Supporting veterans through breakfast clubs",
    category: "Community",
    proxy: "Impact of loneliness on well-being",
    proxyYear: "2021",
    unit: "session",
    unitLabel: "Number of sessions volunteered",
    valuePerUnit: 45.0,
    sdg: "Good Health and Well-Being",
    sdgColor: "#4C9F38",
    description: "Volunteering at breakfast or social clubs for veterans to improve their social connection and mental wellbeing.",
  },
  {
    id: "youth_mentoring",
    name: "Mentoring young people",
    category: "Education",
    proxy: "Value of mentoring for young people",
    proxyYear: "2018",
    unit: "young_person",
    unitLabel: "Number of young people mentored",
    valuePerUnit: 1250.0,
    sdg: "Quality Education",
    sdgColor: "#C5192D",
    description: "Providing guidance, support and encouragement to young people to help them reach their potential.",
  },
  {
    id: "tutoring",
    name: "Tutoring or teaching skills",
    category: "Education",
    proxy: "Value of adult skills training",
    proxyYear: "2019",
    unit: "person",
    unitLabel: "Number of people tutored",
    valuePerUnit: 320.0,
    sdg: "Quality Education",
    sdgColor: "#C5192D",
    description: "Helping others learn new skills or academic subjects through informal tutoring or coaching.",
  },
  {
    id: "fundraising",
    name: "Fundraising for charities",
    category: "Community",
    proxy: "Improved reputation of organisation/charity",
    proxyYear: "2016",
    unit: "event",
    unitLabel: "Number of fundraising events",
    valuePerUnit: 185.0,
    sdg: "Reduced Inequalities",
    sdgColor: "#DD1367",
    description: "Organising or participating in sponsored events, charity runs, or other fundraising activities.",
  },
  {
    id: "community_garden",
    name: "Community garden or allotment volunteering",
    category: "Environment",
    proxy: "Value of urban green space",
    proxyYear: "2018",
    unit: "hour",
    unitLabel: "Hours per year",
    valuePerUnit: 8.5,
    sdg: "Life on Land",
    sdgColor: "#56C02B",
    description: "Tending to community gardens or allotments to produce food and create green spaces.",
  },
  {
    id: "blood_donation",
    name: "Donating blood",
    category: "Health",
    proxy: "Value of blood donation to NHS",
    proxyYear: "2020",
    unit: "donation",
    unitLabel: "Number of donations",
    valuePerUnit: 120.0,
    sdg: "Good Health and Well-Being",
    sdgColor: "#4C9F38",
    description: "Regularly donating blood to help save lives and support the NHS blood supply.",
  },
  {
    id: "mental_health_support",
    name: "Supporting mental health as a volunteer",
    category: "Health",
    proxy: "Impact of loneliness on well-being",
    proxyYear: "2021",
    unit: "person",
    unitLabel: "Number of people supported",
    valuePerUnit: 890.0,
    sdg: "Good Health and Well-Being",
    sdgColor: "#4C9F38",
    description: "Volunteering with mental health organisations, crisis lines or peer support groups.",
  },
  {
    id: "sports_coaching",
    name: "Coaching or organising community sports",
    category: "Community",
    proxy: "Value of physical activity on well-being",
    proxyYear: "2019",
    unit: "participant",
    unitLabel: "Number of participants",
    valuePerUnit: 215.0,
    sdg: "Good Health and Well-Being",
    sdgColor: "#4C9F38",
    description: "Coaching, refereeing or organising community sports clubs and events for others.",
  },
  {
    id: "elderly_visiting",
    name: "Visiting elderly or isolated people",
    category: "Community",
    proxy: "Impact of loneliness on well-being",
    proxyYear: "2021",
    unit: "person",
    unitLabel: "Number of people visited regularly",
    valuePerUnit: 1100.0,
    sdg: "Good Health and Well-Being",
    sdgColor: "#4C9F38",
    description: "Regularly visiting elderly or isolated individuals to provide companionship and reduce loneliness.",
  },
  {
    id: "energy_saving",
    name: "Reducing home energy use",
    category: "Environment",
    proxy: "Carbon reduction from energy efficiency",
    proxyYear: "2022",
    unit: "household",
    unitLabel: "Number of households",
    valuePerUnit: 195.0,
    sdg: "Affordable and Clean Energy",
    sdgColor: "#FCC30B",
    description: "Actively reducing energy consumption at home through efficiency measures, insulation, or renewable energy.",
  },
  {
    id: "charity_volunteering",
    name: "General volunteering for a charity",
    category: "Community",
    proxy: "Improved reputation of organisation/charity",
    proxyYear: "2016",
    unit: "hour",
    unitLabel: "Hours per year",
    valuePerUnit: 12.2,
    sdg: "Reduced Inequalities",
    sdgColor: "#DD1367",
    description: "Regular volunteering time for any registered charity or community organisation.",
  },
  {
    id: "wildlife_conservation",
    name: "Wildlife or nature conservation volunteering",
    category: "Environment",
    proxy: "Value of biodiversity conservation",
    proxyYear: "2019",
    unit: "hour",
    unitLabel: "Hours per year",
    valuePerUnit: 15.0,
    sdg: "Life on Land",
    sdgColor: "#56C02B",
    description: "Participating in wildlife surveys, habitat management, or nature reserve volunteering.",
  },
  {
    id: "disaster_relief",
    name: "Disaster relief or emergency volunteering",
    category: "Community",
    proxy: "Value of emergency response volunteering",
    proxyYear: "2020",
    unit: "hour",
    unitLabel: "Hours per year",
    valuePerUnit: 25.0,
    sdg: "Sustainable Cities and Communities",
    sdgColor: "#F99D26",
    description: "Volunteering to support emergency services, flood relief, or community resilience during crises.",
  },
  {
    id: "rspb_donation",
    name: "Supporting wildlife charities (RSPB/WWF etc.)",
    category: "Environment",
    proxy: "Value of biodiversity conservation",
    proxyYear: "2019",
    unit: "membership_year",
    unitLabel: "Years of membership/support",
    valuePerUnit: 85.0,
    sdg: "Life on Land",
    sdgColor: "#56C02B",
    description: "Supporting wildlife or environmental charities through membership, donations, or fundraising.",
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
