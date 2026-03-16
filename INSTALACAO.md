# MeetScribe — Guia de Instalação e Uso

> Transcrição em tempo real e geração automática de atas para Google Meet e Microsoft Teams.

---

## Índice

1. [Requisitos](#requisitos)
2. [Instalação da Extensão](#instalação-da-extensão)
3. [Obter API Key do Groq (recomendado — gratuito)](#obter-api-key-do-groq)
4. [Obter API Key do Gemini (alternativo)](#obter-api-key-do-gemini)
5. [Configurar a Extensão](#configurar-a-extensão)
6. [Como Usar em uma Reunião](#como-usar-em-uma-reunião)
7. [Modo Híbrido (Sala + Remotos)](#modo-híbrido-sala--remotos)
8. [Exportar a Ata](#exportar-a-ata)
9. [Solução de Problemas](#solução-de-problemas)

---

## Requisitos

- **Navegador:** Google Chrome (versão 114 ou superior) ou Microsoft Edge
- **Plataformas suportadas:** Google Meet, Microsoft Teams (web)
- **API Key gratuita:** Groq (recomendado) ou Google Gemini

---

## Instalação da Extensão

### Passo 1 — Extrair o ZIP

1. Baixe o arquivo `MeetScribe.zip`
2. Clique com o botão direito → **Extrair aqui** (ou "Extract All")
3. Anote o caminho da pasta extraída (ex.: `C:\Users\Você\Downloads\MeetScribe`)

### Passo 2 — Abrir o gerenciador de extensões

1. Abra o **Google Chrome**
2. Na barra de endereços, digite:
   ```
   chrome://extensions
   ```
   e pressione **Enter**

### Passo 3 — Ativar o modo desenvolvedor

No canto superior direito da página, ative a chave **"Modo do desenvolvedor"** (Developer mode).

### Passo 4 — Carregar a extensão

1. Clique no botão **"Carregar sem compactação"** (Load unpacked)
2. Navegue até a pasta extraída (a que contém o arquivo `manifest.json`)
3. Clique em **"Selecionar pasta"**

A extensão aparecerá na lista com o nome **"MeetScribe — Transcrição e Ata de Reuniões"**.

### Passo 5 — Fixar na barra de ferramentas (recomendado)

1. Clique no ícone de **quebra-cabeça** () na barra do Chrome
2. Ao lado de "MeetScribe", clique no **ícone de alfinete** para fixar
3. O ícone do MeetScribe aparecerá sempre visível na barra

---

## Obter API Key do Groq

O Groq é **gratuito e sem limite diário** — é o provedor recomendado.

1. Acesse: **https://console.groq.com**
2. Clique em **"Sign Up"** → crie uma conta gratuita (pode usar Google)
3. Após o login, clique em **"API Keys"** no menu lateral esquerdo
4. Clique em **"Create API Key"**
5. Dê um nome (ex.: "MeetScribe") e clique em **"Submit"**
6. **Copie a chave** — ela começa com `gsk_` (você só verá ela uma vez!)

---

## Obter API Key do Gemini

O Gemini é gratuito mas tem limite de **1.500 requisições/dia**. Use como alternativa ao Groq.

1. Acesse: **https://aistudio.google.com/app/apikey**
2. Faça login com sua conta Google
3. Clique em **"Create API key"**
4. **Copie a chave** — ela começa com `AIza`

---

## Configurar a Extensão

1. Clique no ícone do **MeetScribe** na barra do Chrome
2. No popup, clique em **"Configurações"** (link no rodapé)
3. Na página de configurações:

   **Provedor de IA:**
   - Selecione **Groq** (recomendado)
   - Cole sua chave no campo "API Key do Groq"

   **Idioma das atas:**
   - Selecione **Português (Brasil)**

4. Clique em **"Salvar Configurações"**
5. Uma mensagem "Configurações salvas!" confirmará o sucesso

---

## Como Usar em uma Reunião

### Google Meet

1. Acesse **https://meet.google.com** e entre na reunião
2. **Ative as legendas** da reunião:
   - Clique nos **3 pontinhos** (menu inferior) → **"Legendas"** → **Ativar**
   - Ou use o ícone de legendas `[CC]` na barra inferior
3. Clique no ícone do **MeetScribe** na barra do Chrome
4. O popup detectará automaticamente o Google Meet
5. Clique em **"Iniciar Transcrição"**
6. A transcrição começa — você verá o status mudar para "Gravando"

### Microsoft Teams

1. Acesse **https://teams.microsoft.com** e entre na reunião
2. **Ative as legendas ao vivo:**
   - Clique nos **3 pontinhos** → **"Legendas ao vivo"** → Ativar
3. Clique no ícone do **MeetScribe**
4. Clique em **"Iniciar Transcrição"**

### Encerrar e Gerar Ata

1. Clique no ícone do **MeetScribe**
2. Clique em **"Finalizar Transcrição"**
3. Aguarde a geração da ata (pode levar 10–30 segundos)
4. A ata completa aparecerá com: resumo executivo, decisões, ações e transcrição completa

---

## Modo Híbrido (Sala + Remotos)

Use quando há participantes **presencialmente na sala** E **remotos** na videochamada ao mesmo tempo.

**Exemplo:** 20 pessoas numa sala de reunião + 40 participantes no Meet/Teams.

### Como ativar:

1. Certifique-se de estar no Google Meet ou Teams com legendas ativas
2. Clique no ícone do **MeetScribe**
3. Na aba **"Plataforma"**, marque a caixa **"Modo Híbrido — sala + remotos"**
4. Clique em **"Iniciar Transcrição"**

### O que acontece:

- **Participantes remotos** são identificados pelo nome (via legendas da plataforma)
  - Ex.: `João Silva: "Os números do Q1 mostram crescimento de 15%..."`
- **Participantes presenciais** são capturados pelo microfone e identificados automaticamente
  - Ex.: `Sala - Falante 1: "Concordamos, mas precisamos revisar o custo..."`
- A ata final combina as duas fontes em ordem cronológica

> **Dica:** Para melhor qualidade de captura dos participantes da sala, use um microfone externo ou o microfone do notebook próximo às pessoas presenciais.

---

## Exportar a Ata

Após gerar a ata, você pode exportar em diferentes formatos:

| Formato | Uso ideal |
|---------|-----------|
| **Markdown** | Copiar/colar no Notion, Obsidian, etc. |
| **TXT** | Arquivo de texto simples |
| **DOCX** | Microsoft Word |
| **JSON** | Integração com outros sistemas |

Clique no botão do formato desejado na tela de resultados.

---

## Solução de Problemas

### A extensão não detecta o Google Meet / Teams

- Verifique se as **legendas estão ativas** na reunião (obrigatório)
- Recarregue a página da reunião e tente novamente
- Certifique-se de estar na aba ativa do Chrome quando clicar no ícone

### Erro "Limite da API Gemini atingido"

- Você atingiu a cota diária gratuita do Gemini (1.500 req/dia)
- **Solução:** Configure o Groq nas configurações da extensão
- O Groq é gratuito e não tem limite diário

### Erro "Nenhuma API key configurada"

- Acesse as configurações da extensão e insira uma API key válida
- Groq: chave começa com `gsk_`
- Gemini: chave começa com `AIza`

### A transcrição não está capturando falas

- Confirme que as legendas estão **visíveis** na tela do Meet/Teams
- Tente desativar e reativar as legendas
- Recarregue a página e inicie a transcrição novamente

### Como atualizar a extensão

1. Baixe o novo ZIP
2. Extraia na mesma pasta (substituindo os arquivos)
3. Acesse `chrome://extensions`
4. Clique no ícone de **recarga** () ao lado do MeetScribe

### A ata foi gerada mas está em inglês

- Acesse as configurações → mude o idioma para **Português (Brasil)**
- Salve e gere a ata novamente

---

## Privacidade e Segurança

- Toda a transcrição é processada **localmente** no seu computador
- As API keys são salvas apenas no **armazenamento local** do Chrome (não saem do seu computador)
- O texto da transcrição é enviado à API do Groq/Gemini **somente** no momento de gerar a ata
- Nenhum dado é enviado para servidores do MeetScribe

---

## Suporte

Versão atual: **MeetScribe v1.0**

Para dúvidas ou problemas, consulte este guia ou entre em contato com quem compartilhou a extensão.
