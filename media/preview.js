const vscode = acquireVsCodeApi();

document.addEventListener('mouseup', event => {
    const selection = window.getSelection();
    const toolbar = document.getElementById('floatingToolbar');

    if (selection && selection.toString().trim().length > 0) {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        toolbar.style.top = `${window.scrollY + rect.top - 50}px`;
        toolbar.style.left = `${rect.left}px`;
        toolbar.classList.add('visible');

        toolbar.dataset.selectedText = selection.toString();
    } else {
        if (!toolbar.contains(event.target)) {
            toolbar.classList.remove('visible');
        }
    }
});

function applyFormat(format) {
    const toolbar = document.getElementById('floatingToolbar');
    const selectedText = toolbar.dataset.selectedText;
    if (selectedText) {
        vscode.postMessage({
            type: 'applyFormat',
            format: format,
            selectedText: selectedText
        });
        toolbar.classList.remove('visible');
        window.getSelection().removeAllRanges();
    }
}

document.getElementById('boldBtn').onclick = () => applyFormat('bold');
document.getElementById('highlightBtn').onclick = () => applyFormat('highlight');
document.getElementById('redHighlightBtn').onclick = () => applyFormat('red-highlight');
document.getElementById('deleteBtn').onclick = () => applyFormat('delete');

const exportBtn = document.getElementById('toolbarExportBtn');
if (exportBtn) {
    exportBtn.onclick = () => {
        exportPdf();
        const toolbar = document.getElementById('floatingToolbar');
        toolbar.classList.remove('visible');
        window.getSelection().removeAllRanges();
    };
}

function exportPdf() {
    vscode.postMessage({ type: 'exportPdf' });
}

// ============================================
// SYNC LOGIC: Smooth Center & Strict Locking
// ============================================

let isSyncing = false; // "Echo Prevention" Lock
let lastScrollTime = 0;
let unlockTimeout;

// 1. Preview -> Editor (User Scrolled Preview)
const scrollHandler = () => {
    // If we are currently animating from an editor scroll, DO NOT send a sync back.
    if (isSyncing) return;

    const now = Date.now();
    // Debounce at 100ms: Wait for scroll to settle slightly
    if (now - lastScrollTime < 100) return;
    lastScrollTime = now;

    const elements = document.querySelectorAll('[data-line]');
    if (elements.length === 0) return;

    // Center-biased detection
    const centerY = window.scrollY + (window.innerHeight / 2);
    let bestLine = -1;
    let minDist = Infinity;

    for (const el of elements) {
        const rect = el.getBoundingClientRect(); // relative to viewport
        const absTop = window.scrollY + rect.top;
        const dist = Math.abs(absTop - centerY);

        if (dist < minDist) {
            minDist = dist;
            bestLine = parseInt(el.getAttribute('data-line'));
        }
    }

    if (bestLine >= 0) {
        vscode.postMessage({
            type: 'revealLine',
            line: bestLine
        });
    }
};

window.addEventListener('scroll', scrollHandler, { capture: true });

// 2. Editor -> Preview (User Scrolled Editor)
window.addEventListener('message', event => {
    const message = event.data;
    if (message.type === 'scrollTo') {
        const line = message.line;
        const totalLines = message.totalLines;

        // LOCK: Prevent preview from sending this scroll back to editor
        isSyncing = true;
        if (unlockTimeout) clearTimeout(unlockTimeout);

        // Unlock after animation finishes (750ms is enough for 'smooth')
        unlockTimeout = setTimeout(() => { isSyncing = false; }, 750);

        // Find Exact Element
        const exactEl = document.querySelector(`[data-line="${line}"]`);

        if (exactEl) {
            // Smooth scroll to CENTER
            exactEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
            // Fallback: Interpolation
            const elements = Array.from(document.querySelectorAll('[data-line]'));
            if (elements.length > 0) {
                const sorted = elements.map(el => ({
                    line: parseInt(el.getAttribute('data-line')),
                    top: el.offsetTop
                })).sort((a, b) => a.line - b.line);

                let before = null;
                let after = null;

                for (const item of sorted) {
                    if (item.line <= line) before = item;
                    else { after = item; break; }
                }

                let targetY = 0;
                if (before && after) {
                    const ratio = (line - before.line) / (after.line - before.line);
                    targetY = before.top + (after.top - before.top) * ratio;
                } else if (before) {
                    targetY = before.top;
                } else if (after) {
                    targetY = 0;
                }

                // Center logic for manual Y
                const centerY = targetY - (window.innerHeight / 2);
                const safeY = Math.max(0, centerY);

                window.scrollTo({ top: safeY, behavior: 'smooth' });
            } else if (totalLines) {
                // Percentage
                const pct = line / totalLines;
                const targetY = pct * document.body.scrollHeight;
                window.scrollTo({ top: targetY, behavior: 'smooth' });
            }
        }
    }
});
