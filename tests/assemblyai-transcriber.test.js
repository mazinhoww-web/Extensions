import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { transcribeWithAssemblyAI } from '../utils/assemblyai-transcriber.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeBlobs(texts = ['fake audio data']) {
  return texts.map((t) => new Blob([t], { type: 'audio/webm' }))
}

function uploadOkResponse(uploadUrl = 'https://cdn.assemblyai.com/upload/abc123') {
  return { ok: true, json: async () => ({ upload_url: uploadUrl }) }
}

function transcriptCreatedResponse(id = 'transcript-xyz') {
  return { ok: true, json: async () => ({ id }) }
}

function transcriptProcessingResponse() {
  return { ok: true, json: async () => ({ status: 'processing', id: 'transcript-xyz' }) }
}

function transcriptCompletedResponse(utterances = []) {
  return {
    ok: true,
    json: async () => ({
      id: 'transcript-xyz',
      status: 'completed',
      text: utterances.map((u) => u.text).join(' '),
      audio_duration: 10,
      utterances,
    }),
  }
}

function transcriptErrorResponse(error = 'Audio file could not be read') {
  return {
    ok: true,
    json: async () => ({ id: 'transcript-xyz', status: 'error', error }),
  }
}

function httpErrorResponse(status = 401) {
  return { ok: false, status }
}

