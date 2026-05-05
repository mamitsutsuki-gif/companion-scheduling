# Companion Scheduling (Motiveiji Cloud)

## Local setup

```bash
npm install
npm run db:push
npm run dev
```

## Data backend mode

This app supports two backend storage modes:

- `DATA_BACKEND=prisma`: Prisma + SQLite/PostgreSQL
- `DATA_BACKEND=firebase`: Firestore-backed repositories

Configure `.env` using `.env.example`.

## Firebase settings

### Server (Firebase Admin SDK)

Option A (service account key):

- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`

Option B (keyless ADC):

- `GOOGLE_CLOUD_PROJECT`
- Run `gcloud auth application-default login` on the machine running the app

### Client (Firebase Web SDK)

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`

### Firestore files in this repo

- `firestore.rules`
- `firestore.indexes.json`

Deploy with Firebase CLI as needed:

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

or:

```bash
npm run firebase:deploy:firestore
```

## Build

```bash
npm run build
```

## Firebase E2E readiness checklist

1. `.env` sets `DATA_BACKEND=firebase`.
2. Firebase Admin auth is configured:
   - service account env vars, or
   - keyless ADC (`GOOGLE_CLOUD_PROJECT` + `gcloud auth application-default login`)
3. Firebase Web env vars are set (`NEXT_PUBLIC_FIREBASE_*`).
4. Firestore rules/indexes are deployed:

```bash
npm run firebase:deploy:firestore
```

5. Run backend smoke check:

```bash
npm run firebase:smoke
```

7. Optional: migrate legacy local SQLite data to Firestore:

```bash
npm run firebase:migrate:sqlite
```

6. Manual flow verification:
   - Login with `Firebase（Google）でログイン`
   - Admin sets role (`CLIENT`/`PARTNER`) on `/admin/matches`
   - Create match
   - Open room, send chat
   - Propose 3-5 slots, vote, confirm
   - Verify notification email contains room URL
