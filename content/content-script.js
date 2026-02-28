// Synapse — Content Script
// Extracts page content and structured data for AI context
// Follows skill pattern: listen for messages, respond with data

// ============================================================
// Message Listener (Background ↔ Content Script)
// ============================================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'extractContent') {
        const content = extractPageContent();
        sendResponse(content);
    }

    if (message.action === 'extractStructuredData') {
        const data = extractStructuredData();
        sendResponse(data);
    }

    if (message.action === 'getSelectedText') {
        sendResponse({ selectedText: window.getSelection().toString() });
    }

    return true; // Keep channel open for async
});

// ============================================================
// Page Content Extraction
// ============================================================
function extractPageContent() {
    try {
        const title = document.title || '';
        const url = window.location.href;
        const description = document.querySelector('meta[name="description"]')?.content ||
            document.querySelector('meta[property="og:description"]')?.content || '';

        // Get headings for structure
        const headings = [];
        document.querySelectorAll('h1, h2, h3').forEach((h, i) => {
            if (i < 20) {
                headings.push({
                    level: h.tagName,
                    text: h.textContent.trim().substring(0, 100)
                });
            }
        });

        // Get main text content (smart extraction)
        let content = '';

        // Try to find main content area first
        const mainSelectors = ['main', 'article', '[role="main"]', '.content', '.post-content', '.article-body', '#content'];
        let mainEl = null;

        for (const selector of mainSelectors) {
            mainEl = document.querySelector(selector);
            if (mainEl) break;
        }

        if (mainEl) {
            content = cleanText(mainEl.innerText);
        } else {
            content = cleanText(document.body.innerText);
        }

        // Get selected text
        const selectedText = window.getSelection().toString().trim();

        // Get links
        const links = [];
        document.querySelectorAll('a[href]').forEach((a, i) => {
            if (i < 30 && a.textContent.trim() && a.href.startsWith('http')) {
                links.push({
                    text: a.textContent.trim().substring(0, 60),
                    href: a.href
                });
            }
        });

        // Get images with alt text
        const images = [];
        document.querySelectorAll('img[alt]').forEach((img, i) => {
            if (i < 10 && img.alt.trim()) {
                images.push({ alt: img.alt.trim().substring(0, 100), src: img.src });
            }
        });

        return {
            title,
            url,
            description,
            headings,
            content: content.substring(0, 15000), // Cap at 15k chars
            selectedText,
            links,
            images,
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        return {
            title: document.title || '',
            url: window.location.href,
            content: 'Error extracting page content.',
            error: error.message
        };
    }
}

// ============================================================
// Structured Data Extraction (Tables, Lists, Profiles)
// ============================================================
function extractStructuredData() {
    const data = {
        tables: [],
        lists: [],
        metadata: {}
    };

    try {
        // Extract tables
        document.querySelectorAll('table').forEach((table, i) => {
            if (i < 5) {
                const rows = [];
                const headers = [];

                // Get headers
                table.querySelectorAll('th').forEach(th => {
                    headers.push(th.textContent.trim());
                });

                // Get rows
                table.querySelectorAll('tr').forEach((tr, rowIdx) => {
                    if (rowIdx < 100) { // Cap at 100 rows
                        const cells = [];
                        tr.querySelectorAll('td').forEach(td => {
                            cells.push(td.textContent.trim());
                        });
                        if (cells.length > 0) rows.push(cells);
                    }
                });

                if (rows.length > 0) {
                    data.tables.push({ headers, rows });
                }
            }
        });

        // Extract definition lists / key-value pairs
        document.querySelectorAll('dl').forEach((dl, i) => {
            if (i < 5) {
                const items = [];
                const dts = dl.querySelectorAll('dt');
                const dds = dl.querySelectorAll('dd');
                dts.forEach((dt, idx) => {
                    items.push({
                        key: dt.textContent.trim(),
                        value: dds[idx]?.textContent.trim() || ''
                    });
                });
                if (items.length > 0) data.lists.push({ type: 'definition', items });
            }
        });

        // Extract ordered/unordered lists
        document.querySelectorAll('ul, ol').forEach((list, i) => {
            if (i < 10) {
                const items = [];
                list.querySelectorAll(':scope > li').forEach((li, idx) => {
                    if (idx < 50) {
                        items.push(li.textContent.trim().substring(0, 200));
                    }
                });
                if (items.length > 2) {
                    data.lists.push({ type: list.tagName.toLowerCase(), items });
                }
            }
        });

        // Extract meta information
        data.metadata.title = document.title;
        data.metadata.url = window.location.href;
        data.metadata.author = document.querySelector('meta[name="author"]')?.content || '';
        data.metadata.date = document.querySelector('meta[name="date"]')?.content ||
            document.querySelector('time')?.getAttribute('datetime') || '';

        return data;
    } catch (error) {
        return { error: error.message, tables: [], lists: [], metadata: {} };
    }
}

// ============================================================
// Utility Functions
// ============================================================
function cleanText(text) {
    return text
        .replace(/\s+/g, ' ')           // Collapse whitespace
        .replace(/\n\s*\n/g, '\n')       // Remove blank lines
        .replace(/\t/g, ' ')             // Replace tabs
        .trim();
}
