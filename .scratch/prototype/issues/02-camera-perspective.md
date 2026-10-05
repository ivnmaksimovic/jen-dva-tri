# Camera perspective for the prototype?

Type: grilling
Status: resolved
Blocked by: (none)

Whole-Track high-angle view vs. zoomed follow-cam?

## Answer

Resolved 2026-10-05: fixed near-top view (almost bird's-eye, slightly
angled), v0 keeps it simple — but **no YAGNI**: camera experimentation is
expected later.

- Whole Track is NOT visible at once: real tracks span several metres, huge
  relative to 1:64 cars.
- Deliberate no-YAGNI: camera work will be revisited (rotation, zoom,
  framing).
- With slingshot-aim, the Car appearing in varying orientations on screen is
  fine — even desirable (you do push Cars backwards/diagonally).
- With push-the-phone, the camera likely needs to align behind and above the
  Car at push time (see ticket 07).
