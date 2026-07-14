import { useState, useRef, useEffect, Component, type ReactNode } from "react";
import { Switch, Route, Router as WouterRouter, Link, useLocation } from "wouter";
import { HelmetProvider, Helmet } from "react-helmet-async";
import { updateNavHistory } from "@/lib/nav-history";
import { scrollContentToTop, CONTENT_SCROLL_ID } from "@/lib/scroll-utils";
import { captureException as captureSentryException } from "@/lib/sentry";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WizardProvider } from "@/lib/wizard-context";
import { AuthProvider } from "@/lib/auth-context";
import { SidekickProvider } from "@/lib/sidekick-context";
import { ThemeProvider } from "@/lib/theme-context";
import { SocialSharingProvider } from "@/lib/social-sharing-context";
import { FeedbackProvider } from "@/lib/feedback-context";
import { LocaleProvider } from "@/i18n";
import { FeedbackWidget } from "@/components/FeedbackWidget";
import { YearRolloverModal } from "@/components/YearRolloverModal";
import { ServiceWorkerUpdatePrompt } from "@/components/ServiceWorkerUpdatePrompt";
import { PrivateRoute } from "@/components/PrivateRoute";
import { useAuth } from "@/lib/auth-context";
import { usePageViewTracking } from "@/hooks/usePageViewTracking";
import { X, LogIn, Building2 } from "lucide-react";

const NOINDEX_PATH_PREFIXES = [
  "/login",
  "/auth/confirm",
  "/results",
  "/wizard",
  "/privacy",
  "/terms",
  "/security",
  "/pricing",
  "/feedback",
  "/admin",
  "/log",
  "/challenges",
  "/org",
  "/badges",
  "/milestones",
  "/recap",
  "/quick-log",
  "/history",
  "/journal",
  "/settings",
  "/profile/setup",
  "/profile",
];

// Paths that must be indexable even though a prefix above would catch them.
const NOINDEX_PATH_EXCLUSIONS = ["/org/demo"];

// Layout & Pages
import { Footer } from "@/components/layout/Footer";
import { Navbar } from "@/components/layout/Navbar";
import { OrgMemberSubNav } from "@/components/layout/OrgMemberSubNav";
import { Sidekick } from "@/components/Sidekick";
import Intro from "@/pages/Intro";
import ActionsStep from "@/pages/wizard/ActionsStep";
import ActivitiesStep from "@/pages/wizard/ActivitiesStep";
import ContributionsStep from "@/pages/wizard/ContributionsStep";
import Results from "@/pages/Results";
import Suggestions from "@/pages/Suggestions";
import History from "@/pages/History";
import Journal from "@/pages/Journal";
import Milestones from "@/pages/Milestones";
import OrgPortal from "@/pages/OrgPortal";
import OrgMemberSubmit from "@/pages/OrgMemberSubmit";
import OrgMemberSubmitHistory from "@/pages/OrgMemberSubmitHistory";
import OrgDashboard from "@/pages/OrgDashboard";
import OrgActivities from "@/pages/OrgActivities";
import OrgChallenges from "@/pages/OrgChallenges";
import OrgPulse from "@/pages/OrgPulse";
import OrgMemberPulse from "@/pages/OrgMemberPulse";
import OrgMemberChallenges from "@/pages/OrgMemberChallenges";
import OrgExport from "@/pages/OrgExport";
import OrgSettings from "@/pages/OrgSettings";
import OrgRegister from "@/pages/OrgRegister";
import OrgDemoPage from "@/pages/OrgDemoPage";
import Pricing from "@/pages/Pricing";
import Login from "@/pages/Login";
import AuthConfirm from "@/pages/AuthConfirm";
import About from "@/pages/About";
import Methodology from "@/pages/Methodology";
import WhatsNew from "@/pages/WhatsNew";
import Privacy from "@/pages/Privacy";
import Terms from "@/pages/Terms";
import Security from "@/pages/Security";
import Settings from "@/pages/Settings";
import NotFound from "@/pages/not-found";
import ProfileSetup from "@/pages/ProfileSetup";
import Profile from "@/pages/Profile";
import Admin from "@/pages/Admin";
import Contact from "@/pages/Contact";
import Feedback from "@/pages/Feedback";
import PublicProfile from "@/pages/PublicProfile";
import OrgSharePage from "@/pages/OrgSharePage";
import AnnualRecap from "@/pages/AnnualRecap";
import Challenges from "@/pages/Challenges";
import ChallengeDetail from "@/pages/ChallengeDetail";
import ChallengeJoin from "@/pages/ChallengeJoin";
import QuickLogPhoto from "@/pages/QuickLogPhoto";
import QuickLogActivity from "@/pages/QuickLogActivity";

