-- One live share per report per organisation, enforced atomically so
-- concurrent "Review & share" requests can't create duplicate org copies.
-- Withdrawing a share deletes the org copy, freeing the report to be
-- shared again.
CREATE UNIQUE INDEX IF NOT EXISTS impact_records_one_live_share_idx
  ON impact_records (source_report_id, submitted_to_org_id)
  WHERE source_report_id IS NOT NULL
    AND submitted_to_org_id IS NOT NULL
    AND source = 'member-submitted';
