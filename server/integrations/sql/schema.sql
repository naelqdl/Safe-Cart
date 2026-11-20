-- SafeCart SingleStore schema (S-H1, owner hz; brief: plans/hz.md#H1). 6 tables, columnstore default,
-- within the free Shared tier's 10-table cap. Applied by seed/seed-singlestore.ts (idempotent).
CREATE TABLE IF NOT EXISTS products (sku VARCHAR(64) PRIMARY KEY, title TEXT, brand VARCHAR(80), model VARCHAR(120), upc VARCHAR(20), category VARCHAR(40), price DECIMAL(10,2), list_price DECIMAL(10,2), url TEXT, descr TEXT, attrs JSON, SORT KEY (category), SHARD KEY (sku));
CREATE TABLE IF NOT EXISTS price_obs (sku VARCHAR(64), price DECIMAL(10,2), observed_at DATETIME(6), SORT KEY (observed_at), SHARD KEY (sku));
CREATE TABLE IF NOT EXISTS wishlist (id VARCHAR(40) PRIMARY KEY, user_id VARCHAR(40), sku VARCHAR(64), target_price DECIMAL(10,2), priority INT, added_at DATETIME, SHARD KEY (id));
CREATE TABLE IF NOT EXISTS owned_items (id VARCHAR(40) PRIMARY KEY, user_id VARCHAR(40), title TEXT, brand VARCHAR(80), model VARCHAR(120), upc VARCHAR(20), purchased_at DATETIME, merchant VARCHAR(80), order_ref VARCHAR(80), source VARCHAR(40), SHARD KEY (id));
CREATE TABLE IF NOT EXISTS recalls (recall_id VARCHAR(40) PRIMARY KEY, title TEXT, brands JSON, models JSON, upcs JSON, hazard TEXT, remedy TEXT, url TEXT, published_at DATETIME, senso_content_id VARCHAR(80), active_in_demo BOOL DEFAULT FALSE, SHARD KEY (recall_id));
CREATE TABLE IF NOT EXISTS ledger (id BIGINT AUTO_INCREMENT PRIMARY KEY, run_id VARCHAR(60), at DATETIME(6), kind VARCHAR(20), title TEXT, sponsor VARCHAR(30), detail JSON, SORT KEY (at), SHARD KEY (id));
-- After loading products (seed script; "Duplicate key name" on re-run is fine):
-- ALTER TABLE products ADD FULLTEXT USING VERSION 2 ft (title, descr);
-- OPTIMIZE TABLE products FLUSH;
