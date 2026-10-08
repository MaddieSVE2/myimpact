import { Redirect } from "wouter";

/** Groups are managed in Settings; keep old links working. */
export default function OrgGroups() {
  return <Redirect to="/org/settings?tab=groups" replace />;
}
