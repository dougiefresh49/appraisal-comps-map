-- Drop redundant columns from projects table.
-- subject_data.core is the single source of truth for subject information.
-- folder_structure.subjectPhotosFolderId replaces subject_photos_folder_id.
ALTER TABLE projects DROP COLUMN IF EXISTS subject;
ALTER TABLE projects DROP COLUMN IF EXISTS subject_photos_folder_id;
