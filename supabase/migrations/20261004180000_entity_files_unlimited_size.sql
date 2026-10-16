-- Remove storage object size limit for entity file tabs.

update storage.buckets
set file_size_limit = null
where id = 'entity-files';
