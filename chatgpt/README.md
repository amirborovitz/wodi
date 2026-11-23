# Wodi for ChatGPT

Website: https://www.wodi.fit
MCP endpoint: https://wodi-chatgpt-ykhzfuxbnq-uc.a.run.app/mcp

Lives in the Wodi app repo (wodboard/chatgpt) and imports the app's live code — nothing is copied. Tools: read_board, answer_board, save_board (logging), generate_poster, get_poster (posters), and workout_history, movement_history, personal_records (history).

## Workout and poster workflow

Logging is Wodi's own conversation, never a shape ChatGPT writes. read_board sends the board's words verbatim to the app's reader (parseWorkoutSession; needs OPENAI_API_KEY) and returns Wodi's first question; the draft lives in chatgptDrafts (server-only, 24 h). answer_board takes the athlete's words per question — read by the app (readAnswerLocally) and applied by the shared engine (src/components/tellWodi/chatSession.ts). save_board refuses while Wodi has a question, then builds the workout with the app's buildSavedWorkoutTotals + buildWorkoutDocument, dated now unless the athlete named a day. A Firestore transaction saves it, updates counters once and saves PR events; is_test suppresses counters/PRs. Retry uncertain saves with the same request_id. If generation fails after a save, retry generation against the existing workout_id. The logic without Firestore is chatgpt/src/boardFlow.ts, tested on a real board in test/boardFlow.test.ts.

generate_poster runs the original usePosterPayload -> useCelebrationData -> PosterCard pipeline in isolated Chromium. It renders every multipart page, uses bundled fonts and the owner's weight, and supports all 11 current skins, including the original nine. Photo overlays are omitted; arbitrary browser network fetches are blocked. Text stickers remain. Print dates use UTC; supply sourceDate for an explicit local training calendar date.

Images are private in bucket wodi-chatgpt-posters-1003629121410, under chatgpt-posters/{uid}/{posterId}/{page}.png. Metadata is server-only in chatgptPosters. get_poster checks ownership and underlying workout existence, then returns standard MCP images plus the inline MCP Apps widget. No public image URL is issued.

workout_history, movement_history, and personal_records query the connected athlete's real data. Movement history uses an exact exercise name, ignoring case. The integration does not edit/delete workouts or publish feed posts.

## Authentication

A complete OAuth/OIDC server now runs alongside MCP using the established oidc-provider library. No Auth0 tenant or manual Firebase UID mapping is required. Users sign in with their existing Wodi Google account or existing email-code functions. Password sign-in supports accounts that already have one, including the dedicated reviewer account. The server verifies the Firebase ID token and Wodi profile, then obtains explicit consent.

Security includes PKCE S256, exact callback validation, issuer identification, resource/audience binding to /mcp, one-use codes, one-hour opaque access tokens, rotating refresh tokens, and revocation. Disabled/deleted Firebase accounts immediately lose access. Public endpoints have rate limits; Cloud Run also caps concurrency and instance count. Missing tool scopes return a step-up challenge.

The predefined public OAuth client is wodi-chatgpt, token endpoint authentication method none: there is NO client secret. The stable callback is https://chatgpt.com/connector_platform_oauth_redirect. Restricted dynamic registration also supports ChatGPT callback-ID paths. Remote client-metadata fetch URLs are rejected. The consent screen lists requested workout/poster and OIDC identity/offline permissions.

Server-only wodiOAuthKeys/current holds persistent signing/cookie material. wodiOAuthStore holds grants, sessions and tokens. Existing Firestore client rules deny both collections by default. The adapter enforces expiry at read time; a Firestore TTL policy on wodiOAuthStore.expiresAt can remove expired records. Never apply TTL to signing keys or export private keys into a plugin package.

## Production

Project: wodboard-17f3d. Region: us-central1. Cloud Run service: wodi-chatgpt.
Runtime account: wodi-chatgpt@wodboard-17f3d.iam.gserviceaccount.com.
Permissions: roles/datastore.user, roles/firebaseauth.viewer, and object access restricted to the dedicated poster bucket/prefix. The live app's existing photo bucket and ACLs are untouched.

The container uses Application Default Credentials/workload identity, not downloaded service-account keys. Cloud Run permits public ingress for discovery/OAuth, while MCP requires application-level tokens. Limits: 2 CPUs, 2 GiB RAM, concurrency 1, max 2 instances, 300-second timeout. The service hostname is authorized in Firebase Auth.

