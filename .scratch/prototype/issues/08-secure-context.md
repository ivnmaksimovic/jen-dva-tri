# Secure context: how does the phone get motion sensors?

Type: grilling
Status: resolved
Blocked by: (none)

Fact (MDN): `DeviceMotionEvent` is only available in secure contexts (HTTPS).
Plain-HTTP LAN dev gets zero motion events on the phone.

## Answer

Resolved 2026-10-05: **(a) HTTPS dev server via `@vitejs/plugin-basic-ssl`.**

Confirmed understanding: we keep developing and testing the web version on
the phone (including push-the-phone controls); the native Android (Capacitor)
build and setup are left for later.
