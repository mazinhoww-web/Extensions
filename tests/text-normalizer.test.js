import { describe, it, expect } from 'vitest'
import {
  levenshteinSimilarity,
  cleanText,
  normalizeTranscript,
  formatTranscriptForDisplay,
  formatTranscriptForPrompt,
} from '../utils/text-normalizer.js'

// ─── Helper ───────────────────────────────────────────────────────────────────

function chunk(speaker, text, timestamp = 1000, source = 'caption') {
  return { speaker, text, timestamp, source }
}

// ─── levenshteinSimilarity ────────────────────────────────────────────────────

describe('levenshteinSimilarity', () => {
  it('deve_retornar_1_para_strings_identicas', () => {
    expect(levenshteinSimilarity('reunião de equipe', 'reunião de equipe')).toBe(1)
  })

  it('deve_retornar_0_quando_string_a_e_vazia', () => {
    expect(levenshteinSimilarity('', 'qualquer texto')).toBe(0)
  })

  it('deve_retornar_0_quando_string_b_e_vazia', () => {
    expect(levenshteinSimilarity('qualquer texto', '')).toBe(0)
  })

  it('deve_retornar_valor_proximo_a_1_para_strings_quase_identicas', () => {
    // uma letra de diferença
    expect(levenshteinSimilarity('vamos comecar', 'vamos comecar!')).toBeGreaterThan(0.85)
  })

  it('deve_retornar_valor_baixo_para_strings_completamente_diferentes', () => {
    expect(levenshteinSimilarity('bom dia pessoal', 'xyz123abc')).toBeLessThan(0.4)
  })

  it('deve_ser_simetrico_independente_da_ordem_dos_argumentos', () => {
    const s1 = 'ok vamos la'
    const s2 = 'ok vamos la pessoal agora'
    expect(levenshteinSimilarity(s1, s2)).toBe(levenshteinSimilarity(s2, s1))
  })

  it('deve_retornar_valor_entre_0_e_1', () => {
    const sim = levenshteinSimilarity('texto qualquer', 'outro texto')
    expect(sim).toBeGreaterThanOrEqual(0)
    expect(sim).toBeLessThanOrEqual(1)
  })
})

// ─── cleanText ────────────────────────────────────────────────────────────────

describe('cleanText', () => {
  it('deve_retornar_string_vazia_para_null', () => {
    expect(cleanText(null)).toBe('')
  })

  it('deve_retornar_string_vazia_para_undefined', () => {
    expect(cleanText(undefined)).toBe('')
  })

  it('deve_retornar_string_vazia_para_string_vazia', () => {
    expect(cleanText('')).toBe('')
  })

  it('deve_capitalizar_a_primeira_letra', () => {
    expect(cleanText('olá mundo')).toMatch(/^O/)
  })

  it('deve_adicionar_ponto_final_quando_ausente', () => {
    expect(cleanText('texto sem ponto')).toMatch(/\.$/)
  })

  it('nao_deve_duplicar_ponto_quando_texto_ja_termina_com_pontuacao', () => {
    const result = cleanText('já tem ponto.')
    expect(result).not.toMatch(/\.\s*\.$/)
  })

  it('deve_normalizar_multiplos_espacos_consecutivos_para_um', () => {
    expect(cleanText('texto   com    espacos')).toBe('Texto com espacos.')
  })

  it('deve_remover_espacos_nas_extremidades', () => {
    expect(cleanText('  texto  ')).toBe('Texto.')
  })

  it('deve_preservar_texto_ja_formatado_sem_alterar_conteudo', () => {
    const formatted = 'Texto bem formatado.'
    expect(cleanText(formatted)).toBe(formatted)
  })
})

// ─── normalizeTranscript ──────────────────────────────────────────────────────

describe('normalizeTranscript', () => {
  it('deve_retornar_array_vazio_para_entrada_vazia', () => {
    expect(normalizeTranscript([])).toEqual([])
  })

  it('deve_retornar_array_vazio_para_null', () => {
    expect(normalizeTranscript(null)).toEqual([])
  })

  it('deve_manter_todos_os_chunks_quando_nao_ha_sobreposicao', () => {
    const chunks = [
      chunk('Ana', 'Bom dia', 1000),
      chunk('Bob', 'Olá Ana', 5000),
      chunk('Ana', 'Vamos começar', 12000),
    ]
    expect(normalizeTranscript(chunks)).toHaveLength(3)
  })

  it('deve_colapsar_atualizacoes_parciais_do_mesmo_falante_em_janela_de_10s', () => {
    const t = 1000
    const chunks = [
      chunk('Ana', 'vamos', t),
      chunk('Ana', 'vamos discutir', t + 2000),
      chunk('Ana', 'vamos discutir o projeto', t + 4000),
    ]
    const result = normalizeTranscript(chunks)
    expect(result).toHaveLength(1)
    expect(result[0].text).toContain('projeto')
  })

  it('deve_manter_o_texto_mais_longo_quando_colapsar_parciais', () => {
    const t = 1000
    const chunks = [
      chunk('Bob', 'sprint', t),
      chunk('Bob', 'sprint review de hoje', t + 1500),
    ]
    const result = normalizeTranscript(chunks)
    expect(result[0].text).toContain('review')
  })

  it('nao_deve_colapsar_chunks_do_mesmo_falante_fora_da_janela_de_10s', () => {
    const t = 1000
    const chunks = [
      chunk('Ana', 'Primeira frase', t),
      chunk('Ana', 'Segunda frase separada', t + 15000),
    ]
    const result = normalizeTranscript(chunks)
    expect(result).toHaveLength(2)
  })

  it('nao_deve_colapsar_chunks_de_falantes_diferentes', () => {
    const t = 1000
    const chunks = [
      chunk('Ana', 'Olá pessoal', t),
      chunk('Bob', 'Olá também', t + 500),
    ]
    const result = normalizeTranscript(chunks)
    expect(result).toHaveLength(2)
  })

  it('deve_definir_source_caption_nos_chunks_resultantes', () => {
    const result = normalizeTranscript([chunk('Ana', 'Texto', 1000)])
    expect(result[0].source).toBe('caption')
  })

  it('deve_normalizar_o_texto_dos_chunks_resultantes', () => {
    const result = normalizeTranscript([chunk('Ana', 'texto sem formatacao', 1000)])
    // cleanText capitaliza e adiciona ponto
    expect(result[0].text).toMatch(/^T.*\.$/)
  })

  it('deve_preservar_speaker_e_timestamp_dos_chunks', () => {
    const result = normalizeTranscript([chunk('João', 'Texto', 5000)])
    expect(result[0].speaker).toBe('João')
    expect(result[0].timestamp).toBe(5000)
  })
})

