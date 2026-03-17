import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { generateMinutes, transcribeAudioWithGemini } from '../utils/minutes-generator.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function meetingFixture(overrides = {}) {
  return {
    id: 'meet-abc',
    platform: 'google-meet',
    title: 'Sprint Review',
    startTime: new Date('2024-06-01T09:00:00').getTime(),
    endTime: new Date('2024-06-01T10:00:00').getTime(),
    ...overrides,
  }
}

function transcriptFixture() {
  return [
    { speaker: 'Ana', text: 'Bom dia a todos.', timestamp: 1000, source: 'caption' },
    { speaker: 'Bob', text: 'Bom dia, podemos começar.', timestamp: 5000, source: 'caption' },
  ]
}

function geminiOkResponse(text) {
  return {
    ok: true,
    json: async () => ({
      candidates: [{ content: { parts: [{ text }] } }],
    }),
  }
}

function groqOkResponse(text) {
  return {
    ok: true,
    json: async () => ({
      choices: [{ message: { content: text } }],
    }),
  }
}

function errorResponse(status, body = 'Erro') {
  return {
    ok: false,
    status,
    text: async () => body,
    json: async () => ({}),
  }
}

// ─── generateMinutes ──────────────────────────────────────────────────────────

describe('generateMinutes', () => {
  beforeEach(() => {
    // Limpa o syncStore antes de cada teste
    Object.keys(chrome._syncStore).forEach((k) => delete chrome._syncStore[k])
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('deve_lancar_erro_quando_nenhuma_api_key_esta_configurada', async () => {
    // syncStore vazio = sem chaves
    await expect(generateMinutes(meetingFixture(), [])).rejects.toThrow(
      /Nenhuma API key/i
    )
  })

  it('deve_usar_gemini_quando_provider_gemini_e_chave_gemini_fornecida', async () => {
    chrome._syncStore.aiProvider = 'gemini'
    chrome._syncStore.geminiApiKey = 'chave-gemini-valida'

    global.fetch = vi.fn().mockResolvedValue(geminiOkResponse('# Ata gerada pelo Gemini'))

    const result = await generateMinutes(meetingFixture(), transcriptFixture())

    expect(result).toContain('Ata gerada pelo Gemini')
    const [calledUrl] = fetch.mock.calls[0]
    expect(calledUrl).toContain('gemini')
  })

  it('deve_usar_groq_quando_provider_groq_e_chave_groq_fornecida', async () => {
    chrome._syncStore.aiProvider = 'groq'
    chrome._syncStore.groqApiKey = 'chave-groq-valida'

    global.fetch = vi.fn().mockResolvedValue(groqOkResponse('# Ata gerada pelo Groq'))

    const result = await generateMinutes(meetingFixture(), transcriptFixture())

    expect(result).toContain('Ata gerada pelo Groq')
    const [calledUrl] = fetch.mock.calls[0]
    expect(calledUrl).toContain('groq')
  })

  it('deve_usar_provedor_preferencial_quando_transcript_cabe_nos_dois', async () => {
    chrome._syncStore.aiProvider = 'gemini'
    chrome._syncStore.geminiApiKey = 'chave-gemini'
    chrome._syncStore.groqApiKey = 'chave-groq'

    global.fetch = vi.fn().mockResolvedValue(geminiOkResponse('resposta gemini'))

    await generateMinutes(meetingFixture(), transcriptFixture())

    const [calledUrl] = fetch.mock.calls[0]
    expect(calledUrl).toContain('gemini')
  })

  it('deve_rotear_para_gemini_automaticamente_quando_transcript_e_longo', async () => {
    chrome._syncStore.aiProvider = 'groq'   // preferência é Groq...
    chrome._syncStore.geminiApiKey = 'chave-gemini'
    chrome._syncStore.groqApiKey   = 'chave-groq'

    // Transcript longo (>10000 chars)
    const longTranscript = Array.from({ length: 300 }, (_, i) => ({
      speaker: i % 2 === 0 ? 'Ana' : 'Bob',
      text: `Trecho ${i}: discussão sobre o projeto com detalhes técnicos e decisões importantes da sprint atual.`,
      timestamp: 1000 + i * 9000,
      source: 'caption',
    }))

    global.fetch = vi.fn().mockResolvedValue(geminiOkResponse('ata pelo gemini'))

    await generateMinutes(meetingFixture(), longTranscript)

    // ...mas deve ter usado Gemini por causa do tamanho
    const [calledUrl] = fetch.mock.calls[0]
    expect(calledUrl).toContain('gemini')
  })

  it('deve_usar_gemini_quando_so_gemini_esta_configurado', async () => {
    chrome._syncStore.geminiApiKey = 'chave-gemini'
    // sem groqApiKey

    global.fetch = vi.fn().mockResolvedValue(geminiOkResponse('ata'))

    await generateMinutes(meetingFixture(), transcriptFixture())

    const [calledUrl] = fetch.mock.calls[0]
    expect(calledUrl).toContain('gemini')
  })

  it('deve_usar_groq_quando_so_groq_esta_configurado', async () => {
    chrome._syncStore.groqApiKey = 'chave-groq'
    // sem geminiApiKey

    global.fetch = vi.fn().mockResolvedValue(groqOkResponse('ata'))

    await generateMinutes(meetingFixture(), transcriptFixture())

    const [calledUrl] = fetch.mock.calls[0]
    expect(calledUrl).toContain('groq')
  })

  it('deve_incluir_titulo_da_reuniao_no_prompt_enviado_a_api', async () => {
    chrome._syncStore.aiProvider = 'gemini'
    chrome._syncStore.geminiApiKey = 'chave-teste'

    let capturedBody
    global.fetch = vi.fn(async (_url, opts) => {
      capturedBody = JSON.parse(opts.body)
      return geminiOkResponse('ok')
    })

    await generateMinutes(meetingFixture({ title: 'Reunião de Planejamento Q3' }), [])

    const prompt = capturedBody.contents[0].parts[0].text
    expect(prompt).toContain('Reunião de Planejamento Q3')
  })

  it('deve_incluir_plataforma_da_reuniao_no_prompt_enviado_a_api', async () => {
    chrome._syncStore.aiProvider = 'gemini'
    chrome._syncStore.geminiApiKey = 'chave-teste'

    let capturedBody
    global.fetch = vi.fn(async (_url, opts) => {
      capturedBody = JSON.parse(opts.body)
      return geminiOkResponse('ok')
    })

    await generateMinutes(meetingFixture({ platform: 'teams' }), [])

    const prompt = capturedBody.contents[0].parts[0].text
    expect(prompt).toContain('Microsoft Teams')
  })

  it('deve_incluir_nomes_dos_participantes_no_prompt', async () => {
    chrome._syncStore.aiProvider = 'gemini'
    chrome._syncStore.geminiApiKey = 'chave-teste'

    let capturedBody
    global.fetch = vi.fn(async (_url, opts) => {
      capturedBody = JSON.parse(opts.body)
      return geminiOkResponse('ok')
    })

    await generateMinutes(meetingFixture(), transcriptFixture())

    const prompt = capturedBody.contents[0].parts[0].text
    expect(prompt).toContain('Ana')
    expect(prompt).toContain('Bob')
  })

  it('deve_retornar_o_texto_gerado_pela_api', async () => {
    chrome._syncStore.aiProvider = 'gemini'
    chrome._syncStore.geminiApiKey = 'chave-teste'

    const ataEsperada = '# Ata de Reunião\n## 1. Informações'
    global.fetch = vi.fn().mockResolvedValue(geminiOkResponse(ataEsperada))

    const result = await generateMinutes(meetingFixture(), [])

    expect(result).toBe(ataEsperada)
  })

  it('deve_chamar_callback_onProgress_durante_geracao', async () => {
    chrome._syncStore.aiProvider = 'gemini'
    chrome._syncStore.geminiApiKey = 'chave-teste'

    global.fetch = vi.fn().mockResolvedValue(geminiOkResponse('ata'))

    const onProgress = vi.fn()
    await generateMinutes(meetingFixture(), [], onProgress)

    expect(onProgress).toHaveBeenCalledWith(expect.stringMatching(/gerando|IA/i))
  })

  it('deve_gerar_ata_sem_erro_413_quando_transcript_e_muito_longo_para_o_groq', async () => {
    chrome._syncStore.aiProvider = 'groq'
    chrome._syncStore.groqApiKey = 'chave-groq'

    // 400 chunks simulando reunião de 60min — gera ~14000+ tokens sem truncar
    const longTranscript = Array.from({ length: 400 }, (_, i) => ({
      speaker: i % 2 === 0 ? 'Ana' : 'Bob',
      text: `Trecho ${i}: discussão sobre o projeto e seus desdobramentos técnicos na sprint atual.`,
      timestamp: 1000 + i * 9000,
      source: 'caption',
    }))

    global.fetch = vi.fn().mockResolvedValue(groqOkResponse('# Ata gerada com sucesso'))

    const result = await generateMinutes(meetingFixture(), longTranscript)

    expect(result).toContain('Ata gerada com sucesso')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('deve_usar_groq_como_fallback_quando_gemini_falha_com_erro_generico', async () => {
    chrome._syncStore.aiProvider = 'gemini'
    chrome._syncStore.geminiApiKey = 'chave-gemini'
    chrome._syncStore.groqApiKey = 'chave-groq'

    global.fetch = vi.fn(async (url) => {
      if (url.includes('gemini')) return errorResponse(500, 'Internal error')
      return groqOkResponse('ata pelo groq')
    })

    const result = await generateMinutes(meetingFixture(), [])
    expect(result).toContain('ata pelo groq')
  })

  it('deve_usar_gemini_1_5_como_fallback_quando_2_0_retorna_429', async () => {
    vi.useFakeTimers()

    chrome._syncStore.aiProvider = 'gemini'
    chrome._syncStore.geminiApiKey = 'chave-gemini'

    global.fetch = vi.fn(async (url) => {
      if (url.includes('gemini-2.5-flash')) return errorResponse(429, 'rate limited')
      if (url.includes('gemini-2.0-flash')) return errorResponse(429, 'rate limited')
      if (url.includes('gemini-1.5-flash')) return geminiOkResponse('ata pelo 1.5')
      return errorResponse(500)
    })

    const resultPromise = generateMinutes(meetingFixture(), [])

    // 2.5-flash retries: 5+10+20=35s; 2.0-flash retries: 5+10+20=35s; total: 70s
    await vi.advanceTimersByTimeAsync(80000)
    const result = await resultPromise

    expect(result).toContain('ata pelo 1.5')
  }, 15000)
})

// ─── transcribeAudioWithGemini ────────────────────────────────────────────────

describe('transcribeAudioWithGemini', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('deve_retornar_null_quando_audioBlobs_e_null', async () => {
    const result = await transcribeAudioWithGemini('chave', null, [])
    expect(result).toBeNull()
  })

  it('deve_retornar_null_quando_audioBlobs_e_array_vazio', async () => {
    const result = await transcribeAudioWithGemini('chave', [], [])
    expect(result).toBeNull()
  })

  it('deve_retornar_texto_transcrito_quando_api_responde_com_sucesso', async () => {
    const transcricaoEsperada = '[Falante 1]: Bom dia pessoal\n[Falante 2]: Bom dia'

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: transcricaoEsperada }] } }],
      }),
    })

    const audioBlob = new Blob(['fake audio data'], { type: 'audio/webm' })
    const result = await transcribeAudioWithGemini('chave-teste', [audioBlob], null)

    expect(result).toBe(transcricaoEsperada)
  })

  it('deve_retornar_null_quando_api_retorna_status_de_erro', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 400 })

    const audioBlob = new Blob(['fake audio'], { type: 'audio/webm' })
    const result = await transcribeAudioWithGemini('chave-teste', [audioBlob], null)

    expect(result).toBeNull()
  })

  it('deve_retornar_null_quando_fetch_lanca_excecao', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

    const audioBlob = new Blob(['fake audio'], { type: 'audio/webm' })
    const result = await transcribeAudioWithGemini('chave-teste', [audioBlob], null)

    expect(result).toBeNull()
  })

  it('deve_enviar_audio_para_o_endpoint_correto_do_gemini', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: 'transcrição' }] } }],
      }),
    })

    const audioBlob = new Blob(['audio'], { type: 'audio/webm' })
    await transcribeAudioWithGemini('minha-chave', [audioBlob], null)

    const [calledUrl] = fetch.mock.calls[0]
    expect(calledUrl).toContain('gemini')
    expect(calledUrl).toContain('minha-chave')
  })
})
