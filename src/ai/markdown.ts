/**
 * Lightweight safe markdown & autolink formatter for Sentinel responses.
 * Converts markdown, raw URLs, domains, and known resources into rich clickable HTML elements.
 */

export function formatSentinelMarkdown(rawText: string): string {
  if (!rawText) return '';

  // 1. Basic HTML escaping to prevent XSS
  let text = rawText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  // 2. Fenced code blocks ```lang ... ```
  const codeBlocks: string[] = [];
  text = text.replace(/```(?:[a-zA-Z0-9_-]+)?\n([\s\S]*?)```/g, (_m, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push(`<pre class="sentinel-code-block"><code>${code.trim()}</code></pre>`);
    return `%%%SENTINEL_CODE_${idx}%%%`;
  });

  // Helper for inline formatting within a line
  function formatInline(str: string): string {
    // Collect links to prevent double-wrapping
    const linkTokens: string[] = [];
    const makeToken = (htmlLink: string) => {
      const idx = linkTokens.length;
      linkTokens.push(htmlLink);
      return `%%%SENTINEL_LINK_${idx}%%%`;
    };

    // Inline code `code`
    str = str.replace(/`([^`\n]+)`/g, '<code class="sentinel-inline-code">$1</code>');

    // Markdown links: [Title](url)
    str = str.replace(
      /\[([^\]]+)\]\(((?:https?:\/\/|\/)[^\s)]+)\)/g,
      (_m, title, url) => {
        return makeToken(`<a href="${url}" target="_blank" rel="noopener noreferrer" class="sentinel-link">${title}</a>`);
      }
    );

    // Auto-link bare URLs (https://... or http://...)
    str = str.replace(
      /(https?:\/\/[^\s<]+)/g,
      (url) => {
        return makeToken(`<a href="${url}" target="_blank" rel="noopener noreferrer" class="sentinel-link">${url}</a>`);
      }
    );

    // Auto-link domain names (e.g. itch.io, lichess.org, github.com, etc.)
    const domainRegex = /\b([a-zA-Z0-9-]+\.(?:com|org|io|net|app|dev|ai|gg|co|me|tv|games|xyz|site|tech|info|edu|gov))\b/gi;
    str = str.replace(domainRegex, (domain) => {
      return makeToken(`<a href="https://${domain}" target="_blank" rel="noopener noreferrer" class="sentinel-link">${domain}</a>`);
    });

    // Auto-link well-known gaming & tech platform names
    const knownPlatforms: Array<{ pattern: RegExp; url: string }> = [
      { pattern: /\bCrazyGames\b/gi, url: 'https://www.crazygames.com' },
      { pattern: /\bPoki\b/g, url: 'https://poki.com' },
      { pattern: /\bArmor Games\b/gi, url: 'https://armorgames.com' },
      { pattern: /\bBoard Game Arena\b/gi, url: 'https://boardgamearena.com' },
      { pattern: /\bSteam\b/g, url: 'https://store.steampowered.com' },
      { pattern: /\bGitHub\b/gi, url: 'https://github.com' },
      { pattern: /\bYouTube\b/gi, url: 'https://www.youtube.com' },
      { pattern: /\bReddit\b/gi, url: 'https://www.reddit.com' },
      { pattern: /\bWikipedia\b/gi, url: 'https://www.wikipedia.org' }
    ];

    for (const kp of knownPlatforms) {
      str = str.replace(kp.pattern, (match) => {
        return makeToken(`<a href="${kp.url}" target="_blank" rel="noopener noreferrer" class="sentinel-link">${match}</a>`);
      });
    }

    // Bold **text**
    str = str.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');

    // Italic *text* (single line only, non-empty)
    str = str.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');

    // Restore link tokens
    linkTokens.forEach((linkHtml, idx) => {
      str = str.replace(`%%%SENTINEL_LINK_${idx}%%%`, linkHtml);
    });

    return str;
  }

  // 3. Process line by line for lists, paragraphs, headers
  const lines = text.split('\n');
  const formattedLines: string[] = [];
  let inList = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
      if (!inList) {
        formattedLines.push('<ul class="sentinel-list">');
        inList = true;
      }
      const itemContent = formatInline(trimmed.substring(2));
      formattedLines.push(`<li>${itemContent}</li>`);
    } else if (/^\d+\.\s+/.test(trimmed)) {
      if (!inList) {
        formattedLines.push('<ol class="sentinel-list sentinel-ordered">');
        inList = true;
      }
      const itemContent = formatInline(trimmed.replace(/^\d+\.\s+/, ''));
      formattedLines.push(`<li>${itemContent}</li>`);
    } else {
      if (inList) {
        formattedLines.push('</ul>');
        inList = false;
      }
      if (trimmed.length > 0) {
        formattedLines.push(`<p class="sentinel-para">${formatInline(line)}</p>`);
      } else {
        formattedLines.push('<div class="sentinel-spacer"></div>');
      }
    }
  }

  if (inList) {
    formattedLines.push('</ul>');
  }

  let finalHtml = formattedLines.join('\n');

  // Restore code blocks
  codeBlocks.forEach((block, idx) => {
    finalHtml = finalHtml.replace(`%%%SENTINEL_CODE_${idx}%%%`, block);
  });

  return finalHtml;
}
