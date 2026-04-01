-- Issue 037: SUMMARY template type for comp summary table row config.

alter table comp_ui_templates drop constraint if exists comp_ui_templates_template_type_check;

alter table comp_ui_templates add constraint comp_ui_templates_template_type_check
  check (template_type in ('DEFAULT', 'INCOME', 'SUMMARY'));

-- Global default summary row configs (project_id = null)
insert into comp_ui_templates (project_id, comp_type, template_type, content)
values
  (
    null,
    'Land',
    'SUMMARY',
    '[
      {"id":"f7c0139d-e2c9-491e-a018-6752b1d35fa6","label":"Address"},
      {"id":"8f428e1a-e516-459d-a910-e25bc54955b0","label":"Property Rights"},
      {"id":"c93d2ba8-5430-493f-ad29-c232dd659ed3","label":"Date of Sale"},
      {"id":"256ece72-e7ed-4848-858b-56f6f41f7adb","label":"Land Size (AC)"},
      {"id":"ed85f3ba-5fde-49b2-a6ce-33c18f7ce606","label":"Land Size (SF)"},
      {"id":"c6662c3f-b652-44e8-9193-87ba929c0ddf","label":"Sale Price"},
      {"id":"55c9bca8-6ebe-41c5-9ea9-40e799e6b565","label":"Sale Price / AC"},
      {"id":"2107811d-8a25-4555-a926-3d8f2778a8fa","label":"Sale Price / SF"},
      {"id":"9c0f1695-d93b-4833-a171-6366b8819c75","label":"Zoning"},
      {"id":"7a849f33-53be-4679-b8d2-c6cf42bc58a8","label":"Corner"},
      {"id":"6c666cd7-33e9-49fd-b1d0-3b4685dbda8b","label":"Highway Frontage"},
      {"id":"ad7199f5-cfcf-4cad-97a7-832e8cb375ef","label":"Surface"},
      {"id":"937dc3c7-0897-4168-b80f-539e4bbf3808","label":"Comments"}
    ]'::jsonb
  ),
  (
    null,
    'Sales',
    'SUMMARY',
    '[
      {"id":"c75f13a3-8744-4caf-801f-fa62cbb42141","label":"Address"},
      {"id":"0a130f7d-69ec-452a-b4af-a00439bfbe46","label":"Property Rights"},
      {"id":"eb36dad1-86f4-48f1-bf5b-2d7a02730bef","label":"Date of Sale"},
      {"id":"49e54428-ecd8-4910-bae3-6db597603066","label":"Land Size (AC)"},
      {"id":"3552913a-1b7f-4a60-94a1-7db7cd82781c","label":"Building Size (SF)"},
      {"id":"2f17d7f2-bb46-4bed-b660-69c2cbdf9771","label":"Sale Price"},
      {"id":"db919056-df6e-451c-a23b-a2f7640ba73f","label":"Sale Price / SF"},
      {"id":"8c0b8838-885d-4e12-a843-4ae693337819","label":"Land / Bld Ratio"},
      {"id":"cd9fa344-ecac-4c32-b357-1ab25bbecd6f","label":"Age"},
      {"id":"6547cb01-44c1-4538-847b-ba0b3fd33f0a","label":"Condition"},
      {"id":"53886127-4b09-4993-ada7-c471f4ec3230","label":"Year Built"},
      {"id":"9c7a98a3-37ee-4834-8951-98c30403e628","label":"Office %"},
      {"id":"923d82d8-5b5d-43e9-a76e-5e7d39af3aa0","label":"Zoning"}
    ]'::jsonb
  ),
  (
    null,
    'Rentals',
    'SUMMARY',
    '[
      {"id":"1a11bc4d-1fe7-489b-b963-21b9a31fdb9a","label":"Address"},
      {"id":"f93e1225-4f73-4307-a011-63c5235c80ea","label":"Property Type"},
      {"id":"6576796d-c3cd-4330-9e40-06a2a016ee5f","label":"Lease Start"},
      {"id":"d4f952a5-c943-42c4-a72e-8723ed68a82a","label":"Rentable SF"},
      {"id":"9191b33f-4ee8-4164-93f1-75c9e8431823","label":"Rent / Month"},
      {"id":"3f97c731-3fc0-416d-975f-1a5422d93ecb","label":"Rent / SF / Year"},
      {"id":"b2e5e560-ee41-40c6-9a98-4ca0f566cfae","label":"Expense Structure"},
      {"id":"7d166ca4-4de0-43b6-b617-123d43a349e7","label":"Land / Bld Ratio"},
      {"id":"0e641f38-4be6-429d-8aff-892671ab27fc","label":"Age"},
      {"id":"a6e49a49-bd1b-49c2-a035-b0a75052f889","label":"Condition"},
      {"id":"1d42b2b7-6e52-4cd9-883f-240d5dbdbfe4","label":"Year Built"},
      {"id":"f61e1747-e0e8-43ed-a537-416acbbfcb50","label":"Zoning"}
    ]'::jsonb
  );
