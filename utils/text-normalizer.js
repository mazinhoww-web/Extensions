// MeetScribe — Text Normalizer
// Reconciles caption chunks (from platform) with optional Gemini audio transcript.
// Removes duplicates, normalizes text, and produces a clean unified transcript.

export function normalizeTranscript(captionChunks, geminiTranscript = null) {
  // Step 1: Remove cross-source duplicates for hybrid meetings (platform + room mic)
  const hybridDeduped = deduplicateHybridChunks(captionChunks);

  // Step 2: Deduplicate caption chunks (incremental platform updates)
  const deduped = deduplicateChunks(hybridDeduped);

  // Step 2: If Gemini transcript is available, merge it
  if (geminiTranscript) {
    return mergeWithGemini(deduped, geminiTranscript);
  }

  // Step 3: Clean and normalize text
  return deduped.map((chunk) => ({
    ...chunk,
    text: cleanText(chunk.text),
    source: 'caption',
  }));
}

// ─── Deduplication ────────────────────────────────────────────────────────────
// Caption platforms often emit partial updates as the speaker types.
// We want only the final, longest version of each utterance per speaker.

function deduplicateChunks(chunks) {
  if (!chunks || chunks.length === 0) return [];

  const result = [];
  let i = 0;

  while (i < chunks.length) {
    const current = chunks[i];
    let longest = current;

    // Look ahead: same speaker, text is extension of previous
    let j = i + 1;
    while (j < chunks.length) {
      const next = chunks[j];
      const timeDiff = next.timestamp - current.timestamp;

      // Only group if same speaker and within 10 seconds
      if (next.speaker !== current.speaker || timeDiff > 10000) break;

      // If next text contains or extends current, take the longer one
      if (
        next.text.includes(current.text) ||
        current.text.includes(next.text) ||
        levenshteinSimilarity(current.text, next.text) > 0.7
      ) {
        longest = next.text.length >= longest.text.length ? next : longest;
        j++;
      } else {
        break;
      }
    }

    result.push(longest);
    i = j > i + 1 ? j : i + 1;
  }

  return result;
}

// ─── Merge with Gemini transcript ─────────────────────────────────────────────
// Gemini may produce better text quality; captions provide speaker labels.
// Strategy: align by timestamp, use Gemini text where available, keep caption speaker.

function mergeWithGemini(captionChunks, geminiTranscript) {
  // geminiTranscript can be:
  // - A string: plain text, no timestamps
  // - An array: [{speaker, text, timestamp}] from Gemini's structured output

  if (typeof geminiTranscript === 'string') {
    // Parse Gemini's text output into segments using speaker change cues
    const geminiSegments = parseGeminiText(geminiTranscript);
    return alignSegments(captionChunks, geminiSegments);
  }

  if (Array.isArray(geminiTranscript)) {
    return alignSegments(captionChunks, geminiTranscript);
  }

  return captionChunks.map((c) => ({ ...c, text: cleanText(c.text), source: 'caption' }));
}

function parseGeminiText(text) {
  // Try to parse "Speaker X: text" format
  const lines = text.split('\n').filter((l) => l.trim());
  const segments = [];
  let timestamp = Date.now() - lines.length * 5000; // approximate

  for (const line of lines) {
    const match = line.match(/^([^:]{2,40}):\s*(.+)$/);
    if (match) {
      segments.push({
        speaker: match[1].trim(),
        text: match[2].trim(),
        timestamp: timestamp,
      });
    } else if (line.trim().length > 1) {
      segments.push({
        speaker: segments.length > 0 ? segments[segments.length - 1].speaker : 'Falante',
        text: line.trim(),
        timestamp: timestamp,
      });
    }
    timestamp += 5000;
  }

  return segments;
}

