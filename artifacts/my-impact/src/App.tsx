import { useState, useRef, useEffect, Component, type ReactNode } from "react";
import { Switch, Route, Router as WouterRouter, Link, useLocation } from "wouter";
import { updateNavHistory } from "@/lib/nav-history";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WizardProvider } from "@/lib/wizard-context";
import { AuthProvider } from "@/lib/auth-context";
import { SidekickProvider } from "@/lib/sidekick-context";
import { ThemeProvider } from "@/lib/theme-context";
import { FeedbackProvider } from "@/lib/feedback-context";
import { FeedbackWidget } from "@/components/FeedbackWidget";
import { PrivateRoute } from "@/components/PrivateRoute";
import { useAuth } from "@/lib/auth-context";
import { usePageViewTracking } from "@/hooks/usePageViewTracking";
import { X, LogIn, Building2 } from "lucide-react";

// Layout & Pages
import { Navbar } from "@/components/layout/Navbar";
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
import OrgRegister from "@/pages/OrgRegister";
import OrgDemoPage from "@/pages/OrgDemoPage";
import Login from "@/pages/Login";
import AuthConfirm from "@/pages/AuthConfirm";
import About from "@/pages/About";
import WhatsNew from "@/pages/WhatsNew";
import Privacy from "@/pages/Privacy";
import Settings from "@/pages/Settings";
import NotFound from "@/pages/not-found";
import ProfileSetup from "@/pages/ProfileSetup";
import Profile from "@/pages/Profile";
import Admin from "@/pages/Admin";
import Contact from "@/pages/Contact";
import Feedback from "@/pages/Feedback";

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
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center gap-4">
          <p className="text-lg font-semibold text-foreground">Something went wrong</p>
          <p className="text-sm text-muted-foreground max-w-sm">
            We hit an unexpected error loading this page. Please try refreshing — your data is safe.
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-4 py-2 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Try again
          </button>
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

const HIDE_BANNER_PATHS = ["/login", "/auth/confirm", "/org/demo", "/", "/results"];

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

function AppRouter() {
  const [location] = useLocation();
  const locationRef = useRef<string | undefined>(undefined);
  if (locationRef.current !== location) {
    updateNavHistory(location);
    locationRef.current = location;
  }

  usePageViewTracking();

  return (
    <div className="flex flex-row min-h-screen">
      {/* ── Main content column ── */}
      <div className="flex flex-col flex-grow min-w-0">
        <Navbar />
        <GuestBanner />
        <main className="flex-grow">
          <ErrorBoundary>
          <Switch>
            <Route path="/" component={Intro} />

            {/* Auth routes — no navbar chrome needed */}
            <Route path="/login" component={Login} />
            <Route path="/auth/confirm" component={AuthConfirm} />
            <Route path="/about" component={About} />
            <Route path="/whats-new" component={WhatsNew} />
            <Route path="/privacy" component={Privacy} />

            {/* Wizard routes — open to all */}
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
            <Route path="/badges">
              {() => <Redirect to="/milestones" />}
            </Route>
            <Route path="/org/demo/education">
              {() => <Redirect to="/org/demo?type=education" />}
            </Route>
            <Route path="/org/demo" component={OrgDemoPage} />
            <Route path="/org/register" component={OrgRegister} />
            <Route path="/org">
              {() => <OrgGuestRoute />}
            </Route>

            <Route path="/admin" component={Admin} />
            <Route path="/contact" component={Contact} />

            <Route path="/feedback" component={Feedback} />

            <Route component={NotFound} />
          </Switch>
          </ErrorBoundary>
        </main>
      </div>
      {/* ── Sidekick column (desktop only; mobile handled inside Sidekick) ── */}
      <Sidekick />
      <FeedbackWidget />
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ThemeProvider>
          <AuthProvider>
            <FeedbackProvider>
              <SidekickProvider>
                <WizardProvider>
                  <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                    <AppRouter />
                  </WouterRouter>
                </WizardProvider>
              </SidekickProvider>
            </FeedbackProvider>
          </AuthProvider>
          <Toaster />
        </ThemeProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
