# ShopMate AI Agent Chat API

`POST /api/aiagentchat` provides a store-scoped conversational entry point to the existing ShopMate catalog, inventory, cart, and draft-order services. The endpoint inherits the application's ShopMate bearer-token guard. `X-Store-Id` only selects a store; it is not authentication.

## Request and continuity

First turn:

```http
POST /api/aiagentchat
Authorization: Bearer <SHOPMATE_API_TOKEN>
X-Store-Id: <STORE_UUID>
Content-Type: application/json

{"message":"Show me ceramic mugs under $30"}
```

The response returns a server-generated `conversationId`. Reuse it on later turns, with the same store scope:

```json
{"message":"Add one blue ceramic mug to my cart","conversationId":"<conversation UUID>"}
```

A conversation ID is an unguessable bearer capability scoped to its store. Cart and draft-order IDs remain in server-side conversation state; the caller cannot select arbitrary cart or order IDs. A conversation from another store is returned as not found.

## Tool registry

The registry exposes 12 real service-backed operations: `search_products`, `get_product_details`, `get_recommendations`, `check_stock`, `create_cart`, `add_to_cart`, `update_cart`, `remove_from_cart`, `get_cart`, `create_draft_order`, `update_draft_order`, and `get_draft_order`.

Tool input is validated before execution. Cart and order resources are taken from the conversation state; prices and stock are obtained and checked by the existing commerce services. A draft order reserves inventory under existing order-service rules. It does not take payment. No payment operation is exposed.

Product-name cart requests first run a real catalog search. A cart mutation proceeds only when that search returns one unambiguous match; otherwise the assistant asks the customer to clarify. Questions that imply but do not clearly request a change are answered without running a mutation.

## Provider status

No model-provider dependency or configuration was present in the inspected backend. The current implementation therefore uses the provider-independent `AiAgentPlanner` interface with `DeterministicChatPlanner`. The API reports `mode: "deterministic_fallback"`; it does not claim LLM selection. A future provider adapter can implement the same planner boundary without replacing the tool registry or commerce services.

## Persistence and migration

Conversation transcript, cart ID, and draft-order ID are persisted in `ai_agent_conversations`. The migration is `prisma/migrations/20261129000000_ai_agent_conversations/migration.sql`. It has been added to the branch but intentionally not applied. Apply migrations only through the separately approved deployment/database workflow before using this endpoint against a database.

## Example response

Swagger at `/api/docs` documents the request, response, auth scope, and an illustrative catalog response. Tool results identify each actual service call and whether it succeeded; an attempted but failed call is marked `failed`.
