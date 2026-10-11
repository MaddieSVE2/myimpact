import { renderToString } from "react-dom/server";
import { prerenderToNodeStream } from "react-dom/static";
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
import PublicProfile, { type PublicProfileResponse } from "@/pages/PublicProfile";
import OrgSharePage, { type ShareResponse } from "@/pages/OrgSharePage";
import App from "./App";

/**
 * A public page as the real app renders it for a first-time guest at
 * `path`, waiting for its lazily loaded code. The client reuses this markup
 * (hydrateRoot, see lib/prerender-hydration.ts), so it must be exactly the
 * app's own tree, not a simplified layout.
 */
export async function render(path: string): Promise<string> {
  const { prelude } = await prerenderToNodeStream(
    <Router ssrPath={path}>
      <App />
    </Router>,
  );
  let html = "";
  for await (const chunk of prelude) html += chunk.toString();
  // React emits the page's <title>, <meta> and preload tags first; in the
  // browser it puts them in <head> itself, and prerender.ts writes the head.
  // Keep only what the app renders inside #root.
  const appStart = html.indexOf('<div class="flex flex-col min-h-screen');
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