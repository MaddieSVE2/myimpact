import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Building2, Users, BarChart2, Shield, CheckCircle, ArrowLeft, FileText, Award, Briefcase } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const VALID_TYPES = ["charity", "corporate", "education", "public", "other"] as const;
type OrgType = typeof VALID_TYPES[number] | "";

const isEducation = (type: OrgType) => type === "education";

function getTypeFromUrl(): OrgType {
  try {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("type") ?? "";
    if ((VALID_TYPES as readonly string[]).includes(t)) {
      return t as OrgType;
    }
  } catch {
  }
  return "";
}

function getFeatureCards(type: OrgType) {
  if (isEducation(type)) {
    return [
      {
        icon: BarChart2,
        title: "Aggregated anonymous dashboard",
        desc: "See total social value, volunteering hours, and activity breakdown across your student body. No individual names — just collective graduate outcomes.",
      },
      {
        icon: Users,
        title: "Students join with an invite code",
        desc: "Once set up, share a simple code with your students. They connect their My Impact account and their activity data feeds into your dashboard automatically.",
      },
      {
        icon: Shield,
        title: "Privacy built in",
        desc: "Students choose to join. Journal entries and personal notes are never shared. Data is anonymised — your dashboard shows totals, not individuals.",
      },
      {
        icon: CheckCircle,
        title: "Ready for reporting",
        desc: "Use your dashboard data for UCAS performance evidence, graduate outcomes reporting, employability portfolio analysis, or accreditation returns.",
      },
    ];
  }
  return [
    {
      icon: BarChart2,
      title: "Aggregated anonymous dashboard",
      desc: "See total social value, volunteer hours, and activity breakdown across your organisation. No individual names, just collective impact.",
    },
    {
      icon: Users,
      title: "Members join with an invite code",
      desc: "Once set up, you share a simple code with your members. They connect their My Impact account and their activity data feeds into your dashboard.",
    },
    {
      icon: Shield,
      title: "Privacy built in",
      desc: "Members choose to join. Journal entries and personal notes are never shared. Data is anonymised: your dashboard shows totals, not individuals.",
    },
    {
      icon: CheckCircle,
      title: "Ready for reporting",
      desc: "Use your dashboard data for funding bids, annual reports, commissioner evidence, or SROI analysis with Social Value Engine.",
    },
  ];
}

function getHowItWorksSteps(type: OrgType) {
  if (isEducation(type)) {
    return [
      "Register below; we review your request within 2 working days",
      "We create your institution and send you a unique invite code",
      "Share the code with your students — they join via their My Impact account",
      "Your dashboard updates as students log their activities. No extra staff workload.",
    ];
  }
  return [
    "Register below; we review your request within 2 working days",
    "We create your organisation and send you a unique invite code",
    "Share the code with your members. They join via their My Impact account",
    "Your dashboard updates as members log their activities",
  ];
}

function DemoLink({ type }: { type: OrgType }) {
  if (type === "") {
    return (
      <div className="flex flex-col items-center gap-1 pt-1">
        <p className="text-xs text-muted-foreground mb-1">View an example dashboard:</p>
        <div className="flex gap-4">
          <Link
            href="/org/demo"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            Charity example →
          </Link>
          <Link
            href="/org/demo/education"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            Education example →
          </Link>
        </div>
      </div>
    );
  }
  const href = isEducation(type) ? "/org/demo/education" : "/org/demo";
  const label = isEducation(type)
    ? "View example education dashboard →"
    : "View example charity dashboard →";
  return (
    <div className="flex justify-center pt-1">
      <Link
        href={href}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
      >
        {label}
      </Link>
    </div>
  );
}

