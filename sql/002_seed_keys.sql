-- Optional one-time seeds; runtime will overwrite with fresh hashes via ensureKeyHashes()
insert into api_keys (name, key_hash, role)
values
  ('billing-writer', '$2a$10$placeholderplaceholderplaceholderpl', 'writer'),
  ('admin-ui',       '$2a$10$placeholderplaceholderplaceholderpl', 'admin'),
  ('sa',             '$2a$10$placeholderplaceholderplaceholderpl', 'sa')
on conflict (name) do nothing;
