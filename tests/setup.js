import { vi } from 'vitest'

// ─── URL.createObjectURL / revokeObjectURL ────────────────────────────────────
// jsdom não implementa estas APIs; definir globalmente para testes.

if (!URL.createObjectURL) {
  URL.createObjectURL = vi.fn(() => 'blob:mock-url')
  URL.revokeObjectURL = vi.fn()
}

// ─── Polyfills de Blob para jsdom ─────────────────────────────────────────────
// jsdom não implementa Blob.prototype.text() nem .arrayBuffer()

if (!Blob.prototype.text) {
  Blob.prototype.text = function () {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => reject(reader.error)
      reader.readAsText(this)
    })
  }
}

if (!Blob.prototype.arrayBuffer) {
  Blob.prototype.arrayBuffer = function () {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => reject(reader.error)
      reader.readAsArrayBuffer(this)
    })
  }
}

// ─── Stateful Chrome API mock ─────────────────────────────────────────────────
// localStore e syncStore são objetos mutáveis: os mocks lêem/escrevem neles,
// permitindo que o estado persista entre chamadas dentro do mesmo teste.

const localStore = {}
const syncStore = {}

function makeGetMock(store) {
  return vi.fn(async (keys) => {
    if (typeof keys === 'string') {
      return { [keys]: store[keys] }
    }
    if (Array.isArray(keys)) {
      return Object.fromEntries(keys.map((k) => [k, store[k]]))
    }
    // object with default values
    return Object.fromEntries(
      Object.keys(keys).map((k) => [k, store[k] !== undefined ? store[k] : keys[k]])
    )
  })
}

global.chrome = {
  storage: {
    local: {
      get: makeGetMock(localStore),
      set: vi.fn(async (data) => { Object.assign(localStore, data) }),
      remove: vi.fn(async (keys) => {
        const arr = typeof keys === 'string' ? [keys] : keys
        for (const k of arr) delete localStore[k]
      }),
    },
    sync: {
      get: makeGetMock(syncStore),
    },
  },
  runtime: {
    onMessage: { addListener: vi.fn() },
    onSuspend: { addListener: vi.fn() },
    sendMessage: vi.fn().mockResolvedValue({}),
    getManifest: vi.fn(() => ({ version: '1.0.0' })),
  },
  scripting: {
    executeScript: vi.fn().mockResolvedValue(undefined),
  },
  tabs: {
    onUpdated: { addListener: vi.fn() },
  },
  alarms: {
    create: vi.fn(),
    clear: vi.fn(),
    onAlarm: { addListener: vi.fn() },
  },
  action: {
    setBadgeText: vi.fn(),
    setBadgeBackgroundColor: vi.fn(),
  },
  downloads: {
    download: vi.fn((opts, cb) => { if (cb) cb(); }),
  },

  // Referências internas para reset nos testes
  _localStore: localStore,
  _syncStore: syncStore,
}
