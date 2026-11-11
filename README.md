# MeetIQ

AI voice notes for Android. Record or import audio, transcribe it, then read the summary, key points, action items, and chat with the note. Sign-in is a device id. There is no email or password.

```
/server   Node 22 + Express + TypeScript + Mongoose
/app      Expo SDK 54 React Native app (Android package com.meetiq.app)
```

The app is built to open even when the API is asleep, the phone is offline, or AdMob / RevenueCat fail to start. Those SDKs are initialized in try/catch and never block the first screen.

## API

`GET /health` always returns `{ "ok": true }` and does not need a database.

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/auth/device` | `{ deviceId }` upserts the user and returns a JWT |
| GET, PATCH | `/api/me` | Profile, language, notification preference |
| GET, POST, PATCH, DELETE | `/api/folders` | Per-user folders. New users get Meetings, Lectures, Interviews, and Ideas |
| GET, PATCH, DELETE | `/api/notes` | Notes for the signed-in user |
| POST | `/api/notes/transcribe` | Multipart field `audio` (max 25 MB). Groq `whisper-large-v3-turbo`, then `llama-3.1-8b-instant` for summary, key points, and action items |
| POST | `/api/notes/:id/chat` | Ask a question answered only from that transcript |
| POST | `/api/usage/reward` | Adds 10 free minutes after a rewarded ad. `{ rewardId }` is idempotent |
| POST | `/api/revenuecat/sync` | Client sends the `premium` entitlement from customerInfo |
| POST | `/api/revenuecat/webhook` | RevenueCat subscription events. Matches `app_user_id` to the device id |

Free accounts get 100 transcription minutes total and 8 audio imports. Premium (`premium` entitlement) gets 1,200 minutes per calendar month and unlimited imports. Audio is not stored on the server after transcription, because Render’s disk is ephemeral. Playback uses the file kept on the phone.

### Render env vars

Set these on the web service. Do not commit real values.

| Variable | Required | Purpose |
| --- | --- | --- |
| `MONGODB_URI` | Yes | MongoDB connection string |
| `JWT_SECRET` | Yes | Signs device-login tokens |
| `GROQ_API_KEY` | Yes, for transcription and chat | Groq key. If it is missing the API returns **503** instead of crashing |
| `GROQ_CHAT_MODEL` | No | Defaults to `openai/gpt-oss-20b` |
| `DEEPGRAM_API_KEY` | No | Live and imported audio use Deepgram nova-3 with diarization. If it is missing or Deepgram fails, Groq Whisper is used |
| `SUPADATA_API_KEY` | No | YouTube import reads captions from Supadata first. If it is missing, out of quota, or the video has no captions, the previous YouTube path is used |
| `REVENUECAT_WEBHOOK_SECRET` | No | If set, webhook calls must send `Authorization: Bearer <secret>` |
| `RENDER_EXTERNAL_URL` | Set by Render | Used to ping `/health` every 10 minutes so the free instance stays awake |
| `PORT` | Set by Render | Process listens on `0.0.0.0:$PORT` |

`render.yaml` describes the Docker web service. Point the RevenueCat webhook at `https://<your-service>/api/revenuecat/webhook`. The app sends the device id as the RevenueCat app user id.

Local server:

```bash
cd server
cp .env.example .env
npm install
npm run build
npm start
```

## App

`app.json` `extra.apiUrl` is `https://meetiq-api.onrender.com` until you replace it with the real Render URL. `extra.revenuecatAndroidKey` is the public Android SDK key. Entitlement id is `premium`. Offering `default` uses `$rc_monthly` (`meetiq_monthly`) and `$rc_annual` (`meetiq_yearly`). If RevenueCat fails to configure, the paywall still opens and explains that billing is unavailable.

Ads (AdMob) show only for free users: banner on Home, a native ad in the notes list, an interstitial after transcription at most once every 3 minutes, an app-open ad on cold start after the first launch, and a rewarded ad that grants 10 minutes. `__DEV__` builds use Google test ad units. Release builds use the live units.

```bash
cd app
npm install
npx expo start
```

Release APK (needs the Android SDK):

```bash
cd app
npx expo prebuild --platform android --no-install
cd android && ./gradlew assembleRelease
```

A release APK built from this repo is published as `meetiq-v1.apk` alongside the build artifacts. The upload keystore is not committed.
