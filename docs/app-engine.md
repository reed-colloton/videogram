# Google App Engine

Videogram runs on App Engine Standard with Node.js 24. This repository only prepares deployment; no infrastructure is created by install, build, test, or start.

## Configuration

`app.yaml` starts `npm start` on Google's `PORT` and binds to `0.0.0.0`. Google builds the app with `gcp-build`; the production server serves the resulting HTML, JavaScript, CSS, and example audio. HTTPS is required. Automatic scaling starts at zero and is capped at two F2 instances per version.

The runtime loads the OpenRouter API key from the Secret Manager secret `videogram-openrouter-api-key`, using its service account. `OPENROUTER_SECRET_NAME` can change that secret ID. The key is loaded once per instance; restart/deploy a new version after rotating it. Do not put the key in `app.yaml`, source files, or build environment variables.

Google IAP protects hosted access. Paid API routes verify the signed `x-goog-iap-jwt-assertion` (signature, issuer, audience, expiry), even if the proxy is accidentally disabled. The expected audience is derived from App Engine project metadata, or can be supplied as `IAP_AUDIENCE=/projects/PROJECT_NUMBER/apps/PROJECT_ID`. Only `npm run dev` bypasses login. Local `npm start` previews the production build and example; paid production requests still require IAP.

## Prepare your Google Cloud project

When you are ready, choose a billing-enabled project and an App Engine region. Replace `PROJECT_ID` and `REGION` below. These commands create cloud resources; they are instructions, not part of the build.

```sh
gcloud services enable appengine.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com secretmanager.googleapis.com iap.googleapis.com \
  --project=PROJECT_ID

gcloud app create --project=PROJECT_ID --region=REGION
gcloud iam service-accounts create videogram-runtime --project=PROJECT_ID
```

Skip creation if the app/service account already exists. The App Engine region cannot be changed later. Your deployer needs App Engine deployment and Cloud Build permissions and Service Account User access to the runtime account; follow Google's [deployment permissions guide](https://docs.cloud.google.com/appengine/docs/standard/roles).

Create `videogram-openrouter-api-key` in the [Secret Manager console](https://console.cloud.google.com/security/secret-manager) and add your OpenRouter key as its value. Then grant the runtime account access to that secret only:

```sh
gcloud secrets add-iam-policy-binding videogram-openrouter-api-key \
  --project=PROJECT_ID \
  --member=serviceAccount:videogram-runtime@PROJECT_ID.iam.gserviceaccount.com \
  --role=roles/secretmanager.secretAccessor
```

No downloaded service-account JSON key is needed.

## Deploy later

First run `npm ci` and `npm run check`. You can preview the production example using `npm start` at `http://127.0.0.1:8080`.

Review the upload list with `gcloud meta list-files-for-upload`. `.gcloudignore` excludes local environment files, credentials, Git history, dependencies, and generated builds. Google rebuilds from source on Linux.

Only when you choose to deploy:

```sh
gcloud app deploy app.yaml --project=PROJECT_ID \
  --service-account=videogram-runtime@PROJECT_ID.iam.gserviceaccount.com \
  --version=videogram-v1 --no-promote
```

Set up [IAP for App Engine](https://docs.cloud.google.com/iap/docs/enabling-app-engine) and grant only intended users the **IAP-secured Web App User** role. For a personal Gmail account or users outside a Cloud organization, configure an external OAuth client following [IAP external applications](https://docs.cloud.google.com/iap/docs/custom-oauth-configuration); do not rely on the organization-only Google-managed OAuth client. IAP configuration is managed in Google Cloud, not by `app.yaml`.

Open the version URL, sign in, and verify a two-slide answer, follow-up, playback, and download. Unauthenticated calls to each paid API must return 401; `/api/health` is a non-secret health endpoint. After verification, route traffic to the version:

```sh
gcloud app services set-traffic default --splits=videogram-v1=1 --project=PROJECT_ID
```

For an app's very first version, App Engine can route traffic to it even with `--no-promote`; the API's IAP verification remains required regardless. No automatic deployment or traffic changes are configured in this repository.

## Operational notes

Chats and media stay in browser memory. Refreshing clears them. Video downloads render in the browser; App Engine handles script, image, and speech requests separately. Each provider request is bounded to 120–180 seconds, within Standard's 10-minute request limit. No disk persistence, database, or background video worker is required. Restrict IAP access and set an OpenRouter key spending limit appropriate for your usage.

References: [Node runtime](https://docs.cloud.google.com/appengine/docs/standard/nodejs/runtime), [custom builds](https://docs.cloud.google.com/appengine/docs/standard/nodejs/running-custom-build-step), [signed IAP headers](https://docs.cloud.google.com/iap/docs/signed-headers-howto), [Secret Manager](https://docs.cloud.google.com/secret-manager/docs/access-secret-version).