// ─── formatTranscriptForDisplay ───────────────────────────────────────────────

describe('formatTranscriptForDisplay', () => {
  it('deve_retornar_mensagem_padrao_para_array_vazio', () => {
    expect(formatTranscriptForDisplay([])).toBe('(sem transcrição)')
  })

  it('deve_retornar_mensagem_padrao_para_null', () => {
    expect(formatTranscriptForDisplay(null)).toBe('(sem transcrição)')
  })

  it('deve_formatar_nome_do_falante_em_negrito_markdown', () => {
    const result = formatTranscriptForDisplay([chunk('Ana Silva', 'Bom dia', 1000)])
    expect(result).toContain('**Ana Silva:**')
  })

  it('deve_incluir_o_texto_do_chunk', () => {
    const result = formatTranscriptForDisplay([chunk('Ana', 'Bom dia a todos', 1000)])
    expect(result).toContain('Bom dia a todos')
  })

  it('nao_deve_repetir_o_nome_do_mesmo_falante_em_sequencia', () => {
    const t = 1000
    const result = formatTranscriptForDisplay([
      chunk('Ana', 'Primeira parte', t),
      chunk('Ana', 'Segunda parte', t + 1000),
    ])
    expect((result.match(/\*\*Ana:\*\*/g) || []).length).toBe(1)
  })

  it('deve_exibir_nome_novamente_quando_falante_muda_e_volta', () => {
    const result = formatTranscriptForDisplay([
      chunk('Ana', 'Digo X', 1000),
      chunk('Bob', 'Digo Y', 2000),
      chunk('Ana', 'Concordo', 3000),
    ])
    expect((result.match(/\*\*Ana:\*\*/g) || []).length).toBe(2)
  })

  it('deve_incluir_todos_os_falantes_presentes', () => {
    const result = formatTranscriptForDisplay([
      chunk('Ana', 'Fala 1', 1000),
      chunk('Bob', 'Fala 2', 2000),
      chunk('Carol', 'Fala 3', 3000),
    ])
    expect(result).toContain('**Ana:**')
    expect(result).toContain('**Bob:**')
    expect(result).toContain('**Carol:**')
  })
})

// ─── formatTranscriptForPrompt ────────────────────────────────────────────────

describe('formatTranscriptForPrompt', () => {
  it('deve_retornar_mensagem_padrao_para_array_vazio', () => {
    expect(formatTranscriptForPrompt([])).toBe('(sem transcrição disponível)')
  })

  it('deve_retornar_mensagem_padrao_para_null', () => {
    expect(formatTranscriptForPrompt(null)).toBe('(sem transcrição disponível)')
  })

  it('deve_incluir_horario_formatado_para_cada_novo_falante', () => {
    const ts = new Date('2024-06-01T09:30:00').getTime()
    const result = formatTranscriptForPrompt([chunk('Ana', 'Olá', ts)])
    expect(result).toMatch(/\[\d{2}:\d{2}:\d{2}\]/)
  })

  it('deve_incluir_nome_e_texto_do_falante_na_linha', () => {
    const result = formatTranscriptForPrompt([chunk('João', 'Texto da fala', 1000)])
    expect(result).toContain('João:')
    expect(result).toContain('Texto da fala')
  })

  it('deve_indentar_continuacao_do_mesmo_falante_sem_repetir_nome', () => {
    const t = 1000
    const result = formatTranscriptForPrompt([
      chunk('Ana', 'Parte 1', t),
      chunk('Ana', 'Parte 2', t + 1000),
    ])
    const lines = result.split('\n')
    expect(lines[1].startsWith('  ')).toBe(true)
    expect(lines[1]).not.toContain('Ana:')
  })

  it('deve_usar_linha_com_horario_quando_falante_muda', () => {
    const result = formatTranscriptForPrompt([
      chunk('Ana', 'Diz algo', 1000),
      chunk('Bob', 'Responde', 2000),
    ])
    const linesWithTimestamp = result.split('\n').filter((l) => l.match(/^\[/))
    expect(linesWithTimestamp).toHaveLength(2)
  })
})