function alignSegments(captionChunks, geminiSegments) {
  if (!geminiSegments || geminiSegments.length === 0) {
    return captionChunks.map((c) => ({ ...c, text: cleanText(c.text), source: 'caption' }));
  }

  const result = [];
  let geminiIdx = 0;

  for (const caption of captionChunks) {
    // Find the best matching Gemini segment by text similarity
    let bestIdx = -1;
    let bestSim = 0;

    const searchStart = Math.max(0, geminiIdx - 2);
    const searchEnd = Math.min(geminiSegments.length, geminiIdx + 5);

    for (let i = searchStart; i < searchEnd; i++) {
      const sim = levenshteinSimilarity(
        caption.text.toLowerCase(),
        geminiSegments[i].text.toLowerCase()
      );
      if (sim > bestSim) {
        bestSim = sim;
        bestIdx = i;
      }
    }

    if (bestSim > 0.5 && bestIdx >= 0) {
      // Use Gemini text (better quality) + caption speaker (more reliable)
      result.push({
        speaker: caption.speaker,
        text: cleanText(geminiSegments[bestIdx].text),
        timestamp: caption.timestamp,
        source: 'merged',
      });
      geminiIdx = bestIdx + 1;
    } else {
      // No good match — keep caption as-is
      result.push({
        ...caption,
        text: cleanText(caption.text),
        source: 'caption',
      });
    }
  }

  return result;
}

// ─── Hybrid deduplication ─────────────────────────────────────────────────────
// In hybrid meetings, a room participant who is also connected to the platform
// will appear in both sources: platform captions (real name) and room mic ("Sala - Falante X").
// Remove room-mic chunks that are duplicates of nearby platform caption chunks.

function deduplicateHybridChunks(chunks) {
  if (!chunks || chunks.length === 0) return chunks;

  const hasRoomSource = chunks.some((c) => c.source === 'room');
  const hasPlatformSource = chunks.some((c) => c.source !== 'room' && c.source !== 'mic');
  if (!hasRoomSource || !hasPlatformSource) return chunks;

  const TIME_WINDOW_MS = 6000;
  const SIM_THRESHOLD = 0.6;

  const platformChunks = chunks.filter((c) => c.source !== 'room');
  const roomChunks = chunks.filter((c) => c.source === 'room');

  const filteredRoom = roomChunks.filter((roomChunk) => {
    const nearby = platformChunks.filter(
      (pc) => Math.abs(pc.timestamp - roomChunk.timestamp) < TIME_WINDOW_MS
    );
    const isDuplicate = nearby.some(
      (pc) => levenshteinSimilarity(
        pc.text.toLowerCase().slice(0, 120),
        roomChunk.text.toLowerCase().slice(0, 120)
      ) > SIM_THRESHOLD
    );
    return !isDuplicate;
  });

  return [...platformChunks, ...filteredRoom].sort((a, b) => a.timestamp - b.timestamp);
}

// ─── Text cleaning ────────────────────────────────────────────────────────────

export function cleanText(text) {
  if (!text) return '';
  return text
    .trim()
    // Remove repeated whitespace
    .replace(/\s+/g, ' ')
    // Capitalize first letter
    .replace(/^(.)/, (m) => m.toUpperCase())
    // Ensure sentence ends with punctuation
    .replace(/([a-záàâãéèêíïóôõöúüç\w])$/, '$1.');
}

// ─── Levenshtein similarity (0 to 1) ─────────────────────────────────────────

export function levenshteinSimilarity(a, b) {
  if (a === b) return 1;
  if (!a || !b) return 0;

  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;

  const distance = levenshteinDistance(
    a.slice(0, 100), // cap length for performance
    b.slice(0, 100)
  );

  return 1 - distance / maxLen;
}

function levenshteinDistance(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => {
    const row = new Array(n + 1).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }

  return dp[m][n];
}

// ─── Format transcript for display / prompt ───────────────────────────────────

export function formatTranscriptForDisplay(chunks) {
  if (!chunks || chunks.length === 0) return '(sem transcrição)';

  let result = '';
  let lastSpeaker = '';

  for (const chunk of chunks) {
    if (chunk.speaker !== lastSpeaker) {
      result += `\n**${chunk.speaker}:** `;
      lastSpeaker = chunk.speaker;
    } else {
      result += ' ';
    }
    result += chunk.text;
  }

  return result.trim();
}

export function formatTranscriptForPrompt(chunks, metadata = {}) {
  if (!chunks || chunks.length === 0) return '(sem transcrição disponível)';

  const lines = [];
  let lastSpeaker = '';

  for (const chunk of chunks) {
    const time = new Date(chunk.timestamp).toLocaleTimeString('pt-BR');
    if (chunk.speaker !== lastSpeaker) {
      lines.push(`[${time}] ${chunk.speaker}: ${chunk.text}`);
      lastSpeaker = chunk.speaker;
    } else {
      lines.push(`  ${chunk.text}`);
    }
  }

  return lines.join('\n');
}
