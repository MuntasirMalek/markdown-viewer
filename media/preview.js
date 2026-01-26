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
// ANIMATION ENGINE: Physics-based, Interruptible
// ============================================

let userInteracting = false;
let animationFrameId = null;

// Detecting User Interaction to kill auto-scroll
const killScroll = () => {
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    userInteracting = true;
    setTimeout(() => { userInteracting = false; }, 200); // Debounce interaction flag
};

window.addEventListener('mousedown', killScroll);
window.addEventListener('wheel', killScroll, { passive: true });
window.addEventListener('touchstart', killScroll, { passive: true });
window.addEventListener('keydown', killScroll);

// Smooth Scroll Function (Custom Easing)
function smoothScrollTo(targetY) {
    if (userInteracting) return;

    const startY = window.scrollY;
    const distance = targetY - startY;
    const startTime = performance.now();
    const duration = 400; // ms

    // Quadratic Ease-out
    const easeOutQuad = (t) => t * (2 - t);

    // Cancel previous
    if (animationFrameId) cancelAnimationFrame(animationFrameId);

    function step(currentTime) {
        if (userInteracting) return; // Kill switch

        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const ease = easeOutQuad(progress);

        window.scrollTo(0, startY + (distance * ease));

        if (progress < 1) {
            animationFrameId = requestAnimationFrame(step);
        } else {
            animationFrameId = null;
        }
    }

    animationFrameId = requestAnimationFrame(step);
}

// ============================================
// SYNC LOGIC
// ============================================

let lastSyncSend = 0;

// 1. Preview -> Editor (User Scrolled Preview)
const scrollHandler = () => {
    // If we are auto-scrolling, DO NOT sync back to editor (prevents echo)
    if (animationFrameId !== null) return;

    const now = Date.now();
    if (now - lastSyncSend < 50) return; // Throttle 20fps
    lastSyncSend = now;

    const elements = document.querySelectorAll('[data-line]');
    if (elements.length === 0) return;

    // Use absolute center
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
        let targetY = 0;

        // Exact Match
        const exactEl = document.querySelector(`[data-line="${line}"]`);
        if (exactEl) {
            // Center Align
            targetY = exactEl.offsetTop - (window.innerHeight / 2) + (exactEl.clientHeight / 2);
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
                targetY = rawY - (window.innerHeight / 2); // Center
            } else if (totalLines) {
                // Percentage
                const pct = line / totalLines;
                targetY = pct * document.body.scrollHeight;
            }
        }

        // Bounds Check
        targetY = Math.max(0, Math.min(targetY, document.body.scrollHeight - window.innerHeight));

        // EXECUTE CUSTOM SCROLL
        smoothScrollTo(targetY);
    }
});
