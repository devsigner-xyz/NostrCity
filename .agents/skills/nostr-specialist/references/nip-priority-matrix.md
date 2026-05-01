# NIP Priority Matrix

This matrix helps pick the minimum NIP set per protocol domain.

Priority levels:

- `required`: core interoperability baseline for the domain.
- `recommended`: common for production interoperability.
- `optional`: use-case specific.

| Domain | Required | Recommended | Optional | Notes |
| --- | --- | --- | --- | --- |
| Core event protocol | `01`, `09`, `10` | `18`, `25`, `31` | `14`, `22`, `24` | Signature validity and canonical event fields should be enforced first. |
| Identity and auth | `05`, `19`, `21` | `07`, `42`, `46` | `49`, `55` | Keep encoding/decoding and auth challenge behavior deterministic. |
| Relay capability and routing | `11`, `65` | `50`, `66`, `77` | `43`, `86` | Treat relay support as feature negotiation, not assumption. |
| Messaging and encryption | `17`, `44` | `59` | `C7`, `EE` | Avoid designing new flows around deprecated `04`. |
| Lists and social graph | `51` | `29`, `72` | `78`, `89` | Model list ownership and replacement semantics carefully. |
| Payments and wallets | `47`, `57` | `61`, `75` | `60`, `87` | Separate wallet control messages from social events. |
| Media and storage | `94`, `98` | `92`, `B7` | `96` | `96` exists in many systems but is marked as replaced in upstream docs. |

## Suggested Implementation Order

1. Core event correctness (`01`, signing, validation).
2. Identity/routing (`19`, `21`, `05`, relay metadata).
3. Domain-specific feature set (messaging, payments, media, groups).
4. Optional capabilities once baseline interoperability is stable.
