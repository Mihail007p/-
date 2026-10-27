# CloudArcade

CloudArcade is a browser-based game library and installable Progressive Web App (PWA). It runs user-provided ROM files with EmulatorJS; it does not include game ROMs. The production target is Cloudflare Workers, with D1 for account/library data and R2 for ROMs and cover art.

## Requirements

- Node.js 22 or newer
- npm
- A Cloudflare account only for remote deployment (local development and preview use Wrangler's local services)

## Local development

```bash
npm ci
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev
```

Open <http://localhost:3000>. Next.js development mode uses the bindings in `wrangler.jsonc` through OpenNext's local Cloudflare integration. `.dev.vars` is for local values and must not be committed.

To test the built app in the Workers runtime rather than Next's development server:

```bash
npm run cf:preview
```

Wrangler starts a local Worker preview (normally at <http://localhost:8787>). The D1 migration must be applied locally first. ROM uploads are stored in Wrangler's local R2 emulation.

## Cloudflare setup and deployment

1. Install dependencies and authenticate with Wrangler:
   ```bash
   npm ci
   npx wrangler login
   ```
2. Create the remote database and bucket:
   ```bash
   npx wrangler d1 create cloudarcade-db
   npx wrangler r2 bucket create cloudarcade-roms
   ```
3. Copy the D1 `database_id` returned by Wrangler into `wrangler.jsonc`. Keep the D1 binding name `DB` and R2 binding name `ROM_FILES`; if you choose a different bucket name, update `bucket_name` too.
4. Apply the D1 schema and deploy:
   ```bash
   npm run db:migrate:remote
   npm run cf:deploy
   ```
5. Wrangler prints the public `workers.dev` URL. Add a custom domain in Cloudflare if desired. The PWA requires HTTPS, which Cloudflare provides for its Worker URL.

The checked-in D1 ID is intentionally a placeholder, so remote migrations and deployment will fail until it is replaced with the ID from your Cloudflare account. Never commit credentials or `.dev.vars` values. To change the schema, run `npm run db:generate`, review the generated SQL in `drizzle/`, then apply it locally and remotely with the corresponding migration commands.

## Useful checks

```bash
npm run lint
npm run typecheck
npm run cf:build
```

## Install on a device

CloudArcade is installed from its public HTTPS website as a PWA, not as an APK or native emulator package.

- **Android / Chrome:** open the HTTPS site and press **Установить приложение**. If no prompt appears, open Chrome's menu and choose **Установить приложение** or **Добавить на главный экран**.
- **iPhone / iPad:** open the site in Safari, tap **Поделиться**, then **На экран «Домой»**.
- **Desktop / Edge:** use the install icon in the address bar or the browser menu's install option.

The app needs an internet connection to authenticate, read private ROMs, and load the EmulatorJS runtime from its CDN. The service worker caches the offline information page and icons; it deliberately does not cache private library/API responses or game files. Uploads are sent to the Worker in 20 MiB chunks to stay below Cloudflare's per-request body limit; the current app limit is 500 MiB per ROM and 8 MiB per cover.
