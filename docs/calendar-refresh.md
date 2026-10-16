# Profile calendar refresh

The scheduled workflow checks GitHub every six hours (`17 */6 * * *`, UTC).
GitHub may delay scheduled jobs. Manual dispatch is also available. Changes to
refresh code, tests or the workflow on main trigger a verification/refresh run;
bot commits touching only README/SVGs do not recursively trigger it. Pull requests
changing those same paths run tests with read-only permissions, without accessing
`PROFILE_TOKEN`, publishing artifacts or pushing commits.

## Two different times

- README's `updated` time is the publication time of the last changed calendar.
  It changes only when the deterministic desktop or mobile SVG differs.
- Each successful run records **Source checked successfully** in the Actions job
  summary and logs, including when the published calendar is unchanged. This
  technical check time is not committed. Consult the latest successful run of
  [Refresh profile calendar](https://github.com/mor4ee/mor4ee/actions/workflows/calendar.yml)
  to verify that a quiet calendar is still being checked. Failed runs must not
  be treated as successful source checks.

The SVG cutoff is a UTC date. A new date changes future cells to known cells and
advances the cutoff, even if its contribution count is zero. Year rollover starts
a new annual source snapshot. Counts (including tooltip counts within the same
color bin), cutoff, and the 26-week window are part of the comparison. Changes
outside the displayed 26-week window do not require republishing that window.
The existing SVGs are the saved publication state; no redundant raw API response,
hash file, or check timestamp is stored in git.

The updater renders and validates both images and README markers before writing.
If both SVGs match, it writes none of the published files and retains README
byte-for-byte. Otherwise it writes both renders and the publication timestamp.
The workflow still stages only README and the two SVGs and checks the staged diff
before committing. A failed job cannot reach the commit step.

## Private activity and failure behavior

Every run still requests the authenticated owner and GraphQL contribution calendar.
`PROFILE_TOKEN` must belong to `mor4ee` and have `read:user` (or `user`) scope.
The existing owner, scope, GraphQL-error, complete-coverage, daily-count, and total
validation remains in place; a public-only or incomplete response is rejected.
Only approved daily date/count aggregates are rendered. Repository identities,
raw responses and credentials are never published. No new secret is required.

## Verification

Run `node --test tests/*.test.mjs` (no dependency install required).
The publication regression tests use temporary git repositories to verify an empty
staged diff and unchanged file mtimes on identical data, publication of changed
counts and a new zero-activity date, year rollover, all-or-nothing validation,
repeated API checks and rejection of insufficient scopes. A compatibility test
also re-renders the current published SVGs without changing approved artwork.

Introduced on 2026-10-16 to eliminate README-only timestamp commits such as
`80d7cd8fdf8560ef0928aef87d4746dac166f0d5`. The renderer, SVG assets, profile copy,
fonts, colors and placement were not changed by this fix.
