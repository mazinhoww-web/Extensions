// MeetScribe — Options Page Script

// ─── Load saved settings ──────────────────────────────────────────────────────

async function loadSettings() {
  const settings = await chrome.storage.sync.get([
    'aiProvider',
    'geminiApiKey',
    'groqApiKey',
    'language',
    'showOverlay',
    'includeFullTranscript',
    'audioQualityHigh',
    'speakerGap',
    'deleteAudioAfter',
  ]);

  // Provider
  const provider = settings.aiProvider || 'gemini';
  const radios = document.querySelectorAll('input[name="aiProvider"]');
  radios.forEach((r) => {
    r.checked = r.value === provider;
  });
  updateProviderUI(provider);

  // API keys
  if (settings.geminiApiKey) {
    document.getElementById('geminiApiKey').value = settings.geminiApiKey;
  }
  if (settings.groqApiKey) {
    document.getElementById('groqApiKey').value = settings.groqApiKey;
  }

  // Language
  const lang = document.getElementById('language');
  if (lang && settings.language) lang.value = settings.language;

  // Toggles (default to true if undefined)
  const toggles = {
    showOverlay: settings.showOverlay !== false,
    includeFullTranscript: !!settings.includeFullTranscript,
    audioQualityHigh: settings.audioQualityHigh !== false,
    deleteAudioAfter: settings.deleteAudioAfter !== false,
  };
  Object.entries(toggles).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el) el.checked = val;
  });

  // Speaker gap
  const gap = document.getElementById('speakerGap');
  if (gap && settings.speakerGap) gap.value = String(settings.speakerGap);
}

// ─── Save settings ────────────────────────────────────────────────────────────

async function saveSettings() {
  const provider = document.querySelector('input[name="aiProvider"]:checked')?.value || 'gemini';

  const settings = {
    aiProvider: provider,
    geminiApiKey: document.getElementById('geminiApiKey').value.trim(),
    groqApiKey: document.getElementById('groqApiKey').value.trim(),
    language: document.getElementById('language').value,
    showOverlay: document.getElementById('showOverlay').checked,
    includeFullTranscript: document.getElementById('includeFullTranscript').checked,
    audioQualityHigh: document.getElementById('audioQualityHigh').checked,
    speakerGap: parseInt(document.getElementById('speakerGap').value, 10),
    deleteAudioAfter: document.getElementById('deleteAudioAfter').checked,
  };

  // Validate: at least one API key
  if (!settings.geminiApiKey && !settings.groqApiKey) {
    alert('Por favor, insira ao menos uma API key (Gemini ou Groq) para usar a geração de atas com IA.');
    return;
  }

  await chrome.storage.sync.set(settings);

  // Show success feedback
  const status = document.getElementById('saveStatus');
  if (status) {
    status.classList.add('visible');
    setTimeout(() => status.classList.remove('visible'), 3000);
  }
}

// ─── Provider UI toggle ───────────────────────────────────────────────────────

function updateProviderUI(provider) {
  const geminiCard = document.getElementById('cardGemini');
  const groqCard = document.getElementById('cardGroq');
  const geminiGroup = document.getElementById('geminiKeyGroup');
  const groqGroup = document.getElementById('groqKeyGroup');

  if (provider === 'gemini') {
    geminiCard?.classList.add('selected');
    groqCard?.classList.remove('selected');
    if (geminiGroup) geminiGroup.style.display = 'block';
    if (groqGroup) groqGroup.style.display = 'none';
  } else {
    groqCard?.classList.add('selected');
    geminiCard?.classList.remove('selected');
    if (groqGroup) groqGroup.style.display = 'block';
    if (geminiGroup) geminiGroup.style.display = 'none';
  }
}

// ─── Show/hide password ───────────────────────────────────────────────────────

function setupEyeButtons() {
  document.querySelectorAll('.eye-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target;
      const input = document.getElementById(targetId);
      if (!input) return;
      if (input.type === 'password') {
        input.type = 'text';
        btn.textContent = '🙈';
      } else {
        input.type = 'password';
        btn.textContent = '👁';
      }
    });
  });
}

// ─── Provider radio change ────────────────────────────────────────────────────

function setupProviderRadios() {
  document.querySelectorAll('input[name="aiProvider"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      updateProviderUI(radio.value);
    });
  });

  // Also clicking the card labels
  document.querySelectorAll('.provider-card').forEach((card) => {
    card.addEventListener('click', () => {
      const radio = card.querySelector('input[type="radio"]');
      if (radio) {
        radio.checked = true;
        updateProviderUI(radio.value);
      }
    });
  });
}

// ─── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  setupEyeButtons();
  setupProviderRadios();

  document.getElementById('btnSave')?.addEventListener('click', saveSettings);

  // Allow Ctrl+S to save
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      saveSettings();
    }
  });
});
