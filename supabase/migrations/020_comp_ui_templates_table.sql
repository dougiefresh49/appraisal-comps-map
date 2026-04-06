-- Issue 036: Move comp UI templates to a dedicated table.
-- Replaces the jsonb column on projects with a normalized table that supports
-- per-project overrides and a global default (project_id IS NULL) fallback.

-- ============================================================
-- 1. Create comp_ui_templates table
-- ============================================================

create table if not exists comp_ui_templates (
  id            uuid        primary key default gen_random_uuid(),
  project_id    uuid        references projects(id) on delete cascade,
  comp_type     text        not null check (comp_type in ('Land', 'Sales', 'Rentals')),
  template_type text        not null default 'DEFAULT' check (template_type in ('DEFAULT', 'INCOME')),
  content       jsonb       not null default '[]',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Unique constraint for rows WHERE project_id IS NOT NULL
create unique index if not exists comp_ui_templates_project_type_unique
  on comp_ui_templates (project_id, comp_type, template_type)
  where project_id is not null;

-- Unique constraint for global-default rows WHERE project_id IS NULL
create unique index if not exists comp_ui_templates_global_type_unique
  on comp_ui_templates (comp_type, template_type)
  where project_id is null;

-- ============================================================
-- 2. RLS
-- ============================================================

alter table comp_ui_templates enable row level security;

create policy "Authenticated full access" on comp_ui_templates
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- ============================================================
-- 3. updated_at trigger
-- ============================================================

create trigger comp_ui_templates_updated_at
  before update on comp_ui_templates
  for each row execute function update_updated_at();

-- ============================================================
-- 4. Realtime
-- ============================================================

alter publication supabase_realtime add table comp_ui_templates;

-- ============================================================
-- 5. Drop old jsonb column from projects
-- ============================================================

alter table projects drop column if exists comp_ui_templates;

-- ============================================================
-- 6. Seed global default templates (project_id = null)
-- ============================================================

insert into comp_ui_templates (project_id, comp_type, template_type, content)
values

-- Land / DEFAULT
(null, 'Land', 'DEFAULT', '[
  {"title":"Property Information","side":"left","rows":[
    {"label":"Address","fieldKey":"Address"},
    {"label":"APN","fieldKey":"APN"},
    {"label":"Legal","fieldKey":"Legal"},
    {"label":"Land Size (AC)","fieldKey":"Land Size (AC)"},
    {"label":"Zoning","fieldKey":"Zoning"},
    {"label":"Corner","fieldKey":"Corner"},
    {"label":"Highway Frontage","fieldKey":"Highway Frontage"}
  ]},
  {"title":"Utilities & Surface","side":"left","rows":[
    {"label":"Utils - Electricity","fieldKey":"Utils - Electricity"},
    {"label":"Utils - Water","fieldKey":"Utils - Water"},
    {"label":"Utils - Sewer","fieldKey":"Utils - Sewer"},
    {"label":"Surface","fieldKey":"Surface"}
  ]},
  {"title":"Sale Information","side":"left","rows":[
    {"label":"Sale Price","fieldKey":"Sale Price"},
    {"label":"Date of Sale","fieldKey":"Date of Sale"},
    {"label":"Recording","fieldKey":"Recording"},
    {"label":"Grantor","fieldKey":"Grantor"},
    {"label":"Grantee","fieldKey":"Grantee"}
  ]},
  {"title":"Key Indicators","side":"right","rows":[
    {"label":"Sale Price / AC","fieldKey":"Sale Price / AC"},
    {"label":"Sale Price / SF","fieldKey":"Sale Price / SF"}
  ]},
  {"title":"Comments","side":"full","rows":[
    {"label":"","fieldKey":"Comments"}
  ]}
]'::jsonb),

-- Sales / DEFAULT
(null, 'Sales', 'DEFAULT', '[
  {"title":"Property Information","side":"left","rows":[
    {"label":"Address","fieldKey":"Address"},
    {"label":"APN","fieldKey":"APN"},
    {"label":"Legal","fieldKey":"Legal"},
    {"label":"Property Type","fieldKey":"Property Type"},
    {"label":"Building Size (SF)","fieldKey":"Building Size (SF)"},
    {"label":"Land Size (AC)","fieldKey":"Land Size (AC)"},
    {"label":"Year Built","fieldKey":"Year Built"},
    {"label":"Condition","fieldKey":"Condition"}
  ]},
  {"title":"Sale Information","side":"left","rows":[
    {"label":"Sale Price","fieldKey":"Sale Price"},
    {"label":"Date of Sale","fieldKey":"Date of Sale"},
    {"label":"Recording","fieldKey":"Recording"}
  ]},
  {"title":"Key Indicators","side":"right","rows":[
    {"label":"Sale Price / SF","fieldKey":"Sale Price / SF"},
    {"label":"Overall Cap Rate","fieldKey":"Overall Cap Rate"},
    {"label":"Gross Income Multiplier","fieldKey":"Gross Income Multiplier"}
  ]},
  {"title":"Comments","side":"full","rows":[
    {"label":"","fieldKey":"Comments"}
  ]}
]'::jsonb),

-- Sales / INCOME
(null, 'Sales', 'INCOME', '[
  {"title":"Property Information","side":"left","rows":[
    {"label":"Address","fieldKey":"Address"},
    {"label":"APN","fieldKey":"APN"},
    {"label":"Legal","fieldKey":"Legal"},
    {"label":"Property Type","fieldKey":"Property Type"},
    {"label":"Building Size (SF)","fieldKey":"Building Size (SF)"},
    {"label":"Land Size (AC)","fieldKey":"Land Size (AC)"},
    {"label":"Year Built","fieldKey":"Year Built"},
    {"label":"Condition","fieldKey":"Condition"}
  ]},
  {"title":"Income Analysis","side":"right","rows":[
    {"label":"Rent / SF","fieldKey":"Rent / SF"},
    {"label":"Potential Gross Income","fieldKey":"Potential Gross Income"},
    {"label":"Vacancy %","fieldKey":"Vacancy %"},
    {"label":"Effective Gross Income","fieldKey":"Effective Gross Income"},
    {"label":"Taxes","fieldKey":"Taxes"},
    {"label":"Insurance","fieldKey":"Insurance"},
    {"label":"Expenses","fieldKey":"Expenses"},
    {"label":"Net Operating Income","fieldKey":"Net Operating Income"}
  ]},
  {"title":"Property Improvements","side":"left","rows":[
    {"label":"HVAC","fieldKey":"HVAC"},
    {"label":"Overhead Doors","fieldKey":"Overhead Doors"},
    {"label":"Wash Bay","fieldKey":"Wash Bay"},
    {"label":"Hoisting","fieldKey":"Hoisting"},
    {"label":"Construction","fieldKey":"Construction"},
    {"label":"Other Features","fieldKey":"Other Features"}
  ]},
  {"title":"Key Indicators","side":"right","rows":[
    {"label":"Overall Cap Rate","fieldKey":"Overall Cap Rate"},
    {"label":"Gross Income Multiplier","fieldKey":"Gross Income Multiplier"},
    {"label":"Sale Price / SF","fieldKey":"Sale Price / SF"}
  ]},
  {"title":"Comments","side":"full","rows":[
    {"label":"","fieldKey":"Comments"}
  ]}
]'::jsonb),

-- Rentals / DEFAULT
(null, 'Rentals', 'DEFAULT', '[
  {"title":"Property & Lease","side":"left","rows":[
    {"label":"Address","fieldKey":"Address"},
    {"label":"APN","fieldKey":"APN"},
    {"label":"Legal","fieldKey":"Legal"},
    {"label":"Rentable SF","fieldKey":"Rentable SF"},
    {"label":"Land Size (AC)","fieldKey":"Land Size (AC)"},
    {"label":"Year Built","fieldKey":"Year Built"},
    {"label":"Condition","fieldKey":"Condition"},
    {"label":"Lessor","fieldKey":"Lessor"},
    {"label":"Tenant","fieldKey":"Tenant"},
    {"label":"Lease Start","fieldKey":"Lease Start"},
    {"label":"Expense Structure","fieldKey":"Expense Structure"}
  ]},
  {"title":"Key Indicators","side":"right","rows":[
    {"label":"Rent / Month","fieldKey":"Rent / Month"},
    {"label":"Rent / SF / Year","fieldKey":"Rent / SF / Year"}
  ]},
  {"title":"Comments","side":"full","rows":[
    {"label":"","fieldKey":"Comments"}
  ]}
]'::jsonb);
