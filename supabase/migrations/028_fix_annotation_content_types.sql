UPDATE report_section_annotations
SET content_type = 'standard-with-tweaks',
    notes = COALESCE(notes, '') || ' [auto-fix: intro paragraph is templated, followed by comp UI data pages]'
WHERE section_key IN ('sales-comparison-land', 'sales-comparison-improved')
  AND content_type = 'narrative';

UPDATE report_section_annotations
SET content_type = 'data-driven',
    notes = COALESCE(notes, '') || ' [auto-fix: paragraph generated from template + indicated values inputs]'
WHERE section_key IN ('land-sales-adjustments-summary', 'sales-adjustments-summary')
  AND content_type = 'analysis';