function WhatMembersSeeCallout({ type }: { type: OrgType }) {
  const isEdu = isEducation(type);
  const memberLabel = isEdu ? "student" : "volunteer";
  const memberLabelPlural = isEdu ? "students" : "volunteers";
  const evidenceLabel = isEdu
    ? "UCAS portfolio, employability statement, or graduate outcomes evidence"
    : "CV-ready evidence pack or reference alternative";
  const testimonial = isEdu
    ? "Duke of Edinburgh, society treasurer, peer tutoring — all calculated into a verified social value figure they can put on any application."
    : "Food bank shifts, youth mentoring, community garden — all calculated into a verified social value figure that speaks louder than any reference.";

  return (
    <div className="bg-white border border-border rounded-xl p-5 mb-6">
      <div className="flex items-center gap-2 mb-3">
        <div className="shrink-0 w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
          {isEdu ? (
            <Award className="w-4 h-4 text-green-600" />
          ) : (
            <Briefcase className="w-4 h-4 text-green-600" />
          )}
        </div>
        <p className="text-sm font-semibold text-foreground">What your {memberLabelPlural} see</p>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed mb-3">
        Every {memberLabel} who joins your organisation gets their own personal My Impact record — a
        calculated social value figure, skill evidence, and a portable results page they can use as{" "}
        {evidenceLabel}.
      </p>
      <div className="bg-muted/30 rounded-lg p-3 mb-3">
        <div className="flex items-start gap-2">
          <FileText className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <p className="text-xs text-foreground leading-relaxed italic">
            "{testimonial}"
          </p>
        </div>
      </div>
      <p className="text-xs font-semibold text-primary">
        Better than a reference letter — because it shows, not just tells.
      </p>
    </div>
  );
}

