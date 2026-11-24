CREATE TABLE "inventory_adjustments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "product_id" UUID NOT NULL,
  "quantity_change" INTEGER NOT NULL,
  "available_before" INTEGER NOT NULL,
  "available_after" INTEGER NOT NULL,
  "reserved_quantity" INTEGER NOT NULL,
  "reason" VARCHAR(300) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventory_adjustments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inventory_adjustments_change_nonzero" CHECK ("quantity_change" <> 0),
  CONSTRAINT "inventory_adjustments_available_before_nonnegative" CHECK ("available_before" >= 0),
  CONSTRAINT "inventory_adjustments_available_after_nonnegative" CHECK ("available_after" >= 0),
  CONSTRAINT "inventory_adjustments_reserved_nonnegative" CHECK ("reserved_quantity" >= 0),
  CONSTRAINT "inventory_adjustments_reserved_not_over_available" CHECK ("reserved_quantity" <= "available_after"),
  CONSTRAINT "inventory_adjustments_quantity_matches_change" CHECK ("available_after" = "available_before" + "quantity_change"),
  CONSTRAINT "inventory_adjustments_reason_nonempty" CHECK (length(btrim("reason")) > 0)
);
CREATE INDEX "inventory_adjustments_product_id_created_at_idx"
  ON "inventory_adjustments"("product_id", "created_at");
ALTER TABLE "inventory_adjustments" ADD CONSTRAINT "inventory_adjustments_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
