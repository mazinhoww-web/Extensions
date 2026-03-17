// MeetScribe — Internationalization (i18n)
// Supports pt-BR (default), en-US, es-ES.
// Language is set in options (chrome.storage.sync 'language' key).
// Usage: import { t, initI18n } from './i18n.js'
//        await initI18n();
//        element.textContent = t('startRecording');

const messages = {
  'pt-BR': {
    // Header / status
    inactive: 'Inativo',
    recording: '● Gravando',
    generating: 'Gerando...',
    ataReady: 'Ata Pronta ✓',

    // Tabs
    tabPlatform: 'Plataforma',
    tabMic: 'Modo Sala',
    tabHistory: 'Histórico',

    // Platform view
    startTranscription: '🎙️ Iniciar Transcrição',
    hybridMode: 'Modo Híbrido — sala + remotos',
    hybridDesc: 'Captura legendas da plataforma (participantes remotos) e microfone (participantes presenciais) simultaneamente.',
    multilingual: '🌐 Reunião multilíngue?',
    multilingualDesc: 'Se as legendas estiverem traduzidas para pt-BR, o áudio captado será transcrito no idioma original pelo Gemini.',
    configureNow: 'Configurar agora',
    configureSettings: 'configurações',
    noApiWarning: '⚠️ API key não configurada.',

    // Mic view
    offlineRecording: 'Gravação Offline',
    offlineDesc: 'Captura pelo microfone. Abre uma página dedicada com transcrição ao vivo, detecção de falantes e geração de ata — funciona em qualquer contexto.',
    meetingTitleLabel: 'Título da reunião (opcional):',
    meetingTitlePlaceholder: 'Ex: Reunião de alinhamento',
    startOfflineRecording: '🎤 Iniciar Gravação Offline',
    offlineInProgress: '● Gravação offline em andamento.',
    goToRecording: 'Abrir gravação →',

    // History
    noHistory: 'Nenhuma reunião no histórico.',
    viewMinutes: '👁 Ver ata',
    copy: '📋 Copiar',
    noMinutesGenerated: 'Sem ata gerada',
    delete: '🗑',

    // Recording view
    transcribingMeeting: 'Transcrevendo reunião',
    captionsCaptured: 'trechos capturados',
    stopAndGenerate: '⏹ Encerrar e Gerar Ata',
    cancelWithoutSaving: 'Cancelar sem salvar',

    // Generating view
    generatingMinutes: 'Gerando ata com IA',
    processingTranscription: 'Processando transcrição...',

    // Minutes view
    minutesGenerated: 'Ata gerada com sucesso!',
    copyBtn: '📋 Copiar',
    txtBtn: '⬇ TXT',
    pdfBtn: '🖨 PDF',
    newMeeting: '+ Nova Reunião',

    // Footer
    settings: '⚙️ Configurações',

    // Offline / reconnect
    offlineMsg: '📡 Sem conexão com a internet. A gravação continua, mas a ata será gerada quando a conexão voltar.',

    // Last meeting summary
    lastMeeting: 'Última reunião:',
    noTitle: 'Sem título',

    // Errors
    noApiKey: 'Nenhuma API key configurada. Acesse as opções da extensão para configurar.',
    noMinutesHistory: 'Esta reunião não tem ata gerada. A ata só está disponível para reuniões encerradas pelo MeetScribe.',
  },

  'en-US': {
    inactive: 'Inactive',
    recording: '● Recording',
    generating: 'Generating...',
    ataReady: 'Minutes Ready ✓',

    tabPlatform: 'Platform',
    tabMic: 'Room Mode',
    tabHistory: 'History',

    startTranscription: '🎙️ Start Transcription',
    hybridMode: 'Hybrid Mode — room + remote',
    hybridDesc: 'Captures platform captions (remote participants) and microphone (in-person participants) simultaneously.',
    multilingual: '🌐 Multilingual meeting?',
    multilingualDesc: 'If captions are translated, the captured audio will be transcribed in its original language by Gemini.',
    configureNow: 'Configure now',
    configureSettings: 'settings',
    noApiWarning: '⚠️ API key not configured.',

    offlineRecording: 'Offline Recording',
    offlineDesc: 'Captures via microphone. Opens a dedicated page with live transcription, speaker detection, and AI minutes.',
    meetingTitleLabel: 'Meeting title (optional):',
    meetingTitlePlaceholder: 'E.g. Weekly alignment',
    startOfflineRecording: '🎤 Start Offline Recording',
    offlineInProgress: '● Offline recording in progress.',
    goToRecording: 'Open recording →',

    noHistory: 'No meetings in history.',
    viewMinutes: '👁 View minutes',
    copy: '📋 Copy',
    noMinutesGenerated: 'No minutes generated',
    delete: '🗑',

    transcribingMeeting: 'Transcribing meeting',
    captionsCaptured: 'captions captured',
    stopAndGenerate: '⏹ Stop & Generate Minutes',
    cancelWithoutSaving: 'Cancel without saving',

    generatingMinutes: 'Generating AI minutes',
    processingTranscription: 'Processing transcript...',

    minutesGenerated: 'Minutes generated successfully!',
    copyBtn: '📋 Copy',
    txtBtn: '⬇ TXT',
    pdfBtn: '🖨 PDF',
    newMeeting: '+ New Meeting',

    settings: '⚙️ Settings',

    offlineMsg: '📡 No internet connection. Recording continues, but minutes will be generated when connection is restored.',

    lastMeeting: 'Last meeting:',
    noTitle: 'No title',

    noApiKey: 'No API key configured. Open extension options to set it up.',
    noMinutesHistory: 'This meeting has no minutes generated. Minutes are only available for meetings ended through MeetScribe.',
  },

  'es-ES': {
    inactive: 'Inactivo',
    recording: '● Grabando',
    generating: 'Generando...',
    ataReady: 'Acta Lista ✓',

    tabPlatform: 'Plataforma',
    tabMic: 'Modo Sala',
    tabHistory: 'Historial',

    startTranscription: '🎙️ Iniciar Transcripción',
    hybridMode: 'Modo Híbrido — sala + remotos',
    hybridDesc: 'Captura subtítulos de la plataforma (participantes remotos) y micrófono (participantes presenciales) simultáneamente.',
    multilingual: '🌐 ¿Reunión multilingüe?',
    multilingualDesc: 'Si los subtítulos están traducidos, el audio capturado será transcrito en el idioma original por Gemini.',
    configureNow: 'Configurar ahora',
    configureSettings: 'configuración',
    noApiWarning: '⚠️ API key no configurada.',

    offlineRecording: 'Grabación Offline',
    offlineDesc: 'Captura por micrófono. Abre una página dedicada con transcripción en vivo, detección de hablantes y generación de acta.',
    meetingTitleLabel: 'Título de la reunión (opcional):',
    meetingTitlePlaceholder: 'Ej: Alineación semanal',
    startOfflineRecording: '🎤 Iniciar Grabación Offline',
    offlineInProgress: '● Grabación offline en curso.',
    goToRecording: 'Abrir grabación →',

    noHistory: 'Sin reuniones en el historial.',
    viewMinutes: '👁 Ver acta',
    copy: '📋 Copiar',
    noMinutesGenerated: 'Sin acta generada',
    delete: '🗑',

    transcribingMeeting: 'Transcribiendo reunión',
    captionsCaptured: 'fragmentos capturados',
    stopAndGenerate: '⏹ Finalizar y Generar Acta',
    cancelWithoutSaving: 'Cancelar sin guardar',

    generatingMinutes: 'Generando acta con IA',
    processingTranscription: 'Procesando transcripción...',

    minutesGenerated: '¡Acta generada con éxito!',
    copyBtn: '📋 Copiar',
    txtBtn: '⬇ TXT',
    pdfBtn: '🖨 PDF',
    newMeeting: '+ Nueva Reunión',

    settings: '⚙️ Configuración',

    offlineMsg: '📡 Sin conexión a internet. La grabación continúa, pero el acta se generará cuando la conexión se restaure.',

    lastMeeting: 'Última reunión:',
    noTitle: 'Sin título',

    noApiKey: 'Ninguna API key configurada. Abre las opciones de la extensión para configurarla.',
    noMinutesHistory: 'Esta reunión no tiene acta generada. Las actas solo están disponibles para reuniones finalizadas en MeetScribe.',
  },
};

let _lang = 'pt-BR';

/**
 * Initialize i18n by reading language from chrome.storage.sync.
 * Must be called once before using t().
 */
export async function initI18n() {
  try {
    const { language } = await chrome.storage.sync.get('language');
    if (language && messages[language]) {
      _lang = language;
    } else {
      // Try browser language
      const browserLang = navigator.language;
      if (messages[browserLang]) _lang = browserLang;
      else if (browserLang?.startsWith('en')) _lang = 'en-US';
      else if (browserLang?.startsWith('es')) _lang = 'es-ES';
      else _lang = 'pt-BR';
    }
  } catch (_) {
    _lang = 'pt-BR';
  }
}

/**
 * Translate a key. Falls back to pt-BR if key is missing in current language.
 */
export function t(key) {
  return messages[_lang]?.[key] ?? messages['pt-BR'][key] ?? key;
}

export function currentLang() {
  return _lang;
}
