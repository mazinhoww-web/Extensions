# MeetScribe — Privacy Policy

**Last updated: March 2026**

## 1. Overview

MeetScribe is a Chrome browser extension that transcribes meetings in real time and generates AI-powered meeting minutes. This Privacy Policy describes how data is collected, processed, and stored when you use MeetScribe.

## 2. Data Collected

MeetScribe collects the following data **only during active recording sessions**:

| Data type | Source | Purpose |
|-----------|--------|---------|
| Audio from your microphone | Browser `getUserMedia` API | Recording speech for transcription in Modo Sala and Modo Híbrido |
| Meeting captions/subtitles | Google Meet or Microsoft Teams DOM | Building a text transcript of the meeting |
| Transcribed text | Web Speech API and/or AI providers | Generating meeting minutes |
| Meeting metadata | You (title) or the platform (tab title) | Labeling and organizing meeting records |

MeetScribe does **not** collect:
- Video from your camera
- Keystrokes, clipboard contents, or any other browser activity
- Browsing history or activity outside of Google Meet / Microsoft Teams pages
- Any data when recording is not active

## 3. How Data Is Processed

### 3.1 Local processing
- The Web Speech API (SpeechRecognition) processes audio locally inside Chrome. No audio leaves your device through this path.
- Caption text scraped from the meeting platform is processed entirely in the browser.

### 3.2 Third-party AI providers
When you generate meeting minutes, the transcribed text is sent to the AI provider you have configured:

- **Google Gemini** — text is sent to `generativelanguage.googleapis.com`. Governed by [Google's API Terms of Service](https://ai.google.dev/gemini-api/terms).
- **Groq** — text is sent to `api.groq.com`. Governed by [Groq's Terms of Service](https://groq.com/terms-of-service/).
- **AssemblyAI** — audio is uploaded to `api.assemblyai.com` for speaker diarization (Modo Sala only, if you have configured an AssemblyAI key). Governed by [AssemblyAI's Privacy Policy](https://www.assemblyai.com/legal/privacy-policy).

**You control which providers are used.** If you do not configure a key for a provider, that provider is never contacted.

## 4. Data Storage

| Storage location | Data stored | Retention |
|-----------------|-------------|-----------|
| `chrome.storage.local` (your browser) | Current meeting state, caption chunks, generated minutes | Until you delete meeting history or uninstall the extension |
| `chrome.storage.sync` (your Google account) | API keys, language preference, settings | Until you clear or change them |
| `IndexedDB` (your browser) | Audio blobs recorded during the session | Deleted automatically after minutes are generated (if the "Delete audio after generating minutes" option is enabled) |
| MeetScribe servers | **Nothing** | MeetScribe has no servers and does not receive your data |

All data is stored locally in your browser or sent directly to the AI provider APIs you configure. **MeetScribe does not operate any servers and does not receive, store, or process your data on its infrastructure.**

## 5. API Keys

API keys for Gemini, Groq, and AssemblyAI are entered by you in the extension's Options page. They are stored in `chrome.storage.sync` which is tied to your Google account and synced across your Chrome installations. Keys are transmitted only to the respective provider's API endpoint when making API calls. MeetScribe never reads, logs, or shares your API keys with any third party.

## 6. Data Sharing

MeetScribe does **not**:
- Sell your data to any third party
- Share your data with advertisers
- Share your data with any party other than the AI providers you explicitly configure
- Use your data for training AI models

## 7. Children's Privacy

MeetScribe is not directed at children under 13 years of age and does not knowingly collect personal information from children.

## 8. Your Rights and Controls

You have full control over your data:
- **View and delete** meeting history directly in the extension popup (History tab)
- **Disable recording** by toggling off "Auto-start recording" in Options
- **Revoke microphone access** in Chrome's site settings at any time
- **Uninstall** the extension to delete all locally stored data
- **Clear** `chrome.storage` via Chrome's developer tools (`chrome://settings/clearBrowserData` or DevTools)

## 9. Security

API keys are stored using Chrome's built-in storage encryption. All communication with AI provider APIs is over HTTPS. MeetScribe does not introduce any HTTP endpoints or external scripts beyond what is declared in `manifest.json` `host_permissions`.

## 10. Changes to This Policy

If this policy is updated, the "Last updated" date at the top will be changed. Significant changes will be noted in the extension's release notes.

## 11. Contact

For questions, concerns, or data deletion requests, please open an issue at:
**https://github.com/mazinhoww-web/Extensions/issues**
