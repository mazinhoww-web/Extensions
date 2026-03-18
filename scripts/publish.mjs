#!/usr/bin/env node
/**
 * MeetScribe — Chrome Web Store Publish Script
 *
 * Fluxo:
 *  1. Bump de versão no manifest.json (patch automático)
 *  2. Build do ZIP com os arquivos da extensão
 *  3. Commit + push no git
 *  4. Upload do ZIP via CWS API
 *  5. Pergunta se pode publicar
 *  6. Publica na CWS
 *
 * Configuração: copie .env.example para .env e preencha as credenciais.
 * Como obter as credenciais: veja README da seção "CWS API Setup".
 */

import { execSync } from 'child_process';
import { createReadStream, readFileSync, writeFileSync, existsSync } from 'fs';
import { createInterface } from 'readline';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ── Config ──────────────────────────────────────────────────────────────────

function loadEnv() {
  const envPath = resolve(ROOT, '.env');
  if (!existsSync(envPath)) {
    console.error('\n❌ Arquivo .env não encontrado.');
    console.error('   Copie .env.example para .env e preencha as credenciais.\n');
    process.exit(1);
  }
  const lines = readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const [key, ...rest] = line.split('=');
    if (key && rest.length) process.env[key.trim()] = rest.join('=').trim();
  }
}

loadEnv();

const EXTENSION_ID  = process.env.CWS_EXTENSION_ID;
const CLIENT_ID     = process.env.CWS_CLIENT_ID;
const CLIENT_SECRET = process.env.CWS_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.CWS_REFRESH_TOKEN;

if (!EXTENSION_ID || !CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
  console.error('\n❌ Variáveis de ambiente incompletas no .env.');
  console.error('   Necessário: CWS_EXTENSION_ID, CWS_CLIENT_ID, CWS_CLIENT_SECRET, CWS_REFRESH_TOKEN\n');
  process.exit(1);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function run(cmd, opts = {}) {
  return execSync(cmd, { cwd: ROOT, stdio: opts.silent ? 'pipe' : 'inherit', ...opts });
}

function runOutput(cmd) {
  return execSync(cmd, { cwd: ROOT }).toString().trim();
}

function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans.trim()); }));
}

function log(msg) { console.log(`\n${msg}`); }
function ok(msg)  { console.log(`✅ ${msg}`); }
function err(msg) { console.error(`❌ ${msg}`); }

// ── Step 1: Bump version ─────────────────────────────────────────────────────

function bumpVersion() {
  const manifestPath = resolve(ROOT, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const [major, minor, patch] = manifest.version.split('.').map(Number);
  manifest.version = `${major}.${minor}.${patch + 1}`;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  ok(`Versão bumped: ${major}.${minor}.${patch} → ${manifest.version}`);
  return manifest.version;
}

// ── Step 2: Build ZIP ────────────────────────────────────────────────────────

function buildZip(version) {
  const zipPath = resolve(ROOT, `dist/meetscribe-${version}.zip`);
  run('mkdir -p dist');

  const files = [
    'manifest.json',
    'background/background.js',
    'content/google-meet.js',
    'content/teams.js',
    'content/mic-fallback.js',
    'icons/icon16.png',
    'icons/icon48.png',
    'icons/icon128.png',
    'options/options.html',
    'options/options.js',
    'options/options.css',
    'popup/popup.html',
    'popup/popup.js',
    'popup/popup.css',
    'recorder/recorder.html',
    'recorder/recorder.js',
    'recorder/recorder.css',
    'utils/i18n.js',
    'utils/minutes-generator.js',
    'utils/text-normalizer.js',
    'utils/exporter.js',
    'utils/hotkeys.js',
    'utils/assemblyai-transcriber.js',
    '_locales/pt_BR/messages.json',
    '_locales/en/messages.json',
    '_locales/es/messages.json',
    'PRIVACY_POLICY.md',
  ].filter(f => existsSync(resolve(ROOT, f)));

  run(`zip "${zipPath}" ${files.join(' ')}`);
  const size = runOutput(`du -sh "${zipPath}"`).split('\t')[0];
  ok(`ZIP criado: dist/meetscribe-${version}.zip (${size})`);
  return zipPath;
}

// ── Step 3: Git commit + push ────────────────────────────────────────────────

function gitPush(version) {
  const branch = runOutput('git rev-parse --abbrev-ref HEAD');
  run('git add manifest.json');
  run(`git commit -m "chore: release v${version}"`);
  run(`git push -u origin ${branch}`);
  ok(`Git: commit e push da v${version} no branch ${branch}`);
}

// ── Step 4: OAuth token ──────────────────────────────────────────────────────

async function getAccessToken() {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: REFRESH_TOKEN,
      grant_type:    'refresh_token',
    }),
  });
  const data = await res.json();
  if (!data.access_token) {
    err('Falha ao obter access token: ' + JSON.stringify(data));
    process.exit(1);
  }
  ok('Access token obtido');
  return data.access_token;
}

// ── Step 5: Upload ZIP ───────────────────────────────────────────────────────

async function uploadZip(zipPath, token) {
  log('📤 Fazendo upload do ZIP para a CWS...');
  const zipData = readFileSync(zipPath);

  const res = await fetch(
    `https://www.googleapis.com/upload/chromewebstore/v1.1/items/${EXTENSION_ID}`,
    {
      method: 'PUT',
      headers: {
        Authorization:  `Bearer ${token}`,
        'x-goog-api-version': '2',
        'Content-Type': 'application/zip',
      },
      body: zipData,
    }
  );

  const data = await res.json();
  if (data.uploadState === 'FAILURE') {
    err('Upload falhou:\n' + JSON.stringify(data.itemError, null, 2));
    process.exit(1);
  }
  ok(`Upload concluído (estado: ${data.uploadState})`);
  return data;
}

// ── Step 6: Publish ──────────────────────────────────────────────────────────

async function publish(token) {
  log('🚀 Publicando na Chrome Web Store...');
  const res = await fetch(
    `https://www.googleapis.com/chromewebstore/v1.1/items/${EXTENSION_ID}/publish`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-goog-api-version': '2',
        'Content-Length': '0',
      },
    }
  );
  const data = await res.json();
  if (data.status?.includes('OK') || data.statusDetail?.includes('OK')) {
    ok('Publicado com sucesso! A revisão do Google pode levar alguns dias.');
  } else {
    err('Resposta inesperada:\n' + JSON.stringify(data, null, 2));
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🔵 MeetScribe — CWS Publish Script\n' + '─'.repeat(40));

  // 1. Bump versão
  const version = bumpVersion();

  // 2. Build ZIP
  const zipPath = buildZip(version);

  // 3. Git push
  gitPush(version);

  // 4. Upload
  const token = await getAccessToken();
  await uploadZip(zipPath, token);

  // 5. Confirmar publicação
  console.log('\n─'.repeat(40));
  const answer = await ask(`\n🚀 Publicar v${version} na Chrome Web Store agora? (s/N): `);

  if (answer.toLowerCase() === 's') {
    await publish(token);
  } else {
    log('⏸  Publicação adiada. O ZIP já está no rascunho da CWS.');
    log('   Para publicar manualmente: acesse o Developer Dashboard e clique em "Enviar para análise".');
  }

  console.log('\n✅ Processo concluído.\n');
}

main().catch(e => { err(e.message); process.exit(1); });
