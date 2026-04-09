-- Convert projects.effective_date and projects.report_due_date from text to date.
-- Existing data may be in either YYYY-MM-DD or MM/DD/YYYY format; both are handled.

alter table projects
  alter column effective_date type date
  using case
    when effective_date ~ '^\d{4}-\d{2}-\d{2}' then effective_date::date
    when effective_date ~ '^\d{1,2}/\d{1,2}/\d{4}$' then to_date(effective_date, 'MM/DD/YYYY')
    else null
  end;

alter table projects
  alter column report_due_date type date
  using case
    when report_due_date ~ '^\d{4}-\d{2}-\d{2}' then report_due_date::date
    when report_due_date ~ '^\d{1,2}/\d{1,2}/\d{4}$' then to_date(report_due_date, 'MM/DD/YYYY')
    else null
  end;
