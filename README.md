# CloudArcade

CloudArcade is a browser-based game library and installable Progressive Web App (PWA). It runs user-provided ROM files with EmulatorJS; it does not include game ROMs.

## Run locally

Requirements: Node.js 20.9 or newer and PostgreSQL.

1. Install dependencies: `npm install`.
2. Copy `.env.example` to `.env` and set `DATABASE_URL` to your PostgreSQL database.
3. Apply the included database migration: `npm run db:migrate`.
4. Start the development server: `npm run dev` and open <http://localhost:3000>.

When changing the database schema, create and apply a migration with `npm run db:generate` followed by `npm run db:migrate`. `npm run db:push` is also available for local development.

For a production build, run `npm run build` and then `npm run start`. The server must have access to PostgreSQL and a writable, persistent `storage/` directory for uploaded ROMs and covers. A serverless or multi-instance deployment needs shared persistent/object storage; the current implementation writes to local disk.

## Install on a device

CloudArcade is installed from its website as a PWA, not as an APK or native emulator package. Deploy the app to a public HTTPS address with a valid TLS certificate; `localhost` is also considered secure when testing on the same computer. Keep the PostgreSQL database and uploaded-file storage available to the deployed server.

- **Android / Chrome:** open the HTTPS site, then press **Установить приложение**. If the browser does not show a prompt, use Chrome's menu and choose **Установить приложение** or **Добавить на главный экран**.
- **iPhone / iPad:** open the site in Safari, tap **Поделиться**, then **На экран «Домой»**.
- **Desktop / Edge:** use the install icon in the address bar or the browser menu's install option.

The app needs an internet connection to authenticate, read ROMs, and load the EmulatorJS runtime from its CDN. The service worker caches the offline information page and icons; it deliberately does not cache private library/API responses or game files.
