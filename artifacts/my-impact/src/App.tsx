import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WizardProvider } from "@/lib/wizard-context";
import { AuthProvider } from "@/lib/auth-context";
import { SidekickProvider } from "@/lib/sidekick-context";
import { PrivateRoute } from "@/components/PrivateRoute";

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

function AppRouter() {
  return (
    <div className="min-h-screen flex flex-col lg:pr-12">
      <Navbar />
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
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
