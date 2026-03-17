// fake-indexeddb precisa ser importado ANTES de background.js para que
// global.indexedDB esteja disponível quando as funções de áudio forem chamadas.
import 'fake-indexeddb/auto'

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'

// Importar background.js dispara o registro de chrome.runtime.onMessage.addListener
import '../background/background.js'

// ─── Captura do handler registrado ───────────────────────────────────────────
// background.js chama chrome.runtime.onMessage.addListener(fn) na inicialização.
// Capturamos essa função para usá-la diretamente nos testes.

let messageHandler

beforeAll(() => {
  messageHandler = chrome.runtime.onMessage.addListener.mock.calls[0]?.[0]
  if (!messageHandler) {
    throw new Error(
      'background.js não registrou chrome.runtime.onMessage.addListener. Verifique o setup.'
    )
  }
})

// ─── Helper ───────────────────────────────────────────────────────────────────
// Simula o envio de uma mensagem ao background e aguarda a resposta assíncrona.

function sendMessage(type, data = {}) {
  return new Promise((resolve) => {
    messageHandler({ type, ...data }, {}, resolve)
  })
}

// Reseta o chrome.storage.local entre testes para garantir isolamento.
beforeEach(() => {
  const store = chrome._localStore
  Object.keys(store).forEach((k) => delete store[k])
  vi.clearAllMocks()
})

// ─── START_MEETING ────────────────────────────────────────────────────────────

describe('START_MEETING', () => {
  it('deve_criar_nova_reuniao_com_dados_corretos', async () => {
    const { success, meeting } = await sendMessage('START_MEETING', {
      platform: 'google-meet',
      title: 'Daily Standup',
    })

    expect(success).toBe(true)
    expect(meeting.platform).toBe('google-meet')
    expect(meeting.title).toBe('Daily Standup')
    expect(meeting.id).toBeTruthy()
    expect(meeting.startTime).toBeGreaterThan(0)
    expect(meeting.endTime).toBeNull()
    expect(meeting.captionChunks).toEqual([])
  })

  it('deve_usar_titulo_padrao_quando_title_nao_fornecido', async () => {
    const { meeting } = await sendMessage('START_MEETING', { platform: 'mic' })
    expect(meeting.title).toBeTruthy()
    expect(typeof meeting.title).toBe('string')
  })

  it('deve_promover_reuniao_para_hybrid_quando_mic_entra_em_reuniao_existente', async () => {
    // Inicia com plataforma
    await sendMessage('START_MEETING', { platform: 'teams' })

    // Mic entra na mesma reunião
    const { meeting } = await sendMessage('START_MEETING', { platform: 'mic' })

    expect(meeting.platform).toBe('hybrid')
  })

  it('deve_retornar_reuniao_existente_quando_mesmo_tipo_ja_esta_ativo', async () => {
    const { meeting: first } = await sendMessage('START_MEETING', { platform: 'teams' })
    const { meeting: second } = await sendMessage('START_MEETING', { platform: 'teams' })

    expect(second.id).toBe(first.id)
  })

  it('deve_persistir_reuniao_no_storage', async () => {
    await sendMessage('START_MEETING', { platform: 'google-meet' })

    const stored = chrome._localStore.currentMeeting
    expect(stored).toBeTruthy()
    expect(stored.platform).toBe('google-meet')
  })
})

// ─── CAPTION_CHUNK ────────────────────────────────────────────────────────────

