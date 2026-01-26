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
// ANIMATION ENGINE: Lerp Loop (Game Style)
// ============================================

let animationFrameId = null;
let targetScrollY = window.scrollY; // The goal
let isAutoScrolling = false;

// Kill Switch
const killScroll = () => {
    if (isAutoScrolling) {
        isAutoScrolling = false;
        targetScrollY = window.scrollY; // Reset target to current to stop drift
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
    }
};

window.addEventListener('mousedown', killScroll);
window.addEventListener('wheel', killScroll, { passive: true });
window.addEventListener('touchstart', killScroll, { passive: true });
window.addEventListener('keydown', killScroll);

function startScrollLoop() {
    if (animationFrameId) return; // Already running

    function loop() {
        if (!isAutoScrolling) {
            animationFrameId = null;
            return;
        }

        const currentY = window.scrollY;

        // Linear Interpolation: Move 20% of the distance each frame
        // This creates a natural "slide" that slows down as it arrives.
        // It handles rapid target updates perfectly (just changes direction).
        const diff = targetScrollY - currentY;

        if (Math.abs(diff) < 1) {
            // Arrived
            window.scrollTo(0, targetScrollY);
            isAutoScrolling = false;
            animationFrameId = null;
            return;
        }

        // Speed factor: 0.2 = fast smooth, 0.1 = slow smooth
        const nextY = currentY + (diff * 0.2);
        window.scrollTo(0, nextY);

        animationFrameId = requestAnimationFrame(loop);
    }

    isAutoScrolling = true;
    loop();
}


// ============================================
// SYNC LOGIC
// ============================================

let lastSyncSend = 0;

// 1. Preview -> Editor (User Scrolled Preview)
const scrollHandler = () => {
    // If auto-scrolling, ignore
    if (isAutoScrolling) return;

    const now = Date.now();
    if (now - lastSyncSend < 50) return; // Throttle 20fps
    lastSyncSend = now;

    const elements = document.querySelectorAll('[data-line]');
    if (elements.length === 0) return;

    // Center-biased detection
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

// 2. Editor -> Preview (User Scrolled Editor)
window.addEventListener('message', event => {
    const message = event.data;
    if (message.type === 'scrollTo') {
        const line = message.line;
        const totalLines = message.totalLines;

        // Calculate Target Y
        let newTargetY = 0;

        // Exact Match
        const exactEl = document.querySelector(`[data-line="${line}"]`);
        if (exactEl) {
            // Center Align
            newTargetY = exactEl.offsetTop - (window.innerHeight / 2) + (exactEl.clientHeight / 2);
        } else {
            // Interpolation
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
                newTargetY = rawY - (window.innerHeight / 2); // Center
            } else if (totalLines) {
                // Percentage
                const pct = line / totalLines;
                newTargetY = pct * document.body.scrollHeight;
            }
        }

        // Bounds Check
        newTargetY = Math.max(0, Math.min(newTargetY, document.body.scrollHeight - window.innerHeight));

        // Update Target (Game Loop handles the rest)
        targetScrollY = newTargetY;

        // Start loop if not running
        if (!isAutoScrolling) {
            startScrollLoop();
        }
    }
});
