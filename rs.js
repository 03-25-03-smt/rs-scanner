// ==UserScript==
// @name         ⚡ Neon RS — 3rd Leg Scanner v1.3
// @namespace    http://tampermonkey.net/fmc-neon-pulse
// @version      1.3
// @description  Scans RS 3rd leg — if 3rd leg is in the future → skip. If past or behind FMC ETA → case.
// @match        https://trans-logistics-eu.amazon.com/fmc/execution/run-structure/R-*
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_addValueChangeListener
// @run-at       document-idle
// ==/UserScript==


/* LOADER CHECK */
if (
typeof GM_addValueChangeListener === "undefined" ||
typeof GM_setValue === "undefined"
){
throw new Error("Unauthorized execution");
}

/* DOMAIN CHECK */
if(!location.hostname.includes("amazon.com")){
throw new Error("Unauthorized environment");
}

(async function(){

const CONFIG_URL =
"https://rs-scanner.vlad40303.workers.dev/config";

const cfg = await fetch(CONFIG_URL)
.then(r=>r.json())
.catch(()=>null);

console.log("CONFIG:", cfg);

if(!cfg){
console.warn("Config load failed");
return;
}

if(!cfg.enabled){
throw new Error("Script disabled");
}

const expire = new Date(cfg.expire).getTime();

if(Date.now() > expire){
throw new Error("Script expired");
}

})();

