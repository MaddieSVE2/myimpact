import { Link } from "wouter";
import { ShieldCheck, Lock, ArrowLeft } from "lucide-react";
import { PageMeta } from "@/components/PageMeta";

export default function OrgTypeConsentedLogging() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10" data-testid="page-org-type-consented">
      <PageMeta
        title="Consented logging organisations — My Impact"
        description="How consented logging organisations work on My Impact: activities are shared automatically with your recorded consent, never journals or pulse answers."
        canonical="https://myimpact.uk/org/types/consented-logging"
        ogType="article"
      />
      <Link href="/org" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline mb-6">
        <ArrowLeft className="w-4 h-4" /> Back to organisation portal
      </Link>

      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
          <ShieldCheck className="w-5 h-5 text-blue-600" />
        </div>
        <h1 className="text-2xl font-display font-bold text-foreground">Consented logging organisations</h1>
      </div>
      <p className="text-sm text-muted-foreground mb-8">
        Activities are shared automatically — but only with your explicit, recorded consent.
      </p>

      <div className="space-y-6 text-sm text-foreground leading-relaxed">
        <section>
          <h2 className="text-base font-display font-semibold mb-2">How it works</h2>
          <p>
            When you join a consented logging organisation, you are asked for consent before anything is shared.
            You choose whether to share activities from the date you join onwards, or to also include past
            activities from a date you pick. Once you consent, activities you log are contributed to the
            organisation's dashboard automatically — you don't need to submit each one by hand.
          </p>
        </section>

        <section>
          <h2 className="text-base font-display font-semibold mb-2">Your consent, your control</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Consent is asked for explicitly when you join, and recorded in an audit log.</li>
            <li>You can view your consent — including the date you chose — from the organisation portal at any time.</li>
            <li>You can withdraw consent at any time; new activities stop being shared immediately.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-display font-semibold mb-2">What is never shared</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Your journal entries, personal notes, and reflections — never, under any circumstances.</li>
            <li>Your individual pulse survey answers (managers only ever see anonymous totals).</li>
          </ul>
        </section>

        <div className="rounded-xl border border-border bg-muted/30 p-4 flex items-start gap-3">
          <Lock className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground">
            An organisation's data-sharing type is fixed when it is created and cannot be changed later. If your
            organisation requires you to submit each activity yourself, see{" "}
            <Link href="/org/types/explicit-submission" className="text-primary hover:underline">explicit submission organisations</Link>.
          </p>
        </div>
      </div>
    </div>
  );
}
