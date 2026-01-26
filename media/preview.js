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
// ANIMATION ENGINE: Robust Lerp Loop
// ============================================

let animationFrameId = null;
let targetScrollY = window.scrollY;
let isAutoScrolling = false;
let safetyTimeout = null;

// Kill Switch
const killScroll = () => {
    if (isAutoScrolling) {
        isAutoScrolling = false;
        targetScrollY = window.scrollY;
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
        if (safetyTimeout) clearTimeout(safetyTimeout);
        // Remove indicator
        document.body.classList.remove('is-syncing');
    }
};

const userAction = (e) => {
    // Only kill if it's a real user event, not synthetic
    if (e.isTrusted) killScroll();
};

window.addEventListener('mousedown', userAction);
window.addEventListener('wheel', userAction, { passive: true });
window.addEventListener('touchstart', userAction, { passive: true });
window.addEventListener('keydown', userAction);

function startScrollLoop() {
    if (animationFrameId) return;

    // Visual Indicator (Tiny blue bar at top)
    document.body.classList.add('is-syncing');

    // Safety: Kill auto-scroll after 3 seconds max (prevents stuck lock)
    if (safetyTimeout) clearTimeout(safetyTimeout);
    safetyTimeout = setTimeout(() => { killScroll(); }, 3000);

    function loop() {
        if (!isAutoScrolling) {
            animationFrameId = null;
            document.body.classList.remove('is-syncing');
            return;
        }

        const currentY = window.scrollY;

        // Validation
        if (isNaN(targetScrollY) || isNaN(currentY)) {
            killScroll();
            return;
        }

        const diff = targetScrollY - currentY;

        // Stop if close enough
        if (Math.abs(diff) < 1.0) {
            window.scrollTo({ top: targetScrollY, behavior: 'auto' });
            isAutoScrolling = false;
            animationFrameId = null;
            document.body.classList.remove('is-syncing');
            return;
        }

        // Lerp factor 0.2
        const nextY = currentY + (diff * 0.2);
        window.scrollTo({ top: nextY, behavior: 'auto' });

        animationFrameId = requestAnimationFrame(loop);
    }

    isAutoScrolling = true;
    loop();
}


// ============================================
// SYNC LOGIC
// ============================================

let lastSyncSend = 0;

const scrollHandler = (e) => {
    if (isAutoScrolling) return;

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
        // VISUAL DEBUG: Flash body slightly to prove receipt
        // document.body.style.opacity = '0.99'; 
        // setTimeout(() => document.body.style.opacity = '1', 50);

        const line = message.line;
        const totalLines = message.totalLines;

        let newTargetY = 0;

        // Try exact match
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

        if (Math.abs(newTargetY - targetScrollY) > 2 || !isAutoScrolling) {
            targetScrollY = newTargetY;
            if (!isAutoScrolling) {
                startScrollLoop();
            }
        }
    }
});
