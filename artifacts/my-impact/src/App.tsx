import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WizardProvider } from "@/lib/wizard-context";

// Layout & Pages
import { Navbar } from "@/components/layout/Navbar";
import Intro from "@/pages/Intro";
import ActionsStep from "@/pages/wizard/ActionsStep";
import ActivitiesStep from "@/pages/wizard/ActivitiesStep";
import ContributionsStep from "@/pages/wizard/ContributionsStep";
import Results from "@/pages/Results";
import Suggestions from "@/pages/Suggestions";
import History from "@/pages/History";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

function AppRouter() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-grow">
        <Switch>
          <Route path="/" component={Intro} />
          
          {/* Wizard Routes */}
          <Route path="/wizard/actions" component={ActionsStep} />
          <Route path="/wizard/activities" component={ActivitiesStep} />
          <Route path="/wizard/contributions" component={ContributionsStep} />
          
          {/* Post-Wizard Routes */}
          <Route path="/results" component={Results} />
          <Route path="/suggestions" component={Suggestions} />
          <Route path="/history" component={History} />
          
          <Route component={NotFound} />
        </Switch>
      </main>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WizardProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AppRouter />
          </WouterRouter>
        </WizardProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
