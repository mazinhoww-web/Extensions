// MeetScribe — AssemblyAI Real Voice Diarization
// Used in Modo Sala (mic / hybrid) to identify different speakers by voice.
// API key is configured by the user in extension options (chrome.storage.sync 'assemblyaiApiKey').

const BASE = 'https://api.assemblyai.com';
const POLL_INTERVAL_MS = 3000;
const TIMEOUT_MS = 10 * 60 * 1000; // 10 min max

/**
 * Retrieves the AssemblyAI API key from user settings.
 * Throws a descriptive error if not configured.
 */
async function getAssemblyAIKey() {
  const { assemblyaiApiKey } = await chrome.storage.sync.get('assemblyaiApiKey');
  if (!assemblyaiApiKey) {
    throw new Error(
      'Chave AssemblyAI não configurada. Acesse as Configurações da extensão e insira sua API key do AssemblyAI para identificação de falantes por voz.'
    );
  }
  return assemblyaiApiKey;
}

/**
 * Tests an AssemblyAI API key by making a minimal authenticated request.
 * Resolves if valid, throws if invalid.
 */
export async function testAssemblyAIKey(key) {
  const res = await fetch(`${BASE}/v2/transcript`, {
    method: 'POST',
    headers: {
      authorization: key,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ audio_url: 'https://example.com/test.mp3' }),
  });
  // 400 with a JSON body is expected (bad URL) — that means the key itself is valid
  if (res.status === 401 || res.status === 403) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error || `HTTP ${res.status}`);
  }
  // Any other status (400, 422, etc.) means the key was accepted
}

/**
 * Transcribes audio blobs with real speaker diarization via AssemblyAI.
 * @param {Blob[]} audioBlobs - Array of WebM audio chunks from the recorder
 * @returns {Promise<Array<{speaker, text, timestamp, source, platform}>>}
 */
export async function transcribeWithAssemblyAI(audioBlobs) {
  const apiKey = await getAssemblyAIKey();

  // 1. Combine all recorded chunks into one blob
  const audioBlob = new Blob(audioBlobs, { type: 'audio/webm' });

  // 2. Upload audio to AssemblyAI
  const uploadRes = await fetch(`${BASE}/v2/upload`, {
    method: 'POST',
    headers: {
      authorization: apiKey,
      'content-type': 'application/octet-stream',
    },
    body: audioBlob,
  });
  if (!uploadRes.ok) throw new Error(`AssemblyAI upload falhou: ${uploadRes.status}`);
  const { upload_url } = await uploadRes.json();

  // 3. Create transcription job with speaker diarization
  const transcriptRes = await fetch(`${BASE}/v2/transcript`, {
    method: 'POST',
    headers: {
      authorization: apiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      audio_url: upload_url,
      speaker_labels: true,
      language_detection: true,
      speech_model: 'universal',
    }),
  });
  if (!transcriptRes.ok) throw new Error(`AssemblyAI job falhou: ${transcriptRes.status}`);
  const { id } = await transcriptRes.json();

  // 4. Poll until completed
  const pollingUrl = `${BASE}/v2/transcript/${id}`;
  const deadline = Date.now() + TIMEOUT_MS;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    const result = await fetch(pollingUrl, {
      headers: { authorization: apiKey },
    }).then((r) => r.json());

    if (result.status === 'completed') {
      // 5. Format utterances as caption chunks compatible with normalizeTranscript()
      const audioDurationMs = (result.audio_duration || 0) * 1000;
      const baseTime = Date.now() - audioDurationMs;

      const rawChunks = (result.utterances || []).map((u) => ({
        speaker: `Falante ${u.speaker.charCodeAt(0) - 64}`,
        text: u.text,
        timestamp: baseTime + u.start,
        durationMs: u.end - u.start,
        source: 'assembly-diarized',
        platform: 'mic',
      }));

      // Post-processing: merge very short segments (<300ms) from the same speaker
      // into the preceding segment. Prevents echo-induced fragmentation where a
      // reverb tail is detected as a separate utterance by the same speaker.
      const merged = [];
      for (const chunk of rawChunks) {
        const prev = merged[merged.length - 1];
        if (prev && prev.speaker === chunk.speaker && chunk.durationMs < 300) {
          prev.text = `${prev.text} ${chunk.text}`.trim();
        } else {
          merged.push({ ...chunk });
        }
      }

      // Remove internal durationMs before returning (not part of public interface)
      return merged.map(({ durationMs: _, ...rest }) => rest);
    }

    if (result.status === 'error') {
      throw new Error(`AssemblyAI: ${result.error}`);
    }

    // status === 'processing' — keep polling
  }

  throw new Error('AssemblyAI: timeout após 10 minutos sem resposta');
}
