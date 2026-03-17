import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { exportTXT, exportPDF, copyToClipboard } from '../utils/exporter.js'

// ─── exportTXT ────────────────────────────────────────────────────────────────
// exportTXT converte markdown para texto simples e dispara download.
// Testamos o resultado observável: conteúdo do blob e acionamento do download.

describe('exportTXT', () => {
  let capturedBlob
  let mockAnchor

  beforeEach(() => {
    capturedBlob = null
    mockAnchor = { href: '', download: '', click: vi.fn() }

    // jsdom não provê URL.createObjectURL, então definimos diretamente
    URL.createObjectURL = vi.fn((blob) => {
      capturedBlob = blob
      return 'blob:test-url'
    })
    URL.revokeObjectURL = vi.fn()

    const origCreate = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag === 'a') return mockAnchor
      return origCreate(tag)
    })
  })

  afterEach(() => {
    delete URL.createObjectURL
    delete URL.revokeObjectURL
    vi.restoreAllMocks()
  })

  it('deve_acionar_download_ao_ser_chamado', () => {
    exportTXT('Conteúdo', 'arquivo.txt')
    expect(mockAnchor.click).toHaveBeenCalled()
  })

  it('deve_usar_o_filename_fornecido_pelo_caller', () => {
    exportTXT('Conteúdo', 'minha-ata.txt')
    expect(mockAnchor.download).toBe('minha-ata.txt')
  })

  it('deve_gerar_filename_padrao_com_data_quando_nao_fornecido', () => {
    exportTXT('Conteúdo')
    expect(mockAnchor.download).toMatch(/^ata-reuniao-\d{4}-\d{2}-\d{2}\.txt$/)
  })

  it('deve_remover_marcadores_de_heading_do_markdown', async () => {
    exportTXT('# Título Principal\n## Subtítulo', 'test.txt')
    const text = await capturedBlob.text()
    expect(text).not.toMatch(/^#+/)
    expect(text).toContain('Título Principal')
    expect(text).toContain('Subtítulo')
  })

  it('deve_remover_negrito_mas_preservar_o_texto', async () => {
    exportTXT('**texto em negrito** normal', 'test.txt')
    const text = await capturedBlob.text()
    expect(text).not.toContain('**')
    expect(text).toContain('texto em negrito')
  })

  it('deve_remover_italico_mas_preservar_o_texto', async () => {
    exportTXT('*texto em itálico*', 'test.txt')
    const text = await capturedBlob.text()
    expect(text).not.toMatch(/\*[^*]+\*/)
    expect(text).toContain('texto em itálico')
  })

  it('deve_remover_links_markdown_mas_preservar_texto_do_link', async () => {
    exportTXT('[Clique aqui](https://exemplo.com)', 'test.txt')
    const text = await capturedBlob.text()
    expect(text).toContain('Clique aqui')
    expect(text).not.toContain('https://exemplo.com')
    expect(text).not.toContain('[')
  })

  it('deve_converter_bullets_markdown_para_formato_texto_simples', async () => {
    exportTXT('- Item um\n- Item dois', 'test.txt')
    const text = await capturedBlob.text()
    expect(text).toContain('•')
    expect(text).not.toMatch(/^- /m)
  })

  it('deve_remover_divisores_de_tabela_markdown', async () => {
    exportTXT('| Col A | Col B |\n|---|---|\n| v1 | v2 |', 'test.txt')
    const text = await capturedBlob.text()
    expect(text).not.toMatch(/^[-|:]+$/m)
  })

  it('deve_criar_blob_com_tipo_text_plain', () => {
    exportTXT('Conteúdo', 'test.txt')
    expect(capturedBlob.type).toContain('text/plain')
  })
})

// ─── exportPDF ────────────────────────────────────────────────────────────────

