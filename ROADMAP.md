# MeetScribe — Roadmap & Backlog

> Status: **v1.0** — última atualização: 2026-03-16

---

## ✅ Entregue

### Features
- Transcrição em tempo real (Meet e Teams, latência <3s)
- Identificação de múltiplos falantes
- Modo Híbrido: sala presencial + remotos
- Exportação em 5 formatos (Markdown, DOCX, PDF, TXT, JSON)
- Geração automática de ata com IA (resumo executivo, decisões, próximos passos)

### Melhorias
- Suporte ao Português Brasileiro (transcrição e ata otimizadas para PT-BR)

### Integrações
- Integração com API Groq (provedor principal — gratuito, sem limite diário)
- Integração com API Gemini (provedor alternativo — limite 1.500 req/dia)

---

## 🔄 Em Desenvolvimento

### Features
| ID | Item | Descrição |
|----|------|-----------|
| F1 | Suporte a Zoom | Captura de legendas ao vivo diretamente no Zoom Web |
| F2 | Templates customizáveis de ata | Escolha ou crie templates por tipo de reunião (1:1, Sprint...) |
| F3 | Resumo por email automático | Recebe a ata no email logo após o fim da reunião |

### Melhorias
| ID | Item | Descrição |
|----|------|-----------|
| M1 | Redesign do popup | Nova interface com histórico de reuniões e ações rápidas |
| M2 | Onboarding interativo | Tour guiado para novos usuários configurarem em <2 min |
| M3 | Dark/Light mode no popup | Alterne entre tema escuro e claro nas configurações |
| M4 | Indicador de qualidade de áudio | Exibe em tempo real se o microfone está captando bem |
| M5 | Progress bar na geração da ata | Progresso visual enquanto a IA processa a transcrição |
| M6 | Atalhos de teclado configuráveis | Defina seus próprios atalhos para iniciar/parar transcrição |

### Bug Fix
| ID | Item | Descrição |
|----|------|-----------|
| B1 | Correção de captura em abas inativas | Fix no Chrome throttling que pausava captura ao trocar de aba |
| B2 | Melhoria em salas com eco | Algoritmo de diarização mais robusto para ambientes com reverberação |

### Integrações
| ID | Item | Descrição |
|----|------|-----------|
| I1 | Integração com Notion | Exportação direta para uma página do Notion após gerar a ata |

---

## 📋 Backlog (Próximos Passos)

### Autenticação & Conta
| ID | Item | Descrição | Prioridade |
|----|------|-----------|------------|
| A1 | Login com Google | Autenticação via OAuth Google para sincronização de conta, histórico na nuvem e integrações | Alta |
| A2 | Auto-detecção de Gemini Key via conta Google | Ao logar com Google, detectar e reutilizar automaticamente a chave Gemini associada à conta — elimina configuração manual | Alta |

> **Nota A2:** Depende de A1. Fluxo esperado: usuário loga com Google → extensão solicita escopo `https://www.googleapis.com/auth/generativelanguage` via `chrome.identity.getAuthToken` → usa o token OAuth diretamente na API Gemini sem precisar inserir chave manualmente.

---

### Features
| ID | Item | Descrição |
|----|------|-----------|
| F4 | App mobile iOS | Extensão nativa para Safari iOS com suporte ao Meet mobile |
| F5 | App mobile Android | Chrome Android com captura de reuniões mobile |
| F6 | Dashboard web | Acesse e gerencie todas as suas atas em qualquer dispositivo |
| F7 | Sincronização entre dispositivos | Atas e configurações sincronizadas via conta na nuvem (requer A1) |
| F8 | Exportação para Google Docs | Cria um Google Doc formatado diretamente da ata gerada |
| F9 | Exportação para Confluence | Publica ata no Confluence com formatação de página adequada |
| F10 | Timestamps clicáveis na transcrição | Clique no trecho e pule para aquele momento no vídeo gravado |
| F11 | Busca semântica nas atas | Pesquise por conceito ou contexto em todas as reuniões anteriores |
| F12 | Modo live share | Compartilhe a transcrição em tempo real com participantes remotos |
| F13 | Análise de engajamento | Tempo de fala por participante e índice de participação |
| F14 | Detecção de sentimento | Identifica se o tom da reunião foi positivo, neutro ou tenso |
| F15 | API pública para desenvolvedores | Acesse transcrições e atas via REST API com autenticação por token |
| F16 | Suporte a webhooks | Dispare eventos customizados ao fim de cada reunião transcrita |
| F17 | Modo empresa | Gestão de times, permissões por papel e relatórios consolidados |
| F18 | Teams desktop (app nativo) | Suporte ao Microsoft Teams versão aplicativo desktop instalado |

### Melhorias
| ID | Item | Descrição |
|----|------|-----------|
| M7 | Interface em inglês e espanhol | Internacionalização completa da extensão e das atas geradas |
| M8 | Diarização real por voz no Modo Sala | Identificar cada falante pelo timbre/impressão vocal, não por pausa. Gravar áudio em chunks e enviar à API de diarização (AssemblyAI, Deepgram ou Pyannote) ao final da reunião. Retorno: segmentos com speaker ID (Falante A, Falante B...) mapeados sobre a transcrição existente. Depende de B5. |

### Bug Fix
| ID | Item | Descrição |
|----|------|-----------|
| B3 | Fix: bug de reconexão | Corrigir loop de reconexão após queda de internet durante gravação |
| B4 | Fix: sincronização de legendas | Corrigir dessincronismo de legendas em conexões com alta latência |
| B5 | Remover heurística de troca de falante por pausa | A detecção atual (pausa > Xs = novo falante) é incorreta — uma pausa não implica troca de falante. Remover o setting "Pausa para troca de falante" do options e a função `checkSpeakerChange()` do `mic-fallback.js`. Substituir por diarização real (ver M8). |

### Integrações
| ID | Item | Descrição |
|----|------|-----------|
| I2 | Slack | Envio automático da ata para um canal do Slack ao fim da reunião |
| I3 | Jira | Cria issues/tasks no Jira a partir das ações identificadas na ata |
| I4 | Trello | Cria cards no Trello com os action items extraídos da reunião |
| I5 | Asana | Sincroniza tarefas da ata diretamente para projetos do Asana |
| I6 | Monday.com | Cria items no Monday com responsáveis e prazos da reunião |
| I7 | Google Calendar | Inicia transcrição automaticamente ao detectar evento no calendário |
| I8 | OpenAI GPT | Use sua chave OpenAI como provedor de IA alternativo |

---

## Dependências entre itens

```
A1 (Login Google)
├── A2 (Auto-detecção Gemini Key)
├── F7 (Sincronização entre dispositivos)
├── F6 (Dashboard web)
└── F17 (Modo empresa)
```
