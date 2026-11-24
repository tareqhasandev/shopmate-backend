CREATE TABLE "shopping_carts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "store_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "shopping_carts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "shopping_cart_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "cart_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "quantity" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "shopping_cart_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "shopping_cart_items_quantity_positive" CHECK ("quantity" > 0),
  CONSTRAINT "shopping_cart_items_cart_id_product_id_key" UNIQUE ("cart_id", "product_id")
);

CREATE INDEX "shopping_carts_store_id_updated_at_idx"
  ON "shopping_carts"("store_id", "updated_at");
CREATE INDEX "shopping_cart_items_product_id_idx"
  ON "shopping_cart_items"("product_id");

ALTER TABLE "shopping_carts" ADD CONSTRAINT "shopping_carts_store_id_fkey"
  FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shopping_cart_items" ADD CONSTRAINT "shopping_cart_items_cart_id_fkey"
  FOREIGN KEY ("cart_id") REFERENCES "shopping_carts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shopping_cart_items" ADD CONSTRAINT "shopping_cart_items_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
