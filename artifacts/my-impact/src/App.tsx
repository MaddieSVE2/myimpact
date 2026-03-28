import { useState } from "react";
import { Switch, Route, Router as WouterRouter, Link, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WizardProvider } from "@/lib/wizard-context";
import { AuthProvider } from "@/lib/auth-context";
import { SidekickProvider } from "@/lib/sidekick-context";
import { ThemeProvider } from "@/lib/theme-context";
import { PrivateRoute } from "@/components/PrivateRoute";
import { useAuth } from "@/lib/auth-context";
import { X, LogIn } from "lucide-react";

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
import Badges from "@/pages/Badges";
import OrgPortal from "@/pages/OrgPortal";
import OrgRegister from "@/pages/OrgRegister";
import OrgDemoDashboard from "@/pages/OrgDemoDashboard";
import Login from "@/pages/Login";
import AuthConfirm from "@/pages/AuthConfirm";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

const HIDE_BANNER_PATHS = ["/login", "/auth/confirm", "/org/demo", "/"];

function GuestBanner() {
  const { isLoggedIn, isLoading } = useAuth();
  const [location] = useLocation();
  const [dismissed, setDismissed] = useState(false);

  if (isLoading || isLoggedIn || dismissed) return null;
  if (HIDE_BANNER_PATHS.some(p => location === p || location.startsWith(p + "/"))) return null;

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-between gap-4">
      <p className="text-xs text-amber-800 flex items-center gap-1.5 flex-wrap">
        <LogIn className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>
          You're browsing as a guest.{" "}
          <Link href="/login" className="font-semibold underline underline-offset-2 hover:text-amber-900">
            Log in or create an account
          </Link>{" "}
          to save your history, write journal entries, and earn badges.
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

function AppRouter() {
  return (
    <div className="min-h-screen flex flex-col lg:pr-12">
      <Navbar />
      <GuestBanner />
      <main className="flex-grow">
        <Switch>
          <Route path="/" component={Intro} />

          {/* Auth routes — no navbar chrome needed */}
          <Route path="/login" component={Login} />
          <Route path="/auth/confirm" component={AuthConfirm} />

          {/* Wizard routes — open to all */}
          <Route path="/wizard/actions" component={ActionsStep} />
          <Route path="/wizard/activities" component={ActivitiesStep} />
          <Route path="/wizard/contributions" component={ContributionsStep} />
          <Route path="/results" component={Results} />
          <Route path="/suggestions" component={Suggestions} />

          {/* Protected routes */}
          <Route path="/history">
            {() => <PrivateRoute component={History} />}
          </Route>
          <Route path="/journal">
            {() => <PrivateRoute component={Journal} />}
          </Route>
          <Route path="/badges">
            {() => <PrivateRoute component={Badges} />}
          </Route>
          <Route path="/org/demo" component={OrgDemoDashboard} />
          <Route path="/org/register" component={OrgRegister} />
          <Route path="/org">
            {() => <PrivateRoute component={OrgPortal} />}
          </Route>

          <Route component={NotFound} />
        </Switch>
      </main>
      <Sidekick />
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ThemeProvider>
          <AuthProvider>
            <SidekickProvider>
              <WizardProvider>
                <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                  <AppRouter />
                </WouterRouter>
              </WizardProvider>
            </SidekickProvider>
          </AuthProvider>
          <Toaster />
        </ThemeProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
