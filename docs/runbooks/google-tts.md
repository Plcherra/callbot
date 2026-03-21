# Google Cloud Text-to-Speech — operations

## Enable API and IAM

1. In [Google Cloud Console](https://console.cloud.google.com/) select the target project.
2. **APIs & Services → Enable APIs** → enable **Cloud Text-to-Speech API**.
3. Create a **service account** used only by the voice backend (e.g. `voice-tts@PROJECT_ID.iam.gserviceaccount.com`).
4. Grant **`roles/cloudtts.user`** (Text-to-Speech User). Do not grant broad Editor/Owner.

## Authentication (no keys in git)

**Preferred — Application Default Credentials**

- **Cloud Run / GKE**: attach the service account to the workload (Workload Identity on GKE). No JSON file.
- **Local dev**: `gcloud auth application-default login` (uses your user credentials; not for production servers).

**Service account key JSON (when ADC is not available)**

- Create a key in IAM → Service Accounts → Keys → Add key → JSON **only when required** by your host.
- Store the JSON in a secret manager (GCP Secret Manager, Vault, etc.) and inject at deploy.
- Set **`GOOGLE_APPLICATION_CREDENTIALS`** to the path of the mounted file, or pass JSON body via your platform’s secret-to-env mechanism.
- **Rotate keys**: create a new key, deploy with the new secret, then delete the old key in IAM.

## Quotas and 429 (ResourceExhausted)

- Quotas are per project (requests/minute, characters/minute). See **IAM & Admin → Quotas** filter “Text-to-Speech”.
- **429 / RESOURCE_EXHAUSTED**: temporary overload or quota. The app retries with exponential backoff + jitter. If sustained:
  - Request a quota increase in Cloud Console.
  - Reduce concurrency (fewer simultaneous calls).
  - Enable caching (`TTS_CACHE_BACKEND`) to cut repeated synthesis.

## Billing and budgets

- TTS is billed per **character** (including spaces/newlines; SSML counts include most tags — see product docs).
- Set a **billing budget** and alert thresholds on the GCP project.
- Use app logs for `tts_chars_per_utterance` / daily caps (`TTS_DAILY_CHAR_CAP`) to correlate spend.

## Troubleshooting

| Symptom | Checks |
|--------|--------|
| `403 PERMISSION_DENIED` | SA has `cloudtts.user`; API enabled; correct project. |
| `401` / invalid credentials | `GOOGLE_APPLICATION_CREDENTIALS` path, or expired ADC. |
| `400 INVALID_ARGUMENT` | Voice name + language pair valid; voice in allowlist; not blocked tier. |
| No audio on calls | Confirm `MULAW` + `8000` Hz matches Telnyx WebSocket path; compare with ElevenLabs canary. |

## Environment reference

See `.env.local.example` and `docs/VOICE_SETUP.md` for `TTS_PROVIDER`, `GOOGLE_TTS_*`, and cache settings.
