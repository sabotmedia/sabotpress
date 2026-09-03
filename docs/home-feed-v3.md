# Homepage feed v3

The public homepage now renders cards through `HomeFeedCard` inside `home-feed-grid`.

This class family is intentionally isolated from the historical `publication-post-card`, `publication-hero-card`, and `publication-recent-grid` CSS accumulated in `styles.css` and responsive compatibility layers.

The homepage root exposes `data-home-renderer="v3"` and the recent grid exposes `data-home-grid="v3"` so a deployed browser can be inspected without inferring renderer version from appearance.

Title display modes:

- `hidden`: full natural-ratio image, screen-reader title only.
- `overlay`: image region followed by normal-flow title content pulled over the image edge with a negative margin. Long headlines grow the card and are never clamped.
- `below`: natural-ratio image followed by normal-flow metadata/title.
