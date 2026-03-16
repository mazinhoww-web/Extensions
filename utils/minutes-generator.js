// MeetScribe — Minutes Generator
// Calls Gemini 2.0 Flash (or Groq fallback) to generate a structured meeting minutes
// document (ata de reunião) from the normalized transcript.

import { formatTranscriptForPrompt } from './text-normalizer.js';

// ─── Token estimation & smart routing ────────────────────────────────────────
// Estimativa: 1 token ≈ 4 chars (português/inglês).
// Groq free tier: ~12000 TPM total (input + output). Com max_tokens=8192 de
// resposta e ~500 tokens de template, sobram ~3300 tokens para o transcript.
// Usamos 10000 chars (~2500 tokens) como budget seguro.
//
// Regra de roteamento automático:
//   transcript > budget  →  usa Gemini (1M context) se disponível
//   transcript ≤ budget  →  usa a preferência do usuário (Groq ou Gemini)
//   sem Gemini e longo   →  trunca para Groq (último recurso)

const GROQ_TRANSCRIPT_CHAR_BUDGET = 10_000;

function truncateTranscriptForGroq(chunks) {
  if (!chunks || chunks.length === 0) return { chunks, truncated: false };

  const formatted = formatTranscriptForPrompt(chunks);
  if (formatted.length <= GROQ_TRANSCRIPT_CHAR_BUDGET) return { chunks, truncated: false };

  // Mantém os primeiros 40% e os últimos 40%, resumindo o meio.
  const keep = Math.max(1, Math.floor(chunks.length * 0.4));
  const omitted = chunks.length - keep * 2;

  if (omitted <= 0) return { chunks, truncated: false };

  const truncatedChunks = [
    ...chunks.slice(0, keep),
    {
      speaker: 'Sistema',
      text: `[... ${omitted} trecho(s) intermediário(s) omitido(s) — transcrição reduzida para caber no limite da API Groq ...]`,
      timestamp: chunks[keep]?.timestamp ?? Date.now(),
      source: 'caption',
    },
    ...chunks.slice(chunks.length - keep),
  ];

  return { chunks: truncatedChunks, truncated: true };
}

// ─── Build the prompt ─────────────────────────────────────────────────────────

function buildPrompt(meeting, normalizedTranscript) {
  const startDate = new Date(meeting.startTime).toLocaleDateString('pt-BR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const startTime = new Date(meeting.startTime).toLocaleTimeString('pt-BR');
  const durationMs = (meeting.endTime || Date.now()) - meeting.startTime;
  const durationMin = Math.round(durationMs / 60000);
  const platform = platformLabel(meeting.platform);

  const transcriptText = formatTranscriptForPrompt(normalizedTranscript);

  // Extract unique speakers
  const speakers = [...new Set((normalizedTranscript || []).map((c) => c.speaker))];
  const speakerList = speakers.length > 0 ? speakers.join(', ') : 'Não identificados';

  return `Você é um assistente especializado em redigir atas de reunião corporativas.

Analise a transcrição a seguir e gere uma ata completa e detalhada.

---
METADADOS DA REUNIÃO:
- Plataforma: ${platform}
- Data: ${startDate}
- Horário de início: ${startTime}
- Duração: ${durationMin} minutos
- Título: ${meeting.title || 'Reunião sem título'}
- Participantes identificados: ${speakerList}
---

TRANSCRIÇÃO (com identificação de falantes e horários):
${transcriptText}
---

INSTRUÇÕES PARA A ATA:
1. Detecte automaticamente o(s) idioma(s) presente(s) na transcrição.
   - Se toda a reunião for em um único idioma, redija a ata inteiramente nesse idioma.
   - Se houver múltiplos idiomas, redija a ata no idioma predominante, mas registre fielmente o que cada participante disse, indicando entre parênteses o idioma original quando diferente (ex: "Falante disse em inglês: '...'").
2. Agrupe os assuntos discutidos por TEMA, não cronologicamente.
3. Capture TODAS as decisões tomadas, mesmo que implícitas na conversa.
4. Liste próximos passos com o responsável quando identificável.
5. Se um falante não foi identificado pelo nome, use o identificador da transcrição (ex: Falante 1 ou Sala - Falante 1 para presenciais).
6. Seja preciso: não adicione informações que não estão na transcrição.

Gere a ata com EXATAMENTE as seguintes seções em Markdown:

# Ata de Reunião — ${meeting.title || startDate}

## 1. Informações da Reunião
(tabela com: Plataforma, Data, Horário, Duração, Total de Participantes)

## 2. Participantes
(lista dos participantes identificados)

## 3. Resumo Executivo
(3 a 5 frases resumindo o propósito e resultado geral da reunião)

## 4. Tópicos Discutidos
(subseções por tema, com bullet points dos pontos principais de cada tema)

## 5. Decisões Tomadas
(bullet points claros de cada decisão, com o contexto breve)

## 6. Próximos Passos e Responsabilidades
(tabela ou lista: O quê | Responsável | Prazo se mencionado)

## 7. Observações Importantes
(pontos que não se encaixam nas categorias acima mas são relevantes)

---
*Ata gerada automaticamente pelo MeetScribe em ${new Date().toLocaleString('pt-BR')}*
`;
}

function platformLabel(platform) {
  const labels = {
    'google-meet': 'Google Meet',
    teams: 'Microsoft Teams',
    mic: 'Presencial (Modo Sala)',
    hybrid: 'Modo Híbrido (Sala + Remotos)',
  };
  return labels[platform] || platform;
}

// ─── Gemini API ───────────────────────────────────────────────────────────────

async function callGemini(apiKey, prompt, model = 'gemini-2.0-flash', onProgress) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 8192,
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
    ],
  };

  const retryDelays = [5000, 10000, 20000];

  for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error('Gemini retornou resposta vazia');
      return text;
    }

    if (res.status === 429 && attempt < retryDelays.length) {
      const waitSec = retryDelays[attempt] / 1000;
      onProgress?.(`Aguardando quota Gemini (${waitSec}s)...`);
      await new Promise(r => setTimeout(r, retryDelays[attempt]));
      continue;
    }

    const errText = await res.text();
    if (res.status === 429) {
      throw new Error(
        'Limite da API Gemini atingido. Configure uma chave Groq nas configurações ou aguarde alguns minutos.'
      );
    }
    throw new Error(`Gemini API error ${res.status}: ${errText}`);
  }
}

