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

    // AssemblyAI warning
    noAssemblyAIKey: 'Chave AssemblyAI não configurada. A identificação de falantes por voz não estará disponível. Configure nas Opções para ativar.',

    // Cancel recording modal
    confirmCancelTitle: 'Cancelar gravação?',
    confirmCancelMsg: 'Toda a transcrição desta reunião será perdida. Esta ação não pode ser desfeita.',
    confirmCancelBack: 'Voltar',
    confirmCancelYes: 'Sim, cancelar',

    // Caption warning
    noCaptionsWarning: 'Legendas não detectadas. Verifique se as legendas estão ativas na reunião (ativar "CC" ou "Legendas" na barra inferior).',

    // Empty state
    noMeetingDetected: 'Você não está em uma reunião. Abra o Google Meet ou Microsoft Teams para transcrever automaticamente. Ou use o Modo Sala para reuniões presenciais.',

    // Friendly errors
    errorInvalidApiKey: 'Chave de API inválida ou expirada. Atualize nas Configurações.',
    errorQuotaExceeded: 'Limite de uso da API atingido. Aguarde alguns minutos ou configure uma chave alternativa.',
    errorNetwork: 'Sem conexão com a internet. Verifique sua rede e tente novamente.',
    errorNoApiKey: 'Nenhuma chave de API configurada. Acesse as Configurações para adicionar.',

    // Onboarding (multilingual)
    onboarding1Title: 'Bem-vindo ao MeetScribe!',
    onboarding1Body: 'Transcreva reuniões e gere atas completas com IA — automaticamente. Vamos configurar tudo em menos de 2 minutos.',
    onboarding2Title: 'Configure sua API key',
    onboarding2Body: 'O MeetScribe usa Gemini ou Groq para gerar atas. Ambos são gratuitos. Clique em <strong>Configurações</strong> no rodapé para adicionar sua chave.',
    onboarding3Title: 'Inicie uma reunião',
    onboarding3Body: 'Entre no Google Meet ou Teams e o MeetScribe inicia automaticamente. Para reuniões presenciais, use a aba <strong>Modo Sala</strong>.',
    onboarding4Title: 'Sua ata em segundos',
    onboarding4Body: 'Ao encerrar, clique em <strong>Encerrar e Gerar Ata</strong>. A ata é gerada com resumo, decisões e próximos passos.',
    onboarding5Title: 'Pronto!',
    onboarding5Body: 'Você está pronto para usar o MeetScribe. Boa reunião!',
    onboardingNext: 'Próximo →',
    onboardingStart: 'Começar',
    onboardingSkip: 'Pular',

    // History export
    exportAllMinutes: 'Exportar todas as atas',
    showMore: 'Ver mais',

    // Offline recorder banner
    speechUnavailable: 'Transcrição ao vivo indisponível (sem conexão ou navegador incompatível). O áudio está sendo gravado e será transcrito por IA ao encerrar.',

    // Errors
    noApiKey: 'Nenhuma API key configurada. Acesse as opções da extensão para configurar.',
    noMinutesHistory: 'Esta reunião não tem ata gerada. A ata só está disponível para reuniões encerradas pelo MeetScribe.',

    // Error/warning messages (Sprint 1 fixes)
    errorEmptyTranscript: 'Nenhuma legenda capturada nesta reunião. Verifique se as legendas estão ativas e tente novamente.',
    errorGenerationFailed: 'Falha ao gerar a ata. Verifique sua API key e conexão e tente novamente.',
    errorNoActiveTab: 'Nenhuma aba ativa encontrada.',
    errorNotOnMeet: 'Acesse uma reunião no Google Meet ou Microsoft Teams para iniciar a transcrição.',
    warnAudioUnavailable: '⚠️ Captura de áudio indisponível. A ata será gerada apenas a partir das legendas.',
    warnAssemblyFallback: '⚠️ Identificação de falantes indisponível. Verifique sua chave AssemblyAI nas Configurações.',

    // Default meeting title (used in background.js / recorder.js)
    defaultMeetingTitle: 'Reunião',
    overlayActive: 'MeetScribe ativo — gravando transcrição',
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

    noAssemblyAIKey: 'AssemblyAI key not configured. Voice speaker identification will not be available. Configure it in Options to enable.',

    confirmCancelTitle: 'Cancel recording?',
    confirmCancelMsg: 'All transcription for this meeting will be lost. This action cannot be undone.',
    confirmCancelBack: 'Go back',
    confirmCancelYes: 'Yes, cancel',

    noCaptionsWarning: 'Captions not detected. Make sure captions are enabled in the meeting (enable "CC" or "Captions" in the bottom bar).',

    noMeetingDetected: "You are not in a meeting. Open Google Meet or Microsoft Teams to transcribe automatically. Or use Room Mode for in-person meetings.",

    errorInvalidApiKey: 'Invalid or expired API key. Update it in Settings.',
    errorQuotaExceeded: 'API usage limit reached. Wait a few minutes or configure an alternate key.',
    errorNetwork: 'No internet connection. Check your network and try again.',
    errorNoApiKey: 'No API key configured. Go to Settings to add one.',

    onboarding1Title: 'Welcome to MeetScribe!',
    onboarding1Body: 'Transcribe meetings and generate complete AI-powered minutes — automatically. Let\'s set everything up in under 2 minutes.',
    onboarding2Title: 'Set up your API key',
    onboarding2Body: 'MeetScribe uses Gemini or Groq to generate minutes. Both are free. Click <strong>Settings</strong> in the footer to add your key.',
    onboarding3Title: 'Start a meeting',
    onboarding3Body: 'Join Google Meet or Teams and MeetScribe starts automatically. For in-person meetings, use the <strong>Room Mode</strong> tab.',
    onboarding4Title: 'Your minutes in seconds',
    onboarding4Body: 'When done, click <strong>Stop & Generate Minutes</strong>. Minutes are generated with summary, decisions, and next steps.',
    onboarding5Title: 'All set!',
    onboarding5Body: 'You are ready to use MeetScribe. Have a great meeting!',
    onboardingNext: 'Next →',
    onboardingStart: 'Start',
    onboardingSkip: 'Skip',

    exportAllMinutes: 'Export all minutes',
    showMore: 'Show more',

    speechUnavailable: 'Live transcription unavailable (no connection or incompatible browser). Audio is being recorded and will be transcribed by AI when finished.',

    noApiKey: 'No API key configured. Open extension options to set it up.',
    noMinutesHistory: 'This meeting has no minutes generated. Minutes are only available for meetings ended through MeetScribe.',

    // Error/warning messages (Sprint 1 fixes)
    errorEmptyTranscript: 'No captions captured in this meeting. Make sure captions are enabled and try again.',
    errorGenerationFailed: 'Failed to generate minutes. Check your API key and connection and try again.',
    errorNoActiveTab: 'No active tab found.',
    errorNotOnMeet: 'Open a meeting in Google Meet or Microsoft Teams to start transcription.',
    warnAudioUnavailable: '⚠️ Audio capture unavailable. Minutes will be generated from captions only.',
    warnAssemblyFallback: '⚠️ Speaker identification unavailable. Check your AssemblyAI key in Settings.',

    // Default meeting title
    defaultMeetingTitle: 'Meeting',
    overlayActive: 'MeetScribe active — recording transcript',
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

    noAssemblyAIKey: 'Clave AssemblyAI no configurada. La identificación de hablantes por voz no estará disponible. Configúrala en Opciones para activarla.',

    confirmCancelTitle: '¿Cancelar grabación?',
    confirmCancelMsg: 'Toda la transcripción de esta reunión se perderá. Esta acción no se puede deshacer.',
    confirmCancelBack: 'Volver',
    confirmCancelYes: 'Sí, cancelar',

    noCaptionsWarning: 'Subtítulos no detectados. Asegúrate de que los subtítulos estén activos en la reunión (activar "CC" o "Subtítulos" en la barra inferior).',

    noMeetingDetected: 'No estás en una reunión. Abre Google Meet o Microsoft Teams para transcribir automáticamente. O usa el Modo Sala para reuniones presenciales.',

    errorInvalidApiKey: 'Clave de API inválida o expirada. Actualízala en Configuración.',
    errorQuotaExceeded: 'Límite de uso de la API alcanzado. Espera unos minutos o configura una clave alternativa.',
    errorNetwork: 'Sin conexión a internet. Verifica tu red e inténtalo de nuevo.',
    errorNoApiKey: 'Ninguna clave de API configurada. Ve a Configuración para añadir una.',

    onboarding1Title: '¡Bienvenido a MeetScribe!',
    onboarding1Body: 'Transcribe reuniones y genera actas completas con IA — automáticamente. Configuremos todo en menos de 2 minutos.',
    onboarding2Title: 'Configura tu API key',
    onboarding2Body: 'MeetScribe usa Gemini o Groq para generar actas. Ambos son gratuitos. Haz clic en <strong>Configuración</strong> en el pie de página para añadir tu clave.',
    onboarding3Title: 'Inicia una reunión',
    onboarding3Body: 'Entra en Google Meet o Teams y MeetScribe inicia automáticamente. Para reuniones presenciales, usa la pestaña <strong>Modo Sala</strong>.',
    onboarding4Title: 'Tu acta en segundos',
    onboarding4Body: 'Al terminar, haz clic en <strong>Finalizar y Generar Acta</strong>. El acta se genera con resumen, decisiones y próximos pasos.',
    onboarding5Title: '¡Todo listo!',
    onboarding5Body: '¡Estás listo para usar MeetScribe. ¡Buena reunión!',
    onboardingNext: 'Siguiente →',
    onboardingStart: 'Empezar',
    onboardingSkip: 'Saltar',

    exportAllMinutes: 'Exportar todas las actas',
    showMore: 'Ver más',

    speechUnavailable: 'Transcripción en vivo no disponible (sin conexión o navegador incompatible). El audio está siendo grabado y será transcrito por IA al finalizar.',

    noApiKey: 'Ninguna API key configurada. Abre las opciones de la extensión para configurarla.',
    noMinutesHistory: 'Esta reunión no tiene acta generada. Las actas solo están disponibles para reuniones finalizadas en MeetScribe.',

    // Error/warning messages (Sprint 1 fixes)
    errorEmptyTranscript: 'No se capturaron subtítulos en esta reunión. Verifica que los subtítulos estén activos e inténtalo de nuevo.',
    errorGenerationFailed: 'Error al generar el acta. Verifica tu API key y conexión e inténtalo de nuevo.',
    errorNoActiveTab: 'No se encontró ninguna pestaña activa.',
    errorNotOnMeet: 'Abre una reunión en Google Meet o Microsoft Teams para iniciar la transcripción.',
    warnAudioUnavailable: '⚠️ Captura de audio no disponible. El acta se generará solo a partir de los subtítulos.',
    warnAssemblyFallback: '⚠️ Identificación de hablantes no disponible. Verifica tu clave AssemblyAI en Configuración.',

    // Default meeting title
    defaultMeetingTitle: 'Reunión',
    overlayActive: 'MeetScribe activo — grabando transcripción',
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
