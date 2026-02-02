(function () {

    const MAX_EMAILS = 4;
    const MAX_RUN_MS = 60000;
    const VERBOSE = !!window.__EMAIL_FINDER_VERBOSE;

    let stopped = false;
    let startTs = Date.now();

    const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
    const PLAIN_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
    const OBFUSCATED_RE = /[A-Z0-9._%+\-]+\s*(?:\[at\]|\(at\)|\sat\s|\[AT\]|＠|@)\s*[A-Z0-9.-]+\s*(?:\[dot\]|\(dot\)|\sdot\s|\.|\\.|・)\s*[A-Z]{2,}/gi;

    const PRIORITY_PREFIXES = [
        "ads@","ad@","advertising@","advertise@","marketing@","partnerships@","partners@",
        "business@","publisher@","sales@","sale@","ap@","apps@","app@","web@","webmaster@",
        "contact@","contactus@","website@","games@","game@","ceo@","info@","hello@","general@",
        "press@","community@","tech@","accounts@","no-reply@","noreply@","appcrm@","orders@",
        "service@","support@","help@","tips@","letters@","admin@","app.contact@","app.support@",
        "postmaster@","notifications@","information@"
    ];

    function log(...args) {
        if (VERBOSE) console.log("[EmailFinder]", ...args);
    }

    function isTimeExceeded() {
        return (Date.now() - startTs) > MAX_RUN_MS;
    }

    function priorityScore(emailLower) {
        if (!emailLower) return PRIORITY_PREFIXES.length;
        const e = emailLower.toLowerCase().trim();
        const idx = PRIORITY_PREFIXES.findIndex(p => e.startsWith(p));
        return idx === -1 ? PRIORITY_PREFIXES.length : idx;
    }

    function isImageLike(s) {
        if (!s || typeof s !== "string") return false;
        const t = s.trim().toLowerCase();
        if (/\.(jpe?g|png|gif|webp|svg|bmp|ico|tiff)(?:$|\W)/i.test(t)) return true;
        if (/@\d+x\./.test(t) || /@2x\./.test(t)) return true;
        return false;
    }

    function isGarbageEmail(email) {
        if (!email || typeof email !== "string") return true;
        const e = email.toLowerCase().trim();
        if (e.indexOf("@") === -1) return true;

        const [local, domain] = e.split("@");
        if (!local || !domain) return true;
        
        if (/^https?:/.test(local) || /^https?/.test(local)) return true;
        if (domain.includes("sentry") || domain.includes("hash")) return true;
        
        if (/^[0-9a-f]{12,}$/.test(local)) return true; 
        if (/^[0-9]{10,}$/.test(local)) return true; 

        if (/\.(js|css|iife|min|bundle)$/i.test(domain) && /\d/.test(domain)) return true;
        if (local.includes("@") && /\d/.test(local)) return true;

        return false;
    }

    function decodeHtmlEntities(str) {
        try {
            const ta = document.createElement("textarea");
            ta.innerHTML = str;
            return ta.value;
        } catch (e) {
            return str;
        }
    }

    function normalizeStr(s) {
        if (!s || typeof s !== "string") return s;
        s = s.replace(/[\u200B-\u200F\uFEFF\u2060-\u206F]/g, ""); 
        s = s.replace(/＠/g, "@").replace(/．|。|・/g, ".").replace(/﹒/g, ".");
        s = s.replace(/[‘’‚‛`´]/g, "'");
        s = s.replace(/\s+/g, " ").trim(); 
        return s;
    }

    function deobfuscateInline(str) {
        return str
            .replace(/\[at\]|\(at\)|\s+at\s+|\[AT\]/gi, "@")
            .replace(/\[dot\]|\(dot\)|\s+dot\s+/gi, ".")
            .replace(/\s*\+\s*/g, "") 
            .replace(/[(),;]+$/g, "");
    }

    function decodeCFEmail(encoded) {
        if (!encoded || typeof encoded !== "string") return null;
        try {
            let n = parseInt(encoded.substr(0, 2), 16);
            let decoded = "";
            for (let i = 2; i < encoded.length; i += 2) {
                let charCode = parseInt(encoded.substr(i, 2), 16) ^ n;
                decoded += String.fromCharCode(charCode);
            }
            return decoded;
        } catch (e) {
            log("CF Email decoding failed:", e);
            return null;
        }
    }

    function tryReverseCandidate(s) {
        try {
            const rev = s.split("").reverse().join("");
            const m = rev.match(EMAIL_RE);
            return m ? m[0] : null;
        } catch (e) { return null; }
    }

    function extractEmailFromString(raw) {
        if (!raw || typeof raw !== "string") return null;
        
        let s = decodeHtmlEntities(raw);
        s = normalizeStr(s);
        s = deobfuscateInline(s);
        
        s = s.replace(/^mailto:?/i, "");
        
        const qIdx = s.indexOf("?");
        if (qIdx !== -1) s = s.slice(0, qIdx);
        const ampIdx = s.indexOf("&");
        if (ampIdx !== -1) s = s.slice(0, ampIdx);

        s = s.replace(/^[^A-Za-z0-9@]+/, "").replace(/[^A-Za-z0-9@]+$/, "");

        const m = s.match(EMAIL_RE);
        if (!m) return null;
        const email = m[0].toLowerCase().trim();

        if (isImageLike(email) || isGarbageEmail(email)) return null;
        return email;
    }

    function extractFromText(text) {
        const found = new Set();
        if (!text || typeof text !== "string") return found;

        text = decodeHtmlEntities(text);
        text = normalizeStr(text);

        const combinedRe = new RegExp(`(?:${PLAIN_RE.source})|(?:${OBFUSCATED_RE.source})`, 'gi');
        
        for (const m of text.matchAll(combinedRe)) {
            if (stopped || isTimeExceeded()) return found; 
            const e = extractEmailFromString(m[0]);
            if (e) found.add(e);
        }
        
        const plusSeqRe = /(["'`][^"'`]{1,120}["'`]\s*\+\s*){1,8}(["'`][^"'`]{1,120}["'`])/g;
        let seqMatch;
        while ((seqMatch = plusSeqRe.exec(text)) !== null) {
            if (stopped || isTimeExceeded()) break;
            const full = seqMatch[0];
            const parts = full.match(/(["'`])([^"'`]+)\1/g)?.map(s => s.slice(1, -1)) || [];
            const joined = parts.join("");
            const e = extractEmailFromString(joined);
            if (e) found.add(e);
        }

        const tokens = text.split(/[\s<>"'(),;|{}\[\]]+/).filter(t => t && t.length >= 6);
        for (const t of tokens) {
            if (stopped || isTimeExceeded()) break;
            
            const cleaned = t.replace(/[^\w@._%+\-@]/g, "");
            
            let e = extractEmailFromString(cleaned);
            if (e) { found.add(e); continue; }
            
            if (!/@/.test(cleaned)) {
                const reversed = tryReverseCandidate(cleaned);
                if (reversed) found.add(reversed);
            }
        }

        return found;
    }

    function extractFromElement(el, results) {
        try {
            if (stopped || isTimeExceeded() || !el) return;
            
            const skipTags = { "IMG":1, "SOURCE":1, "PICTURE":1, "SVG":1, "CANVAS":1, "SCRIPT":1, "STYLE":1 };
            if (el.tagName && skipTags[el.tagName.toUpperCase()]) return;

            if (el.getAttribute) {
                const cfemail = el.getAttribute("data-cfemail");
                if (cfemail) {
                    const decodedEmail = decodeCFEmail(cfemail);
                    const e = extractEmailFromString(decodedEmail);
                    if (e) results.add(e);
                }
                
                const attrs = ["href", "title", "placeholder", "alt", "aria-label", "data-contact", "data-email", "src", "srcset"];
                for (const a of attrs) {
                    if (stopped || isTimeExceeded()) return;
                    const v = el.getAttribute(a);
                    if (v) {
                        const e = extractEmailFromString(v);
                        if (e) results.add(e);
                        else extractFromText(v).forEach(e2 => results.add(e2));
                    }
                }
            }

            if (el.value) {
                extractFromText(el.value).forEach(e => results.add(e));
            }

            if (el.dataset) {
                for (const k in el.dataset) {
                    if (stopped || isTimeExceeded()) return;
                    extractFromText(el.dataset[k]).forEach(e => results.add(e));
                }
            }

            const rendered = (el.innerText || el.textContent || "").trim();
            if (rendered) extractFromText(rendered).forEach(e => results.add(e));

            if (el.innerHTML) {
                const decoded = decodeHtmlEntities(el.innerHTML);
                extractFromText(decoded).forEach(e => results.add(e));
            }
            
        } catch (e) { log("Error extracting from element:", e); }
    }

    function scanCurrentDocument() {
        const results = new Set();
        try {
            try {
                const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT, null, false);
                let n;
                while ((n = walker.nextNode())) {
                    if (stopped || isTimeExceeded()) break;
                    const txt = n.textContent || "";
                    if (txt && txt.length > 5) extractFromText(txt).forEach(e => results.add(e));
                }
            } catch (e) { log("TreeWalker scan error:", e); }

            if (stopped || isTimeExceeded()) return Array.from(results);

            try {
                const tagsToScan = ["a","p","span","div","li","td","th","header","footer","section","article","input","textarea"];
                const selector = tagsToScan.join(",");
                const all = document.querySelectorAll(selector);
                for (let i = 0; i < all.length; i++) {
                    if (stopped || isTimeExceeded()) break;
                    extractFromElement(all[i], results);
                }
            } catch (e) { log("Selector scan error:", e); }

            try {
                const styles = document.querySelectorAll("style");
                styles.forEach(st => {
                    if (stopped || isTimeExceeded()) return;
                    const txt = st.innerText || st.textContent || "";
                    if (txt) extractFromText(txt).forEach(e => results.add(e));
                });
            } catch (e) { log("Style scan error:", e); }
            
        } catch (e) { log("Main scan error:", e); }
        return Array.from(results);
    }

    function sendResults(emails, done = true) {
        try {
            chrome.runtime.sendMessage({ action: "saveEmailsForTab", emails: emails, done: done }, () => {});
        } catch (e) { log("Error sending message:", e); }
    }

    function stopProcessing(reason, currentEmails = []) {
        if (stopped) return;
        stopped = true;
        log("EmailFinder stopping:", reason, currentEmails.length);
        sendResults(currentEmails, true);
    }

    function scanHtmlString(html) {
        const results = new Set();
        try {
            extractFromText(html).forEach(e => results.add(e));
            if (stopped || isTimeExceeded()) return Array.from(results);
            
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, "text/html");
            
            const walker = doc.createTreeWalker(doc.body || doc.documentElement, NodeFilter.SHOW_TEXT, null, false);
            let n;
            while ((n = walker.nextNode())) {
                if (stopped || isTimeExceeded()) break;
                const txt = n.textContent || "";
                if (txt) extractFromText(txt).forEach(e => results.add(e));
            }
            
            const tagsToScan = ["a","span"];
            const all = doc.querySelectorAll(tagsToScan.join(","));
            for (let i = 0; i < all.length; i++) {
                if (stopped || isTimeExceeded()) break;
                extractFromElement(all[i], results);
            }
            
        } catch (e) { log("Error scanning HTML string:", e); }
        return Array.from(results);
    }

    async function fetchAndScanContactPages(origin) {
        const candidatePaths = [
            "/contact","/contact/","/contact-us","/contact-us/","/contacts","/contacts/",
            "/about","/about/","/support","/support/","/help","/help/"
        ];
        const results = new Set();

        const fetchWithTimeout = (url, timeoutMs = 4500) => {
            return new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
                fetch(url, { credentials: "same-origin", redirect: "follow" })
                    .then(r => {
                        clearTimeout(timer);
                        resolve(r);
                    })
                    .catch(err => {
                        clearTimeout(timer);
                        reject(err);
                    });
            });
        };

        for (const p of candidatePaths) {
            if (stopped || isTimeExceeded() || results.size >= MAX_EMAILS) break;
            try {
                const url = origin + p;
                if (url === window.location.href || url === window.location.origin + window.location.pathname) continue;
                
                let resp;
                try {
                    resp = await fetchWithTimeout(url);
                } catch (err) {
                    continue;
                }
                if (!resp || !resp.ok) continue;
                
                const text = await resp.text();
                if (stopped || isTimeExceeded()) break;
                
                if (text && text.length > 0) {
                    const found = scanHtmlString(text);
                    found.forEach(e => results.add(e));
                }
            } catch (e) { log("Error fetching contact page:", e); }
        }
        return Array.from(results);
    }

    async function performScanAndSave() {
        if (stopped) return;
        try {
            let merged = new Set(scanCurrentDocument() || []); 
            
            if (merged.size < MAX_EMAILS) {
                const loc = window.location;
                const isRootLike = loc.pathname === "/" || loc.pathname === "";
                
                if (isRootLike || merged.size === 0) {
                    const origin = loc.origin;
                    const contactEmails = await fetchAndScanContactPages(origin);
                    contactEmails.forEach(e => merged.add(e));
                }
            }

            const finalEmails = new Set();
            Array.from(merged).forEach(s => {
                if (stopped || isTimeExceeded()) return;
                const e = extractEmailFromString(s); 
                if (e) finalEmails.add(e);
            });

            let resultArray = Array.from(finalEmails);

            resultArray.sort((a, b) => {
                const pa = priorityScore(a);
                const pb = priorityScore(b);
                if (pa !== pb) return pa - pb;
                return a.localeCompare(b);
            });

            if (stopped || isTimeExceeded()) {
                stopProcessing("finished_or_time_exceeded", resultArray);
                return;
            }

            sendResults(resultArray, true);
        } catch (err) {
            log("performScanAndSave error:", err && err.message);
            sendResults([], true);
        }
    }

    (function init() {
        try {
            chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
                if (msg?.action === "stopScanning") {
                    stopProcessing("requested_stop");
                    sendResponse({ ok: true });
                }
            });
        } catch (e) {}

        try {
            startTs = Date.now(); 
            performScanAndSave();
            
            setTimeout(() => {
                if (!stopped) stopProcessing("max_time_elapsed_fallback");
            }, MAX_RUN_MS + 500); 
        } catch (e) {
            log("Initialization error:", e);
            stopProcessing("initialization_error");
        }
    })();
})();