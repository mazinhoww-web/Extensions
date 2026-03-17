// MeetScribe — Exporter
// Handles downloading the meeting minutes as TXT or PDF.

// ─── TXT Export ───────────────────────────────────────────────────────────────

export function exportTXT(markdownContent, filename) {
  // Convert basic markdown to plain text
  const plain = markdownToPlain(markdownContent);
  const blob = new Blob([plain], { type: 'text/plain;charset=utf-8' });
  triggerDownload(blob, filename || `ata-reuniao-${dateStamp()}.txt`);
}

// ─── PDF Export ───────────────────────────────────────────────────────────────
// window.open + print() is unreliable in extension context (blocked by popup
// blockers). Instead, we download an HTML file that the user can open and
// print as PDF (Ctrl+P → Save as PDF) from any browser.

export function exportPDF(markdownContent, title) {
  const html = markdownToHTML(markdownContent, title);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const filename = `ata-reuniao-${dateStamp()}.html`;

  // Use chrome.downloads if available (extension context), otherwise fallback
  if (typeof chrome !== 'undefined' && chrome.downloads?.download) {
    const url = URL.createObjectURL(blob);
    chrome.downloads.download({ url, filename, saveAs: true }, () => {
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    });
  } else {
    triggerDownload(blob, filename);
  }
}

// ─── Clipboard ────────────────────────────────────────────────────────────────

export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (_) {
    // Fallback for older APIs
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

// ─── Markdown → Plain Text ────────────────────────────────────────────────────

function markdownToPlain(md) {
  return md
    .replace(/^#{1,6}\s+/gm, '') // headings
    .replace(/\*\*(.*?)\*\*/g, '$1') // bold
    .replace(/\*(.*?)\*/g, '$1') // italic
    .replace(/`(.*?)`/g, '$1') // code
    .replace(/^\s*[-*+]\s+/gm, '  • ') // bullets
    .replace(/^\s*\d+\.\s+/gm, (m) => m) // ordered lists
    .replace(/\|/g, ' | ') // table separators
    .replace(/^[-|:]+$/gm, '') // table dividers
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links
    .replace(/\n{3,}/g, '\n\n') // excess blank lines
    .trim();
}

// ─── Markdown → HTML (for PDF printing) ──────────────────────────────────────

function markdownToHTML(md, title) {
  const body = md
    // Headings
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    // Bold / italic
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Horizontal rule
    .replace(/^---$/gm, '<hr>')
    // Bullet lists
    .replace(/^(\s*)[-*+] (.+)$/gm, '<li>$2</li>')
    // Paragraph breaks
    .replace(/\n\n/g, '</p><p>')
    // Wrap in p tags
    .replace(/^(?!<[hli]|<hr|<p)(.+)$/gm, '<p>$1</p>');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>${title || 'Ata de Reunião'}</title>
  <style>
    @page { margin: 2cm; size: A4; }
    body {
      font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
      font-size: 11pt;
      line-height: 1.6;
      color: #1a1a1a;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
    }
    h1 {
      color: #1a237e;
      border-bottom: 2px solid #1a237e;
      padding-bottom: 8px;
      font-size: 18pt;
    }
    h2 {
      color: #283593;
      font-size: 14pt;
      margin-top: 24px;
      border-left: 4px solid #3f51b5;
      padding-left: 10px;
    }
    h3 {
      color: #37474f;
      font-size: 12pt;
    }
    li {
      margin-bottom: 4px;
    }
    ul { padding-left: 20px; }
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 12px 0;
    }
    th, td {
      border: 1px solid #ccc;
      padding: 6px 10px;
      text-align: left;
    }
    th { background: #e8eaf6; font-weight: 600; }
    hr { border: none; border-top: 1px solid #ddd; margin: 20px 0; }
    em { color: #555; }
    p { margin: 6px 0; }
    @media print {
      body { padding: 0; }
      h2 { page-break-before: auto; }
    }
  </style>
</head>
<body>
  ${body}
</body>
</html>`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dateStamp() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
