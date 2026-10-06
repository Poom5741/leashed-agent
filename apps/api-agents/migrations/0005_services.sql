-- Slice 4 — public services marketplace registry.
-- The slice-1 CLI's `marketplace register` POSTs here; the SPA's
-- `/services` page reads from here.

CREATE TABLE services (
  id             TEXT    PRIMARY KEY,
  endpoint_url   TEXT    NOT NULL,
  rail           TEXT    NOT NULL,
  price_base     TEXT    NOT NULL,
  token          TEXT    NOT NULL,
  seller_address TEXT    NOT NULL,
  signature      TEXT    NOT NULL,
  created_at     INTEGER NOT NULL
);

CREATE INDEX idx_services_endpoint ON services(endpoint_url);
CREATE INDEX idx_services_rail     ON services(rail,        created_at DESC);
CREATE INDEX idx_services_seller  ON services(seller_address, created_at DESC);