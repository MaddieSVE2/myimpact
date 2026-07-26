import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { getPreviousLocation } from "@/lib/nav-history";
import { NoIndexMeta } from "@/components/PageMeta";
import { BirthDateForm } from "@/components/BirthDateForm";

interface PrivateRouteProps {
  component: React.ComponentType;
}

export function PrivateRoute({ component: Component }: PrivateRouteProps) {
  const { isLoggedIn, isLoading, user, refreshUser } = useAuth();
  const [location, navigate] = useLocation();

  useEffect(() => {
    if (!isLoading && !isLoggedIn) {
      const next = encodeURIComponent(location);
      const prev = getPreviousLocation();
      const from = prev && prev !== location ? encodeURIComponent(prev) : null;
      const query = from ? `?next=${next}&from=${from}` : `?next=${next}`;
      navigate(`/login${query}`);
    }
  }, [isLoading, isLoggedIn, navigate, location]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-[#F06127] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-center px-4">
        <div className="w-8 h-8 border-2 border-[#F06127] border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-muted-foreground">Redirecting to sign in…</p>
      </div>
    );
  }

  // Age-gate backstop: any signed-in user still missing a date of birth
  // (interrupted first sign-in, older sessions) must provide it before
  // using the app.
  if (user?.needsBirthDate) {
    return (
      <>
        <NoIndexMeta />
        <div className="min-h-[60vh] flex items-center justify-center px-4">
          <div className="w-full max-w-sm bg-white rounded-2xl p-8 shadow-sm border border-border">
            <BirthDateForm onComplete={() => { void refreshUser(); }} />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <NoIndexMeta />
      <Component />
    </>
  );
}