Required environment:
- PUBLIC_URL=https://wodi-chatgpt-ykhzfuxbnq-uc.a.run.app
- GOOGLE_CLOUD_PROJECT=wodboard-17f3d
- FIREBASE_STORAGE_BUCKET=wodi-chatgpt-posters-1003629121410
- FIREBASE_WEB_CONFIG_JSON: the existing public Firebase browser config as JSON, available from Firebase Hosting /__/firebase/init.json.

Optional environment:
- OAUTH_REDIRECT_URIS: explicit additional callbacks for an administrator-configured client.
- OPENAI_DOMAIN_CHALLENGE: the exact publishing-portal token. Served verbatim at /.well-known/openai-apps-challenge.

OAuth discovery: /.well-known/openid-configuration.
Protected-resource discovery: /.well-known/oauth-protected-resource/mcp and the root variant.
Support, privacy and terms: /support, /privacy, /terms.
Use /support or the root page for external availability checks; Google Frontend intercepts /healthz on this deployment.

Build the container from the **wodboard repository root** (not chatgpt/) using chatgpt/Dockerfile — the root `.dockerignore` keeps every `.env` and service-account key out of the image. Future updates can use Cloud Build/Artifact Registry and Cloud Run with the same service account/environment. Preserve the issuer URL and signing material. Main Wodi Hosting and existing Firebase Functions need no deployment changes.

**New since the board-reader rebuild:** the service needs `OPENAI_API_KEY` (the app's board reader runs on the server). Give it as a Secret Manager secret, for example `--set-secrets OPENAI_API_KEY=<secret-name>:latest` on `gcloud run deploy`; never as a plain env var or in the image. The server refuses to start without it.

    # from the wodboard repo root — IMAGE is your Artifact Registry path for wodi-chatgpt
    docker build -f chatgpt/Dockerfile -t IMAGE .
    docker push IMAGE
    gcloud run deploy wodi-chatgpt --image IMAGE --region us-central1 \
      --set-secrets OPENAI_API_KEY=<secret-name>:latest
    # keep the service's existing env vars, service account and region as they are today

## Build and test

From the root: npm ci. Then in chatgpt:

    npm ci
    npm run build
    npm run typecheck
    npx playwright install chromium
    npm test
    npx firebase emulators:exec --project demo-wodi --config ../firebase.e2e.json --only auth,firestore,storage "npm run test:e2e"

The emulators require Java 21+. Tests cover all skins, multipart output, inline widget initialization/results, authentication compatibility, real OAuth/Firebase linking, consent, PKCE and callback/resource binding, code replay, refresh rotation, revocation, disabled accounts, retries/counters/PRs, private storage, invalid inputs, isolation, and deletion revocation.

Production is additionally verified with a dedicated synthetic reviewer account: OAuth login, all six tools, logging deduplication, history/records, Cloud Chromium image generation, private retrieval, token refresh and revocation. No real athlete's history is used for tests.

Root checks: TypeScript, 1,525 passing tests (one existing skip), and 69 matching poster fixtures. The full release:check was run; the separate offline parser corpus reports cached-parse failures in this environment, so the full gate is NOT reported green. The main Wodi application is not released or replaced by this deployment.

## Install and publish

The portable plugin lives in ../plugin: manifest, OAuth MCP configuration, Wodi artwork, workflow skill, and five positive/three negative review cases. It contains no passwords, OAuth secrets, or account tokens.

For a private connection, add the MCP endpoint in ChatGPT with OAuth, client ID wodi-chatgpt, authentication method none, no secret, and the advertised scopes. For publication, upload the plugin ZIP in OpenAI's publishing dashboard, connect and scan the server, configure the domain challenge, provide reviewer credentials separately, and resolve findings.

The dedicated synthetic review credentials are in Google Secret Manager secret wodi-chatgpt-reviewer. Never put them in the ZIP. Live ChatGPT installation and publication require the signed-in publishing UI; OpenAI approval is external and is not implied by server tests.

References:
- https://developers.openai.com/plugins/build/auth
- https://developers.openai.com/plugins/build/chatgpt-ui
- https://developers.openai.com/plugins/deploy/submission
