-- Report-share provenance must be durable: deleting a source report while a
-- live org share still points at it silently erased the link (ON DELETE SET
-- NULL), turning the immutable share into an ordinary editable submission and
-- breaking dedupe + the one-live-share invariant. Enforce at the DB layer:
-- the FK now blocks deleting a source report that still has shares (NO
-- ACTION is deferred to statement end, so a full account wipe that removes
-- source and share together in one statement still succeeds).
ALTER TABLE impact_records
  DROP CONSTRAINT IF EXISTS impact_records_source_report_id_fkey;
ALTER TABLE impact_records
  ADD CONSTRAINT impact_records_source_report_id_fkey
  FOREIGN KEY (source_report_id) REFERENCES impact_records(id);
