import type { ComponentType } from "react";
import { renderToString } from "react-dom/server";
import { Router } from "wouter";
import { HelmetProvider } from "react-helmet-async";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth-context";
import { ThemeProvider } from "@/lib/theme-context";
import { WizardProvider } from "@/lib/wizard-context";
import { SidekickProvider } from "@/lib/sidekick-context";
import { SocialSharingProvider } from "@/lib/social-sharing-context";
import { FeedbackProvider } from "@/lib/feedback-context";
import { LocaleProvider } from "@/i18n";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import Intro from "@/pages/Intro";
import About from "@/pages/About";
import Methodology from "@/pages/Methodology";
import WhatsNew from "@/pages/WhatsNew";
import Contact from "@/pages/Contact";
import Organisations from "@/pages/Organisations";
import OrgDemoPage from "@/pages/OrgDemoPage";
import OrgRegister from "@/pages/OrgRegister";
import OrgTypeExplicitSubmission from "@/pages/OrgTypeExplicitSubmission";
import OrgTypeConsentedLogging from "@/pages/OrgTypeConsentedLogging";
import Suggestions from "@/pages/Suggestions";
import NotFound from "@/pages/not-found";
import PublicProfile, { type PublicProfileResponse } from "@/pages/PublicProfile";
import OrgSharePage, { type ShareResponse } from "@/pages/OrgSharePage";

const PUBLIC_PAGES: Record<string, ComponentType> = {
  "/": Intro,
  "/about": About,
  "/methodology": Methodology,
  "/whats-new": WhatsNew,
  "/contact": Contact,
  "/organisations": Organisations,
  "/org/demo": OrgDemoPage,
  "/org/register": OrgRegister,
  "/org/types/explicit-submission": OrgTypeExplicitSubmission,
  "/org/types/consented-logging": OrgTypeConsentedLogging,
  "/suggestions": Suggestions,
  "/404": NotFound,
};

export function render(path: string): string {
  const Page = PUBLIC_PAGES[path];
  if (!Page) throw new Error(`No public page component registered for ${path}`);

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  const html = renderToString(
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ThemeProvider>
            <SocialSharingProvider>
              <AuthProvider>
                <LocaleProvider>
                  <FeedbackProvider>
                    <SidekickProvider>
                      <WizardProvider>
                        <Router ssrPath={path}>
                          <div className="flex min-h-screen flex-col">
                            <Navbar />
                            <main className="flex-grow">
                              <Page />
                            </main>
                            <Footer />
                          </div>
                        </Router>
                      </WizardProvider>
                    </SidekickProvider>
                  </FeedbackProvider>
                </LocaleProvider>
              </AuthProvider>
            </SocialSharingProvider>
          </ThemeProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </HelmetProvider>,
  );

  // Helmet v3 emits its server tags inline before the first rendered element.
  // Metadata is injected into <head> by prerender.ts, so retain only the app
  // tree here to avoid duplicate title/meta elements inside <body>.
  const appStart = html.indexOf('<div class="flex min-h-screen flex-col">');
  if (appStart < 0) throw new Error(`Rendered app wrapper missing for ${path}`);
  return html.slice(appStart);
}

export function renderSlugPage(
  path: string,
  kind: "profile" | "org-share",
  data: PublicProfileResponse | ShareResponse,
): string {
  const Page = kind === "profile"
    ? () => <PublicProfile initialData={data as PublicProfileResponse} />
    : () => <OrgSharePage initialData={data as ShareResponse} />;
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  const html = renderToString(
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ThemeProvider>
            <SocialSharingProvider>
              <AuthProvider>
                <LocaleProvider>
                  <FeedbackProvider>
                    <SidekickProvider>
                      <WizardProvider>
                        <Router ssrPath={path}>
                          <div className="flex min-h-screen flex-col">
                            <Navbar />
                            <main className="flex-grow">
                              <Page />
                            </main>
                            <Footer />
                          </div>
                        </Router>
                      </WizardProvider>
                    </SidekickProvider>
                  </FeedbackProvider>
                </LocaleProvider>
              </AuthProvider>
            </SocialSharingProvider>
          </ThemeProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </HelmetProvider>,
  );

  const appStart = html.indexOf('<div class="flex min-h-screen flex-col">');
  if (appStart < 0) throw new Error(`Rendered app wrapper missing for ${path}`);
  return html.slice(appStart);
}