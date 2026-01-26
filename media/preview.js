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
// SYNC LOGIC: Linear Interpolation & Throttle
// ============================================

let isSyncing = false;
let lastScrollTime = 0;

// Preview -> Editor Sync (Throttled, not Debounced)
const scrollHandler = () => {
    if (isSyncing) return;

    const now = Date.now();
    if (now - lastScrollTime < 50) return; // 20fps throttle
    lastScrollTime = now;

    const elements = document.querySelectorAll('[data-line]');
    if (elements.length === 0) return;

    // Find the current scroll position relative to elements
    const scrollTop = window.scrollY;

    // Find element just before and just after the scroll top
    let beforeEl = null;
    let afterEl = null;

    for (const el of elements) {
        if (el.offsetTop <= scrollTop) {
            beforeEl = el;
        } else {
            afterEl = el;
            break; // Sorted by appearance in DOM usually implies sorted by top
        }
    }

    let targetLine = 0;

    if (beforeEl && afterEl) {
        // Interpolate
        const minLine = parseInt(beforeEl.getAttribute('data-line'));
        const maxLine = parseInt(afterEl.getAttribute('data-line'));

        const minPos = beforeEl.offsetTop;
        const maxPos = afterEl.offsetTop;

        const ratio = (scrollTop - minPos) / (maxPos - minPos);
        targetLine = minLine + Math.round((maxLine - minLine) * ratio);
    } else if (beforeEl) {
        targetLine = parseInt(beforeEl.getAttribute('data-line'));
    } else if (afterEl) {
        targetLine = parseInt(afterEl.getAttribute('data-line'));
    }

    if (targetLine >= 0) {
        vscode.postMessage({
            type: 'revealLine',
            line: targetLine
        });
    }
};

window.addEventListener('scroll', scrollHandler, { capture: true });

// Editor -> Preview Sync (Instant, Interpolated)
window.addEventListener('message', event => {
    const message = event.data;
    if (message.type === 'scrollTo') {
        const line = message.line;
        const totalLines = message.totalLines;

        isSyncing = true;

        // 1. Precise Element Match
        const exactEl = document.querySelector(`[data-line="${line}"]`);
        if (exactEl) {
            // align to top, INSTANT execution
            window.scrollTo({ top: exactEl.offsetTop, behavior: 'auto' });
        } else {
            // 2. Interpolation Strategy
            // Find closest markers
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
                    targetY = before.top; // Should maybe extrapolate?
                } else if (after) {
                    targetY = 0; // Top of doc
                }

                // If no markers found at all, fallback to percentage (handled below indirectly or by totalLines)
                if (before || after) {
                    window.scrollTo({ top: targetY, behavior: 'auto' });
                } else if (totalLines) {
                    const pct = line / totalLines;
                    window.scrollTo({ top: pct * document.body.scrollHeight, behavior: 'auto' });
                }
            } else if (totalLines) {
                // No markers, pure percentage
                const pct = line / totalLines;
                window.scrollTo({ top: pct * document.body.scrollHeight, behavior: 'auto' });
            }
        }

        // Release lock
        setTimeout(() => { isSyncing = false; }, 100);
    }
});