// ─── Groq API (fallback) ──────────────────────────────────────────────────────

async function callGroq(apiKey, prompt) {
  const url = 'https://api.groq.com/openai/v1/chat/completions';

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 8192,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('Groq returned empty response');
  return text;
}

// ─── Gemini audio transcription (optional enhancement) ────────────────────────
// Sends audio chunks to Gemini for a high-quality re-transcription.
// Returns the raw transcript text for use in normalization.

export async function transcribeAudioWithGemini(apiKey, audioBlobs, captionTranscript) {
  if (!audioBlobs || audioBlobs.length === 0) return null;

  try {
    // Combine all audio blobs into one
    const combined = new Blob(audioBlobs, { type: 'audio/webm' });

    // Convert to base64
    const arrayBuffer = await combined.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i]);
    const base64Audio = btoa(binary);

    const captionContext = captionTranscript
      ? `\n\nContexto das legendas capturadas (para referência de speaker labels):\n${formatTranscriptForPrompt(captionTranscript)}`
      : '';

    const prompt = `Transcreva este áudio de reunião.
Detecte automaticamente o idioma falado. Se houver múltiplos idiomas, transcreva cada trecho no idioma em que foi dito.
Identifique cada falante diferente como "Falante 1", "Falante 2", etc., baseando-se em diferenças de voz.
${captionContext}
Formato de saída — uma linha por trecho de fala:
[Falante X]: texto transcrito

Seja preciso e mantenha todas as informações ditas.`;

    const model = 'gemini-2.0-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const body = {
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: 'audio/webm',
                data: base64Audio,
              },
            },
          ],
        },
      ],
      generationConfig: { temperature: 0.1, maxOutputTokens: 16384 },
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) return null;
    const data = await res.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch (err) {
    console.warn('[MeetScribe] Audio transcription failed:', err.message);
    return null;
  }
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export async function generateMinutes(meeting, normalizedTranscript, onProgress) {
  const { aiProvider = 'groq', geminiApiKey, groqApiKey } = await chrome.storage.sync.get([
    'aiProvider',
    'geminiApiKey',
    'groqApiKey',
  ]);

  if (!geminiApiKey && !groqApiKey) {
    throw new Error('Nenhuma API key configurada. Acesse as opções da extensão para configurar.');
  }

  // ── Roteamento inteligente por tamanho de transcrição ──────────────────────
  const transcriptText   = formatTranscriptForPrompt(normalizedTranscript);
  const fitsGroq         = transcriptText.length <= GROQ_TRANSCRIPT_CHAR_BUDGET;
  const approxTokens     = Math.ceil(transcriptText.length / 4);

  // Decide qual provedor usar:
  //  1. Transcrição longa E Gemini disponível → Gemini (contexto de 1M tokens)
  //  2. Apenas Gemini configurado             → Gemini
  //  3. Apenas Groq configurado               → Groq (trunca se necessário)
  //  4. Ambos disponíveis + cabe no Groq      → preferência do usuário
  let effectiveProvider;
  if (!fitsGroq && geminiApiKey) {
    effectiveProvider = 'gemini';
    onProgress?.(
      `Reunião longa (~${approxTokens} tokens) — usando Gemini automaticamente para melhor qualidade`
    );
  } else if (geminiApiKey && !groqApiKey) {
    effectiveProvider = 'gemini';
  } else if (groqApiKey && !geminiApiKey) {
    effectiveProvider = 'groq';
  } else {
    effectiveProvider = aiProvider; // preferência do usuário
  }

  // Prompt completo para Gemini; truncado (se necessário) para Groq
  const geminiPrompt = buildPrompt(meeting, normalizedTranscript);
  const buildGroqPrompt = () => {
    const { chunks, truncated } = truncateTranscriptForGroq(normalizedTranscript);
    if (truncated) {
      onProgress?.('Transcrição muito longa para o Groq — resumindo trechos intermediários...');
    }
    return buildPrompt(meeting, chunks);
  };

  onProgress?.('Gerando ata com IA...');

  try {
    if (effectiveProvider === 'gemini') {
      return await callGemini(geminiApiKey, geminiPrompt, 'gemini-2.0-flash', onProgress);
    } else {
      return await callGroq(groqApiKey, buildGroqPrompt());
    }
  } catch (err) {
    const is429 = err.message.includes('Limite da API Gemini') || err.message.includes('429');

    // Fallback 1: gemini-1.5-flash (cota separada)
    if (is429 && geminiApiKey) {
      onProgress?.('Tentando gemini-1.5-flash...');
      try {
        return await callGemini(geminiApiKey, geminiPrompt, 'gemini-1.5-flash', onProgress);
      } catch (_) { /* continua para Groq */ }
    }

    // Fallback 2: Groq (com transcript truncado se necessário)
    if (groqApiKey && effectiveProvider !== 'groq') {
      onProgress?.('Gemini indisponível, usando Groq...');
      return await callGroq(groqApiKey, buildGroqPrompt());
    }

    throw err;
  }
}
