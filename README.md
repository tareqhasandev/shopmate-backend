# ShopMate AI backend foundation

Standalone TypeScript/NestJS REST API for the ShopMate AI e-commerce assessment. It is intentionally isolated from the Agentplace agent runtime so the assessment's conventional backend can evolve without changing platform-owned server infrastructure.

## Requirements

- Node.js 20+ (tested with Node 24)
- PostgreSQL 13+
- npm

## Local setup

```sh
cp .env.example .env
# Edit DATABASE_URL to point at your PostgreSQL database with schema=shopmate.
npm install --include=dev
npm run prisma:generate
npm run prisma:migrate:deploy
npm run seed
npm run start:dev
```

For local schema development, `npm run prisma:migrate:dev -- --name change_name` creates and applies a migration. By default, set `SHOPMATE_API_TOKEN` in `.env` to a unique random secret of at least 32 characters; for example, generate one with `openssl rand -hex 32`. To test every REST operation through Swagger without a token, set `SHOPMATE_PUBLIC_TEST_API=true` only on a disposable demo deployment. That mode exposes all REST reads and writes to anyone who can reach the API, limited to one configured store; never use it with real data. Do not commit `.env`; use deployment secret management for private credentials. The checked-in `.env.example` contains no real credentials.

## Environment

- `DATABASE_URL` (required): PostgreSQL connection string targeting the dedicated `shopmate` schema. This keeps ShopMate objects separate from other apps sharing the same database.
- `PORT` (default `3001`): API listener port.
- `CORS_ORIGINS` (default `http://localhost:3000`): comma-separated allowed origins.
- `SHOPMATE_DEFAULT_STORE_ID` (default `00000000-0000-4000-8000-000000000001`): UUID used by the seed and requests without `X-Store-Id`.
- `SHOPMATE_PUBLIC_TEST_API` (default `false`): set `true` only for disposable public testing. Every REST route becomes unauthenticated, but requests are restricted to `SHOPMATE_API_STORE_ID` or the default store. This permits public writes and exposes that store's data.
- `SHOPMATE_API_TOKEN` (required unless `SHOPMATE_PUBLIC_TEST_API=true` or `NODE_ENV=test`): private bearer token, at least 32 characters; configure the same value in this backend and the trusted Agentplace server.
- `SHOPMATE_API_STORE_ID` (optional): binds protected requests or public test mode to one store; defaults to `SHOPMATE_DEFAULT_STORE_ID`.
- `NODE_ENV` (default `development`).

## Agentplace connection

The Agentplace server has a `shopmateOrders` tool for live catalog search and unpaid draft creation/updates. To enable it, configure these server-side secrets on the Agentplace environment (not in browser code):

- `SHOPMATE_API_URL`: reachable HTTPS ShopMate API base URL (for example, the service origin or an origin ending in `/api`); plain HTTP is accepted only for localhost development.
- `SHOPMATE_API_TOKEN`: the same private, random token configured in the ShopMate backend environment.
- `SHOPMATE_STORE_ID`: the UUID that matches `SHOPMATE_API_STORE_ID` on the backend.

The tool is not registered until all three are present and valid. It fixes the store scope server-side and does not expose credentials to the model. Missing URL/token/store configuration means the live agent operation is unavailable; testing the REST API by itself does not verify this connection.

## API

The global prefix is `/api`; Swagger UI is at `http://localhost:3001/api/docs` and its OpenAPI JSON is at `/api/docs-json`. Both documentation endpoints are publicly readable. Enable `SHOPMATE_PUBLIC_TEST_API=true` and restart the backend to execute **all** documented REST operations from Swagger without a bearer token. In that mode, requests are restricted to the single configured test store; the UI warns that anyone with network access can read and mutate that store. For cross-origin browser clients, add their origin to `CORS_ORIGINS` (the hosted Swagger UI itself is same-origin).

