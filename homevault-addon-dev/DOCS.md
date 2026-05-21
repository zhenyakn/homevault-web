# HomeVault (Dev) Home Assistant Add-on

This is the **dev channel** of HomeVault. It runs pre-release builds produced
by the `Dev Release` CI pipeline on every push to the `dev` branch, so you can
test merged features before they are promoted to a production release.

Install it **alongside** the stable HomeVault add-on — it is a separate add-on
with its own slug (`homevault-dev`), so the two never collide.

## Important: use a separate database

The dev build may run schema migrations that are still under test. Pointing it
at your production database can corrupt real data.

The default `DATABASE_URL` therefore targets a **separate** database named
`homevault_dev`. Create it first:

1. Open the **MariaDB** add-on configuration.
2. Add `homevault_dev` to the `databases` list and restart MariaDB.
3. (Optional) add a dedicated user, or reuse the existing `homeassistant` user.

If you understand the risk and want to share the production database, change
`DATABASE_URL` in this add-on's configuration.

## Configuration

The options are identical to the stable add-on:

- `DATABASE_URL`: MySQL/MariaDB connection string. Defaults to the isolated
  `homevault_dev` database.
- `JWT_SECRET`: Session secret. Generated automatically if left empty.
- `LOG_LEVEL`: Defaults to `debug` for this channel to aid testing.
- See the stable add-on docs for the remaining options.

## Updating

Every push to `dev` publishes a new build and bumps this add-on's version to
`0.0.0-dev.<build-number>`. Refresh the add-on store and Home Assistant will
offer the new build as an update.

## Promoting to production

When a dev build looks good, open a pull request from `dev` to `main`. Merging
and tagging a `v*` release triggers the production `Build & Publish` workflow.
