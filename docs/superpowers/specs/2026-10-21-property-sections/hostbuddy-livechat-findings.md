# HostBuddy live chat on reset.club: feasibility findings (2026-10-22)

Sources: get_api_reference (direct_integrations, master_account, general), get_product_overview, getAccount, listProperties. No write tools called.

## Current account
- user_id sloan_thereset_club, plan "HostBuddy Elite", properties_allowed 4, active.
- 4 properties, all chatbot_status ON, not locked: Barn Studio (470197), Cook House (382929), Hill Studio (411354), Zink Cabin (382943). property_id values are OwnerRez-style ids from the Calry import.

## 1. Create conversation for a no-reservation visitor, push message in
Documented route: Direct Integrations `POST /partner/receive_message` (base https://api.hostbuddy.ai).
Required body: user_id, conversation_id, reservation_ids (array), property_id, messages (array). Optional: guest_name, channel (AIRBNB|VRBO|BOOKING_COM|WHATSAPP|SMS|EMAIL|OTHER), multi_property_id.
Message: createdAt (req), senderType guest|host (req), id, body, senderName, type (CHANNEL|EMAIL|WHATSAPP|SMS), attachments.
Doc: "Notifies HostBuddy of a new message on a conversation. HostBuddy merges it and may generate an AI reply... Processed asynchronously." Returns 200 "message received and being processed".
- conversation_id is ours to choose ("stored as you provide them"); no separate create-conversation endpoint, receive_message implicitly creates.
- reservation_ids is listed required (array). Whether an empty array is accepted is NOT documented. Workaround: first POST /partner/update_guests with a reservation `status: "INQUIRY"` (documented enum) with arrival/departure dates, primaryGuest, source DIRECT, then use that id. Dates are required there (arrivalDate/departureDate), so would need placeholder dates; behaviour of inquiry journeys then firing is a side effect to check.
- property_id is required, so a visitor must be tied to one property (or multi_property_id). A generic "any property" question is not documented as supported.
General API (`/api/v1`) has NO create-conversation endpoint (only list, get, send message, draft, chatbot:toggle).

## 2. How replies come back
Direct Integrations: webhook only. HostBuddy POSTs to a receiver URL we host (`message_receiver_url` on the master account), body: user_id, conversation_id, reservation_id, message, channel, sender (hostbuddy|host), source (auto_response | journeys_<id>), sender_name, attachments. Our receiver returns success (typically with our message_id). Auth header "any partner-specific auth header you've configured."
Doc: "onboarding a new receiver currently requires HostBuddy to wire it up, so coordinate with the HostBuddy team." (Master API `POST /update_master_account_data` can set message_receiver_url via data_dict, so possibly self-serve; contradictory, ask.)
Polling alternative: General API `GET /api/v1/conversations/{id}` returns messages (sender guest|host|hostbuddy, text, time_utc, source). Works only on the account that owns the key.
Latency: NOT documented. Receive is async; no SLA. Product overview describes real-time webhook handling but gives no numbers.

## 3. Auth and account model
Direct Integrations needs two credentials plus ownership: X-API-Key (partner application key issued by HostBuddy) + Authorization Bearer master JWT. Doc: "Tokens are issued to the partner by HostBuddy (currently minted internally; there is no self-serve token endpoint)", 30 day validity (so renewals needed, or ask for longer). Target account named by body `user_id`, must satisfy users/{user_id}.sub_account_of == our master id.
Master Account API: master token from POST /login, then POST /create_subaccount, create_subaccount_property, etc. The subaccount token (GET /get_subaccount_token) is NOT a /partner/* credential; it is a session token to act as the sub-account.
Implication: the existing account sloan_thereset_club is a normal account with no sub_account_of set; docs say nothing about converting/adopting it (subaccount_link_integration adopts only for partner petscreening). So Direct Integrations realistically requires a NEW sub-account under a master account, with properties pushed by us (create_subaccount_property, update_property_details, files via ... ). Its properties are separate objects: would duplicate the 4 properties (and billing: update_subaccount_property has is_locked "drives billing"), and would not share the existing account's knowledge base/documents/SOPs/journeys/action-item notification settings. It would not conflict with the OwnerRez/Calry link (separate account), but knowledge would have to be copied (update_property_details is free-form JSON up to 650k chars; GET /partner/get_property_data could not read the other account). Docs say sub-account may optionally connect a PMS via Calry (connect_subaccount_to_pms), which could pull OwnerRez data again, doc is silent on whether the same OwnerRez credentials can be linked twice.
Who issues: HostBuddy (partner API key + master). Not self-serve. A master account becomes master "by virtue of other accounts pointing at it" but the API key and token still come from HostBuddy.

## 4. General user API on the existing account
Auth: X-API-Key hba_..., generated in account settings (self-serve), scopes read / write / messaging (messaging opt-in). Rate limited per key, 429; limits NOT documented.
Relevant endpoints: GET /api/v1/conversations (filters incl. channel e.g. `hostbuddy`), GET /conversations/{id}, POST /conversations/{id}/messages (needs write + messaging; delivers to the guest over the conversation's channel, i.e. real PMS guest), POST /conversations/{id}/draft ("Generates an AI-suggested reply to the latest guest message without sending it", returns draft, justification, conversation_id), POST /conversations/{id}/chatbot:toggle, POST /action_items (property_name, item, category, conversation_id, guest_name, assigned_to).
Gaps: no endpoint to create a conversation or inject a guest message, and draft works only on an existing conversation's latest guest message. So it cannot take arbitrary text. Not a route for website chat on its own.
Possible hint of a first-party route: Property schema has `chatbot_key`, "Public key used to initialize the property's guest chat widget." Message `source` example `direct_chat_response`, conversation channel example `hostbuddy`. This implies HostBuddy already has a guest chat widget (probably the sandbox/test chat or a product feature). The widget embed, endpoints and whether it is public/production are NOT documented. Strongest lead: ask HostBuddy about it.

## 5. Action items, schedule
- Action items: docs say the AI raises action items from conversations and routes to SMS/WhatsApp/email/Slack. Whether this applies to conversations created via /partner/receive_message in a sub-account is NOT explicitly documented; it is plausible since "reservation and message data flow into the same guest/conversation records the HostBuddy AI reads". Notifications would use the sub-account's settings, not the existing account's. Via General API we could create action items manually (POST /action_items) as a fallback escalation.
- Schedule: product overview: "set a schedule (the times HostBuddy auto-responds)"; locked or OFF property never auto-responds. Schedule applies per account, so a new sub-account needs its own schedule. Whether /partner conversations obey it: not documented. Per-conversation toggle exists (chatbot:toggle) in General API.

## 6. Blockers / unknowns
- Partner-only: Direct Integrations and Master Account need a HostBuddy-issued API key and master JWT, no self-serve. Needs HostBuddy approval and receiver wiring.
- Pricing for sub-accounts/partner: NOT documented (per-property billing via Stripe; is_locked drives billing, so duplicated properties likely count).
- Rate limits, latency, empty reservation_ids, anonymous visitor handling, public widget: NOT documented.
- Guest identity: visitors are anonymous; need a stable conversation_id per browser session, we proxy server-side (never expose keys in browser).

## Recommended route
1. Ask HostBuddy first about the property chat widget (chatbot_key / channel `hostbuddy` / source direct_chat_response): can it be embedded on reset.club for the existing account, with action items and schedule? That would keep one knowledge base.
2. If not, Direct Integrations on a new sub-account via a Cloudflare Worker proxy: browser -> worker -> POST /partner/receive_message; HostBuddy -> worker receiver (message_receiver_url) -> store in KV/DO -> browser polls/SSE. Requires: partner API key, master account + token (or longer-lived token), receiver registration, confirmation that empty/placeholder reservation works, copy of knowledge base to the sub-account, billing terms.
3. Fallback with no HostBuddy approval: Worker creates nothing in HostBuddy; instead use own LLM with knowledge base and create action items via General API POST /action_items. Not HostBuddy AI replies.

## Questions for HostBuddy
1. Is the guest chat widget (chatbot_key) embeddable on an external site, and does it support site visitors with no reservation?
2. Can we get partner API key + master account, and can the existing account sloan_thereset_club be adopted as a sub-account (keeping KB and OwnerRez link)?
3. Does /partner/receive_message accept empty reservation_ids? What happens to anonymous chats (property assignment)?
4. Expected reply latency, rate limits, token lifetime beyond 30 days, pricing.
5. Do action items and auto-respond schedule apply to partner-pushed conversations?