describe('exportPDF', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Re-define URL mocks (the exportTXT afterEach deletes them)
    URL.createObjectURL = vi.fn(() => 'blob:mock-url')
    URL.revokeObjectURL = vi.fn()
  })

  afterEach(() => {
    delete URL.createObjectURL
    delete URL.revokeObjectURL
  })

  it('deve_usar_chrome_downloads_quando_disponivel', () => {
    exportPDF('# Conteúdo', 'Minha Ata')
    expect(chrome.downloads.download).toHaveBeenCalled()
    const opts = chrome.downloads.download.mock.calls[0][0]
    expect(opts.url).toBe('blob:mock-url')
    expect(opts.filename).toMatch(/\.html$/)
    expect(opts.saveAs).toBe(true)
  })

  it('deve_criar_blob_html_com_doctype', () => {
    exportPDF('# Título', 'Ata')
    expect(URL.createObjectURL).toHaveBeenCalled()
    const blob = URL.createObjectURL.mock.calls[0][0]
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toContain('text/html')
  })

  it('deve_incluir_conteudo_markdown_convertido_em_html', async () => {
    exportPDF('# Título da Reunião', 'Ata')
    const blob = URL.createObjectURL.mock.calls[0][0]
    const html = await blob.text()
    expect(html).toContain('<h1>')
    expect(html).toContain('Título da Reunião')
  })

  it('deve_usar_titulo_fornecido_na_tag_title_do_html', async () => {
    exportPDF('Conteúdo', 'Reunião Sprint 42')
    const blob = URL.createObjectURL.mock.calls[0][0]
    const html = await blob.text()
    expect(html).toContain('<title>Reunião Sprint 42</title>')
  })

  it('deve_usar_titulo_padrao_quando_nao_fornecido', async () => {
    exportPDF('Conteúdo')
    const blob = URL.createObjectURL.mock.calls[0][0]
    const html = await blob.text()
    expect(html).toContain('Ata de Reunião')
  })

  it('deve_incluir_doctype_no_html_gerado', async () => {
    exportPDF('Conteúdo', 'Ata')
    const blob = URL.createObjectURL.mock.calls[0][0]
    const html = await blob.text()
    expect(html).toContain('<!DOCTYPE html>')
  })

  it('deve_converter_bold_markdown_em_tag_strong_no_html', async () => {
    exportPDF('**decisão importante**', 'Ata')
    const blob = URL.createObjectURL.mock.calls[0][0]
    const html = await blob.text()
    expect(html).toContain('<strong>decisão importante</strong>')
  })

  it('deve_chamar_triggerDownload_como_fallback_sem_chrome_downloads', () => {
    // Temporarily remove chrome.downloads to test fallback path
    const originalDownloads = chrome.downloads
    delete chrome.downloads
    try {
      exportPDF('Conteúdo', 'Ata')
      // Falls back to triggerDownload which calls URL.createObjectURL + <a>.click()
      expect(URL.createObjectURL).toHaveBeenCalled()
    } finally {
      chrome.downloads = originalDownloads
    }
  })
})

// ─── copyToClipboard ──────────────────────────────────────────────────────────

describe('copyToClipboard', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('deve_copiar_o_texto_para_a_area_de_transferencia', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      writable: true,
      configurable: true,
    })

    await copyToClipboard('Texto para copiar')
    expect(writeText).toHaveBeenCalledWith('Texto para copiar')
  })

  it('deve_retornar_true_quando_copia_com_sucesso', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    })

    const result = await copyToClipboard('qualquer texto')
    expect(result).toBe(true)
  })

  it('deve_usar_fallback_com_execCommand_quando_clipboard_api_falha', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('Not allowed')) },
      writable: true,
      configurable: true,
    })

    // jsdom não provê document.execCommand, então definimos diretamente
    document.execCommand = vi.fn().mockReturnValue(true)
    const result = await copyToClipboard('texto fallback')
    expect(document.execCommand).toHaveBeenCalledWith('copy')
    expect(result).toBe(true)
    delete document.execCommand
  })

  it('deve_copiar_texto_vazio_sem_erros', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    })

    await expect(copyToClipboard('')).resolves.not.toThrow()
  })
})
