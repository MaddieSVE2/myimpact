import { Link } from "wouter";
import { ShieldCheck, Lock, ArrowLeft } from "lucide-react";
import { PageMeta } from "@/components/PageMeta";

export default function OrgTypeExplicitSubmission() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-10" data-testid="page-org-type-explicit">
      <PageMeta
        title="Explicit submission organisations — My Impact"
        description="How explicit submission organisations work on My Impact: members choose exactly which activities to submit, and nothing is shared automatically."
        canonical="https://myimpact.uk/org/types/explicit-submission"
        ogType="article"
      />
      <Link href="/org" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline mb-6">
        <ArrowLeft className="w-4 h-4" /> Back to organisation portal
      </Link>

      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
          <ShieldCheck className="w-5 h-5 text-primary" />
        </div>
        <h1 className="text-2xl font-display font-bold text-foreground">Explicit submission organisations</h1>
      </div>
      <p className="text-sm text-muted-foreground mb-8">
        The default and most private way an organisation works on My Impact.
      </p>

      <div className="space-y-6 text-sm text-foreground leading-relaxed">
        <section>
          <h2 className="text-base font-display font-semibold mb-2">How it works</h2>
          <p>
            In an explicit submission organisation, nothing you log is shared automatically. You choose which
            activities to submit to your organisation, when to submit them, and you can review exactly what is
            included before it is sent. If you never submit anything, your organisation never sees anything.
          </p>
        </section>

        <section>
          <h2 className="text-base font-display font-semibold mb-2">What the organisation sees</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Activities you explicitly submit (with your name, so submissions can be verified).</li>
            <li>Anonymous aggregate totals: social value, hours, and category breakdowns across members.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-display font-semibold mb-2">What is never shared</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Activities you have not submitted.</li>
            <li>Your journal entries, personal notes, and reflections.</li>
            <li>Your pulse survey answers (managers only ever see anonymous totals).</li>
          </ul>
        </section>

        <div className="rounded-xl border border-border bg-muted/30 p-4 flex items-start gap-3">
          <Lock className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground">
            An organisation's data-sharing type is fixed when it is created and cannot be changed later. If your
            organisation instead shares activities automatically with member consent, see{" "}
            <Link href="/org/types/consented-logging" className="text-primary hover:underline">consented logging organisations</Link>.
          </p>
        </div>
      </div>
    </div>
  );
}
