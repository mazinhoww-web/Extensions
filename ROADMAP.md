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
| B6 | Transcrição completa ausente no Modo Offline | Na gravação offline, mesmo com a opção "incluir transcrição completa" ativada nas configurações, o resultado exibe apenas a ata gerada pela IA — a transcrição bruta não é exibida/exportada. Corrigir para que o modo offline respeite a configuração `includeTranscript` e exiba/exporte a transcrição completa junto com a ata. |
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

## Análise Competitiva (Março 2026)

> Pesquisa realizada em 2026-03-16. Fontes: Chrome Web Store, G2, Product Hunt, Capterra, blogs dos próprios concorrentes.

### Panorama do mercado

O mercado de AI meeting notetakers vale ~$450M hoje, projetado para $2.5B em 2033. A transcrição em si virou commodity — a briga agora é em **privacidade**, **operação sem bot**, **profundidade de integrações** e **automação de follow-up**.

**Disruption iminente:** A Microsoft vai bloquear bots de terceiros no Teams a partir de **maio/junho 2026**. Isso vai quebrar Fireflies, Otter.ai, MeetGeek, Sembly, tl;dv e Read.ai para usuários Teams que aplicarem a política. Ferramentas com integração nativa sem bot ganharão mercado expressivo.

---

### Mapa de concorrentes

| Concorrente | Rating | Usuários | Free Tier | Pro | Moat principal |
|---|---|---|---|---|---|
| **Fathom** | G2 5/5 | 500k+ | Gravação ilimitada, 5 AI summaries/mês | $15/mês | Melhor free tier; G2 #1 |
| **Tactiq** | CWS 4.8/5 | 700k+ | 10 transcrições/mês | $12/mês | Bot-free por design (captura legendas); privacidade real |
| **tl;dv** | — | — | Gravação + transcrição ilimitada | $18/mês | Free tier generoso; timestamps clicáveis; GDPR |
| **Fireflies.ai** | CWS 4.6/5 | 1M+ empresas | 800 min armazenamento | $10/mês | 100+ idiomas; integrações CRM; maior base |
| **Otter.ai** | — | — | 300 min/mês, cap 30 min/sessão | $8.33/mês | Mais barato; captura de slides; mobile |
| **Read.ai** | — | — | 5 reuniões/mês | $15/mês | Engagement score; Speaker Coach em tempo real |
| **MeetGeek** | — | — | Limitado | $15–59/mês | 8.000+ integrações; 100+ idiomas |
| **Supernormal** | — | 700k+ orgs | 1.000 min armazenamento | $18/mês | AI Agents que geram entregáveis (apresentações, briefs) |
| **Sembly** | — | — | 60 min/mês | $10/mês | Mais certificações (SOC2+GDPR+HIPAA+PCI); regulados |
| **Notta** | — | 10M+ | 120 min, cap 3 min/sessão | $8.17/mês | 58 idiomas + tradução em tempo real; maior base global |

---

### Gaps e oportunidades identificadas

| # | Gap | Como explorar |
|---|-----|---------------|
| **C1** | Teams bot-blocking em mai/jun 2026 | Construir integração nativa Teams sem bot — maior oportunidade de Q2/Q3 2026 |
| **C2** | Free tiers são "modo trial" (caps agressivos) | Free tier realmente útil: transcrição ilimitada + N AI summaries/mês (modelo Fathom) |
| **C3** | Áudio enviado para servidores US — privacidade questionável | Processar localmente ou oferecer EU hosting com deleção verificável — moat de confiança |
| **C4** | Timestamps clicáveis levam ao momento no vídeo | Fathom e tl;dv fazem isso — já está no backlog como F10 |
| **C5** | Vocabulário customizado (termos técnicos/domínio) | Permitir glossário por time: nomes de produtos, siglas, terminologia técnica |
| **C6** | Mercado LATAM subatendido | MeetScribe PT-BR já tem vantagem — idioma, gírias, sotaques locais |
| **C7** | Dados silos — ninguém conecta reunião + email + Slack bem | Read.ai tenta mas tem problemas de trust — oportunidade de longo prazo |
| **C8** | Reuniões curtas e standups | Bots falham em reuniões <4 min; extensão browser-native resolve isso |

---

### Features de alto valor para adicionar ao backlog (mapeadas da análise)

| ID | Feature | Origem da insight | Dificuldade |
|----|---------|-------------------|-------------|
| **C-F1** | Timestamps clicáveis → pular para momento no vídeo | tl;dv, Fathom moat | Média (já é F10) |
| **C-F2** | Templates de ata por tipo de reunião (sales, standup, 1:1, sprint, entrevista) | tl;dv, MeetGeek diferencial | Baixa (já é F2 em dev) |
| **C-F3** | Análise de tempo de fala por participante (talk time %) | Read.ai, MeetGeek | Baixa |
| **C-F4** | Video soundbites — clipes curtos compartilháveis de momentos-chave | Fathom moat | Média |
| **C-F5** | Vocabulário customizado por organização (glossário técnico) | Notta diferencial | Baixa |
| **C-F6** | AI Chat cross-reuniões — perguntas sobre o histórico inteiro | Fireflies, MeetGeek | Alta |
| **C-F7** | Integração nativa Teams sem bot (Graph API / Teams App) | Gap crítico pré-bloqueio Microsoft | Alta |
| **C-F8** | Detecção de risco em reuniões de vendas (objeções, sentimento por deal) | Read.ai Sales AGI | Alta |
| **C-F9** | Suporte a gravação de reuniões já encerradas (upload de áudio/vídeo) | Gap: Fathom não faz isso | Média |

---

### Benchmark de preços recomendado para MeetScribe

| Plano | Preço alvo | O que inclui |
|-------|-----------|--------------|
| Free | R$0 | Transcrição ilimitada, 5 AI summaries/mês |
| Pro | ~R$55–65/mês ($10–12) | AI ilimitado, todos os formatos de export, integrações básicas |
| Team | ~R$110–120/usuário/mês ($20–22) | Colaboração, admin, CRM sync, vocabulário customizado |
| Enterprise | Custom | EU hosting, SSO, compliance, relatórios consolidados |

---

## Dependências entre itens

```
A1 (Login Google)
├── A2 (Auto-detecção Gemini Key)
├── F7 (Sincronização entre dispositivos)
├── F6 (Dashboard web)
└── F17 (Modo empresa)
```
