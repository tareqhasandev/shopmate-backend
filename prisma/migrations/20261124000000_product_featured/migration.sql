ALTER TABLE "products"
  ADD COLUMN "is_featured" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "products_store_id_is_active_is_featured_idx"
  ON "products"("store_id", "is_active", "is_featured");
