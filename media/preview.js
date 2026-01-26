// ===== VS Code API =====
const vscode = acquireVsCodeApi();

// ===== DOM Elements =====
const preview = document.getElementById('preview');
const floatingToolbar = document.getElementById('floatingToolbar');
const boldBtn = document.getElementById('boldBtn');
const highlightBtn = document.getElementById('highlightBtn');
const redHighlightBtn = document.getElementById('redHighlightBtn');
const deleteBtn = document.getElementById('deleteBtn');

// ===== State =====
let selectedText = '';

// ===== Marked.js Configuration =====
function configureMarked() {
    const renderer = new marked.Renderer();

    // Override text to support ==highlight== (yellow) and ::text:: (red)
    renderer.text = function (token) {
        let text = token.text || token;
        if (typeof text === 'string') {
            text = text.replace(/==([^=]+)==/g, '<mark>$1</mark>');
            text = text.replace(/::([^:]+)::/g, '<mark class="red-highlight">$1</mark>');
        }
        return text;
    };

    marked.setOptions({
        renderer: renderer,
        gfm: true,
        breaks: true,
        pedantic: false,
        smartypants: false,
        headerIds: true,
        mangle: false,
        highlight: function (code, lang) {
            if (lang && hljs.getLanguage(lang)) {
                try {
                    return hljs.highlight(code, { language: lang }).value;
                } catch (e) { }
            }
            return hljs.highlightAuto(code).value;
        }
    });
}

// ===== Markdown Rendering =====
function renderMarkdown(text) {
    const mathBlocks = [];
    const inlineMath = [];

    // Protect block math $$...$$
    text = text.replace(/\$\$([^$]+)\$\$/g, (match, math) => {
        mathBlocks.push(math);
        return `%%MATHBLOCK${mathBlocks.length - 1}%%`;
    });

    // Protect inline math $...$
    text = text.replace(/\$([^$\n]+)\$/g, (match, math) => {
        inlineMath.push(math);
        return `%%INLINEMATH${inlineMath.length - 1}%%`;
    });

    // Render markdown
    let html = marked.parse(text);

    // Restore block math
    html = html.replace(/%%MATHBLOCK(\d+)%%/g, (match, index) => {
        try {
            return katex.renderToString(mathBlocks[parseInt(index)], {
                displayMode: true,
                throwOnError: false
            });
        } catch (e) {
            return `<span class="math-error">${mathBlocks[parseInt(index)]}</span>`;
        }
    });

    // Restore inline math
    html = html.replace(/%%INLINEMATH(\d+)%%/g, (match, index) => {
        try {
            return katex.renderToString(inlineMath[parseInt(index)], {
                displayMode: false,
                throwOnError: false
            });
        } catch (e) {
            return `<span class="math-error">${inlineMath[parseInt(index)]}</span>`;
        }
    });

    return html;
}

function updatePreview() {
    const contentElement = document.getElementById('markdown-content');
    if (!contentElement) return;

    // Decode HTML entities
    const text = contentElement.textContent
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'");

    const sourceLines = text.split('\n');

    // Render markdown
    preview.innerHTML = renderMarkdown(text);

    // Add data-line attributes for scroll sync
    addLineAttributes(sourceLines);
}

function addLineAttributes(sourceLines) {
    const usedLines = new Set();
    const blockElements = preview.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote > p, pre, .katex-display, table');

    blockElements.forEach(el => {
        const elText = el.textContent.trim();
        if (!elText || elText.length < 2) return;

        const isCodeBlock = el.tagName === 'PRE';
        const isMathBlock = el.classList?.contains('katex-display');
        const isTable = el.tagName === 'TABLE';

        const prefix = elText.substring(0, Math.min(8, elText.length));

        for (let i = 0; i < sourceLines.length; i++) {
            if (usedLines.has(i)) continue;

            const srcLine = sourceLines[i];

            if (isCodeBlock) {
                if (srcLine.trim().startsWith('```')) {
                    el.setAttribute('data-line', i);
                    usedLines.add(i);
                    break;
                }
            } else if (isMathBlock) {
                if (srcLine.trim() === '$$' || srcLine.trim().startsWith('$$')) {
                    el.setAttribute('data-line', i);
                    usedLines.add(i);
                    break;
                }
            } else if (isTable) {
                if (srcLine.includes('|')) {
                    el.setAttribute('data-line', i);
                    usedLines.add(i);
                    break;
                }
            } else {
                const cleanSrcLine = srcLine.replace(/\*\*|__|[*_]|==|~~|`|#/g, '').trim();

                if (cleanSrcLine === elText || srcLine.includes(elText)) {
                    el.setAttribute('data-line', i);
                    usedLines.add(i);
                    break;
                }
                if (srcLine.includes(prefix) && prefix.length >= 5) {
                    el.setAttribute('data-line', i);
                    usedLines.add(i);
                    break;
                }
            }
        }
    });
}

// ===== Scroll Sync =====
function scrollToLine(line) {
    const element = preview.querySelector(`[data-line="${line}"]`);
    if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
        // Fallback: scroll proportionally
        const totalLines = preview.querySelectorAll('[data-line]').length;
        if (totalLines > 0) {
            const scrollRatio = line / totalLines;
            preview.scrollTop = scrollRatio * (preview.scrollHeight - preview.clientHeight);
        }
    }
}

// ===== Floating Toolbar =====
function showFloatingToolbar(x, y) {
    floatingToolbar.style.left = `${x}px`;
    floatingToolbar.style.top = `${y}px`;
    floatingToolbar.classList.add('visible');
}

function hideFloatingToolbar() {
    floatingToolbar.classList.remove('visible');
    selectedText = '';
}

function handlePreviewSelection() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
        hideFloatingToolbar();
        return;
    }

    let text = selection.toString().trim();
    if (text.length < 1) {
        hideFloatingToolbar();
        return;
    }

    text = text.replace(/\s+/g, ' ').trim();
    selectedText = text;

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const x = Math.max(10, rect.left + (rect.width / 2) - 60);
    const y = Math.max(10, rect.top - 50);

    showFloatingToolbar(x, y);
}

function applyFormat(format) {
    if (!selectedText) return;

    vscode.postMessage({
        type: 'applyFormat',
        format: format,
        selectedText: selectedText
    });

    hideFloatingToolbar();
}

// ===== Message Handling =====
window.addEventListener('message', event => {
    const message = event.data;
    switch (message.type) {
        case 'scrollTo':
            scrollToLine(message.line);
            break;
        case 'update':
            // Future: handle content updates via messages
            break;
    }
});

// ===== Event Listeners =====
document.addEventListener('mouseup', () => {
    setTimeout(handlePreviewSelection, 10);
});

document.addEventListener('mousedown', (e) => {
    if (!floatingToolbar.contains(e.target)) {
        hideFloatingToolbar();
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        hideFloatingToolbar();
    }
});

if (boldBtn) {
    boldBtn.addEventListener('click', () => applyFormat('bold'));
}

if (highlightBtn) {
    highlightBtn.addEventListener('click', () => applyFormat('highlight'));
}

if (redHighlightBtn) {
    redHighlightBtn.addEventListener('click', () => applyFormat('red-highlight'));
}

if (deleteBtn) {
    deleteBtn.addEventListener('click', () => applyFormat('delete'));
}

// ===== Initialization =====
configureMarked();
updatePreview();
