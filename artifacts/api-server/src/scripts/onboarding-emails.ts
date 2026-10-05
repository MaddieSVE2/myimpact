/** Onboarding emails by hand. Normally run hourly by the scheduler; see SCHEDULING.md. */
import { runOnboardingEmails } from "../jobs/onboardingEmails.js";
import { runCli } from "./_cli.js";

runCli("onboarding-emails", () => runOnboardingEmails());
