# Firestore Security Rules — Musafir Cafe

These rules are the repository-managed baseline for the current POS and QR ordering data paths.

## Data access model

- `users/{uid}/...`: private POS data; only the signed-in account whose Firebase UID matches `uid` can read or write it.
- `shops/{uid}` and `shops/{uid}/img/{imageId}`: public read for the customer menu; only the matching shop owner can publish or change menu data.
- `orders/{orderId}`: anonymous customer create is allowed only for a published shop and only with the expected bounded order fields. Customers can fetch a single order by its opaque random tracking ID. Only the owning shop account can list its orders and update status/ETA.
- `ratings/{orderId}`: a customer can create one rating for an existing order belonging to the same shop. Only the shop owner can read ratings.
- `receipts/{receiptId}`: public get by receipt code; only the owning account can create, update, or delete its receipt/due-share record.

All other paths are denied by default.

## Deploy

1. Confirm the Firebase project selected in your deployment environment is the same project configured by the POS and customer menu.
2. Review these rules against your live Firestore collections and test with Firebase Emulator Suite before production deployment.
3. Deploy rules only: `firebase deploy --only firestore:rules`.

## Important security boundaries

- Firebase web API keys are project identifiers, not secrets. Firestore Security Rules are the actual authorization boundary.
- Customer order creation is intentionally public to support guest checkout. This baseline validates the shop and basic payload shape, but it does not provide abuse-rate limiting, bot protection, payment verification, or inventory reservation. Add App Check and server-side order intake/rate limiting before treating guest ordering as abuse-resistant.
- Order tracking and receipt links are public single-document reads. Their random IDs/codes are bearer links; anyone who obtains a link can view that document. Do not store payment credentials, authentication secrets, or highly sensitive customer data in those documents.
- The customer order page currently submits orders through the Firestore REST API and uses a local retry queue. Test guest order creation, offline retry, owner status changes, order tracking, and rating creation in the Firebase Emulator Suite before production deployment.
- These rules intentionally do not grant access to anonymous queries over all orders or ratings.

## Regression checklist

- Sign in as shop owner A; read/write only `users/A/...`.
- Confirm owner A can publish `shops/A` and its images, but cannot write `shops/B`.
- Confirm a guest can read a published menu and create a bounded order for that shop.
- Confirm a guest cannot create an order for an unpublished/nonexistent shop, set a non-new initial status, or write unexpected fields.
- Confirm owner A can list only orders where `uid == A` and update only status/ETA.
- Confirm a guest can track a known order ID but cannot query the full order collection.
- Confirm a rating must match an existing order and shop UID; owner B cannot read owner A's ratings.
- Confirm a receipt code can be fetched, but only its owner can mutate or delete it.
