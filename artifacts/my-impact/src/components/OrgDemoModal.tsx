import { Link } from "wouter";
import { Eye } from "lucide-react";

export function OrgDemoButton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <Link
      href="/org/demo"
      className={className ?? "inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"}
      style={style}
    >
      <Eye className="w-3.5 h-3.5" />
      View example dashboard
    </Link>
  );
}