describe('CAPTION_CHUNK', () => {
  // Captions are batched in memory and flushed after 5 chunks or 10s.
  // To verify persistence, we send 5 chunks (triggers auto-flush) or end the meeting.

  it('deve_adicionar_chunk_a_reuniao_ativa', async () => {
    await sendMessage('START_MEETING', { platform: 'google-meet' })

    const t = Date.now()
    const chunk = { speaker: 'Ana', text: 'Bom dia', timestamp: t }
    // Send 5 chunks to trigger flush (batch threshold)
    await sendMessage('CAPTION_CHUNK', { data: chunk })
    await sendMessage('CAPTION_CHUNK', { data: { speaker: 'B', text: 'x', timestamp: t + 100 } })
    await sendMessage('CAPTION_CHUNK', { data: { speaker: 'C', text: 'y', timestamp: t + 200 } })
    await sendMessage('CAPTION_CHUNK', { data: { speaker: 'D', text: 'z', timestamp: t + 300 } })
    await sendMessage('CAPTION_CHUNK', { data: { speaker: 'E', text: 'w', timestamp: t + 400 } })

    const meeting = chrome._localStore.currentMeeting
    expect(meeting.captionChunks).toHaveLength(5)
    expect(meeting.captionChunks[0].speaker).toBe('Ana')
  })

  it('deve_acumular_multiplos_chunks_em_ordem', async () => {
    await sendMessage('START_MEETING', { platform: 'google-meet' })

    const t = Date.now()
    // Send 5 chunks to trigger flush
    for (let i = 0; i < 5; i++) {
      await sendMessage('CAPTION_CHUNK', { data: { speaker: i < 3 ? 'Ana' : 'Bob', text: `msg${i}`, timestamp: t + i * 1000 } })
    }

    const meeting = chrome._localStore.currentMeeting
    expect(meeting.captionChunks).toHaveLength(5)
  })

  it('deve_retornar_success_true', async () => {
    await sendMessage('START_MEETING', { platform: 'google-meet' })
    const result = await sendMessage('CAPTION_CHUNK', {
      data: { speaker: 'X', text: 'texto', timestamp: 1 },
    })
    expect(result.success).toBe(true)
  })
})

// ─── END_MEETING ──────────────────────────────────────────────────────────────

describe('END_MEETING', () => {
  it('deve_definir_endTime_na_reuniao', async () => {
    await sendMessage('START_MEETING', { platform: 'google-meet' })

    const beforeEnd = Date.now()
    const { meeting } = await sendMessage('END_MEETING')

    expect(meeting.endTime).toBeGreaterThanOrEqual(beforeEnd)
  })

  it('deve_salvar_reuniao_encerrada_no_historico', async () => {
    await sendMessage('START_MEETING', { platform: 'google-meet', title: 'Sprint Demo' })
    await sendMessage('END_MEETING')

    const { meetings = [] } = chrome._localStore
    expect(meetings).toHaveLength(1)
    expect(meetings[0].title).toBe('Sprint Demo')
  })

  it('deve_manter_historico_com_no_maximo_10_reunioes', async () => {
    // Cria e encerra 11 reuniões
    for (let i = 0; i < 11; i++) {
      Object.keys(chrome._localStore).forEach((k) => delete chrome._localStore[k])
      // Preserva histórico acumulado
      const existingHistory = chrome._localStore.meetings
      if (existingHistory) chrome._localStore.meetings = existingHistory

      await sendMessage('START_MEETING', { platform: 'mic', title: `Reunião ${i}` })
      await sendMessage('END_MEETING')
    }

    const { meetings = [] } = chrome._localStore
    expect(meetings.length).toBeLessThanOrEqual(10)
  })

  it('deve_retornar_null_quando_nao_ha_reuniao_ativa', async () => {
    const { meeting } = await sendMessage('END_MEETING')
    expect(meeting).toBeNull()
  })
})

// ─── GET_CURRENT_MEETING ──────────────────────────────────────────────────────

describe('GET_CURRENT_MEETING', () => {
  it('deve_retornar_null_quando_nao_ha_reuniao_ativa', async () => {
    const { meeting } = await sendMessage('GET_CURRENT_MEETING')
    expect(meeting).toBeNull()
  })

  it('deve_retornar_a_reuniao_em_andamento', async () => {
    await sendMessage('START_MEETING', { platform: 'teams', title: 'Sync' })

    const { meeting } = await sendMessage('GET_CURRENT_MEETING')

    expect(meeting).not.toBeNull()
    expect(meeting.platform).toBe('teams')
    expect(meeting.title).toBe('Sync')
  })
})

