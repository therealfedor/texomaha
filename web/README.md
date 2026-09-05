# Texomaha Web

Small multiplayer play-money Texomaha poker app.

## Run

Install Node.js 22 or newer, then:

```sh
npm install
npm run dev
```

Open `http://localhost:4173`, create two accounts in separate browsers, create a game, copy the `/join/{token}` invite link, and join from the second browser.

## Production

```sh
TEXOMAHA_JWT_SECRET="replace-with-a-long-random-secret-value" npm run build
TEXOMAHA_JWT_SECRET="replace-with-a-long-random-secret-value" npm start
```

## Deploy

The app is a single Node service that serves the React build, API routes, and Socket.IO realtime transport from the same origin. Deploy the `web/` directory to a host that supports long-running Node processes and WebSockets.

### Render

1. Push this repository to GitHub.
2. In Render, create a Blueprint from `web/render.yaml`, or create a Web Service manually with:
   - Root directory: `web`
   - Build command: `npm ci && npm run build`
   - Start command: `npm start`
   - Health check path: `/api/health`
3. Set `TEXOMAHA_JWT_SECRET` to a long random value if it was not generated automatically.
4. Add a persistent disk if you want accounts/games to survive service restarts, and set `TEXOMAHA_DATA_DIR` to the mounted path.
5. Copy the HTTPS service URL into `TexomahaWebAppURL` in `Texomaha/Info.plist`.

### Docker

```sh
docker build -t texomaha .
docker run -p 4173:4173 -e TEXOMAHA_JWT_SECRET="replace-with-a-long-random-secret-value" -v texomaha-data:/app/data texomaha
```

The server is authoritative for cards, turn order, betting, stacks, legal actions, pots, showdown, and per-player card visibility. Runtime data is persisted to `data/texomaha.json` for reconnects. `database.sql` contains the normalized schema to move persistence to Postgres/Supabase without changing the client or poker engine boundaries.

## Rules

Texomaha-specific assumptions live in `src/shared/texomahaRules.ts`. The current default is:

- each player receives 6 private cards
- before preflop betting, each player assigns exactly 2 cards to Texas and 4 cards to Omaha
- Texas is evaluated as best five from the assigned 2 Texas cards plus the shared board
- Omaha is evaluated as exactly 2 assigned Omaha cards plus exactly 3 shared board cards
- the showdown pot is split between the Texas result and the Omaha result

Change the rule module if your house version uses a different split or payout rule.