export default function OrgRegister() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const [step, setStep] = useState<"info" | "form" | "done">("info");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<{
    orgName: string;
    type: OrgType;
    contactName: string;
    contactEmail: string;
    size: string;
    purpose: string;
  }>({
    orgName: "",
    type: "",
    contactName: "",
    contactEmail: "",
    size: "",
    purpose: "",
  });

  useEffect(() => {
    const urlType = getTypeFromUrl();
    if (urlType) {
      setForm(f => ({ ...f, type: urlType }));
    }
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value } = e.target;
    if (name === "type") {
      setForm(f => ({ ...f, type: value as OrgType }));
    } else {
      setForm(f => ({ ...f, [name]: value }));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${BASE}/api/org/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      setStep("done");
    } catch {
      setError("Could not connect. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const edu = isEducation(form.type);
  const memberLabel = edu ? "students" : "members";
  const featureCards = getFeatureCards(form.type);
  const howItWorks = getHowItWorksSteps(form.type);

  if (step === "done") {
    return (
      <div className="min-h-screen bg-muted/20 flex items-center justify-center px-4 py-16">
        <div className="max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="text-2xl font-display font-bold text-foreground mb-3">Request sent</h1>
          <p className="text-sm text-muted-foreground leading-relaxed mb-8">
            Thanks for registering your interest. We'll review your request and be in touch at{" "}
            <strong>{form.contactEmail}</strong> within 2 working days with your invite code and setup instructions.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            Back to home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/20">
      <div className="max-w-2xl mx-auto px-4 py-10">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to home
        </Link>

        {step === "info" && (
          <>
            <div className="mb-8">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-semibold mb-4">
                <Building2 className="w-3.5 h-3.5" /> For organisations
              </div>
              <h1 className="text-3xl font-display font-bold text-foreground mb-3 leading-tight">
                {edu
                  ? "Evidence the employability journey of every student"
                  : "Measure the social value your people create"}
              </h1>
              <p className="text-base text-muted-foreground leading-relaxed">
                {edu
                  ? "My Impact gives your institution an aggregated, anonymised dashboard showing the collective social value and employability evidence generated by your students — without tracking individuals."
                  : "My Impact gives your organisation an aggregated, anonymised dashboard showing the collective social value generated by your members, without tracking individuals."}
              </p>
            </div>

            <div className="mb-5">
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Select your organisation type to see relevant information</label>
              <select
                value={form.type}
                onChange={e => setForm(f => ({ ...f, type: e.target.value as OrgType }))}
                className="w-full px-3 py-2.5 rounded-lg border border-border text-sm focus:outline-none focus:border-primary bg-white"
              >
                <option value="">Select your organisation type…</option>
                <option value="charity">Charity / voluntary sector</option>
                <option value="corporate">Corporate / business</option>
                <option value="education">School / college / university</option>
                <option value="public">Local authority / public sector</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div className="grid gap-4 mb-8">
              {featureCards.map(({ icon: Icon, title, desc }) => (
                <div key={title} className="bg-white border border-border rounded-xl p-5 flex gap-4">
                  <div className="shrink-0 w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Icon className="w-4.5 h-4.5 text-primary" style={{ width: 18, height: 18 }} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground mb-1">{title}</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {edu && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6 flex gap-3">
                <CheckCircle className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-green-800 mb-1">No extra staff workload</p>
                  <p className="text-xs text-green-700 leading-relaxed">
                    Students self-document their own activities and skills. Your dashboard populates automatically — no manual data entry, no spreadsheets, no chasing students for evidence.
                  </p>
                </div>
              </div>
            )}

            <WhatMembersSeeCallout type={form.type} />

            <div className="bg-primary/5 border border-primary/20 rounded-xl p-5 mb-6">
              <p className="text-sm font-semibold text-foreground mb-1">How it works</p>
              <ol className="text-xs text-muted-foreground space-y-2 mt-2">
                {howItWorks.map((step, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="shrink-0 w-5 h-5 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center">{i + 1}</span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>

            <button
              onClick={() => setStep("form")}
              className="w-full py-3 rounded-xl bg-primary text-white font-semibold text-sm hover:bg-primary/90 transition-colors mb-2"
            >
              Register your organisation →
            </button>

            <DemoLink type={form.type} />
          </>
        )}

        {step === "form" && (
          <>
            <div className="mb-6">
              <button
                onClick={() => setStep("info")}
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
              <h1 className="text-2xl font-display font-bold text-foreground mb-1">Register your organisation</h1>
              <p className="text-sm text-muted-foreground">We'll review your request and be in touch within 2 working days.</p>
            </div>

            <form onSubmit={handleSubmit} className="bg-white border border-border rounded-xl p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Organisation name <span className="text-red-500">*</span></label>
                <input
                  name="orgName"
                  value={form.orgName}
                  onChange={handleChange}
                  required
                  placeholder={edu ? "e.g. Northfield University" : "e.g. Riverside Youth Trust"}
                  className="w-full px-3 py-2.5 rounded-lg border border-border text-sm focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Organisation type <span className="text-red-500">*</span></label>
                <select
                  name="type"
                  value={form.type}
                  onChange={handleChange}
                  required
                  className="w-full px-3 py-2.5 rounded-lg border border-border text-sm focus:outline-none focus:border-primary bg-white"
                >
                  <option value="" disabled>Select your organisation type…</option>
                  <option value="charity">Charity / voluntary sector</option>
                  <option value="corporate">Corporate / business</option>
                  <option value="education">School / college / university</option>
                  <option value="public">Local authority / public sector</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Your name <span className="text-red-500">*</span></label>
                  <input
                    name="contactName"
                    value={form.contactName}
                    onChange={handleChange}
                    required
                    placeholder="First and last name"
                    className="w-full px-3 py-2.5 rounded-lg border border-border text-sm focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Your email <span className="text-red-500">*</span></label>
                  <input
                    name="contactEmail"
                    type="email"
                    value={form.contactEmail}
                    onChange={handleChange}
                    required
                    placeholder="you@organisation.org"
                    className="w-full px-3 py-2.5 rounded-lg border border-border text-sm focus:outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Approximate number of {memberLabel}</label>
                <select
                  name="size"
                  value={form.size}
                  onChange={handleChange}
                  className="w-full px-3 py-2.5 rounded-lg border border-border text-sm focus:outline-none focus:border-primary bg-white"
                >
                  <option value="">Select a range</option>
                  <option value="1–10">1–10</option>
                  <option value="11–50">11–50</option>
                  <option value="51–200">51–200</option>
                  <option value="201–500">201–500</option>
                  <option value="500+">500+</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">How do you plan to use My Impact?</label>
                <textarea
                  name="purpose"
                  value={form.purpose}
                  onChange={handleChange}
                  rows={3}
                  placeholder={
                    edu
                      ? "e.g. Evidencing student employability portfolios, improving UCAS outcomes data, tracking student engagement with extracurricular activities..."
                      : "e.g. Tracking volunteer impact for annual report, evidencing outcomes for funders..."
                  }
                  className="w-full px-3 py-2.5 rounded-lg border border-border text-sm focus:outline-none focus:border-primary resize-none"
                />
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 rounded-xl bg-primary text-white font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-60"
              >
                {submitting ? "Sending..." : "Submit registration request"}
              </button>

              <p className="text-xs text-muted-foreground text-center">
                We'll review your request and reply within 2 working days.
              </p>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
