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

        const selectedText = selection.toString();
        toolbar.dataset.selectedText = selectedText;

        // Find the parent block element using closest() - much more reliable
        // Start from an element node, not a text node
        const startElem = range.startContainer.nodeType === 1
            ? range.startContainer
            : range.startContainer.parentElement;

        // Find the closest block-level parent (li, p, td, h1-h6)
        const blockElement = startElem?.closest('li, p, td, th, h1, h2, h3, h4, h5, h6');
        const blockContext = blockElement?.textContent || '';

        // Find the closest element with a data-line attribute
        const lineElement = startElem?.closest('[data-line]');
        const lineNumber = lineElement ? parseInt(lineElement.getAttribute('data-line'), 10) : -1;

        // Debug: log what we found
        console.log(`[preview.js] Found: block=${blockElement?.tagName}, context="${blockContext.substring(0, 60)}...", line=${lineNumber}`);

        toolbar.dataset.sourceLine = lineNumber;
        toolbar.dataset.blockContext = blockContext;

        // SIBLING-BASED APPROACH: Count previous siblings containing the text
        let textOccurrenceIndex = 0;
        try {
            if (selectedText && blockElement) {
                // Count previous siblings that contain the same text
                let sibling = blockElement.previousElementSibling;
                while (sibling) {
                    const sibText = sibling.textContent || '';
                    if (sibText.includes(selectedText)) {
                        textOccurrenceIndex++;
                    }
                    sibling = sibling.previousElementSibling;
                }

                // Also check if we're inside a nested list - go up and check parent's siblings
                let parent = blockElement.parentElement;
                while (parent && parent !== document.body) {
                    const parentTag = parent.tagName?.toLowerCase();
                    if (parentTag === 'li' || parentTag === 'ul' || parentTag === 'ol') {
                        let parentSibling = parent.previousElementSibling;
                        while (parentSibling) {
                            const psText = parentSibling.textContent || '';
                            if (psText.includes(selectedText)) {
                                textOccurrenceIndex++;
                            }
                            parentSibling = parentSibling.previousElementSibling;
                        }
                    }
                    parent = parent.parentElement;
                }

                console.log(`[preview.js] Sibling-based count: ${textOccurrenceIndex} occurrences before this one`);
            }
        } catch (err) {
            console.error('[preview.js] Error counting occurrences:', err);
            textOccurrenceIndex = 0;
        }

        toolbar.dataset.blockOccurrenceIndex = textOccurrenceIndex;

        console.log(`[preview.js] Selection: "${selectedText.substring(0, 30)}..." textOccurrenceIndex: ${textOccurrenceIndex} blockContext: "${blockContext.substring(0, 50)}..." line: ${lineNumber}`);
    } else {
        if (!toolbar.contains(event.target)) {
            toolbar.classList.remove('visible');
        }

    }
});




function applyFormat(format) {
    const toolbar = document.getElementById('floatingToolbar');
    const selectedText = toolbar.dataset.selectedText;
    const sourceLine = parseInt(toolbar.dataset.sourceLine || '-1', 10);
    const blockContext = toolbar.dataset.blockContext || '';
    const blockOccurrenceIndex = parseInt(toolbar.dataset.blockOccurrenceIndex || '0', 10);

    // Debug output
    console.log(`[preview.js applyFormat] sourceLine=${sourceLine}, blockOccurrenceIndex=${blockOccurrenceIndex}, blockContext="${blockContext?.substring(0, 50)}...", selectedText="${selectedText?.substring(0, 30)}..."`);

    if (selectedText) {
        vscode.postMessage({
            type: 'applyFormat',
            format: format,
            selectedText: selectedText,
            sourceLine: sourceLine,
            blockContext: blockContext,
            blockOccurrenceIndex: blockOccurrenceIndex  // Which occurrence of identical blocks
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