const queryClient = new QueryClient();

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error("[ErrorBoundary]", error, info.componentStack);
    captureSentryException(error, { componentStack: info.componentStack });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center gap-4">
          <p className="text-lg font-semibold text-foreground">Something went wrong</p>
          <p className="text-sm text-muted-foreground max-w-sm">
            We hit an unexpected error loading this page. Please try refreshing. Your data is safe.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="px-4 py-2 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Try again
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-md border border-border text-foreground text-sm font-medium hover:bg-muted transition-colors"
            >
              Reload page
            </button>
          </div>
          {this.state.error && (
            <details className="mt-4 text-left max-w-xl w-full">
              <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                Show technical details
              </summary>
              <pre className="mt-2 p-3 bg-muted rounded-md text-xs overflow-auto whitespace-pre-wrap break-words text-muted-foreground">
                {this.state.error.message}
                {this.state.error.stack ? `\n\n${this.state.error.stack}` : ""}
              </pre>
            </details>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}

function Redirect({ to }: { to: string }) {
  const [, setLocation] = useLocation();
  useEffect(() => { setLocation(to, { replace: true }); }, [to]);
  return null;
}

const HIDE_BANNER_PATHS = ["/login", "/auth/confirm", "/org/demo", "/", "/results", "/profile"];

function GuestBanner() {
  const { isLoggedIn, isLoading } = useAuth();
  const [location] = useLocation();
  const [dismissed, setDismissed] = useState(false);

  if (isLoading || isLoggedIn || dismissed) return null;
  if (HIDE_BANNER_PATHS.some(p => location === p || location.startsWith(p + "/"))) return null;

  const loginHref = `/login?from=${encodeURIComponent(location)}`;

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-between gap-4">
      <p className="text-xs text-amber-800 flex items-center gap-1.5 flex-wrap">
        <LogIn className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>
          You're browsing as a guest.{" "}
          <Link href={loginHref} className="font-semibold underline underline-offset-2 hover:text-amber-900">
            Log in or create an account
          </Link>{" "}
          to save your history, write journal entries, and earn milestones.
        </span>
      </p>
      <button
        onClick={() => setDismissed(true)}
        className="shrink-0 p-0.5 rounded text-amber-500 hover:text-amber-800 hover:bg-amber-100 transition-colors"
        aria-label="Dismiss"
      >
        <X className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

function OrgGuestRoute() {
  const { isLoggedIn, isLoading } = useAuth();
  if (isLoading) return null;
  if (isLoggedIn) return <OrgPortal />;

  const params = new URLSearchParams(window.location.search);
  const hasInviteParams = params.has("orgId") && params.has("inviteCode");

  if (hasInviteParams) {
    const returnTo = encodeURIComponent(`/org${window.location.search}`);
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-6" style={{ background: "rgba(232,99,58,0.10)" }}>
          <Building2 className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-2xl font-display font-bold text-foreground mb-3">You've been invited</h1>
        <p className="text-muted-foreground mb-2 leading-relaxed">
          Log in or create a free account to join your organisation on My Impact.
        </p>
        <p className="text-muted-foreground mb-8 leading-relaxed text-sm">
          Once you're signed in, you'll be taken straight to the join confirmation.
        </p>
        <Link
          href={`/login?next=${returnTo}`}
          className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-md bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          <LogIn className="w-4 h-4" />
          Log in to join
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-20 text-center">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-6" style={{ background: "rgba(232,99,58,0.10)" }}>
        <Building2 className="w-8 h-8 text-primary" />
      </div>
      <h1 className="text-2xl font-display font-bold text-foreground mb-3">Organisation portal</h1>
      <p className="text-muted-foreground mb-2 leading-relaxed">
        The organisation portal lets schools, charities, and local authorities view aggregated impact data for their members.
      </p>
      <p className="text-muted-foreground mb-8 leading-relaxed">
        To access the portal you need to register your organisation first.
      </p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Link
          href="/org/register"
          className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-md bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          Register your organisation →
        </Link>
        <Link
          href="/org/demo"
          className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-md border border-border bg-white text-sm font-medium text-foreground hover:bg-secondary transition-colors"
        >
          See a demo first
        </Link>
      </div>
    </div>
  );
}

const NO_FOOTER_PATHS = [
  "/",
  "/login",
  "/auth/confirm",
  "/wizard",
  "/results",
  "/recap",
  "/quick-log",
  "/log",
];


function AppRouter() {
  const [location] = useLocation();
  const locationRef = useRef<string | undefined>(undefined);
  if (locationRef.current !== location) {
    updateNavHistory(location);
    locationRef.current = location;
  }

  useEffect(() => {
    scrollContentToTop();
  }, [location]);

  usePageViewTracking();

  const showFooter = !NO_FOOTER_PATHS.some(
    (p) => location === p || location.startsWith(p + "/")
  );

  const isExcludedFromNoIndex = NOINDEX_PATH_EXCLUSIONS.some(
    (p) => location === p || location.startsWith(p + "?")
  );
  const shouldNoIndex = !isExcludedFromNoIndex && NOINDEX_PATH_PREFIXES.some(
    (p) => location === p || location.startsWith(p + "/") || location.startsWith(p + "?")
  );

  return (
    <div className="flex flex-col min-h-screen lg:h-screen">
      {shouldNoIndex && (
        <Helmet>
          <meta name="robots" content="noindex, nofollow" />
        </Helmet>
      )}
      {/* ── Top nav: full-width, always visible above content ── */}
      <Navbar />
      {/* ── Content row: fills remaining height on desktop ── */}
      <div className="flex flex-row flex-1 lg:min-h-0">
        {/* ── Main content column: scrolls independently on desktop ── */}
        <div id={CONTENT_SCROLL_ID} className="flex flex-col flex-grow min-w-0 lg:overflow-y-auto">
          <OrgMemberSubNav />
          <GuestBanner />
          <main className="flex-grow">
            <ErrorBoundary>
            <Switch>
              <Route path="/" component={Intro} />

              {/* Auth routes, no navbar chrome needed */}
              <Route path="/login" component={Login} />
              <Route path="/auth/confirm" component={AuthConfirm} />
              <Route path="/about" component={About} />
              <Route path="/methodology" component={Methodology} />
              <Route path="/whats-new" component={WhatsNew} />
              <Route path="/privacy" component={Privacy} />
              <Route path="/terms" component={Terms} />
              <Route path="/security" component={Security} />
              <Route path="/pricing" component={Pricing} />

              {/* Wizard routes, open to all */}
              <Route path="/wizard/actions" component={ActionsStep} />
              <Route path="/wizard/activities" component={ActivitiesStep} />
              <Route path="/wizard/contributions" component={ContributionsStep} />
              <Route path="/results" component={Results} />
              <Route path="/suggestions" component={Suggestions} />

              {/* Profile routes */}
              <Route path="/profile/setup">
                {() => <PrivateRoute component={ProfileSetup} />}
              </Route>
              <Route path="/profile">
                {() => <PrivateRoute component={Profile} />}
              </Route>

              {/* Protected routes */}
              <Route path="/settings">
                {() => <PrivateRoute component={Settings} />}
              </Route>
              <Route path="/history">
                {() => <PrivateRoute component={History} />}
              </Route>
              <Route path="/journal">
                {() => <PrivateRoute component={Journal} />}
              </Route>
              <Route path="/milestones">
                {() => <PrivateRoute component={Milestones} />}
              </Route>
              <Route path="/recap">
                {() => <PrivateRoute component={AnnualRecap} />}
              </Route>
              <Route path="/quick-log">
                {() => <PrivateRoute component={QuickLogPhoto} />}
              </Route>
              <Route path="/log" component={QuickLogActivity} />
              <Route path="/badges">
                {() => <Redirect to="/milestones" />}
              </Route>
              <Route path="/org/demo/education">
                {() => <Redirect to="/org/demo?type=education" />}
              </Route>
              <Route path="/org/demo" component={OrgDemoPage} />
              <Route path="/org/register" component={OrgRegister} />
              <Route path="/org/share/:slug" component={OrgSharePage} />
              <Route path="/org/submit/history">
                {() => <PrivateRoute component={OrgMemberSubmitHistory} />}
              </Route>
              <Route path="/org/submit">
                {() => <PrivateRoute component={OrgMemberSubmit} />}
              </Route>
              <Route path="/org/dashboard">
                {() => <PrivateRoute component={OrgDashboard} />}
              </Route>
              <Route path="/org/activities">
                {() => <PrivateRoute component={OrgActivities} />}
              </Route>
              <Route path="/org/challenges">
                {() => <PrivateRoute component={OrgChallenges} />}
              </Route>
              <Route path="/org/member/challenges">
                {() => <PrivateRoute component={OrgMemberChallenges} />}
              </Route>
              <Route path="/org/member/pulse">
                {() => <PrivateRoute component={OrgMemberPulse} />}
              </Route>
              <Route path="/org/pulse">
                {() => <PrivateRoute component={OrgPulse} />}
              </Route>
              <Route path="/org/export">
                {() => <PrivateRoute component={OrgExport} />}
              </Route>
              <Route path="/org/settings">
                {() => <PrivateRoute component={OrgSettings} />}
              </Route>
              <Route path="/org">
                {() => <OrgGuestRoute />}
              </Route>

              {/* Challenges */}
              <Route path="/challenges/join" component={ChallengeJoin} />
              <Route path="/challenges/:id">
                {() => <PrivateRoute component={ChallengeDetail} />}
              </Route>
              <Route path="/challenges">
                {() => <PrivateRoute component={Challenges} />}
              </Route>

              <Route path="/admin" component={Admin} />
              <Route path="/contact" component={Contact} />

              <Route path="/feedback" component={Feedback} />

              {/* Public profile, no login required */}
              <Route path="/profile/:slug" component={PublicProfile} />

              <Route component={NotFound} />
            </Switch>
            </ErrorBoundary>
          </main>
          {showFooter && <Footer />}
        </div>
        {/* ── Sidekick column (desktop only; mobile handled inside Sidekick) ── */}
        <Sidekick />
      </div>
      <FeedbackWidget />
      <YearRolloverModal />
    </div>
  );
}

function App() {
  return (
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
                      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                        <AppRouter />
                      </WouterRouter>
                    </WizardProvider>
                  </SidekickProvider>
                </FeedbackProvider>
                <ServiceWorkerUpdatePrompt />
              </LocaleProvider>
            </AuthProvider>
            </SocialSharingProvider>
            <Toaster />
          </ThemeProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </HelmetProvider>
  );
}

export default App;