const SAMPLE_UTTERANCES = [
  { speaker: 'A', text: 'Bom dia pessoal, vamos começar a reunião.', start: 0, end: 3200 },
  { speaker: 'B', text: 'Bom dia! Estou pronto.', start: 3500, end: 5000 },
  { speaker: 'A', text: 'Ótimo. Primeiro ponto da pauta.', start: 5500, end: 8000 },
]

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('transcribeWithAssemblyAI', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  // ── Fluxo feliz ─────────────────────────────────────────────────────────────

  it('fluxo_completo_upload_job_poll_retorna_utterances_formatadas', async () => {
    let callCount = 0
    global.fetch = vi.fn(async (url) => {
      if (url.includes('/v2/upload')) return uploadOkResponse()
      if (url.includes('/v2/transcript') && !url.includes('transcript-xyz')) return transcriptCreatedResponse()
      // polling: processing na 1ª chamada, completed na 2ª
      callCount++
      if (callCount === 1) return transcriptProcessingResponse()
      return transcriptCompletedResponse(SAMPLE_UTTERANCES)
    })

    const promise = transcribeWithAssemblyAI(makeBlobs())
    await vi.advanceTimersByTimeAsync(7000) // 2 polls × 3s
    const result = await promise

    expect(result).toHaveLength(3)
    expect(result[0].speaker).toBe('Falante A')
    expect(result[1].speaker).toBe('Falante B')
    expect(result[2].speaker).toBe('Falante A')
    expect(result[0].text).toBe('Bom dia pessoal, vamos começar a reunião.')
    expect(result[0].source).toBe('assembly-diarized')
    expect(result[0].platform).toBe('mic')
    expect(typeof result[0].timestamp).toBe('number')
  })

  it('retorna_resultado_imediatamente_se_status_ja_completed_no_primeiro_poll', async () => {
    global.fetch = vi.fn(async (url) => {
      if (url.includes('/v2/upload')) return uploadOkResponse()
      if (url.includes('/v2/transcript') && !url.includes('transcript-xyz')) return transcriptCreatedResponse()
      return transcriptCompletedResponse(SAMPLE_UTTERANCES)
    })

    const promise = transcribeWithAssemblyAI(makeBlobs())
    await vi.advanceTimersByTimeAsync(3000) // 1 poll
    const result = await promise

    expect(result).toHaveLength(3)
  })

  it('combina_multiplos_blobs_em_um_unico_upload', async () => {
    const capturedRequests = []
    global.fetch = vi.fn(async (url, opts) => {
      capturedRequests.push({ url, opts })
      if (url.includes('/v2/upload')) return uploadOkResponse()
      if (url.includes('/v2/transcript') && !url.includes('transcript-xyz')) return transcriptCreatedResponse()
      return transcriptCompletedResponse(SAMPLE_UTTERANCES)
    })

    const blobs = makeBlobs(['chunk1', 'chunk2', 'chunk3'])
    const promise = transcribeWithAssemblyAI(blobs)
    await vi.advanceTimersByTimeAsync(3000)
    await promise

    const uploadCall = capturedRequests.find((r) => r.url.includes('/v2/upload'))
    expect(uploadCall).toBeDefined()
    expect(uploadCall.opts.body).toBeInstanceOf(Blob)
    // 3 chunks combinados em 1 blob
    expect(fetch).toHaveBeenCalledTimes(3) // upload + create + poll
  })

  it('envia_speaker_labels_e_language_detection_no_job', async () => {
    const capturedBodies = []
    global.fetch = vi.fn(async (url, opts) => {
      if (opts?.body && typeof opts.body === 'string') {
        capturedBodies.push(JSON.parse(opts.body))
      }
      if (url.includes('/v2/upload')) return uploadOkResponse()
      if (url.includes('/v2/transcript') && !url.includes('transcript-xyz')) return transcriptCreatedResponse()
      return transcriptCompletedResponse(SAMPLE_UTTERANCES)
    })

    const promise = transcribeWithAssemblyAI(makeBlobs())
    await vi.advanceTimersByTimeAsync(3000)
    await promise

    const jobBody = capturedBodies.find((b) => b.audio_url)
    expect(jobBody.speaker_labels).toBe(true)
    expect(jobBody.language_detection).toBe(true)
    expect(jobBody.audio_url).toBe('https://cdn.assemblyai.com/upload/abc123')
  })

  it('envia_api_key_como_authorization_header_em_todas_chamadas', async () => {
    const capturedHeaders = []
    global.fetch = vi.fn(async (url, opts) => {
      capturedHeaders.push(opts?.headers || {})
      if (url.includes('/v2/upload')) return uploadOkResponse()
      if (url.includes('/v2/transcript') && !url.includes('transcript-xyz')) return transcriptCreatedResponse()
      return transcriptCompletedResponse(SAMPLE_UTTERANCES)
    })

    const promise = transcribeWithAssemblyAI(makeBlobs())
    await vi.advanceTimersByTimeAsync(3000)
    await promise

    capturedHeaders.forEach((h) => {
      expect(h.authorization).toBe('443d68fff20641a9a94bab1be3be9998')
    })
  })

  it('retorna_array_vazio_quando_utterances_ausentes_na_resposta', async () => {
    global.fetch = vi.fn(async (url) => {
      if (url.includes('/v2/upload')) return uploadOkResponse()
      if (url.includes('/v2/transcript') && !url.includes('transcript-xyz')) return transcriptCreatedResponse()
      return { ok: true, json: async () => ({ status: 'completed', audio_duration: 5 }) } // sem utterances
    })

    const promise = transcribeWithAssemblyAI(makeBlobs())
    await vi.advanceTimersByTimeAsync(3000)
    const result = await promise

    expect(result).toEqual([])
  })

  // ── Polling ─────────────────────────────────────────────────────────────────

  it('continua_polling_enquanto_status_e_processing', async () => {
    let polls = 0
    global.fetch = vi.fn(async (url) => {
      if (url.includes('/v2/upload')) return uploadOkResponse()
      if (url.includes('/v2/transcript') && !url.includes('transcript-xyz')) return transcriptCreatedResponse()
      polls++
      if (polls < 4) return transcriptProcessingResponse()
      return transcriptCompletedResponse(SAMPLE_UTTERANCES)
    })

    const promise = transcribeWithAssemblyAI(makeBlobs())
    await vi.advanceTimersByTimeAsync(15000) // 4 polls × 3s = 12s
    const result = await promise

    expect(polls).toBe(4)
    expect(result).toHaveLength(3)
  })

  // ── Erros ───────────────────────────────────────────────────────────────────

  it('lanca_erro_quando_upload_falha_com_http_error', async () => {
    global.fetch = vi.fn(async (url) => {
      if (url.includes('/v2/upload')) return httpErrorResponse(401)
      return transcriptCreatedResponse()
    })

    // Attach rejection handler before any async work to avoid UnhandledRejectionWarning
    await expect(transcribeWithAssemblyAI(makeBlobs())).rejects.toThrow(/upload falhou: 401/)
  })

  it('lanca_erro_quando_criacao_do_job_falha_com_http_error', async () => {
    global.fetch = vi.fn(async (url) => {
      if (url.includes('/v2/upload')) return uploadOkResponse()
      if (url.includes('/v2/transcript') && !url.includes('transcript-xyz')) return httpErrorResponse(400)
    })

    await expect(transcribeWithAssemblyAI(makeBlobs())).rejects.toThrow(/job falhou: 400/)
  })

  it('lanca_erro_quando_assemblyai_retorna_status_error', async () => {
    global.fetch = vi.fn(async (url) => {
      if (url.includes('/v2/upload')) return uploadOkResponse()
      if (url.includes('/v2/transcript') && !url.includes('transcript-xyz')) return transcriptCreatedResponse()
      return transcriptErrorResponse('Audio file could not be decoded')
    })

    const promise = transcribeWithAssemblyAI(makeBlobs())
    const assertion = expect(promise).rejects.toThrow(/Audio file could not be decoded/)
    await vi.advanceTimersByTimeAsync(3000)
    await assertion
  })

  it('lanca_erro_de_timeout_apos_10_minutos_sem_completed', async () => {
    global.fetch = vi.fn(async (url) => {
      if (url.includes('/v2/upload')) return uploadOkResponse()
      if (url.includes('/v2/transcript') && !url.includes('transcript-xyz')) return transcriptCreatedResponse()
      return transcriptProcessingResponse() // sempre processing
    })

    const promise = transcribeWithAssemblyAI(makeBlobs())
    const assertion = expect(promise).rejects.toThrow(/timeout/)
    await vi.advanceTimersByTimeAsync(11 * 60 * 1000) // 11 minutos
    await assertion
  })
})