- `GET /api/health` — checks the API and database connection.
- `GET /api/categories` — list store categories.
- `GET /api/products` — paginated active catalog with `min_price`, `max_price`, `category`, `brand`, `in_stock`, `search`, `sort_by`, `sort_order`, `page`, and `limit` filters.
- `GET /api/products/search?search=...` — search active products by name, brand, SKU, or tags; accepts the same filters.
- `GET /api/products/featured` — paginated active featured products; accepts the same filters.
- `GET /api/products/categories` — categories with active product counts.
- `GET /api/products/category/:slug` — paginated active products in a category.
- `GET /api/products/:id` — active product detail by UUID; the Phase 1 slug form remains accepted for compatibility.
- `POST /api/products` — create an active product and its initial inventory record.
- `PATCH /api/products/:id` — update product fields and, optionally, available stock.
- `DELETE /api/products/:id` — safely deactivate; it does not physically delete products.
- `GET /api/inventory?page=1&limit=20` — paginated store inventory, including products with no inventory row (shown as zero stock).
- `GET /api/inventory/:productId` — physical available stock, reserved stock, and derived sellable quantity.
- `GET /api/inventory/:productId/availability` — explicit `in_stock`/`out_of_stock` status and sellability.
- `PATCH /api/inventory/:productId` — set `availableQuantity`; it cannot be lower than existing draft-order reservations. Reservations change through draft creation/cancellation.
- `POST /api/inventory/:productId/adjustments` — apply a signed `quantityChange` with a required `reason`; each accepted change is durably audited.
- `POST /api/customers` — create a customer profile; there is no public customer listing endpoint.
- `POST /api/cart` — create an empty cart or create one with initial products.
- `GET /api/cart/:id` — retrieve cart items, current database prices, availability, and subtotal.
- `POST /api/cart/:id/items` — add a product or increase its existing line quantity.
- `PATCH /api/cart/:id/items/:itemId` — set a cart line quantity.
- `DELETE /api/cart/:id/items/:itemId` — remove a line and recalculate the subtotal.
- `DELETE /api/cart/:id` — delete a cart and its items.
- `POST /api/orders/draft` — create a draft from a cart or direct product IDs/quantities; stock is checked and reserved atomically. Prices are read from the database.
- `GET /api/orders/:id` and `GET /api/orders` — retrieve an order or list store-scoped orders with optional status and pagination filters.
- `PATCH /api/orders/:id` — update draft customer or notes; pricing and status are server-controlled.
- `PATCH /api/orders/:id/items/:itemId` — change a draft line quantity, adjust its reservation, and recalculate totals from the stored price snapshot.
- `DELETE /api/orders/:id/items/:itemId` — remove a draft line and release its reservation.
- `POST /api/orders/:id/confirm-draft` — confirm a non-empty draft, keeping its reservation and initiating no payment.
- `POST /api/orders/:id/cancel` — cancel a draft and release its stock reservation. The previous `POST /api/orders/drafts` creation path remains as a deprecated compatibility alias.

With `SHOPMATE_PUBLIC_TEST_API=false` (the default), catalog, health, and Swagger reads are public, while all writes and private inventory/cart/order reads require `Authorization: Bearer <SHOPMATE_API_TOKEN>`. Set `SHOPMATE_PUBLIC_TEST_API=true` on a disposable test instance to make every REST route public and usable from Swagger without credentials; this mode is restricted to one store (`SHOPMATE_API_STORE_ID`, or the default store) and permits anyone to modify its products, inventory, carts, customers, and draft orders. Never enable it with real stores or customer data. In either mode `X-Store-Id: <uuid>` is only a routing selector; protected credentials and public test mode are limited to the configured store. ShopMate is a demo service without production rate limiting, role-based access, or fulfillment controls. Public catalog reads never return inactive products. Product deletion is a soft deactivation to preserve order references. Inventory writes are serialized per product and database constraints prevent negative or inconsistent quantities. Draft-order creation locks the relevant products, checks requested quantities against current sellable stock (`available_quantity - reserved_quantity`), and atomically reserves the units for that draft. Cancelling a draft releases its reservation. Drafts never charge or call a payment provider; order items capture product name, SKU, and unit-price snapshots.

Successful responses use `{ "data": ... }`; failures use a stable `{ "error": { "code", "message", "details?" }, "path", "timestamp" }` envelope. Order monetary fields are serialized consistently as two-decimal strings.

## Database and seed

The Prisma schema and checked-in SQL migrations are under `prisma/`. The catalog migration adds `is_featured` to the existing Product table; no duplicate product table is introduced. Phase 3 adds the inventory-adjustment audit table. Phase 4 adds store-scoped `shopping_carts` and `shopping_cart_items` tables. Phase 5 adds the `CONFIRMED` draft-order status without adding any payment state or provider integration. The idempotent seed creates one demo store, five categories, 15 fictional products, stock records including two out-of-stock items, and a small featured set. It does not seed customer records. Prices use PostgreSQL `DECIMAL(12,2)`, timestamps are `TIMESTAMPTZ`, and inventory/order checks are also enforced in SQL.

## Checks

```sh
npm run build
npm test
npm run test:integration
npm run prisma:status
```

Cart contents are separate from draft orders and do not reserve inventory. Every cart mutation validates current sellable stock under a product-row lock and calculates prices from the database. Draft creation copies either cart lines or direct product IDs and quantities, validates sellable stock, snapshots the current database prices, and reserves stock atomically. Draft item quantity changes update both the reservation and totals using the saved unit-price snapshot. Only DRAFT orders can be edited or cancelled; confirmation changes status to CONFIRMED and retains the reservation. Every order response includes `paymentStatus: NOT_PROCESSED`; no route charges a customer, invokes a payment provider, or creates a paid status.

The integration suite requires a reachable PostgreSQL URL with `schema=shopmate`. It creates a unique disposable test store, exercises catalog, inventory, cart, and order HTTP endpoints (including draft creation from carts and direct product lines, stock changes and reservations, quantity edits, snapshot-price recalculation, deletion, confirmation without payment, and Swagger error documentation), then removes that store and its fixtures. Applying migrations, seeding, and `/api/health` verification also require the scoped database URL.
