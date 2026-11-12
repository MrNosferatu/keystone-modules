# Keystone modules

The bank of site modules for the Keystone browser extension. Modules are data,
never code. The only copy lives here: Keystone's database doesn't hold them.

Each push to `main` checks the modules, signs them with Ed25519 and publishes
`index.json` to the `published` branch. The extension downloads it, verifies each
signature with the public key built into it, and ignores anything else. It also
ignores a module older than one it has already seen. The repo has to be public, as
the extension reads it without signing in.

Which modules you install, whether they're on, and which fields they send are
kept in the extension.

Installed modules update by themselves. The extension looks every 6 hours, on browser
start, and an hour after a failed download. Choosing **Refresh** looks straight away.

## Set up

1. `npm run keygen` prints a key pair.
2. `MODULE_SIGNING_KEY` goes in this repo's GitHub secrets (Settings → Secrets and
   variables → Actions). Don't commit it.
3. `WXT_RECIPE_PUBLIC_KEY` goes in the extension's build settings.

## Add or change a module

Add `modules/<slug>.json`, or edit one and raise its `version`; the check fails
otherwise. Delete the file to remove it. Then push to `main`.

```
npm test
npm run check
```

There are three ways to read a site:

**API Call:** the extension calls the address itself. Can run on a schedule.

```json
{
  "version": 1,
  "name": "GitHub",
  "description": "Followers and join date from a public profile.",
  "domain": "github.com",
  "modes": ["manual", "auto", "scheduled"],
  "source": { "type": "api", "url": "https://api.github.com/users/{username}" },
  "fields": [
    { "key": "followers", "label": "Followers", "path": "followers", "transform": "number" },
    { "key": "joined", "label": "Join date", "path": "created_at", "regex": "^(\\d{4}-\\d{2}-\\d{2})" },
    { "key": "profile", "label": "Profile link", "template": "https://github.com/{username}" }
  ]
}
```

For an API that needs you signed in, add `"session": true` and `"identity"`, the
path to the username in the answer. A value is only stored if it matches the
service, so another signed-in account can't overwrite it.

For an API that takes a key, add `"auth": "key"`, `"identity"`, and `"identityUrl"`, an
address on the same site that names the key's owner. Each account saves its own key in
the extension's Settings. The owner is checked first, and nothing else is read if it
isn't the service's username. A key never reaches Keystone.

A field with `"items"` sends a list, up to 25 entries: `path` points at the list, and
`items` names up to 8 paths inside each entry. Keystone only stores it for a key set up
as Object / List.

**Captured Response:** reads a response the site's own page receives, when its
path and query match `match`. Nothing extra is requested from the site. Needs the
site open, so no schedule.

```json
{
  "version": 1,
  "name": "Example",
  "domain": "example.com",
  "modes": ["manual", "auto"],
  "source": { "type": "intercept", "match": "^/api/me", "identity": "user.name" },
  "fields": [{ "key": "balance", "label": "Balance", "path": "user.balance", "transform": "number" }]
}
```

Only the fields ticked reach Keystone; the rest of the response is dropped in the
extension. Without `identity`, the account comes from the page's address, or the
site having only one service. Otherwise nothing is stored.

**Scrape Page:** reads elements of an open page. Needs the site open.

```json
{
  "version": 1,
  "name": "Example",
  "domain": "example.com",
  "pages": ["^/u/"],
  "modes": ["manual", "auto"],
  "source": { "type": "page" },
  "fields": [{ "key": "karma", "label": "Karma", "selector": "[data-testid=karma]", "regex": "([\\d,]+)", "transform": "number" }]
}
```

Add `"namedInAddress": true` to `source` where anyone's page can be open, like a
profile. Only a page with the service's username in its address is read, so someone
else's values can't be stored on your account.

Add `"send": "changed"` at the top of a page or intercept module to send as soon as
a value differs from the last one sent, instead of at most once an hour. A captured
response is compared each time the page receives it; a page is watched for as long as
it's open. It needs Auto, is limited to one send a minute per service (a change in
between waits its turn), and shows in the popup as **When it changes**.

A field reads from one of `path` (API, captured), `selector` with optional `attr`
(page), or `template`. `regex` keeps its first group. `transform` is `number`,
`unix_date` or `exists`. `label` is its name when choosing what to send. Sources
only read from `domain` or its subdomains.

## Publish your own repository

Anyone can publish modules this way: fork or copy this repo, make a key with `npm run
keygen`, add `MODULE_SIGNING_KEY` to the repo's secrets, and push. People then add your
repo under **Module Providers** in the extension's Settings. They need its address, like
`https://github.com/you/your-modules`, or any address serving `dist/index.json`.

Their extension pins the `publicKey` published in `index.json` when they add it, and
stops updating from a repo whose key changes. Your modules keep their own names, so
they can't replace Keystone's or another repo's. If an update changes a module's
`domain`, `source` or `pages`, it's turned off until the person turns it on again.

## Your own modules

The extension's Settings has **Custom Modules** for a module only you use. Paste the
same JSON there. It's kept in that browser and isn't signed; nothing here is involved.

## Try it with a debug build

```
npm run build   # needs MODULE_SIGNING_KEY in .env
npm run serve   # http://localhost:4310/index.json
```

Point the extension's debug build at that address with `WXT_MODULES_URL`.
