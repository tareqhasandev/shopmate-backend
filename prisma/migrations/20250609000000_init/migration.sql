CREATE TYPE "DraftOrderStatus" AS ENUM ('DRAFT', 'CANCELLED');

CREATE TABLE "stores" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" VARCHAR(160) NOT NULL,
  "slug" VARCHAR(180) NOT NULL,
  "currency" CHAR(3) NOT NULL DEFAULT 'USD',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "stores_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "stores_name_nonempty" CHECK (length(btrim("name")) > 0)
);
CREATE UNIQUE INDEX "stores_slug_key" ON "stores"("slug");

CREATE TABLE "categories" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "store_id" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "slug" VARCHAR(140) NOT NULL,
  "description" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "categories_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "categories_name_nonempty" CHECK (length(btrim("name")) > 0)
);
CREATE UNIQUE INDEX "categories_store_id_slug_key" ON "categories"("store_id", "slug");
CREATE INDEX "categories_store_id_name_idx" ON "categories"("store_id", "name");
ALTER TABLE "categories" ADD CONSTRAINT "categories_store_id_fkey"
  FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "products" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "store_id" UUID NOT NULL,
  "category_id" UUID NOT NULL,
  "name" VARCHAR(180) NOT NULL,
  "slug" VARCHAR(200) NOT NULL,
  "description" TEXT NOT NULL,
  "sku" VARCHAR(80) NOT NULL,
  "price" DECIMAL(12,2) NOT NULL,
  "compare_at_price" DECIMAL(12,2),
  "brand" VARCHAR(120) NOT NULL,
  "image_url" TEXT NOT NULL,
  "specifications" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "tags" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "products_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "products_name_nonempty" CHECK (length(btrim("name")) > 0),
  CONSTRAINT "products_sku_nonempty" CHECK (length(btrim("sku")) > 0),
  CONSTRAINT "products_price_nonnegative" CHECK ("price" >= 0),
  CONSTRAINT "products_compare_at_price_nonnegative" CHECK ("compare_at_price" IS NULL OR "compare_at_price" >= 0)
);
CREATE UNIQUE INDEX "products_store_id_slug_key" ON "products"("store_id", "slug");
CREATE UNIQUE INDEX "products_store_id_sku_key" ON "products"("store_id", "sku");
CREATE INDEX "products_store_id_category_id_is_active_idx" ON "products"("store_id", "category_id", "is_active");
CREATE INDEX "products_store_id_brand_idx" ON "products"("store_id", "brand");
ALTER TABLE "products" ADD CONSTRAINT "products_store_id_fkey"
  FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey"
  FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "inventory" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "product_id" UUID NOT NULL,
  "available_quantity" INTEGER NOT NULL,
  "reserved_quantity" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventory_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inventory_product_id_key" UNIQUE ("product_id"),
  CONSTRAINT "inventory_available_nonnegative" CHECK ("available_quantity" >= 0),
  CONSTRAINT "inventory_reserved_nonnegative" CHECK ("reserved_quantity" >= 0),
  CONSTRAINT "inventory_reserved_not_over_available" CHECK ("reserved_quantity" <= "available_quantity")
);
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "customers" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "store_id" UUID NOT NULL,
  "full_name" VARCHAR(200) NOT NULL,
  "email" VARCHAR(254) NOT NULL,
  "phone" VARCHAR(40),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "customers_full_name_nonempty" CHECK (length(btrim("full_name")) > 0)
);
CREATE UNIQUE INDEX "customers_store_id_email_key" ON "customers"("store_id", "email");
CREATE INDEX "customers_store_id_created_at_idx" ON "customers"("store_id", "created_at");
ALTER TABLE "customers" ADD CONSTRAINT "customers_store_id_fkey"
  FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "draft_orders" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "store_id" UUID NOT NULL,
  "customer_id" UUID,
  "order_number" VARCHAR(40) NOT NULL,
  "status" "DraftOrderStatus" NOT NULL DEFAULT 'DRAFT',
  "subtotal" DECIMAL(12,2) NOT NULL,
  "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "shipping_cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "total" DECIMAL(12,2) NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "notes" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "draft_orders_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "draft_orders_subtotal_nonnegative" CHECK ("subtotal" >= 0),
  CONSTRAINT "draft_orders_discount_nonnegative" CHECK ("discount" >= 0 AND "discount" <= "subtotal"),
  CONSTRAINT "draft_orders_shipping_nonnegative" CHECK ("shipping_cost" >= 0),
  CONSTRAINT "draft_orders_total_nonnegative" CHECK ("total" >= 0),
  CONSTRAINT "draft_orders_total_matches_components" CHECK ("total" = "subtotal" - "discount" + "shipping_cost")
);
CREATE UNIQUE INDEX "draft_orders_store_id_order_number_key" ON "draft_orders"("store_id", "order_number");
CREATE INDEX "draft_orders_store_id_status_created_at_idx" ON "draft_orders"("store_id", "status", "created_at");
CREATE INDEX "draft_orders_customer_id_created_at_idx" ON "draft_orders"("customer_id", "created_at");
ALTER TABLE "draft_orders" ADD CONSTRAINT "draft_orders_store_id_fkey"
  FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "draft_orders" ADD CONSTRAINT "draft_orders_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "draft_order_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "order_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "product_name" VARCHAR(180) NOT NULL,
  "sku" VARCHAR(80) NOT NULL,
  "unit_price" DECIMAL(12,2) NOT NULL,
  "quantity" INTEGER NOT NULL,
  "line_total" DECIMAL(12,2) NOT NULL,
  CONSTRAINT "draft_order_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "draft_order_items_unit_price_nonnegative" CHECK ("unit_price" >= 0),
  CONSTRAINT "draft_order_items_quantity_positive" CHECK ("quantity" > 0),
  CONSTRAINT "draft_order_items_line_total_nonnegative" CHECK ("line_total" >= 0),
  CONSTRAINT "draft_order_items_line_total_matches_snapshot" CHECK ("line_total" = "unit_price" * "quantity")
);
CREATE INDEX "draft_order_items_order_id_idx" ON "draft_order_items"("order_id");
CREATE INDEX "draft_order_items_product_id_idx" ON "draft_order_items"("product_id");
ALTER TABLE "draft_order_items" ADD CONSTRAINT "draft_order_items_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "draft_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "draft_order_items" ADD CONSTRAINT "draft_order_items_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
