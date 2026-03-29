import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { getPreviousLocation } from "@/lib/nav-history";

interface PrivateRouteProps {
  component: React.ComponentType;
}

export function PrivateRoute({ component: Component }: PrivateRouteProps) {
  const { isLoggedIn, isLoading } = useAuth();
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
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-[#F06127] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return <Component />;
}
