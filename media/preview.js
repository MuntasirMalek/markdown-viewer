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
// ANIMATION STRIPPED: Native Sync Only
// ============================================

// Toggle Red Flash for debugging
function flashDebug() {
    document.body.style.backgroundColor = '#ffcccc'; // Light Red
    setTimeout(() => {
        document.body.style.backgroundColor = '';
    }, 100);
    // Also blue bar
    document.body.classList.add('is-syncing');
    setTimeout(() => {
        document.body.classList.remove('is-syncing');
    }, 200);
}

// ============================================
// SYNC LOGIC
// ============================================

let lastSyncSend = 0;
let ignoreNextScroll = false; // crude lock

const scrollHandler = (e) => {
    // If we just sync-scrolled, ignore this event to prevent echo
    if (ignoreNextScroll) {
        ignoreNextScroll = false;
        return;
    }

    const now = Date.now();
    if (now - lastSyncSend < 50) return;
    lastSyncSend = now;

    const elements = document.querySelectorAll('[data-line]');
    if (elements.length === 0) return;

    const centerY = window.scrollY + (window.innerHeight / 2);
    let bestLine = -1;
    let minDist = Infinity;

    for (const el of elements) {
        const rect = el.getBoundingClientRect();
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

window.addEventListener('message', event => {
    const message = event.data;
    if (message.type === 'scrollTo') {

        // DEBUG FLASH
        flashDebug();

        const line = message.line;
        const totalLines = message.totalLines;

        let newTargetY = 0;

        // Exact match
        const exactEl = document.querySelector(`[data-line="${line}"]`);
        if (exactEl) {
            newTargetY = exactEl.offsetTop - (window.innerHeight / 2) + (exactEl.clientHeight / 2);
        } else {
            // Interpolate
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

                let rawY = 0;
                if (before && after) {
                    const ratio = (line - before.line) / (after.line - before.line);
                    rawY = before.top + (after.top - before.top) * ratio;
                } else if (before) {
                    rawY = before.top;
                } else if (after) {
                    rawY = 0;
                }
                newTargetY = rawY - (window.innerHeight / 2);
            } else if (totalLines) {
                const pct = line / totalLines;
                newTargetY = pct * document.body.scrollHeight;
            }
        }

        if (isNaN(newTargetY)) return;

        const maxScroll = Math.max(0, document.body.scrollHeight - window.innerHeight);
        newTargetY = Math.max(0, Math.min(newTargetY, maxScroll));

        // NATIVE SCROLL (INSTANT)
        // Set lock to prevent echo
        ignoreNextScroll = true;
        window.scrollTo({
            top: newTargetY,
            behavior: 'auto' // Instant jump
        });
    }
});