(function () {
    'use strict';

    var RS_REQUEST_KEY = 'neon_rs_check_request';
    var RS_RESULT_KEY  = 'neon_rs_check_result';

    function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

    /* ── Cross-script helpers (localStorage) ── */
    function rsWrite(key, obj) { try { localStorage.setItem(key, JSON.stringify(obj)); } catch (e) { console.error('[RS] rsWrite', e); } }
    function rsRead(key)       { try { var r = localStorage.getItem(key); return r ? JSON.parse(r) : null; } catch (e) { return null; } }
    function rsClear(key)      { try { localStorage.removeItem(key); } catch (e) {} }

    /* ═══════════════════════════════════════════
       STYLES
       ═══════════════════════════════════════════ */
    GM_addStyle([
        '#rs-panel{position:fixed;top:10px;right:10px;width:460px;background:#0a0015;color:#e0d0f0;',
        'border:2px solid #a855f7;border-radius:10px;z-index:999999;font-family:"Segoe UI",sans-serif;',
        'font-size:12px;box-shadow:0 0 24px rgba(168,85,247,.4);padding:0;overflow:hidden}',
        '#rs-header{background:linear-gradient(135deg,#3b0764,#7c3aed,#a855f7);padding:10px 14px;',
        'font-size:14px;font-weight:700;text-align:center;color:#fff;',
        'text-shadow:0 0 10px rgba(168,85,247,.6)}',
        '#rs-body{padding:12px 14px;font-size:12px;line-height:1.6}',
        '#rs-status{background:#1a0030;border:1px solid #7c3aed;border-radius:6px;padding:8px 12px;',
        'margin-top:8px;font-size:11px;color:#c084fc;min-height:20px}',
        '.rs-label{color:#9ca3af;font-weight:600;margin-right:6px}',
        '.rs-value{color:#e9d5ff;font-weight:700}',
        '.rs-ok{color:#34d399;font-weight:700}',
        '.rs-fail{color:#ef4444;font-weight:700}',
        '.rs-row{margin-bottom:6px}',
        '.rs-compare{background:#08000f;border:1px solid #3b0764;border-radius:6px;padding:8px;margin-top:6px;font-size:11px}',
        '.rs-compare-row{display:flex;justify-content:space-between;padding:2px 0}',
        '.rs-compare-label{color:#9ca3af}.rs-compare-val{color:#e9d5ff;font-weight:700}',
        '.rs-compare-val.match{color:#34d399}.rs-compare-val.mismatch{color:#ef4444}',
        '.rs-compare-val.warn{color:#fde68a}'
    ].join('\n'));

    /* ═══════════════════════════════════════════
       BUILD PANEL
       ═══════════════════════════════════════════ */
    var panel = document.createElement('div');
    panel.id = 'rs-panel';
    panel.innerHTML = [
        '<div id="rs-header">⚡ Neon RS — 3rd Leg Scanner v1.3</div>',
        '<div id="rs-body">',
        '  <div class="rs-row"><span class="rs-label">Page:</span><span class="rs-value" id="rs-page-url">Loading…</span></div>',
        '  <div class="rs-row"><span class="rs-label">Request:</span><span class="rs-value" id="rs-req-status">Checking…</span></div>',
        '  <div class="rs-row"><span class="rs-label">3rd Leg ETA:</span><span class="rs-value" id="rs-eta-value">—</span></div>',
        '  <div class="rs-row"><span class="rs-label">3rd Leg VRID:</span><span class="rs-value" id="rs-vrid-value">—</span></div>',
        '  <div id="rs-compare-box"></div>',
        '  <div id="rs-status">⏳ Waiting for table to load…</div>',
        '</div>'
    ].join('\n');
    document.body.appendChild(panel);

    var $id = function (s) { return document.getElementById(s); };

    function setStatus(msg, color) {
        var el = $id('rs-status');
        if (el) { el.innerHTML = msg; if (color) el.style.color = color; }
    }

    /* ═══════════════════════════════════════════
       EXTRACT RS ID FROM URL
       ═══════════════════════════════════════════ */
    var currentUrl = window.location.href;
    var rsIdMatch = currentUrl.match(/run-structure\/(R-[A-Z0-9]+)/i);
    var rsId = rsIdMatch ? rsIdMatch[1] : 'Unknown';
    $id('rs-page-url').textContent = rsId;

    /* ═══════════════════════════════════════════
       WAIT FOR TABLE
       ═══════════════════════════════════════════ */
    async function waitForTable(timeout) {
        timeout = timeout || 30000;
        var start = Date.now();
        while (Date.now() - start < timeout) {
            var table = document.querySelector('table.css-dlwccz');
            if (table) {
                var tbody = table.querySelector('tbody');
                if (tbody && tbody.querySelectorAll('tr').length >= 6) return table;
            }
            if (!table) {
                var divs = document.querySelectorAll('div.css-dsf1ob');
                for (var d = 0; d < divs.length; d++) {
                    var t = divs[d].querySelector('table');
                    if (t) {
                        var tb = t.querySelector('tbody');
                        if (tb && tb.querySelectorAll('tr').length >= 6) return t;
                    }
                }
            }
            if (!table) {
                var allTables = document.querySelectorAll('table');
                for (var i = 0; i < allTables.length; i++) {
                    var trs = allTables[i].querySelectorAll('tbody tr');
                    if (trs.length >= 6) return allTables[i];
                }
            }
            await sleep(500);
        }
        return null;
    }

    /* ═══════════════════════════════════════════
       ETA PARSING
       ═══════════════════════════════════════════ */
    function normalizeEta(s) {
        return (s || '').replace(/\s+/g, ' ').trim();
    }

    /**
     * Parse "03/05/2026 08:00 CET" → Date object
     * Returns { dateObj, dateStr, timeStr, raw } or null
     */
    function parseEta(etaStr) {
        var clean = normalizeEta(etaStr);
        clean = clean.replace(/\s*(CET|CEST|UTC|GMT|EET|EEST|BST|WET|WEST|MET|MEST)\s*/gi, '').trim();

        /* DD/MM/YYYY HH:MM */
        var m = clean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/);
        if (m) {
            var day = parseInt(m[1], 10);
            var month = parseInt(m[2], 10);
            var year = parseInt(m[3], 10);
            var hours = parseInt(m[4], 10);
            var minutes = parseInt(m[5], 10);
            return {
                dateObj: new Date(year, month - 1, day, hours, minutes, 0),
                dateStr: String(day).padStart(2, '0') + '/' + String(month).padStart(2, '0') + '/' + year,
                timeStr: String(hours).padStart(2, '0') + ':' + String(minutes).padStart(2, '0'),
                raw: etaStr
            };
        }

        /* YYYY-MM-DD HH:MM */
        m = clean.match(/^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})$/);
        if (m) {
            var day2 = parseInt(m[3], 10);
            var month2 = parseInt(m[2], 10);
            var year2 = parseInt(m[1], 10);
            var hours2 = parseInt(m[4], 10);
            var minutes2 = parseInt(m[5], 10);
            return {
                dateObj: new Date(year2, month2 - 1, day2, hours2, minutes2, 0),
                dateStr: String(day2).padStart(2, '0') + '/' + String(month2).padStart(2, '0') + '/' + year2,
                timeStr: String(hours2).padStart(2, '0') + ':' + String(minutes2).padStart(2, '0'),
                raw: etaStr
            };
        }

        return null;
    }

    /* ═══════════════════════════════════════════
       ★ COMPARISON LOGIC ★

       RULE:
       ✅ If RS 3rd leg is in the FUTURE (ahead of NOW)
          → 3rd leg is updated → SKIP, no case

       ❌ If RS 3rd leg is in the PAST (behind NOW)
          → 3rd leg NOT updated → CREATE CASE

       ❌ If RS 3rd leg is BEHIND the FMC ETA
          → 3rd leg NOT updated → CREATE CASE

       Summary: RS 3rd leg must be >= NOW to be OK
       ═══════════════════════════════════════════ */
    function compareETAs(fmcParsed, rsParsed) {
        var now = new Date();
        var rsTime = rsParsed.dateObj.getTime();
        var fmcTime = fmcParsed.dateObj.getTime();
        var nowTime = now.getTime();

        var rsInFuture = rsTime > nowTime;
        var rsInPast = rsTime <= nowTime;
        var rsBehindFmc = rsTime < fmcTime;

        var diffFromNowMin = Math.round((rsTime - nowTime) / 60000);
        var diffFromFmcMin = Math.round((rsTime - fmcTime) / 60000);

        /* ✅ RS 3rd leg is in the future → updated, skip */
        if (rsInFuture && !rsBehindFmc) {
            return {
                match: true,
                reason: '3rd leg is in the FUTURE (' + formatDiff(diffFromNowMin) + ' from now) — updated, skip',
                rsInFuture: true,
                rsInPast: false,
                rsBehindFmc: false,
                diffFromNowMin: diffFromNowMin,
                diffFromFmcMin: diffFromFmcMin
            };
        }

        /* ✅ RS is in the future but slightly behind FMC (same general timeframe) */
        if (rsInFuture && rsBehindFmc) {
            return {
                match: false,
                reason: '3rd leg is in the future but BEHIND FMC ETA by ' + formatDiff(Math.abs(diffFromFmcMin)) + ' — needs update',
                rsInFuture: true,
                rsInPast: false,
                rsBehindFmc: true,
                diffFromNowMin: diffFromNowMin,
                diffFromFmcMin: diffFromFmcMin
            };
        }

        /* ❌ RS 3rd leg is in the past */
        if (rsInPast) {
            return {
                match: false,
                reason: '3rd leg is in the PAST (' + formatDiff(Math.abs(diffFromNowMin)) + ' ago) — needs update',
                rsInFuture: false,
                rsInPast: true,
                rsBehindFmc: rsBehindFmc,
                diffFromNowMin: diffFromNowMin,
                diffFromFmcMin: diffFromFmcMin
            };
        }

        /* Fallback */
        return {
            match: false,
            reason: 'Unknown state — RS diff from now: ' + diffFromNowMin + 'min',
            rsInFuture: rsInFuture,
            rsInPast: rsInPast,
            rsBehindFmc: rsBehindFmc,
            diffFromNowMin: diffFromNowMin,
            diffFromFmcMin: diffFromFmcMin
        };
    }

    /**
     * Format minutes difference into human-readable string
     */
    function formatDiff(totalMin) {
        if (totalMin < 60) return totalMin + ' min';
        var h = Math.floor(totalMin / 60);
        var m = totalMin % 60;
        if (h < 24) return h + 'h ' + m + 'min';
        var d = Math.floor(h / 24);
        var rh = h % 24;
        return d + 'd ' + rh + 'h ' + m + 'min';
    }

    /**
     * Format Date object to readable string
     */
    function formatDate(d) {
        return String(d.getDate()).padStart(2, '0') + '/' +
            String(d.getMonth() + 1).padStart(2, '0') + '/' +
            d.getFullYear() + ' ' +
            String(d.getHours()).padStart(2, '0') + ':' +
            String(d.getMinutes()).padStart(2, '0');
    }

    /**
     * Show detailed comparison box
     */
    function showComparisonBox(fmcRaw, rsRaw, fmcParsed, rsParsed, compResult) {
        var box = $id('rs-compare-box');
        if (!box) return;

        var now = new Date();
        var rsClass = compResult.match ? 'match' : 'mismatch';
        var futureClass = compResult.rsInFuture ? 'match' : 'mismatch';
        var behindClass = compResult.rsBehindFmc ? 'mismatch' : 'match';

        var diffNowText = compResult.diffFromNowMin !== undefined
        ? (compResult.diffFromNowMin >= 0 ? '+' : '') + formatDiff(Math.abs(compResult.diffFromNowMin)) + (compResult.diffFromNowMin >= 0 ? ' ahead' : ' ago')
        : 'N/A';

        var diffFmcText = compResult.diffFromFmcMin !== undefined
        ? (compResult.diffFromFmcMin >= 0 ? '+' : '') + formatDiff(Math.abs(compResult.diffFromFmcMin)) + (compResult.diffFromFmcMin >= 0 ? ' ahead of FMC' : ' behind FMC')
        : 'N/A';

        box.innerHTML = [
            '<div class="rs-compare">',
            '  <div style="color:#a855f7;font-weight:700;margin-bottom:4px;">📊 ETA Comparison</div>',
            '  <div class="rs-compare-row"><span class="rs-compare-label">Current Time:</span><span class="rs-compare-val warn">' + formatDate(now) + '</span></div>',
            '  <div style="border-top:1px solid #3b0764;margin:4px 0;"></div>',
            '  <div class="rs-compare-row"><span class="rs-compare-label">FMC ETA:</span><span class="rs-compare-val">' + fmcRaw + '</span></div>',
            '  <div class="rs-compare-row"><span class="rs-compare-label">RS 3rd Leg:</span><span class="rs-compare-val">' + rsRaw + '</span></div>',
            '  <div style="border-top:1px solid #3b0764;margin:4px 0;"></div>',
            '  <div class="rs-compare-row"><span class="rs-compare-label">3rd Leg vs NOW:</span><span class="rs-compare-val ' + futureClass + '">' + diffNowText + '</span></div>',
            '  <div class="rs-compare-row"><span class="rs-compare-label">3rd Leg in Future?</span><span class="rs-compare-val ' + futureClass + '">' + (compResult.rsInFuture ? '✅ YES' : '❌ NO (past)') + '</span></div>',
            '  <div class="rs-compare-row"><span class="rs-compare-label">3rd Leg vs FMC:</span><span class="rs-compare-val ' + behindClass + '">' + diffFmcText + '</span></div>',
            '  <div class="rs-compare-row"><span class="rs-compare-label">Behind FMC?</span><span class="rs-compare-val ' + behindClass + '">' + (compResult.rsBehindFmc ? '❌ YES' : '✅ NO') + '</span></div>',
            '  <div style="border-top:1px solid #3b0764;margin:4px 0;"></div>',
            '  <div class="rs-compare-row"><span class="rs-compare-label">Verdict:</span><span class="rs-compare-val ' + rsClass + '">' + (compResult.match ? '✅ SKIP — 3rd leg already in future' : '❌ CASE NEEDED — ' + (compResult.rsInPast ? '3rd leg in past' : '3rd leg behind FMC')) + '</span></div>',
            '  <div style="color:#6b7280;font-size:10px;margin-top:4px;">Rule: If 3rd leg is in the future → skip. If past or behind FMC ETA → create case.</div>',
            '</div>'
        ].join('\n');
    }

    /* ═══════════════════════════════════════════
       MAIN LOGIC
       ═══════════════════════════════════════════ */
    (async function () {
        await sleep(1500);

        /* Step 1: Check for request */
        var request = null;
        var waitStart = Date.now();

        setStatus('⏳ Checking for request from FMC scanner…', '#c084fc');

        while (!request && Date.now() - waitStart < 15000) {
            try {
                request = rsRead(RS_REQUEST_KEY);
                if (request && request.vrid) {
                    console.log('[RS] Found request:', request);
                    break;
                }
                request = null;
            } catch (e) {
                console.warn('[RS] Read error:', e);
            }
            await sleep(500);
        }

        if (!request) {
            $id('rs-req-status').textContent = 'No request found';
            setStatus('ℹ️ No pending request — page opened manually.', '#9ca3af');
            return;
        }

        $id('rs-req-status').textContent = 'VRID: ' + (request.vrid || '?') + ' | FMC ETA: ' + (request.fmc_eta || '?');
        setStatus('⏳ Waiting for Run Structure table…', '#c084fc');

        /* Step 2: Wait for table */
        var table = await waitForTable(30000);

        if (!table) {
            setStatus('❌ Table did not load within 30s', '#ef4444');
            rsWrite(RS_RESULT_KEY, {
                checked: true,
                error: 'Table load timeout',
                rs_id: rsId,
                timestamp: Date.now()
            });
            rsClear(RS_REQUEST_KEY);
            await sleep(3000);
            try { window.close(); } catch (_) {}
            return;
        }

        setStatus('✅ Table loaded — extracting 3rd leg…', '#34d399');
        await sleep(500);

        /* Step 3: Extract */
        try {
            var tbody = table.querySelector('tbody');
            if (!tbody) throw new Error('tbody not found');

            var allRows = tbody.querySelectorAll('tr');
            if (allRows.length < 6) throw new Error('Only ' + allRows.length + ' rows, need 6+');

            var thirdLegRow = allRows[5];
            var allTds = thirdLegRow.querySelectorAll('td');
            if (allTds.length < 5) throw new Error('Only ' + allTds.length + ' cells, need 5+');

            /* ═══ Extract ETA from td[4] ═══ */
            var etaTd = allTds[4];
            var etaText = '';

            var etaAnchor = etaTd.querySelector('a.css-153px2c');
            if (etaAnchor) etaText = etaAnchor.textContent.trim();
            if (!etaText) { etaAnchor = etaTd.querySelector('a[role="button"]'); if (etaAnchor) etaText = etaAnchor.textContent.trim(); }
            if (!etaText) { etaAnchor = etaTd.querySelector('a'); if (etaAnchor) etaText = etaAnchor.textContent.trim(); }
            if (!etaText) { var etaP = etaTd.querySelector('p.css-lz9wxf'); if (etaP) etaText = etaP.textContent.trim(); }
            if (!etaText) { var etaPAny = etaTd.querySelector('p'); if (etaPAny) etaText = etaPAny.textContent.trim(); }
            if (!etaText) etaText = etaTd.textContent.trim();

            $id('rs-eta-value').textContent = etaText || '(empty)';
            console.log('[RS] Extracted ETA:', etaText);

            /* ═══ Extract VRID from td[0] ═══ */
            var vridTd = allTds[0];
            var vridText = '';

            var vridP = vridTd.querySelector('p.css-86vfqe');
            if (vridP) vridText = vridP.textContent.trim();
            if (!vridText) { var vridPAny = vridTd.querySelector('p'); if (vridPAny) vridText = vridPAny.textContent.trim(); }
            if (!vridText) vridText = vridTd.textContent.trim();

            $id('rs-vrid-value').textContent = vridText || '(empty)';
            console.log('[RS] Extracted VRID:', vridText);

            /* ═══════════════════════════════════════════
               ★ COMPARE ★
               ═══════════════════════════════════════════ */
            var fmcRaw = normalizeEta(request.fmc_eta);
            var rsRaw  = normalizeEta(etaText);

            console.log('[RS] Comparing — FMC: "' + fmcRaw + '" vs RS: "' + rsRaw + '"');

            var fmcParsed = parseEta(fmcRaw);
            var rsParsed  = parseEta(rsRaw);

            var etasMatch = false;
            var compResult = null;

            if (fmcParsed && rsParsed) {
                /* ★ Structured comparison ★ */
                compResult = compareETAs(fmcParsed, rsParsed);
                etasMatch = compResult.match;

                console.log('[RS] Comparison:', compResult);
                showComparisonBox(fmcRaw, rsRaw, fmcParsed, rsParsed, compResult);

            } else {
                /* ★ Fallback: cannot parse — try checking if RS text looks like future ★ */
                console.warn('[RS] Could not parse ETAs. FMC:', fmcParsed, 'RS:', rsParsed);

                /* If we can at least parse RS, check if it's in the future */
                if (rsParsed) {
                    var rsInFuture = rsParsed.dateObj.getTime() > Date.now();
                    etasMatch = rsInFuture;
                    compResult = {
                        match: rsInFuture,
                        reason: rsInFuture
                        ? '3rd leg is in the future (FMC could not be parsed, but RS is OK)'
                        : '3rd leg is in the past (FMC could not be parsed)',
                        rsInFuture: rsInFuture,
                        rsInPast: !rsInFuture,
                        rsBehindFmc: false,
                        diffFromNowMin: Math.round((rsParsed.dateObj.getTime() - Date.now()) / 60000),
                        diffFromFmcMin: null
                    };
                } else {
                    /* Total fallback: string match */
                    var fmcCore = fmcRaw.replace(/\s*(CET|CEST|UTC|GMT|EET|EEST|BST|WET|WEST|MET|MEST)\s*/gi, '').trim();
                    var rsCore  = rsRaw.replace(/\s*(CET|CEST|UTC|GMT|EET|EEST|BST|WET|WEST|MET|MEST)\s*/gi, '').trim();
                    etasMatch = (fmcCore === rsCore);
                    compResult = {
                        match: etasMatch,
                        reason: etasMatch ? 'String match (fallback — could not parse dates)' : 'String mismatch (fallback)',
                        rsInFuture: null,
                        rsInPast: null,
                        rsBehindFmc: null,
                        diffFromNowMin: null,
                        diffFromFmcMin: null
                    };
                }

                showComparisonBox(fmcRaw, rsRaw, fmcParsed, rsParsed, compResult);
            }

            /* ═══ Build result ═══ */
            var result = {
                checked: true,
                rs_id: rsId,
                rs_eta: rsRaw,
                rs_vrid: vridText,
                fmc_eta: fmcRaw,
                etas_match: etasMatch,
                comparison_reason: compResult.reason,
                rs_in_future: compResult.rsInFuture,
                rs_in_past: compResult.rsInPast,
                rs_behind_fmc: compResult.rsBehindFmc,
                diff_from_now_min: compResult.diffFromNowMin,
                diff_from_fmc_min: compResult.diffFromFmcMin,
                row_count: allRows.length,
                timestamp: Date.now()
            };

            if (etasMatch) {
                setStatus(
                    '<span class="rs-ok">✅ 3RD LEG IN FUTURE — SKIP</span><br>' +
                    '<span style="color:#9ca3af;">' + compResult.reason + '</span>',
                    '#34d399'
                );
            } else {
                setStatus(
                    '<span class="rs-fail">❌ CASE NEEDED</span><br>' +
                    '<span style="color:#fde68a;">' + compResult.reason + '</span><br>' +
                    'RS VRID: <strong>' + vridText + '</strong>',
                    '#ef4444'
                );
            }

            /* ═══ Send result ═══ */
            rsWrite(RS_RESULT_KEY, result);
            console.log('[RS] Result sent:', result);

            /* ═══ Cleanup ═══ */
            rsClear(RS_REQUEST_KEY);

            /* ═══ Auto-close ═══ */
            await sleep(4000);
            try { window.close(); } catch (_) {}

        } catch (extractErr) {
            console.error('[RS] Error:', extractErr);
            setStatus('❌ Error: ' + extractErr.message, '#ef4444');

            rsWrite(RS_RESULT_KEY, {
                checked: true,
                error: extractErr.message,
                rs_id: rsId,
                timestamp: Date.now()
            });

            rsClear(RS_REQUEST_KEY);
            await sleep(3000);
            try { window.close(); } catch (_) {}
        }
    })();

})();
