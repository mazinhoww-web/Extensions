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

  // Provider preference
  const provider = settings.aiProvider || 'groq';
  document.querySelectorAll('input[name="aiProvider"]').forEach((r) => {
    r.checked = r.value === provider;
  });
  updateProviderUI(provider);

  // API keys
  if (settings.geminiApiKey) document.getElementById('geminiApiKey').value = settings.geminiApiKey;
  if (settings.groqApiKey)   document.getElementById('groqApiKey').value   = settings.groqApiKey;

  // Language
  const lang = document.getElementById('language');
  if (lang && settings.language) lang.value = settings.language;

  // Toggles (default to true if undefined)
  const toggleDefaults = {
    showOverlay: true,
    includeFullTranscript: false,
    audioQualityHigh: true,
    deleteAudioAfter: true,
  };
  Object.entries(toggleDefaults).forEach(([id, def]) => {
    const el = document.getElementById(id);
    if (el) el.checked = settings[id] !== undefined ? settings[id] : def;
  });

  // Speaker gap
  const gap = document.getElementById('speakerGap');
  if (gap && settings.speakerGap) gap.value = String(settings.speakerGap);
}

// ─── Save settings ────────────────────────────────────────────────────────────

async function saveSettings() {
  const provider = document.querySelector('input[name="aiProvider"]:checked')?.value || 'groq';
  const geminiKey = document.getElementById('geminiApiKey').value.trim();
  const groqKey   = document.getElementById('groqApiKey').value.trim();

  if (!geminiKey && !groqKey) {
    alert('Por favor, insira ao menos uma API key (Groq ou Gemini) para usar a geração de atas com IA.');
    return;
  }

  await chrome.storage.sync.set({
    aiProvider: provider,
    geminiApiKey: geminiKey,
    groqApiKey: groqKey,
    language: document.getElementById('language').value,
    showOverlay: document.getElementById('showOverlay').checked,
    includeFullTranscript: document.getElementById('includeFullTranscript').checked,
    audioQualityHigh: document.getElementById('audioQualityHigh').checked,
    speakerGap: parseInt(document.getElementById('speakerGap').value, 10),
    deleteAudioAfter: document.getElementById('deleteAudioAfter').checked,
  });

  const status = document.getElementById('saveStatus');
  if (status) {
    status.classList.add('visible');
    setTimeout(() => status.classList.remove('visible'), 3000);
  }
}

// ─── Provider UI (highlight selection only — both key groups stay visible) ────

function updateProviderUI(provider) {
  document.getElementById('cardGemini')?.classList.toggle('selected', provider === 'gemini');
  document.getElementById('cardGroq')?.classList.toggle('selected',   provider === 'groq');
}

// ─── Show/hide password ───────────────────────────────────────────────────────

function setupEyeButtons() {
  document.querySelectorAll('.eye-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.target);
      if (!input) return;
      if (input.type === 'password') { input.type = 'text'; btn.textContent = '🙈'; }
      else                           { input.type = 'password'; btn.textContent = '👁'; }
    });
  });
}

// ─── API key test ─────────────────────────────────────────────────────────────

async function testGeminiKey(key) {
  const models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
  let lastErr;

  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Responda apenas: OK' }] }],
        generationConfig: { maxOutputTokens: 5 },
      }),
    });

    if (res.ok) return; // chave válida

    const data = await res.json().catch(() => ({}));
    const msg = data?.error?.message || `Erro HTTP ${res.status}`;

    if (res.status === 429) {
      // 429 com limit:0 = modelo não disponível neste projeto, tenta o próximo
      if (msg.includes('limit: 0')) { lastErr = new Error(msg); continue; }
      // 429 normal = quota atingida mas chave é válida
      return;
    }

    if (res.status === 400 || res.status === 404) { lastErr = new Error(msg); continue; }

    throw new Error(msg);
  }

  throw lastErr || new Error('Nenhum modelo Gemini disponível para esta chave');
}

async function testGroqKey(key) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: 'OK' }],
      max_tokens: 5,
    }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error?.message || `Erro HTTP ${res.status}`);
  }
}

function setupTestButtons() {
  document.querySelectorAll('.test-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const provider  = btn.dataset.provider;
      const keyInput  = document.getElementById(provider === 'gemini' ? 'geminiApiKey' : 'groqApiKey');
      const resultEl  = document.getElementById(provider === 'gemini' ? 'testGeminiResult' : 'testGroqResult');
      if (!resultEl) return;

      const key = keyInput?.value.trim();
      if (!key) {
        resultEl.textContent = '⚠️ Insira uma API key para testar';
        resultEl.className = 'test-result warn';
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Testando…';
      resultEl.textContent = '⏳ Verificando chave…';
      resultEl.className = 'test-result loading';

      try {
        if (provider === 'gemini') await testGeminiKey(key);
        else                       await testGroqKey(key);
        resultEl.textContent = '✅ Chave válida';
        resultEl.className = 'test-result success';
      } catch (err) {
        resultEl.textContent = `❌ ${err.message}`;
        resultEl.className = 'test-result error';
      } finally {
        btn.disabled = false;
        btn.textContent = 'Testar';
      }
    });
  });
}

// ─── Provider radio change ────────────────────────────────────────────────────

function setupProviderRadios() {
  document.querySelectorAll('input[name="aiProvider"]').forEach((radio) => {
    radio.addEventListener('change', () => updateProviderUI(radio.value));
  });

  document.querySelectorAll('.provider-card').forEach((card) => {
    card.addEventListener('click', () => {
      const radio = card.querySelector('input[type="radio"]');
      if (radio) { radio.checked = true; updateProviderUI(radio.value); }
    });
  });
}

// ─── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  setupEyeButtons();
  setupProviderRadios();
  setupTestButtons();

  document.getElementById('btnSave')?.addEventListener('click', saveSettings);

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveSettings(); }
  });
});