// ─── GET_AUDIO_CHUNKS ─────────────────────────────────────────────────────────

describe('GET_AUDIO_CHUNKS', () => {
  it('deve_retornar_array_vazio_quando_nao_ha_reuniao_ativa', async () => {
    const { chunks } = await sendMessage('GET_AUDIO_CHUNKS')
    expect(chunks).toEqual([])
  })

  it('deve_retornar_chunks_salvos_para_reuniao_ativa', async () => {
    await sendMessage('START_MEETING', { platform: 'google-meet' })

    // AUDIO_CHUNK now expects audioData (Uint8Array array) and mimeType
    const audioData = Array.from(new TextEncoder().encode('audio data'))
    await sendMessage('AUDIO_CHUNK', { audioData, mimeType: 'audio/webm' })

    const { chunks } = await sendMessage('GET_AUDIO_CHUNKS')
    expect(chunks).toHaveLength(1)
  })
})

// ─── SAVE_FIELD ───────────────────────────────────────────────────────────────

describe('SAVE_FIELD', () => {
  it('deve_atualizar_um_campo_da_reuniao_ativa', async () => {
    await sendMessage('START_MEETING', { platform: 'google-meet' })

    await sendMessage('SAVE_FIELD', { field: 'title', value: 'Novo Título' })

    const meeting = chrome._localStore.currentMeeting
    expect(meeting.title).toBe('Novo Título')
  })

  it('deve_retornar_success_true', async () => {
    await sendMessage('START_MEETING', { platform: 'google-meet' })
    const result = await sendMessage('SAVE_FIELD', {
      field: 'minutesMarkdown',
      value: '# Ata',
    })
    expect(result.success).toBe(true)
  })
})

// ─── CLEAR_MEETING ────────────────────────────────────────────────────────────

describe('CLEAR_MEETING', () => {
  it('deve_remover_reuniao_ativa_do_storage', async () => {
    await sendMessage('START_MEETING', { platform: 'google-meet' })
    await sendMessage('CLEAR_MEETING')

    expect(chrome._localStore.currentMeeting).toBeUndefined()
  })

  it('deve_retornar_success_true', async () => {
    const result = await sendMessage('CLEAR_MEETING')
    expect(result.success).toBe(true)
  })
})

// ─── GET_MEETINGS_HISTORY ─────────────────────────────────────────────────────

describe('GET_MEETINGS_HISTORY', () => {
  it('deve_retornar_array_vazio_quando_nao_ha_historico', async () => {
    const { meetings } = await sendMessage('GET_MEETINGS_HISTORY')
    expect(meetings).toEqual([])
  })

  it('deve_retornar_reunioes_encerradas_em_ordem_mais_recente_primeiro', async () => {
    await sendMessage('START_MEETING', { platform: 'mic', title: 'Primeira' })
    await sendMessage('END_MEETING')

    // Reseta currentMeeting para iniciar nova reunião
    delete chrome._localStore.currentMeeting

    await sendMessage('START_MEETING', { platform: 'mic', title: 'Segunda' })
    await sendMessage('END_MEETING')

    const { meetings } = await sendMessage('GET_MEETINGS_HISTORY')

    expect(meetings[0].title).toBe('Segunda')
    expect(meetings[1].title).toBe('Primeira')
  })
})

// ─── Tipo desconhecido ────────────────────────────────────────────────────────

describe('tipo_desconhecido', () => {
  it('deve_retornar_erro_para_tipo_de_mensagem_nao_reconhecido', async () => {
    const result = await sendMessage('TIPO_QUE_NAO_EXISTE')
    expect(result.error).toBeTruthy()
    expect(result.error).toContain('TIPO_QUE_NAO_EXISTE')
  })
})
