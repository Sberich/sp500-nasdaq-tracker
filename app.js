// --- Safe Storage ---
function safeGet(key, defaultVal) {
    try { return localStorage.getItem(key) || defaultVal; } 
    catch(e) { return defaultVal; }
}
function safeSet(key, val) {
    try { localStorage.setItem(key, val); } 
    catch(e) { }
}

// --- XSS Protection ---
function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// --- Constants & State ---
let API_URL = safeGet('SP_API_URL', '') || 'https://script.google.com/macros/s/AKfycbzKXQWPFCWqNG0MkZlvl4x4uhxYy9F2ppjXGfb523Ek3cgAhiYOpvNzDXlfvZYaP9IF/exec';
let allStocks = [];
let favorites = JSON.parse(safeGet('SP_FAVS', '[]') || '[]');
let watchlist = JSON.parse(safeGet('SP_WATCH', '[]') || '[]');
let currentSymbol = '';
let globalWatchLines = {}; // Store all cross-device watch lines
let currentRange = '1D';
let currentSector = 'ทั้งหมด';
let currentIndex = 'all';
let priceChart = null;
let latestChartArgs = null;
let currentLevelsData = null;
window.currentLevelsData = null;
let currentChartMode = 'alphazone';
let isTradingViewScriptLoaded = false;
let currentTradingViewSymbol = '';
let currentScreener = null;
let currentCapFilter = 'ALL';
let currentTrendFilter = 'ALL';
let currentVolFilter = 'ALL';

// --- DOM Elements ---
const elStockList = document.getElementById('stock-list');
const elSearchInput = document.getElementById('search-input');
const elStatsBar = document.getElementById('stats-bar');
const elDetailPanel = document.getElementById('detail-panel');
const elEmptyState = document.getElementById('empty-state');
const elDetailContent = document.getElementById('detail-content');

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initWorkspaceControls();
    setupEventListeners();
    
    if (!API_URL) {
        showConfigModal();
    } else {
        fetchStocks();
    }
});

// --- Theme Management ---
function initTheme() {
    const savedTheme = safeGet('SP_THEME', 'dark') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    
    document.getElementById('theme-toggle').addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        safeSet('SP_THEME', next);
        if (priceChart && latestChartArgs) {
            renderChart(latestChartArgs.points, latestChartArgs.emaData, latestChartArgs.livePrice);
        }
    });
}

// --- Configuration Modal ---
function showConfigModal() {
    const modal = document.getElementById('config-modal');
    modal.classList.add('active');
    
    document.getElementById('btn-save-api').addEventListener('click', () => {
        const url = document.getElementById('api-url-input').value.trim();
        if (url) {
            API_URL = url;
            safeSet('SP_API_URL', url);
            modal.classList.remove('active');
            fetchStocks();
        }
    });
}

// --- Event Listeners ---
let currentMover = null; // 'day_gainers' | 'day_losers' | 'most_actives' | null
let moverCache = {};

function setupEventListeners() {
    // Refresh Button
    let isRefreshing = false;
    document.getElementById('refresh-btn').addEventListener('click', async () => {
        if (isRefreshing) return;
        isRefreshing = true;
        
        const icon = document.querySelector('#refresh-btn i');
        icon.classList.add('rotating');
        
        try {
            await fetchStocks();
            if (currentSymbol) {
                await Promise.all([
                    loadLiveLevels(),
                    loadChartData()
                ]);
            }
        } finally {
            icon.classList.remove('rotating');
            isRefreshing = false;
        }
    });

    // Search (debounced)
    let _searchTimer = null;
    elSearchInput.addEventListener('input', () => {
        if (currentMover) return; // disable search in mover mode
        clearTimeout(_searchTimer);
        _searchTimer = setTimeout(() => renderList(), 200);
    });
    
    // Index Tabs (ทั้งหมด, S&P500, NASDAQ, NYSE, โปรด)
    document.querySelectorAll('.filter-tabs:not(.mover-tabs) .tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            // Deactivate mover tabs
            currentMover = null;
            document.querySelectorAll('.mover-btn').forEach(b => b.classList.remove('active'));
            
            // Activate index tab
            document.querySelectorAll('.filter-tabs:not(.mover-tabs) .tab-btn').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            currentIndex = e.currentTarget.dataset.idx;
            currentSector = 'ทั้งหมด';
            buildSectorTabs();
            renderList();
        });
    });

    // Market Mover Tabs (Gainers, Losers, Active)
    document.querySelectorAll('.mover-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const moverId = e.currentTarget.dataset.mover;
            
            // If clicking same active mover, deactivate and go back to normal
            if (currentMover === moverId) {
                currentMover = null;
                e.currentTarget.classList.remove('active');
                renderList();
                return;
            }
            
            // Deactivate index tabs
            document.querySelectorAll('.filter-tabs:not(.mover-tabs) .tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.mover-btn').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            
            currentMover = moverId;
            fetchMarketMovers(moverId);
        });
    });
    
    // Range Tabs
    document.querySelectorAll('.range-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (!currentSymbol) return;
            document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentRange = e.target.dataset.range;
            loadChartData();
        });
    });
    
    // Mobile Back Button
    document.getElementById('btn-back').addEventListener('click', () => {
        elDetailPanel.classList.remove('active');
        document.querySelectorAll('.stock-card').forEach(c => c.classList.remove('active'));
        const tvTarget = document.getElementById('tradingview_widget_target');
        if (tvTarget) tvTarget.innerHTML = '';
        currentTradingViewSymbol = '';
    });

    // Reset Zoom
    document.getElementById('btn-reset-zoom').addEventListener('click', () => {
        if(priceChart) priceChart.resetZoom();
    });

    // Sector Custom Dropdown
    const sectorDropdown = document.getElementById('sector-dropdown');
    const sectorToggle = document.getElementById('sector-toggle');
    const sectorMenu = document.getElementById('sector-menu');
    const sectorLabel = document.getElementById('sector-label');

    if (sectorToggle) {
        sectorToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            sectorDropdown.classList.toggle('open');
        });
    }

    document.addEventListener('click', (e) => {
        if (sectorDropdown && !sectorDropdown.contains(e.target)) {
            sectorDropdown.classList.remove('open');
        }
    });
    
    // Favorite Button in Detail
    document.getElementById('d-fav-btn').addEventListener('click', () => {
        if (!currentSymbol) return;
        toggleFavorite(currentSymbol);
        
        // Update button UI
        const isFav = favorites.includes(currentSymbol);
        const btn = document.getElementById('d-fav-btn');
        btn.classList.toggle('is-fav', isFav);
        btn.innerHTML = isFav ? '<i class="ri-star-fill"></i>' : '<i class="ri-star-line"></i>';
        
        if (!currentMover) renderList();
    });

    // Watch Button in Detail
    document.getElementById('d-watch-btn').addEventListener('click', () => {
        if (!currentSymbol) return;
        toggleWatchlist(currentSymbol);
        
        // Update button UI
        const isWatch = watchlist.includes(currentSymbol);
        const btn = document.getElementById('d-watch-btn');
        btn.classList.toggle('is-watch', isWatch);
        btn.innerHTML = isWatch ? '<i class="ri-eye-fill"></i>' : '<i class="ri-eye-line"></i>';
        
        if (!currentMover) renderList();
    });
}

// --- Data Fetching ---
async function fetchWithRetry(url, options = {}, retries = 2) {
    for (let i = 0; i <= retries; i++) {
        try {
            const res = await fetch(url, options);
            if (res.ok) return res;
            if (i === retries) throw new Error('API Error: ' + res.status);
        } catch (err) {
            if (i === retries || (err.name === 'AbortError')) throw err;
            await new Promise(resolve => setTimeout(resolve, 1500 * (i + 1))); // delay before retry
        }
    }
}

async function fetchStocks() {
    try {
        const res = await fetchWithRetry(`${API_URL}?action=getStockList`);
        const data = await res.json();
        
        if (data.success) {
            allStocks = data.data || [];
            if (data.favs) {
                favorites = data.favs;
                safeSet('SP_FAVS', JSON.stringify(favorites));
            }
            if (data.watch) {
                watchlist = data.watch;
                safeSet('SP_WATCH', JSON.stringify(watchlist));
            }
            // Load cross-device watch lines from backend
            if (data.watchLines) {
                try { globalWatchLines = JSON.parse(data.watchLines); } catch(e) { globalWatchLines = {}; }
            } else {
                try { globalWatchLines = JSON.parse(safeGet('SP_WATCH_LINES', '{}') || '{}'); } catch(e) { globalWatchLines = {}; }
            }

            buildSectorTabs();
            renderList();
            
            // Asynchronously fetch Pre/Post Market prices and Market Cap to not block UI
            // fetchAsyncQuotes(); // Disabled on init to prevent blocking chart loads (handled by polling loop)
        } else {
            showErrorList(data.error || 'Failed to load data');
        }
    } catch (err) {
        showErrorList('Network Error. Please check API URL. ' + err.message);
        if(!API_URL) showConfigModal();
    }
}

let isFetchingQuotes = false;
async function fetchAsyncQuotes() {
    if (isFetchingQuotes) return;
    isFetchingQuotes = true;
    try {
        const symbols = allStocks.map(s => s.symbol).filter(s => !s.includes('.BK') && !s.startsWith('GPF'));
        if (symbols.length === 0) return;

        const chunkSize = 50;
        const chunks = [];
        for (let i = 0; i < symbols.length; i += chunkSize) chunks.push(symbols.slice(i, i + chunkSize));

        const CONCURRENCY = 3;
        let extMap = {};
        for (let i = 0; i < chunks.length; i += CONCURRENCY) {
            const batch = chunks.slice(i, i + CONCURRENCY);
            const results = await Promise.all(batch.map(async (chunk) => {
                try {
                    const fetchOpts = {};
                    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
                        fetchOpts.signal = AbortSignal.timeout(15000);
                    }
                    const res = await fetchWithRetry(API_URL + '?action=getBulkQuotes&symbols=' + chunk.map(encodeURIComponent).join(','), fetchOpts);
                    return await res.json();
                } catch (e) { console.error('Chunk fetch failed:', e); return null; }
            }));
            results.forEach(r => { if (r && r.success && r.data) Object.assign(extMap, r.data); });
        }

        let updated = false;
        for (const s of allStocks) {
            if (extMap[s.symbol]) {
                const q = extMap[s.symbol];
                if (q.price) s.price = q.price;
                if (q.marketCap) s.marketCap = q.marketCap;
                if (q.volume) s.volume = q.volume;
                if (q.avgVolume) s.avgVolume = q.avgVolume;
                if (q.regChangePct != null) s.regChangePct = q.regChangePct;
                if (q.dayHigh != null) s.dayHigh = q.dayHigh;
                if (q.extPrice) {
                    s.extPrice = q.extPrice;
                    s.extChangePct = q.extChangePct;
                    s.extType = q.extType;
                }
                updated = true;
            }
        }
        if (updated) updateStockPricesInPlace();
    } catch (err) {
        console.error("Bulk Quotes Error:", err);
    } finally {
        isFetchingQuotes = false;
    }
}

function updateStockPricesInPlace() {
    const list = document.getElementById('stock-list');
    if (!list) return;
    allStocks.forEach(s => {
        const card = list.querySelector('.stock-card[data-symbol="' + CSS.escape(s.symbol) + '"]');
        if (!card) return;
        
        // 1. Update regular price
        const priceEl = card.querySelector('.sc-price');
        if (priceEl && s.price != null) priceEl.textContent = '$' + s.price.toFixed(2);
        
        // 2. Update Pre/Post market price
        if (s.extPrice != null && s.extChangePct != null) {
            let extEl = card.querySelector('.sc-ext-price');
            const isUp = Number(s.extChangePct) >= 0;
            const typeStr = s.extType === 'PRE' ? 'Pre' : 'Post';
            const valStr = `${typeStr} ${Number(s.extPrice).toFixed(2)} (${isUp ? '+' : ''}${Number(s.extChangePct).toFixed(2)}%)`;
            
            if (extEl) {
                extEl.className = `sc-ext-price ${isUp ? 'ext-green' : 'ext-red'}`;
                extEl.textContent = valStr;
            } else {
                const nameContainer = card.querySelector('.sc-top > div');
                if (nameContainer) {
                    extEl = document.createElement('span');
                    extEl.className = `sc-ext-price ${isUp ? 'ext-green' : 'ext-red'}`;
                    extEl.textContent = valStr;
                    nameContainer.appendChild(extEl);
                }
            }
        }
    });
}

function showErrorList(msg) {
    elStockList.innerHTML = `<div class="loader-container"><i class="ri-error-warning-line" style="font-size:32px;color:var(--red);"></i><p>${escapeHtml(msg)}</p></div>`;
}

// --- Screener Logic ---
function toggleScreener() {
    const panel = document.getElementById('screener-panel');
    const btn = document.getElementById('screener-toggle-btn');
    if (panel.style.display === 'none') {
        panel.style.display = 'flex';
        btn.classList.add('active');
        btn.innerHTML = '<i class="ri-filter-3-fill"></i>';
    } else {
        panel.style.display = 'none';
        btn.classList.remove('active');
        btn.innerHTML = '<i class="ri-filter-3-line"></i>';
    }
}

function updateScreenerBadge() {
    const btn = document.getElementById('screener-toggle-btn');
    if (!btn) return;
    if (currentScreener || currentCapFilter !== 'ALL') {
        btn.style.color = 'var(--primary)';
        btn.style.borderColor = 'var(--primary)';
    } else {
        btn.style.color = '';
        btn.style.borderColor = '';
    }
}

function applyScreener(preset) {
    currentScreener = currentScreener === preset ? null : preset;
    document.querySelectorAll('#sc-buy_dip, #sc-breakout, #sc-upside, #sc-day_high').forEach(btn => btn.classList.remove('active'));
    if (currentScreener) {
        document.getElementById('sc-' + preset).classList.add('active');
    }
    updateScreenerBadge();
    renderList();
}

function setTrendFilter(trend) {
    currentTrendFilter = trend;
    document.querySelectorAll('.trend-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById('trend-' + trend).classList.add('active');
    updateScreenerBadge();
    renderList();
}

function setVolFilter(vol) {
    currentVolFilter = vol;
    document.querySelectorAll('.vol-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById('vol-' + vol).classList.add('active');
    updateScreenerBadge();
    renderList();
}

function setCapFilter(cap) {
    currentCapFilter = cap;
    document.querySelectorAll('.cap-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById('cap-' + cap).classList.add('active');
    updateScreenerBadge();
    renderList();
}

function clearScreener() {
    currentScreener = null;
    currentCapFilter = 'ALL';
    currentTrendFilter = 'ALL';
    currentVolFilter = 'ALL';
    document.querySelectorAll('#screener-panel .sc-btn').forEach(b => b.classList.remove('active'));
    
    document.getElementById('cap-ALL')?.classList.add('active');
    document.getElementById('trend-ALL')?.classList.add('active');
    document.getElementById('vol-ALL')?.classList.add('active');
    
    updateScreenerBadge();
    renderList();
}

// --- List Rendering ---
function buildSectorTabs() {
    const filtered = allStocks.filter(s => {
        if (currentIndex === 'all') return true;
        const angels = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA'];
          if (currentIndex === '7MAG') return angels.includes(s.symbol);
          if (currentIndex === 'GPF') return s.index === 'GPF';
          if (currentIndex === 'S&P500') return s.index === 'S&P500' || s.index === 'Both';
          if (currentIndex === 'NASDAQ100') return s.index === 'NASDAQ100' || s.index === 'Both';
          return s.index === currentIndex;
    });
    const sectors = ['ทั้งหมด', ...new Set(filtered.map(s => s.sector).filter(Boolean))];
    
    const sectorMenu = document.getElementById('sector-menu');
    const sectorLabel = document.getElementById('sector-label');
    const sectorDropdown = document.getElementById('sector-dropdown');
    
    if (!sectorMenu) return;
    
    sectorMenu.innerHTML = sectors.map(s => 
        `<div class="dropdown-item ${s === currentSector ? 'active' : ''}" data-value="${escapeHtml(s)}">
            ${s === 'ทั้งหมด' ? 'All Sectors (ทั้งหมด)' : escapeHtml(s)}
        </div>`
    ).join('');

    if (sectorLabel) {
        sectorLabel.textContent = currentSector === 'ทั้งหมด' ? 'All Sectors (ทั้งหมด)' : currentSector;
    }

    sectorMenu.querySelectorAll('.dropdown-item').forEach(item => {
        item.addEventListener('click', (e) => {
            currentSector = e.currentTarget.getAttribute('data-value');
            sectorDropdown.classList.remove('open');
            renderList();
        });
    });
}

let currentSort = 'auto'; // 'auto', 'az', 's1'

function toggleSort() {
    if (currentSort === 'auto') currentSort = 'az';
    else if (currentSort === 'az') currentSort = 's1';
    else currentSort = 'auto';
    
    const btn = document.getElementById('sort-btn');
    if (btn) {
        if (currentSort === 'auto') btn.innerHTML = '<i class="ri-magic-line"></i> Auto';
        else if (currentSort === 'az') btn.innerHTML = '<i class="ri-sort-asc"></i> A-Z';
        else btn.innerHTML = '<i class="ri-funds-line"></i> S1';
    }
    renderList();
}

function renderList() {
    const query = elSearchInput.value.trim().toUpperCase();
    
    let stocks = allStocks.filter(s => {
        if (currentIndex === 'fav') return favorites.includes(s.symbol);
        if (currentIndex === 'watch') return watchlist.includes(s.symbol);
        const angels = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA'];
          if (currentIndex === '7MAG' && !angels.includes(s.symbol)) return false;
          if (currentIndex === 'S&P500' && s.index !== 'S&P500' && s.index !== 'Both') return false;
          if (currentIndex === 'NASDAQ100' && s.index !== 'NASDAQ100' && s.index !== 'Both') return false;
          if (currentIndex !== 'all' && currentIndex !== '7MAG' && currentIndex !== 'S&P500' && currentIndex !== 'NASDAQ100' && s.index !== currentIndex) return false;
        if (currentSector !== 'ทั้งหมด' && s.sector !== currentSector) return false;
        if (query) {
            if (!(s.symbol.includes(query) || (s.name || '').toUpperCase().includes(query))) return false;
        }
        
        // Screener Filters
        if (currentTrendFilter !== 'ALL') {
            const trendStr = (s.status || '').toLowerCase();
            if (currentTrendFilter === 'BULL' && !trendStr.includes('up')) return false;
            if (currentTrendFilter === 'BEAR' && !trendStr.includes('down')) return false;
            if (currentTrendFilter === 'SIDEWAYS' && !trendStr.includes('sideways')) return false;
        }
        
        if (currentVolFilter === 'HIGH') {
            if (!s.volume || !s.avgVolume || s.volume < s.avgVolume * 1.0) return false;
        }
        
        if (currentCapFilter !== 'ALL') {
            const cap = Number(s.marketCap) || 0;
            if (currentCapFilter === 'MEGA' && cap < 200000000000) return false;
            if (currentCapFilter === 'LARGE' && (cap < 10000000000 || cap >= 200000000000)) return false;
            if (currentCapFilter === 'MID' && (cap < 2000000000 || cap >= 10000000000)) return false;
            if (currentCapFilter === 'SMALL' && cap >= 2000000000) return false;
        }
        
        if (currentScreener === 'buy_dip') {
            const pS1 = s.pctS1 != null ? s.pctS1 : -999;
            const pS2 = s.pctS2 != null ? s.pctS2 : -999;
            if (!((pS1 >= -0.03 && pS1 <= 0.03) || (pS2 >= -0.03 && pS2 <= 0.03))) return false;
        } else if (currentScreener === 'breakout') {
            const pR1 = s.pctR1 != null ? s.pctR1 : 999;
            const pR2 = s.pctR2 != null ? s.pctR2 : 999;
            if (!((pR1 >= -0.05 && pR1 <= 0.05) || (pR2 >= -0.05 && pR2 <= 0.05))) return false;
        } else if (currentScreener === 'upside') {
            const pR1 = s.pctR1 != null ? s.pctR1 : 0;
            if (pR1 < 0.10) return false;
        } else if (currentScreener === 'day_high') {
            if (!s.dayHigh || !s.price) return false;
            const distToHigh = (s.price - s.dayHigh) / s.dayHigh;
            if (distToHigh < -0.015) return false; // Must be within 1.5% of Day High
        }
        
        return true;
    });
    
    // Adaptive Sorting Logic
    const isMoverTab = ['day_gainers', 'day_losers', 'most_actives', 'trending_now'].includes(currentIndex);
    
    if (!isMoverTab) {
        let effectiveSort = currentSort;
        if (effectiveSort === 'auto') {
            // Adaptive defaults based on tab
            if (['fav', 'watch'].includes(currentIndex)) {
                effectiveSort = 's1';
            } else if (['7MAG', 'all', 'S&P500', 'NASDAQ100', 'NYSE'].includes(currentIndex)) {
                effectiveSort = 'az';
            } else {
                effectiveSort = 'az'; // Default for sectors
            }
        }
        
        if (effectiveSort === 'az') {
            stocks.sort((a, b) => (a.symbol || '').localeCompare(b.symbol || ''));
        } else {
            // Sort by closeness to Support 1
            stocks.sort((a, b) => {
                if (a.pctS1 == null && b.pctS1 == null) return 0;
                if (a.pctS1 == null) return 1;
                if (b.pctS1 == null) return -1;
                return Math.abs(a.pctS1) - Math.abs(b.pctS1);
            });
        }
    }
    
    if (!stocks.length) {
        elStockList.innerHTML = `<div class="loader-container"><p>ไม่พบข้อมูลหุ้น</p></div>`;
        elStatsBar.innerHTML = `แสดง <span>0</span> หุ้น`;
        return;
    }
    
    const nearCount = stocks.filter(s => s.pctS1 != null && Math.abs(s.pctS1 * 100) < 5).length;
    elStatsBar.innerHTML = `<span>${stocks.length}</span> ตัว &middot; ใกล้ S1: <span style="color:var(--red)">${nearCount}</span>`;
    
    // [Optimized for Mobile] Incremental Rendering
    elStockList.innerHTML = '';
    const CHUNK_SIZE = 40;
    let currentIdx = 0;
    
    function renderChunk() {
        const chunk = stocks.slice(currentIdx, currentIdx + CHUNK_SIZE);
        if (!chunk.length) return;
        
        const html = chunk.map(s => createStockCard(s)).join('');
        elStockList.insertAdjacentHTML('beforeend', html);
        
        currentIdx += CHUNK_SIZE;
        if (currentIdx < stocks.length) {
            requestAnimationFrame(renderChunk);
        }
    }
    renderChunk();
}

function createStockCard(s) {
    const priceStr = s.price != null ? '$' + s.price.toFixed(2) : '—';
    const pct = s.pctS1 != null ? s.pctS1 * 100 : null;
    const absPct = pct != null ? Math.abs(pct) : null;
    let colorClass = '', pctClass = 'ok', pctStr = '—';
    
    if (pct != null) {
        pctStr = 'S1: ' + (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%';
        if (absPct < 1) { colorClass = 'near'; pctClass = 'near'; }
        else if (absPct < 3) { colorClass = 'close'; pctClass = 'close'; }
    }
    
    const isFav = favorites.includes(s.symbol);
    const isWatch = watchlist.includes(s.symbol);
    const logoUrl = `https://financialmodelingprep.com/image-stock/${s.symbol}.png`;
    const initials = s.symbol.substring(0, 3);
    
    let levelsHtml = '';
    if (s.s1 != null) levelsHtml += `<span class="chip s">S1 ${s.s1.toFixed(0)}</span>`;
    if (s.r1 != null) levelsHtml += `<span class="chip r">R1 ${s.r1.toFixed(0)}</span>`;
    
    let regPctStr = '';
    if (s.regChangePct != null) {
        const isUp = s.regChangePct >= 0;
        regPctStr = `<span class="sc-pct ${isUp ? 'ok' : 'near'} mono">${isUp ? '+' : ''}${s.regChangePct.toFixed(2)}%</span>`;
    }

    let idxBadge = '';
    if (s.index === 'NASDAQ100') idxBadge = 'idx-nq';
    else if (s.index === 'Both') idxBadge = 'idx-both';
    else idxBadge = 'idx-sp';

    return `
    <div class="stock-card ${colorClass} ${currentSymbol === s.symbol ? 'active' : ''}" data-symbol="${escapeHtml(s.symbol)}">
        <div class="sc-logo-wrapper">
            <button class="sc-watch ${isWatch ? 'is-watch' : ''}" data-symbol="${escapeHtml(s.symbol)}">
                <i class="${isWatch ? 'ri-eye-fill' : 'ri-eye-line'}"></i>
            </button>
            <button class="sc-star ${isFav ? 'is-fav' : ''}" data-symbol="${escapeHtml(s.symbol)}">
                <i class="${isFav ? 'ri-star-fill' : 'ri-star-line'}"></i>
            </button>
            <img class="sc-logo" src="${logoUrl}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
            <div class="sc-logo-fallback" style="display:none">${escapeHtml(initials)}</div>
        </div>
        
        <div class="sc-info">
            <div class="sc-top">
                <div style="display:flex; align-items:baseline; gap:6px;">
                    <span class="sc-symbol">${escapeHtml(s.symbol)}</span>
                    ${(s.extPrice != null && s.extChangePct != null) ? `<span class="sc-ext-price ${Number(s.extChangePct) >= 0 ? 'ext-green' : 'ext-red'}">${s.extType === 'PRE' ? 'Pre' : 'Post'} ${Number(s.extPrice).toFixed(2)} (${Number(s.extChangePct) > 0 ? '+' : ''}${Number(s.extChangePct).toFixed(2)}%)</span>` : ''}
                </div>
                <div style="display:flex; align-items:center;">
                    <span class="sc-price mono">${priceStr}</span>
                </div>
            </div>
            <div class="sc-mid">
                <span class="sc-name">${escapeHtml(s.name || '')}</span>
                ${regPctStr}
            </div>
            <div class="sc-bot" style="justify-content:space-between; align-items:center;">
                <div style="display:flex; gap:4px; align-items:center;">
                    <span class="badge ${idxBadge}">${escapeHtml(s.index === 'Both' ? 'S&P+NQ' : (s.index || 'S&P500'))}</span>
                    ${levelsHtml}
                </div>
                <span class="sc-pct ${pctClass} mono">${pctStr}</span>
            </div>
        </div>
    </div>`;
}

function toggleFavorite(symbol) {
    const idx = favorites.indexOf(symbol);
    if (idx === -1) favorites.push(symbol);
    else favorites.splice(idx, 1);
    safeSet('SP_FAVS', JSON.stringify(favorites));
    syncFavWatchToBackend();
}

function toggleWatchlist(symbol) {
    const idx = watchlist.indexOf(symbol);
    if (idx === -1) watchlist.push(symbol);
    else watchlist.splice(idx, 1);
    safeSet('SP_WATCH', JSON.stringify(watchlist));
    syncFavWatchToBackend();
}

// --- Detail View ---
function openDetail(symbol) {
    const stock = allStocks.find(s => s.symbol === symbol);
    if (!stock) return;
    
    currentSymbol = symbol;
    if (typeof renderWatchLinesUI === 'function') renderWatchLinesUI();
    if (typeof switchChartMode === 'function') switchChartMode('alphazone');
    // UI Transitions
    elEmptyState.classList.add('hidden');
    elDetailContent.classList.remove('hidden');
    elDetailPanel.classList.add('active'); // For mobile
    
    // Populate Header
    document.getElementById('d-symbol').textContent = symbol;
    const hdrFullname = document.getElementById('d-hdr-fullname');
    if (hdrFullname) hdrFullname.textContent = stock.name || '';
    document.getElementById('d-fullname').textContent = stock.name || '';
    document.getElementById('d-sector').textContent = stock.sector || '';
    
    const idxBadge = document.getElementById('d-idx-badge');
    idxBadge.textContent = stock.index || 'S&P500';
    idxBadge.className = 'badge ' + (stock.index === 'NASDAQ100' ? 'idx-nq' : stock.index === 'Both' ? 'idx-both' : 'idx-sp');
    
    document.getElementById('d-price').textContent = stock.price ? '$' + stock.price.toFixed(2) : '—';
    document.getElementById('d-change').textContent = '-';
    document.getElementById('d-change').className = 'price-change mono';
    
    document.getElementById('d-ext-price').style.display = 'none';
    document.getElementById('d-ext-price').textContent = '';
    
    const isFav = favorites.includes(symbol);
    const favBtn = document.getElementById('d-fav-btn');
    favBtn.classList.toggle('is-fav', isFav);
    favBtn.innerHTML = isFav ? '<i class="ri-star-fill"></i>' : '<i class="ri-star-line"></i>';
    
    const isWatch = watchlist.includes(symbol);
    const watchBtn = document.getElementById('d-watch-btn');
    watchBtn.classList.toggle('is-watch', isWatch);
    watchBtn.innerHTML = isWatch ? '<i class="ri-eye-fill"></i>' : '<i class="ri-eye-line"></i>';
    
    // Populate Technical Action Center Stats (RSI, S1, R1)
    const formatPct = (price, level) => {
        if (!price || !level) return '';
        const pct = ((level - price) / price) * 100;
        const colorCls = pct >= 0 ? 'pm-val-green' : 'pm-val-red';
        return ` <span class="${colorCls}">(${pct>0?'+':''}${pct.toFixed(2)}%)</span>`;
    };

    let rsiColor = 'var(--text-main)';
    if (stock.rsi > 70) rsiColor = 'var(--red)';
    else if (stock.rsi < 30) rsiColor = 'var(--green)';
    else if (stock.rsi) rsiColor = 'var(--yellow)';

    document.getElementById('d-rsi').innerHTML = stock.rsi ? `<span style="color:${rsiColor}">${stock.rsi.toFixed(2)}</span>` : '—';
    document.getElementById('d-s1').innerHTML = stock.s1 ? `$${stock.s1.toFixed(2)}${formatPct(stock.price, stock.s1)}` : '—';
    document.getElementById('d-r1').innerHTML = stock.r1 ? `$${stock.r1.toFixed(2)}${formatPct(stock.price, stock.r1)}` : '—';
    
    // Reset Data areas
    document.getElementById('ema-bar').innerHTML = '<span class="ema-chip na"><div class="spinner-small"></div> กำลังคำนวณข้อมูล...</span>';
    document.getElementById('levels-list').innerHTML = '<div class="loader-container"><div class="spinner"></div><p>กำลังวิเคราะห์แนวรับ-ต้าน...</p></div>';
    document.getElementById('trend-badge-wrap').innerHTML = '';
    
    currentLevelsData = null;
    window.currentLevelsData = null;
    syncCompactTelemetry();
    if (typeof window.refreshAICoachContextUI === 'function') window.refreshAICoachContextUI();
    
    Promise.all([loadLiveLevels(), loadChartData()]).catch(e => console.error("Error loading detail:", e));
}

let _levelsAbortController = null;
async function loadLiveLevels() {
    if (_levelsAbortController) {
        _levelsAbortController.abort();
    }
    _levelsAbortController = new AbortController();
    const signal = _levelsAbortController.signal;
    
    const requestedSymbol = currentSymbol;
    try {
        const res = await fetchWithRetry(`${API_URL}?action=getLiveLevels&symbol=${encodeURIComponent(requestedSymbol)}`, { signal });
        const data = await res.json();
        
        if (currentSymbol !== requestedSymbol) return;
        
        if (data.success) {
            currentLevelsData = data;
            window.currentLevelsData = data;
            renderLiveLevels(data);
            if (data.summary) {
                renderSummary(data.summary);
                if (currentChartMode === 'info') renderCompanyInfoTab();
            }
            syncCompactTelemetry();
            addChartAnnotations();
            if (typeof window.refreshAICoachContextUI === 'function') window.refreshAICoachContextUI();
        } else {
            document.getElementById('levels-list').innerHTML = `<p class="help-text" style="color:var(--red)"><i class="ri-error-warning-line"></i> ${escapeHtml(data.error)}</p>`;
            document.getElementById('ema-bar').innerHTML = '<span class="ema-chip na">ไม่สามารถโหลดข้อมูล EMA</span>';
        }
    } catch (err) {
        if (err.name === 'AbortError') return;
        document.getElementById('levels-list').innerHTML = `<p class="help-text" style="color:var(--red)"><i class="ri-wifi-off-line"></i> เกิดข้อผิดพลาดในการโหลดข้อมูล</p>`;
    }
}

function renderLiveLevels(data) {
    const price = data.price;
    const sup = data.supports || [];
    const rst = data.resists || [];
    const ema = data.ema;
    
    // Price Update
    if (price) document.getElementById('d-price').textContent = '$' + price.toFixed(2);
    if (data.calcTime) document.getElementById('calc-time').textContent = 'อัปเดต: ' + data.calcTime;
    
    // Trend Badge
    const trendMap = {
        strong_up: ['strong-up', 'ri-arrow-right-up-line', 'Uptrend แข็งแกร่ง (เหนือ EMA200 D+W)'],
        up: ['up', 'ri-arrow-right-up-line', 'Uptrend (เหนือ EMA200 Daily)'],
        sideways: ['sideways', 'ri-arrow-right-s-line', 'Sideways (แกว่งตัวรอบ EMA)'],
        down: ['down', 'ri-arrow-right-down-line', 'Downtrend (ใต้ EMA200 Daily)'],
        strong_down: ['strong-down', 'ri-arrow-right-down-line', 'Downtrend แข็งแกร่ง (ใต้ EMA200 D+W)']
    };
    const [tCls, tIcon, tLabel] = trendMap[data.trend] || ['sideways', 'ri-subtract-line', '—'];
    document.getElementById('trend-badge-wrap').innerHTML = `<span class="trend-badge ${tCls}"><i class="${tIcon}"></i> ${tLabel}</span>`;
    
    // EMA Bar
    if (ema) {
        let html = '';
        if (ema.daily) html += `<span class="ema-chip ${ema.position === 'above' ? 'above' : 'below'}">EMA200D $${ema.daily} (${ema.pctD}%)</span>`;
        if (ema.weekly) html += `<span class="ema-chip ${parseFloat(ema.pctW) > 0 ? 'above' : 'below'}">EMA200W $${ema.weekly} (${ema.pctW}%)</span>`;
        document.getElementById('ema-bar').innerHTML = html;
    } else {
        document.getElementById('ema-bar').innerHTML = '<span class="ema-chip na">ไม่มีข้อมูล EMA</span>';
    }
    
    // Levels List
    let html = '';
    
    // Resists
    html += '<div class="section-hdr resist">🔴 แนวต้าน (โซนขาย)</div>';
    if (!rst.length) html += '<p class="help-text">ไม่พบแนวต้านที่ชัดเจนในระยะใกล้</p>';
    [...rst].reverse().forEach((r, i) => { html += createLevelRow('resist', 'R' + (rst.length - i), r, price); });
    
    // Current Price Marker
    html += `<div class="price-now-badge"><span class="price-now-inner"><i class="ri-focus-3-line"></i> ราคาปัจจุบัน $${price.toFixed(2)}</span></div>`;
    
    // Supports
    html += '<div class="section-hdr support">🟢 แนวรับ (โซนซื้อ)</div>';
    if (!sup.length) html += '<p class="help-text">ไม่พบแนวรับที่ชัดเจนในระยะใกล้</p>';
    sup.forEach((s, i) => { html += createLevelRow('support', 'S' + (i + 1), s, price); });
    
    document.getElementById('levels-list').innerHTML = html;
}

function createLevelRow(type, label, lvl, price) {
    const pct = ((lvl.price - price) / price * 100);
    const pctStr = (pct > 0 ? '+' : '') + pct.toFixed(2) + '%';
    const s = Math.min(lvl.score || 1, 10);
    const dots = [...Array(10)].map((_, i) => `<span class="sdot ${i < s ? 'on-' + type : 'off'}"></span>`).join('');
    
    const mLabel = { 'swing': 'Daily Swing', 'swing_w': 'Weekly Swing', 'fib_ret': 'Fib Ret', 'fib_ext': 'Fib Ext', 'fib': 'Fib Pivot', 'pivot': 'Pivot', 'round': 'Round Number' };
    const mStr = (lvl.methods || '').split('+').map(m => mLabel[m] || m).join(' • ');
    
    let badgesHtml = '';
    if (lvl.tier) {
        let tierColor = 'var(--text-muted)';
        if (lvl.tier === 'S') tierColor = '#8b5cf6';
        if (lvl.tier === 'A') tierColor = '#3b82f6';
        if (lvl.tier === 'B') tierColor = '#10b981';
        if (lvl.tier === 'C') tierColor = '#f59e0b';
        badgesHtml += `<span class="lvl-badge tier-badge" style="background:${tierColor}20;color:${tierColor};">Tier ${lvl.tier}</span>`;
    }
    if (lvl.isConfluence) {
        badgesHtml += `<span class="lvl-badge conf-badge" style="background:#eab30820;color:#eab308;"><i class="ti ti-star-filled" style="font-size:10px;"></i> Conf</span>`;
    }
    if (lvl.testCount >= 3) {
        badgesHtml += `<span class="lvl-badge test-badge" style="background:#ef444420;color:#ef4444;">Tested ${lvl.testCount}x</span>`;
    }
    
    return `
    <div class="level-row ${type} glass">
        <div class="lr-left">
            <div class="lr-title-row">
                <span class="lr-label ${type}">${label}</span>
                ${badgesHtml}
            </div>
            <div class="score-bar">${dots}</div>
            <span class="lr-method">${mStr}</span>
        </div>
        <div class="lr-right">
            <div class="lr-price">${lvl.price.toFixed(2)} <button type="button" class="lr-pin-btn" onclick="event.stopPropagation(); addCustomWatchLineByPrice(${lvl.price});" title="ปักหมุดแจ้งเตือนที่ระดับนี้"><i class="ri-pushpin-line"></i></button></div>
            <div class="lr-pct ${type}">${pctStr}</div>
        </div>
    </div>`;
}

function renderSummary(summary) {
    if (!summary) return;
    
    // Combined Hero Fundamentals
    const heroFundBox = document.getElementById('d-hero-fundamentals');
    if (summary.fundamentals && heroFundBox) {
        const f = summary.fundamentals;
        let ratingBadge = '';
        if (summary.rating) {
            const r = summary.rating.replace(/_/g, ' ').toUpperCase();
            let colorClass = 'pm-sell-btn'; // Default
            if (r.includes('BUY')) colorClass = 'pm-buy-btn';
            else if (r.includes('HOLD')) colorClass = 'pm-hold-btn';
            ratingBadge = `<span class="${colorClass}">${r}</span>`;
        }

        heroFundBox.innerHTML = `
            <div class="pm-row">
                <div class="pm-label">TARGET</div>
                <div class="pm-val target-val-group" style="flex-wrap: wrap; gap: 4px;">
                    <span class="target-val-text">${f.targetMeanPrice !== '-' ? '$' + escapeHtml(String(f.targetMeanPrice)) : '-'}</span>
                    <span class="target-upside-text ${f.upsideRaw > 0 ? 'pm-val-green' : 'pm-val-red'}">${f.upsideRaw > 0 ? '+' : ''}${escapeHtml(String(f.upside))}</span>
                    ${ratingBadge}
                </div>
            </div>
            <div class="pm-row">
                <div class="pm-label">P/E RATIO</div>
                <div class="pm-val">${escapeHtml(String(f.trailingPE || f.pe))}</div>
            </div>
            <div class="pm-row">
                <div class="pm-label">MARKET CAP</div>
                <div class="pm-val">${escapeHtml(String(f.marketCap))}</div>
            </div>
            <div class="pm-row">
                <div class="pm-label">DIV YIELD</div>
                <div class="pm-val">${escapeHtml(String(f.dividendYield || f.divYield))}</div>
            </div>
            <div class="pm-row">
                <div class="pm-label">BETA</div>
                <div class="pm-val">${escapeHtml(String(f.beta))}</div>
            </div>
            <div class="pm-row" style="border-bottom: none;">
                <div class="pm-label">REV GROWTH</div>
                <div class="pm-val ${parseFloat(f.revenueGrowth || f.revGrowth) > 0 ? 'pm-val-green' : (parseFloat(f.revenueGrowth || f.revGrowth) < 0 ? 'pm-val-red' : '')}">${escapeHtml(String(f.revenueGrowth || f.revGrowth))}</div>
            </div>
        `;
        heroFundBox.style.display = 'flex';
    } else if (heroFundBox) {
        heroFundBox.style.display = 'none';
        heroFundBox.innerHTML = '';
    }

    // Company Description
    const descBox = document.getElementById('d-company-desc');
    if (summary.desc && descBox) {
        descBox.innerHTML = `<h3><i class="ri-building-4-line"></i> About Company</h3><p>${escapeHtml(summary.desc)}</p>`;
        descBox.style.display = 'block';
    } else if (descBox) {
        descBox.style.display = 'none';
    }
}

// --- Chart ---
let _chartAbortController = null;
async function loadChartData() {
    if (_chartAbortController) {
        _chartAbortController.abort();
    }
    _chartAbortController = new AbortController();
    const signal = _chartAbortController.signal;
    
    document.getElementById('chart-loading').classList.add('active');
    const requestedSymbol = currentSymbol;
    const requestedRange = currentRange;
    
    try {
        const res = await fetchWithRetry(`${API_URL}?action=getStockChart&symbol=${encodeURIComponent(requestedSymbol)}&range=${requestedRange}`, { signal });
        const data = await res.json();
        
        if (currentSymbol !== requestedSymbol || currentRange !== requestedRange) return;
        
        document.getElementById('chart-loading').classList.remove('active');
        
        if (data.success) {
            // Update Change Text
            if (data.currentPrice && data.prevClose) {
                const chg = data.currentPrice - data.prevClose;
                const pct = chg / data.prevClose * 100;
                const sign = chg >= 0 ? '+' : '';
                const el = document.getElementById('d-change');
                el.textContent = `${sign}${chg.toFixed(2)} (${sign}${pct.toFixed(2)}%)`;
                el.className = 'price-change mono ' + (chg >= 0 ? 'up' : 'down');
            }

            // Update Quote Stats
            if (data.quote) {
                const low = data.quote.fiftyTwoWeekLow;
                const high = data.quote.fiftyTwoWeekHigh;
                if (low && high && high > low && data.currentPrice) {
                    document.getElementById('d-52w-low').textContent = `$${low.toFixed(2)}`;
                    document.getElementById('d-52w-high').textContent = `$${high.toFixed(2)}`;
                    let pct = ((data.currentPrice - low) / (high - low)) * 100;
                    pct = Math.max(0, Math.min(100, pct));
                    document.getElementById('d-52w-marker').style.left = `${pct}%`;
                } else {
                    document.getElementById('d-52w-low').textContent = `—`;
                    document.getElementById('d-52w-high').textContent = `—`;
                    document.getElementById('d-52w-marker').style.left = `50%`;
                }

                const dLow = data.quote.dayLow;
                const dHigh = data.quote.dayHigh;
                if (dLow && dHigh && dHigh > dLow && data.currentPrice) {
                    document.getElementById('d-day-low').textContent = `$${dLow.toFixed(2)}`;
                    document.getElementById('d-day-high').textContent = `$${dHigh.toFixed(2)}`;
                    let pct = ((data.currentPrice - dLow) / (dHigh - dLow)) * 100;
                    pct = Math.max(0, Math.min(100, pct));
                    document.getElementById('d-day-marker').style.left = `${pct}%`;
                } else {
                    document.getElementById('d-day-low').textContent = `—`;
                    document.getElementById('d-day-high').textContent = `—`;
                    document.getElementById('d-day-marker').style.left = `50%`;
                }
                
                if (data.summary) {
                    // Description handled by renderSummary() — no duplicate here
                    
                    // --- Pre/Post Market Price Update ---
                    const f = data.summary.fundamentals;
                    if (f && f.extPrice != null && f.extChangePct != null) {
                        const extEl = document.getElementById('d-ext-price');
                        if (extEl) {
                            const label = f.extType === 'PRE' ? '☀️ Pre-Market' : '🌙 Post-Market';
                            const sign = f.extChangePct > 0 ? '+' : '';
                            extEl.textContent = `${label}: $${f.extPrice.toFixed(2)} (${sign}${f.extChangePct.toFixed(2)}%)`;
                            extEl.style.display = 'block';
                            extEl.className = 'pm-change mono ' + (f.extChangePct >= 0 ? 'up' : 'down');
                        }
                    }
                    
                    if (data.summary.fundamentals) {
                    }
                }
            }
            
            const emaLabels = (data.emaData || []).map(e => `EMA${e.period}`).join(', ');
            document.getElementById('ema-label').textContent = emaLabels || 'EMA';
            
            latestChartArgs = { points: data.points, emaData: data.emaData || [], livePrice: data.currentPrice };
            renderChart(data.points, data.emaData || [], data.currentPrice);
            syncCompactTelemetry();
            if (typeof window.refreshAICoachContextUI === 'function') window.refreshAICoachContextUI();
        } else {
            console.error("Chart API Error:", data.error);
            const canvas = document.getElementById('priceChart');
            if (priceChart) { priceChart.destroy(); }
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.font = '14px Inter';
            ctx.fillStyle = '#ef4444';
            ctx.textAlign = 'center';
            ctx.fillText('ไม่สามารถโหลดข้อมูลกราฟได้ (Yahoo API Error)', canvas.width/2, canvas.height/2);
        }
    } catch (err) {
        if (err.name === 'AbortError') return;
        document.getElementById('chart-loading').classList.remove('active');
        console.error(err);
        const canvas = document.getElementById('priceChart');
        if (priceChart) { priceChart.destroy(); }
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.font = '14px Inter';
        ctx.fillStyle = '#ef4444';
        ctx.textAlign = 'center';
        ctx.fillText('เกิดข้อผิดพลาดในการโหลดกราฟ', canvas.width/2, canvas.height/2);
    }
}

function calcRSI(prices, period = 14) {
    const clean = prices.filter(p => typeof p === 'number' && Number.isFinite(p));
    if (clean.length < period + 1) return null;
    let avgG = 0, avgL = 0;
    for (let i = 1; i <= period; i++) {
        const d = clean[i] - clean[i - 1];
        if (d > 0) avgG += d; else avgL -= d;
    }
    avgG /= period; avgL /= period;
    for (let i = period + 1; i < clean.length; i++) {
        const d = clean[i] - clean[i - 1];
        avgG = (avgG * (period - 1) + (d > 0 ? d : 0)) / period;
        avgL = (avgL * (period - 1) + (d < 0 ? -d : 0)) / period;
    }
    if (avgL === 0) return 100;
    return Math.round((100 - 100 / (1 + avgG / avgL)) * 100) / 100;
}

function renderChart(points, emaData, livePrice) {
    const canvas = document.getElementById('priceChart');
    if (priceChart) { priceChart.destroy(); }
    
    if (!points || !points.length) return;
    
    const closes = points.map(p => p.close);
    const labels = points.map(p => p.label);
    
    // RSI — show on chart badge, don't overwrite daily RSI
    const rsi = calcRSI(closes);
    const rsiBadge = document.getElementById('chart-rsi-badge');
    if (rsiBadge) {
        if (rsi != null) {
            rsiBadge.textContent = 'RSI(14) ' + currentRange + ': ' + rsi;
            rsiBadge.style.color = rsi < 30 ? 'var(--green)' : rsi > 70 ? 'var(--red)' : 'var(--text-main)';
        } else {
            rsiBadge.textContent = '';
        }
    }
    
    // Colors based on theme
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
    const textColor = isDark ? '#94a3b8' : '#64748b';
    
    const ctx = canvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, isDark ? 'rgba(59,130,246,0.3)' : 'rgba(37,99,235,0.2)');
    grad.addColorStop(1, 'rgba(59,130,246,0.0)');
    
    const datasets = [{
        label: 'Price',
        data: closes,
        borderColor: isDark ? '#3b82f6' : '#2563eb',
        borderWidth: 2,
        backgroundColor: grad,
        fill: true,
        tension: 0.1,
        pointRadius: 0,
        pointHoverRadius: 6,
        pointHitRadius: 10
    }];
    
    const emaColors = ['#eab308', '#f97316', '#8b5cf6'];
    
    if (emaData && emaData.length > 0) {
        emaData.forEach((ema, idx) => {
            datasets.push({
                label: `EMA${ema.period}`,
                data: ema.series,
                borderColor: emaColors[idx % emaColors.length],
                borderWidth: 1.5,
                borderDash: [5, 5],
                fill: false,
                pointRadius: 0,
                pointHoverRadius: 0
            });
        });
    }

    const isMobile = window.innerWidth <= 768;
    const hideTicks = isMobile && (currentRange === '1H' || currentRange === '4H');

    initChartInteractions();
    resetChartHudToLatest(points, emaData);

    const alphaCrosshairPlugin = {
        id: 'alphaCrosshair',
        afterDraw(chart) {
            const { ctx, chartArea, scales } = chart;
            if (!chartArea || !scales || !scales.y) return;
            const isDarkTheme = document.documentElement.getAttribute('data-theme') === 'dark';

            // 1. Draw Pin Preview Line when Pin Mode is active
            if (isPinMode && Number.isFinite(pinPreviewY) && pinPreviewY >= chartArea.top && pinPreviewY <= chartArea.bottom) {
                const pVal = scales.y.getValueForPixel(pinPreviewY);
                ctx.save();
                ctx.strokeStyle = '#a855f7';
                ctx.lineWidth = 1.5;
                ctx.setLineDash([5, 4]);
                ctx.beginPath();
                ctx.moveTo(chartArea.left, pinPreviewY);
                ctx.lineTo(chartArea.right, pinPreviewY);
                ctx.stroke();

                const labelTxt = `📌 $${pVal.toFixed(2)}`;
                ctx.font = '600 10.5px "IBM Plex Mono", monospace';
                const txtW = ctx.measureText(labelTxt).width + 10;
                const boxX = Math.max(chartArea.left + 4, chartArea.right - txtW - 4);
                const boxY = Math.max(chartArea.top + 2, pinPreviewY - 22);
                ctx.fillStyle = '#6d28d9';
                ctx.beginPath();
                if (ctx.roundRect) ctx.roundRect(boxX, boxY, txtW, 18, 4);
                else ctx.rect(boxX, boxY, txtW, 18);
                ctx.fill();
                ctx.fillStyle = '#ffffff';
                ctx.fillText(labelTxt, boxX + 5, boxY + 12.5);
                ctx.restore();
            }

            // 2. Draw Subtle Vertical + Horizontal Crosshair on active point (without blocking lines)
            const active = chart.tooltip && chart.tooltip.getActiveElements ? chart.tooltip.getActiveElements() : [];
            if (active && active.length > 0) {
                const pt = active[0].element;
                if (!pt) return;
                ctx.save();
                ctx.strokeStyle = isDarkTheme ? 'rgba(148, 163, 184, 0.45)' : 'rgba(71, 85, 105, 0.4)';
                ctx.lineWidth = 1;
                ctx.setLineDash([3, 3]);

                // Vertical line
                ctx.beginPath();
                ctx.moveTo(pt.x, chartArea.top);
                ctx.lineTo(pt.x, chartArea.bottom);
                ctx.stroke();

                // Horizontal line
                ctx.beginPath();
                ctx.moveTo(chartArea.left, pt.y);
                ctx.lineTo(chartArea.right, pt.y);
                ctx.stroke();

                // Highlight dot
                ctx.setLineDash([]);
                ctx.fillStyle = isDarkTheme ? '#60a5fa' : '#2563eb';
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, 4.5, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = isDarkTheme ? '#09090b' : '#ffffff';
                ctx.lineWidth = 1.5;
                ctx.stroke();
                ctx.restore();
            }
        }
    };

    priceChart = new Chart(canvas, {
        type: 'line',
        data: { labels, datasets },
        plugins: [alphaCrosshairPlugin],
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: isMobile ? { left: 2, right: 2, top: 6, bottom: 0 } : { left: 4, right: 4, top: 8, bottom: 0 }
            },
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    enabled: false,
                    external: updateChartHudFromTooltip
                },
                zoom: {
                    pan: { enabled: !isMobile, mode: 'x' },
                    zoom: {
                        wheel: { enabled: true, modifierKey: 'ctrl' },
                        pinch: { enabled: true },
                        mode: 'x'
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    bounds: 'data',
                    offset: false,
                    ticks: {
                        display: !hideTicks,
                        color: textColor,
                        maxTicksLimit: isMobile ? 4 : 6,
                        maxRotation: 0,
                        minRotation: 0,
                        autoSkip: true,
                        padding: isMobile ? 4 : 6,
                        font: { size: isMobile ? 9.5 : 11 },
                        align: 'inner'
                    }
                },
                y: {
                    position: 'right',
                    grid: { color: gridColor, drawBorder: false },
                    ticks: {
                        color: textColor,
                        padding: isMobile ? 4 : 6,
                        font: { size: isMobile ? 10 : 11, family: 'IBM Plex Mono' },
                        callback: v => '$' + v
                    }
                }
            }
        }
    });
    
    addChartAnnotations();
}

function addChartAnnotations() {
    if (!priceChart || !currentLevelsData) return;
    
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const sColor = isDark ? 'rgba(34, 197, 94, 0.4)' : 'rgba(22, 163, 74, 0.4)';
    const rColor = isDark ? 'rgba(239, 68, 68, 0.4)' : 'rgba(220, 38, 38, 0.4)';

    const annotations = {};

    const isMobileAnno = window.innerWidth <= 768;
    const annoFontSize = isMobileAnno ? 9 : 10;
    const annoYAdj = isMobileAnno ? -8 : -10;

    const customLines = (typeof getCustomWatchLines === 'function') ? getCustomWatchLines() : [];
    const curRefPrice = (currentLevelsData && currentLevelsData.price) || (latestChartArgs && latestChartArgs.livePrice) || null;
    const pinLabelBg = isDark ? 'rgba(24, 24, 27, 0.82)' : 'rgba(255, 255, 255, 0.88)';
    customLines.forEach((p, i) => {
        const dirArrow = curRefPrice ? (p >= curRefPrice ? '▲' : '▼') : '';
        annotations['customLine'+i] = {
            type: 'line', yMin: p, yMax: p, borderColor: '#8b5cf6', borderWidth: 1.8, borderDash: [5, 4],
            label: {
                display: true,
                content: `📌 ${dirArrow} $${Number(p).toFixed(2)}`,
                position: 'start',
                backgroundColor: pinLabelBg,
                color: '#a78bfa',
                padding: { x: 5, y: 2 },
                borderRadius: 4,
                font: { size: annoFontSize, family: 'IBM Plex Mono', weight: '600' },
                yAdjust: annoYAdj
            }
        };
    });

    const supports = currentLevelsData.supports || [];
    const resists = currentLevelsData.resists || [];
    
    supports.forEach((s, i) => {
        annotations['s'+i] = {
            type: 'line', yMin: s.price, yMax: s.price,
            borderColor: sColor, borderWidth: 1.5, borderDash: [4, 4],
            label: { display: true, content: 'S'+(i+1)+' $'+s.price.toFixed(2), position: 'end', yAdjust: annoYAdj, backgroundColor: 'transparent', color: sColor, font: {family: 'IBM Plex Mono', size: annoFontSize, weight: '600'} }
        };
    });
    
    [...resists].reverse().forEach((r, i) => {
        annotations['r'+i] = {
            type: 'line', yMin: r.price, yMax: r.price,
            borderColor: rColor, borderWidth: 1.5, borderDash: [4, 4],
            label: { display: true, content: 'R'+(resists.length-i)+' $'+r.price.toFixed(2), position: 'end', yAdjust: annoYAdj, backgroundColor: 'transparent', color: rColor, font: {family: 'IBM Plex Mono', size: annoFontSize, weight: '600'} }
        };
    });
    
    // Fallback EMA200D reference line when chart range (<200 bars like 1D 6mo) cannot plot curved EMA200
    const emaSeries0 = latestChartArgs && latestChartArgs.emaData && latestChartArgs.emaData[0] && latestChartArgs.emaData[0].series;
    const validEmaPts = Array.isArray(emaSeries0) ? emaSeries0.filter(v => v != null).length : 0;
    if (validEmaPts < 2 && currentLevelsData && currentLevelsData.ema && currentLevelsData.ema.daily && (currentRange === '1D' || currentRange === 'YTD')) {
        const ema200Val = Number(currentLevelsData.ema.daily);
        if (Number.isFinite(ema200Val)) {
            annotations['ema200Ref'] = {
                type: 'line',
                yMin: ema200Val,
                yMax: ema200Val,
                borderColor: 'rgba(234, 179, 8, 0.7)',
                borderWidth: 1.5,
                borderDash: [6, 4],
                label: {
                    display: true,
                    content: 'EMA200D $' + ema200Val.toFixed(2),
                    position: 'start',
                    yAdjust: annoYAdj,
                    backgroundColor: 'transparent',
                    color: '#eab308',
                    font: { family: 'IBM Plex Mono', size: annoFontSize, weight: '600' }
                }
            };
        }
    }

    priceChart.options.plugins.annotation = { annotations };
    priceChart.update();
}

// --- Market Movers ---
async function fetchMarketMovers(scrId) {
    elStockList.innerHTML = `<div class="loader-container"><div class="spinner"></div><p>กำลังดึงข้อมูล Market Movers...</p></div>`;
    elStatsBar.innerHTML = '';
    
    // Use cache if fresh (< 5 min)
    if (moverCache[scrId] && Date.now() - moverCache[scrId].ts < 300000) {
        renderMoverList(moverCache[scrId].data);
        return;
    }
    
    try {
        const res = await fetchWithRetry(`${API_URL}?action=getMarketMovers&scrId=${scrId}`);
        const data = await res.json();
        
        if (data.success) {
            moverCache[scrId] = { data, ts: Date.now() };
            renderMoverList(data);
        } else {
            showErrorList(data.error || 'ไม่สามารถดึงข้อมูลได้');
        }
    } catch(err) {
        showErrorList('Network Error: ' + err.message);
    }
}

function renderMoverList(data) {
    const stocks = data.data || [];
    const titleMap = { day_gainers: '🚀 Top Gainers', day_losers: '📉 Top Losers', most_actives: '🔥 Most Active', trending_now: '📈 Trending Now' };
    
    elStatsBar.innerHTML = `<span>${titleMap[data.scrId] || ''}</span> &middot; ${stocks.length} ตัว`;
    
    if (!stocks.length) {
        elStockList.innerHTML = `<div class="loader-container"><p>ไม่พบข้อมูล</p></div>`;
        return;
    }
    
    elStockList.innerHTML = stocks.map(s => createMoverCard(s)).join('');
}

function createMoverCard(s) {
    const priceStr = s.price != null ? '$' + s.price.toFixed(2) : '—';
    const chg = s.change, chgPct = s.changePct;
    const isUp = chg != null && chg >= 0;
    const chgStr = chg != null ? (isUp ? '+' : '') + chg.toFixed(2) : '—';
    const pctStr = chgPct != null ? (isUp ? '+' : '') + chgPct.toFixed(2) + '%' : '—';
    const colorClass = isUp ? 'ok' : 'near';
    
    const volStr = s.volume != null ? formatVolume(s.volume) : '—';
    const logoUrl = `https://financialmodelingprep.com/image-stock/${s.symbol}.png`;
    const initials = s.symbol.substring(0, 3);
    
    return `
    <div class="stock-card" data-symbol="${escapeHtml(s.symbol)}">
        <div class="sc-logo-wrapper">
            <img class="sc-logo" src="${logoUrl}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
            <div class="sc-logo-fallback" style="display:none">${escapeHtml(initials)}</div>
        </div>
        
        <div class="sc-info">
            <div class="sc-top">
                <div style="display:flex; align-items:baseline; gap:6px;">
                    <span class="sc-symbol">${escapeHtml(s.symbol)}</span>
                    ${(s.extPrice != null && s.extChangePct != null) ? `<span class="sc-ext-price ${Number(s.extChangePct) >= 0 ? 'ext-green' : 'ext-red'}">${s.extType === 'PRE' ? '☀️' : '🌙'} ${Number(s.extPrice).toFixed(2)} (${Number(s.extChangePct) > 0 ? '+' : ''}${Number(s.extChangePct).toFixed(2)}%)</span>` : ''}
                </div>
                <span class="sc-price mono">${priceStr}</span>
            </div>
            <div class="sc-mid">
                <span class="sc-name">${escapeHtml(s.name || '')}</span>
                <span class="sc-pct ${colorClass} mono">${pctStr}</span>
            </div>
            <div class="sc-bot">
                <span class="badge idx-sp">${s.exchange || 'US'}</span>
                <span class="chip ${isUp ? 'r' : 's'}">${chgStr}</span>
                <span class="badge" style="background:var(--border);color:var(--text-muted)">Vol ${volStr}</span>
            </div>
        </div>
    </div>`;
}

function formatVolume(vol) {
    if (vol >= 1e9) return (vol / 1e9).toFixed(1) + 'B';
    if (vol >= 1e6) return (vol / 1e6).toFixed(1) + 'M';
    if (vol >= 1e3) return (vol / 1e3).toFixed(0) + 'K';
    return vol.toString();
}





// Visitor Count (GPF1 logic)
document.addEventListener('DOMContentLoaded', () => {
    fetch('https://countapi.mileshilliard.com/api/v1/hit/alphazone_dashboard_sp500')
        .then(res => res.json())
        .then(data => {
            let count = data.value || 1; // Note: mileshilliard returns "value", not "count"
            let v = Math.floor(count / 10000) + 1;
            let rem = (count % 10000).toString().padStart(4, '0');
            const el = document.getElementById('global-visit-count');
            if (el) el.textContent = `v${v}.${rem}`;
        })
        .catch(err => {
            const el = document.getElementById('global-visit-count');
            if (el) el.textContent = `v1.0001`;
        });
});


// ==========================================
// CNN Fear & Greed Index
// ==========================================
async function updateFearGreedBadge() {
    try {
        const badge = document.getElementById('fg-badge');
        if (!badge) return;

        // 1. ดึงจาก CNN โดยตรงทางหน้าเว็บ (ตามที่คุณพี่ต้องการ)
        const resp = await fetch('https://production.dataviz.cnn.io/index/fearandgreed/graphdata', {
            headers: {
                'Origin': 'https://edition.cnn.com',
                'Referer': 'https://edition.cnn.com/'
            }
        });
        if (!resp.ok) throw new Error('Fetch failed');
        const raw = await resp.json();
        if (!raw.fear_and_greed) throw new Error('Bad structure');
        
        const ratingMap = {
            'extreme fear': 'Extreme Fear',
            'fear': 'Fear',
            'neutral': 'Neutral',
            'greed': 'Greed',
            'extreme greed': 'Extreme Greed'
        };
        const ratingLower = raw.fear_and_greed.rating.toLowerCase();

        const data = { 
            score: Math.round(raw.fear_and_greed.score), 
            rating: ratingMap[ratingLower] || raw.fear_and_greed.rating 
        };
        window.alphaZoneFearGreed = {
            score: data.score,
            rating: data.rating,
            vix: raw.market_volatility_vix ? Math.round(raw.market_volatility_vix.score) : null
        };

        let color = '#94a3b8'; 
        let emoji = '😐';
        
        if (data.score <= 24) { color = '#ef4444'; emoji = '😱'; } 
        else if (data.score <= 44) { color = '#f97316'; emoji = '😨'; } 
        else if (data.score <= 55) { color = '#94a3b8'; emoji = '😐'; } 
        else if (data.score <= 75) { color = '#22c55e'; emoji = '😏'; } 
        else { color = '#eab308'; emoji = '🤑'; } 

        document.getElementById('fg-emoji').textContent = emoji;
        document.getElementById('fg-label').textContent = data.rating;
        document.getElementById('fg-score').textContent = data.score;
        
        badge.style.setProperty('--fg-color', color);
        badge.style.display = 'flex';
        badge.style.opacity = '1';
        badge.style.transform = 'translateY(0)';
        
        // 2. ซิงค์ส่งให้หลังบ้าน (ลบ mode: no-cors ออกแล้ว เพื่อให้ GAS รับค่าได้จริง)
        if (API_URL) {
            const payload = {
                score: data.score,
                rating: data.rating,
                vix: raw.market_volatility_vix ? Math.round(raw.market_volatility_vix.score) : null
            };
            fetch(API_URL + '?action=syncFearGreed&payload=' + encodeURIComponent(JSON.stringify(payload)))
                .catch(e => console.log('FG sync error:', e));
        }
        
    } catch (err) {
        console.error('Fear & Greed Error:', err);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // ดึงครั้งแรกเมื่อเปิดเว็บ
    updateFearGreedBadge();
    // ดึงใหม่ทุก 1 ชั่วโมง (3,600,000 ms) ตามที่ตั้งไว้เพื่อประหยัดโควตา
    setInterval(updateFearGreedBadge, 3600000);
});

// ==========================================
// Sync & UI Interactions
// ==========================================
let _syncTimer = null;
function syncFavWatchToBackend() {
    clearTimeout(_syncTimer);
    _syncTimer = setTimeout(() => {
        let watchLinesPayload = encodeURIComponent(JSON.stringify(globalWatchLines || {}));
        fetch(`${API_URL}?action=syncFavWatch&favs=${favorites.map(encodeURIComponent).join(',')}&watch=${watchlist.map(encodeURIComponent).join(',')}&watchLines=${watchLinesPayload}`)
            .then(res => { if (!res.ok) throw new Error('Sync API Error: ' + res.status); return res.json(); })
            .catch(e => console.log('Sync failed', e));
    }, 1000);
}

// Global Event Delegation for Stock List
elStockList.addEventListener('click', (e) => {
    const card = e.target.closest('.stock-card');
    if (!card) return;
    const symbol = card.dataset.symbol;
    if (!symbol) return;
    
    if (e.target.closest('.sc-watch')) {
        e.stopPropagation();
        toggleWatchlist(symbol);
        if (!currentMover) renderList(); // Re-render if in normal list to update sort/filter
        return;
    }
    if (e.target.closest('.sc-star')) {
        e.stopPropagation();
        toggleFavorite(symbol);
        if (!currentMover) renderList(); // Re-render if in normal list to update sort/filter
        return;
    }
    
    document.querySelectorAll('.stock-card').forEach(c => c.classList.remove('active'));
    card.classList.add('active');
    openDetail(symbol);
});

// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(reg => {
      console.log('ServiceWorker registration successful');
    }).catch(err => {
      console.log('ServiceWorker registration failed: ', err);
    });
  });
}


// ================== PRICE ALERT SYSTEM (Watch Lines) ==================
function getCustomWatchLines() {
    if (!currentSymbol) return [];
    if (!globalWatchLines) globalWatchLines = {};
    if (!globalWatchLines[currentSymbol]) {
        globalWatchLines[currentSymbol] = [];
    }
    return globalWatchLines[currentSymbol];
}

function saveCustomWatchLines(lines) {
    if (!currentSymbol) return;
    globalWatchLines[currentSymbol] = lines;
    // Trigger sync to backend
    syncFavWatchToBackend();
    renderCustomWatchLinesUI();
}

function addCustomWatchLineByPrice(p) {
    if (!currentSymbol) return;
    let lines = getCustomWatchLines();
    p = Number(p.toFixed(2));
    if (!lines.includes(p)) {
        lines.push(p);
        lines.sort((a,b) => b - a);
        saveCustomWatchLines(lines);
        if(typeof addChartAnnotations === 'function') addChartAnnotations();
    }
}

function removeCustomWatchLine(p) {
    if (!currentSymbol) return;
    let lines = getCustomWatchLines();
    lines = lines.filter(x => x !== p);
    saveCustomWatchLines(lines);
    if(typeof addChartAnnotations === 'function') addChartAnnotations();
}

function renderCustomWatchLinesUI() {
    let container = document.getElementById('watch-lines-list') || document.querySelector('.chart-footer') || document.querySelector('.canvas-container');
    if (!container) return;
    
    let wlBox = document.getElementById('custom-watchlines-box');
    if (!wlBox) {
        wlBox = document.createElement('div');
        wlBox.id = 'custom-watchlines-box';
        wlBox.style.cssText = 'display: flex; flex-wrap: wrap; gap: 6px; align-items: center; justify-content: flex-start; background: transparent;';
        container.appendChild(wlBox);
    }

    const lines = getCustomWatchLines();
    wlBox.innerHTML = '';
    
    if (lines.length === 0) {
        wlBox.style.display = 'none';
        return;
    }
    
    wlBox.style.display = 'flex';
    
    const refPrice = (currentLevelsData && currentLevelsData.price) || (latestChartArgs && latestChartArgs.livePrice) || null;
    lines.forEach(p => {
        const pill = document.createElement('div');
        pill.className = 'wl-pill';
        pill.style.cssText = 'background: rgba(139, 92, 246, 0.15); color: #c4b5fd; border: 1px solid rgba(139, 92, 246, 0.4); padding: 3px 7px; margin: 0; border-radius: 6px; font-size: 11px; font-family: "IBM Plex Mono", monospace; display: inline-flex; align-items: center; gap: 4px; cursor: pointer; transition: 0.2s; line-height: 1.2;';
        let pctTxt = '';
        if (refPrice && refPrice > 0) {
            const pct = ((p - refPrice) / refPrice) * 100;
            pctTxt = ` <span style="opacity:0.8;font-size:10px;">(${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%)</span>`;
        }
        pill.innerHTML = `<span style="color: #a78bfa;">📌</span> $${p.toFixed(2)}${pctTxt} <span style="color:#ef4444;font-weight:700;margin-left:2px;">✕</span>`;
        pill.title = 'คลิกเพื่อลบหมุดนี้';
        pill.onclick = () => removeCustomWatchLine(p);
        
        pill.onmouseover = () => pill.style.background = 'rgba(139, 92, 246, 0.3)';
        pill.onmouseout = () => pill.style.background = 'rgba(139, 92, 246, 0.15)';
        
        wlBox.appendChild(pill);
    });
    
    // เปลี่ยนปุ่ม Reset เป็นข้อความเล็กๆ ไม่แย่งซีนปุ่ม Reset Zoom
    if (lines.length > 1) {
        const btnClearAll = document.createElement('div');
        btnClearAll.style.cssText = 'margin-left: auto; color: #ef4444; font-size: 0.75rem; cursor: pointer; text-decoration: underline; padding: 2px 6px; opacity: 0.8;';
        btnClearAll.innerHTML = 'ล้างทั้งหมด';
        btnClearAll.onclick = () => {
            if(confirm('ต้องการลบปักหมุดทั้งหมดของ ' + currentSymbol + ' ใช่หรือไม่?')) {
                saveCustomWatchLines([]);
                if(typeof addChartAnnotations === 'function') addChartAnnotations();
            }
        };
        wlBox.appendChild(btnClearAll);
    }
}

// Hook into openDetail to render the UI when switching stocks
const originalOpenDetail = typeof openDetail === 'function' ? openDetail : null;
if (originalOpenDetail) {
    window.openDetail = async function(symbol) {
        await originalOpenDetail(symbol);
        setTimeout(renderCustomWatchLinesUI, 500);
    };
}


// ================== CROSSHAIR HUD & PRECISION PIN INTERACTIONS ==================
let isPinMode = false;
let pinPreviewY = null;

function resetChartHudToLatest(points, emaData) {
    const hud = document.getElementById('chart-hud-readout');
    if (!hud) return;
    if (!points || !points.length) {
        hud.innerHTML = '<span class="hud-hint">แตะหรือเลื่อนบนกราฟเพื่อดูราคา</span>';
        return;
    }
    const lastIdx = points.length - 1;
    const lastPt = points[lastIdx];
    let emaHtml = '';
    if (emaData && emaData[0] && Array.isArray(emaData[0].series)) {
        const ev = emaData[0].series[lastIdx];
        if (ev != null) emaHtml = `<span class="hud-ema">EMA${emaData[0].period}: $${Number(ev).toFixed(2)}</span>`;
    }
    hud.innerHTML = `<span class="hud-date">${escapeHtml(lastPt.label)}</span><span class="hud-price">$${Number(lastPt.close).toFixed(2)}</span>${emaHtml}`;
}

function updateChartHudFromTooltip(context) {
    const hud = document.getElementById('chart-hud-readout');
    if (!hud) return;
    const { tooltip } = context;
    if (!tooltip || tooltip.opacity === 0 || !tooltip.dataPoints || !tooltip.dataPoints.length) {
        if (latestChartArgs) resetChartHudToLatest(latestChartArgs.points, latestChartArgs.emaData);
        return;
    }
    const dateLabel = tooltip.title && tooltip.title[0] ? tooltip.title[0] : '';
    let priceVal = null;
    let emaTxt = '';
    tooltip.dataPoints.forEach(dp => {
        if (dp.datasetIndex === 0) priceVal = dp.parsed.y;
        else if (dp.parsed && dp.parsed.y != null) {
            emaTxt += ` <span class="hud-ema">${escapeHtml(dp.dataset.label)}: $${dp.parsed.y.toFixed(2)}</span>`;
        }
    });
    if (priceVal == null) return;
    hud.innerHTML = `<span class="hud-date">${escapeHtml(dateLabel)}</span><span class="hud-price">$${priceVal.toFixed(2)}</span>${emaTxt}`;
}

window.togglePinMode = function(forceState) {
    isPinMode = typeof forceState === 'boolean' ? forceState : !isPinMode;
    pinPreviewY = null;
    const btn = document.getElementById('btn-pin-mode');
    const container = document.querySelector('.canvas-container');
    const hud = document.getElementById('chart-hud-readout');
    if (btn) btn.classList.toggle('active', isPinMode);
    if (container) container.classList.toggle('pin-mode-active', isPinMode);
    if (hud && isPinMode) {
        hud.innerHTML = '<span style="color:#c4b5fd;">📌 แตะ/คลิกบนกราฟเพื่อปักหมุดระดับราคาที่ต้องการ</span>';
    } else if (latestChartArgs) {
        resetChartHudToLatest(latestChartArgs.points, latestChartArgs.emaData);
    }
    if (priceChart) priceChart.draw();
};

window.toggleManualPinBar = function(forceOpen) {
    const bar = document.getElementById('pin-input-bar');
    const btn = document.getElementById('btn-pin-manual');
    const input = document.getElementById('pin-price-input');
    if (!bar) return;
    const open = typeof forceOpen === 'boolean' ? forceOpen : bar.classList.contains('hidden');
    bar.classList.toggle('hidden', !open);
    if (btn) btn.classList.toggle('active', open);
    if (open && input) {
        const curPrice = (currentLevelsData && currentLevelsData.price) || (latestChartArgs && latestChartArgs.livePrice);
        if (!input.value && curPrice) input.value = Number(curPrice).toFixed(2);
        input.focus();
        input.select();
    }
};

window.submitManualPin = function() {
    const input = document.getElementById('pin-price-input');
    if (!input) return;
    const val = parseFloat(input.value);
    if (!Number.isFinite(val) || val <= 0) {
        alert('กรุณากรอกราคาที่ถูกต้อง (มากกว่า 0)');
        return;
    }
    addCustomWatchLineByPrice(val);
    input.value = '';
    toggleManualPinBar(false);
};

window.pinCurrentLivePrice = function() {
    const curPrice = (currentLevelsData && currentLevelsData.price) || (latestChartArgs && latestChartArgs.livePrice);
    if (curPrice && Number.isFinite(Number(curPrice))) {
        addCustomWatchLineByPrice(Number(curPrice));
        toggleManualPinBar(false);
    }
};

function getPriceFromEvent(e) {
    if (!priceChart) return null;
    const canvasPosition = Chart.helpers.getRelativePosition(e, priceChart);
    const dataY = priceChart.scales.y.getValueForPixel(canvasPosition.y);
    return { price: dataY, y: canvasPosition.y };
}

function chartDoubleClickHandler(e) {
    const res = getPriceFromEvent(e);
    if (res && res.price > 0) addCustomWatchLineByPrice(res.price);
}

function chartPointerMoveHandler(e) {
    if (!isPinMode || !priceChart) return;
    const src = (e.touches && e.touches[0]) ? e.touches[0] : e;
    const res = getPriceFromEvent(src);
    if (res) {
        pinPreviewY = res.y;
        priceChart.draw();
    }
}

function chartClickPinHandler(e) {
    if (!isPinMode || !priceChart) return;
    const res = getPriceFromEvent(e);
    if (res && res.price > 0) {
        addCustomWatchLineByPrice(res.price);
        togglePinMode(false);
    }
}

function chartTouchEndPinHandler(e) {
    if (!isPinMode || !priceChart) return;
    const touch = e.changedTouches && e.changedTouches[0];
    if (!touch) return;
    const res = getPriceFromEvent(touch);
    if (res && res.price > 0) {
        e.preventDefault();
        addCustomWatchLineByPrice(res.price);
        togglePinMode(false);
    }
}

function chartMouseLeaveHandler() {
    pinPreviewY = null;
    if (latestChartArgs) resetChartHudToLatest(latestChartArgs.points, latestChartArgs.emaData);
    if (priceChart) priceChart.draw();
}

function initChartInteractions() {
    const canvas = document.getElementById('priceChart');
    if (!canvas) return;

    if (canvas._hammer) {
        canvas._hammer.destroy();
        canvas._hammer = null;
    }

    canvas.removeEventListener('dblclick', chartDoubleClickHandler);
    canvas.removeEventListener('mousemove', chartPointerMoveHandler);
    canvas.removeEventListener('touchmove', chartPointerMoveHandler);
    canvas.removeEventListener('click', chartClickPinHandler);
    canvas.removeEventListener('touchend', chartTouchEndPinHandler);
    canvas.removeEventListener('mouseleave', chartMouseLeaveHandler);

    canvas.addEventListener('dblclick', chartDoubleClickHandler);
    canvas.addEventListener('mousemove', chartPointerMoveHandler);
    canvas.addEventListener('touchmove', chartPointerMoveHandler, { passive: true });
    canvas.addEventListener('click', chartClickPinHandler);
    canvas.addEventListener('touchend', chartTouchEndPinHandler);
    canvas.addEventListener('mouseleave', chartMouseLeaveHandler);

    const pinInput = document.getElementById('pin-price-input');
    if (pinInput && !pinInput.dataset.boundEnter) {
        pinInput.dataset.boundEnter = '1';
        pinInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                submitManualPin();
            }
        });
    }
}

// Add Keyboard Shortcut (Alt + H)
document.addEventListener('keydown', function(e) {
    if (e.altKey && e.key.toLowerCase() === 'h') {
        if (!priceChart) return;
        // ปักหมุดที่ราคาสุดท้าย (Live Price)
        const lastIdx = priceChart.data.datasets[0].data.length - 1;
        if (lastIdx >= 0) {
            const currentPrice = priceChart.data.datasets[0].data[lastIdx];
            if (currentPrice) addCustomWatchLineByPrice(currentPrice);
        }
    }
});
// =============================================================



// ==========================================
// Async Quotes Polling (Pre/Post Market & Market Cap)
// ==========================================
let quotePollTimer = null;
function startQuotePolling() {
    if (quotePollTimer) clearInterval(quotePollTimer);
    
    // Call once immediately after a short delay to load pre/post market prices
    setTimeout(() => {
        if (allStocks && allStocks.length > 0) {
            fetchAsyncQuotes();
        }
    }, 2000);
    
    quotePollTimer = setInterval(() => {
        // Only fetch if tab is active to save quota
        if (document.visibilityState === 'visible' && allStocks && allStocks.length > 0) {
            fetchAsyncQuotes();
        }
    }, 45000); // 45 seconds
}
document.addEventListener('DOMContentLoaded', startQuotePolling);


// ==========================================
// Dual Mode Chart (AlphaZone, TradingView Pro & Company News)
// ==========================================
function switchChartMode(mode) {
    currentChartMode = mode;

    const btnAZ = document.getElementById('tab-btn-alphazone');
    const btnTV = document.getElementById('tab-btn-tradingview');
    const btnInfo = document.getElementById('tab-btn-info');
    const viewAZ = document.getElementById('view-alphazone-chart');
    const viewTV = document.getElementById('view-tradingview-chart');
    const viewInfo = document.getElementById('view-company-info');
    const tvHint = document.getElementById('chart-tv-hint');

    if (!btnAZ || !btnTV || !viewAZ || !viewTV) return;

    btnAZ.classList.toggle('active', mode === 'alphazone');
    btnTV.classList.toggle('active', mode === 'tradingview');
    if (btnInfo) btnInfo.classList.toggle('active', mode === 'info');

    viewAZ.style.display = (mode === 'alphazone') ? 'block' : 'none';
    viewTV.style.display = (mode === 'tradingview') ? 'block' : 'none';
    if (viewInfo) viewInfo.style.display = (mode === 'info') ? 'block' : 'none';

    if (tvHint) tvHint.style.display = (mode === 'tradingview') ? 'block' : 'none';

    if (mode === 'alphazone') {
        if (priceChart) priceChart.resize();
    } else if (mode === 'tradingview') {
        renderTradingViewWidget(currentSymbol);
    } else if (mode === 'info') {
        renderCompanyNewsTab();
    }
}

function loadTradingViewScript() {
    return new Promise((resolve, reject) => {
        if (typeof TradingView !== 'undefined') {
            resolve();
            return;
        }
        if (isTradingViewScriptLoaded) {
            const checkInterval = setInterval(() => {
                if (typeof TradingView !== 'undefined') {
                    clearInterval(checkInterval);
                    resolve();
                }
            }, 50);
            return;
        }
        isTradingViewScriptLoaded = true;
        const script = document.createElement('script');
        script.src = 'https://s3.tradingview.com/tv.js';
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load TradingView script'));
        document.head.appendChild(script);
    });
}

async function renderTradingViewWidget(symbol) {
    if (!symbol) return;
    const target = document.getElementById('tradingview_widget_target');
    const loader = document.getElementById('tv-chart-loading');
    if (!target) return;

    if (currentTradingViewSymbol === symbol && target.innerHTML.trim().length > 0) {
        if (loader) loader.style.display = 'none';
        target.style.display = 'block';
        return;
    }

    if (loader) {
        loader.style.display = 'flex';
        loader.innerHTML = '<div class="spinner" style="width:20px; height:20px;"></div> กำลังเชื่อมต่อ TradingView...';
    }
    target.style.display = 'none';
    target.innerHTML = '';

    try {
        await loadTradingViewScript();

        const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
        
        new TradingView.widget({
            "autosize": true,
            "symbol": symbol,
            "interval": "D",
            "timezone": "Asia/Bangkok",
            "theme": isDark ? "dark" : "light",
            "style": "1",
            "locale": "th_TH",
            "toolbar_bg": isDark ? "#121212" : "#f1f3f6",
            "enable_publishing": false,
            "allow_symbol_change": true,
            "hide_top_toolbar": false,
            "hide_legend": false,
            "save_image": false,
            "container_id": "tradingview_widget_target"
        });

        currentTradingViewSymbol = symbol;
        if (loader) loader.style.display = 'none';
        target.style.display = 'block';
    } catch (e) {
        console.warn('TradingView render error:', e);
        if (loader) loader.innerHTML = '<span style="color:var(--red);"><i class="ri-error-warning-line"></i> ไม่สามารถเชื่อมต่อ TradingView ได้ในขณะนี้</span>';
    }
}

// 📰 Render Dedicated Company News Tab (No duplicates)
async function renderCompanyNewsTab() {
    const content = document.getElementById('company-info-content');
    if (!content) return;
    
    const stock = allStocks.find(s => s.symbol === currentSymbol);
    if (!stock) {
        content.innerHTML = '<p class="help-text" style="padding:20px; text-align:center;">กรุณาเลือกหุ้นเพื่อดูข่าวสาร</p>';
        return;
    }

    const symbol = stock.symbol;
    const name = stock.name || symbol;

    const yahooNewsUrl = 'https://finance.yahoo.com/quote/' + encodeURIComponent(symbol) + '/news/';
    const translateYahooUrl = 'https://finance-yahoo-com.translate.goog/quote/' + encodeURIComponent(symbol) + '/news/?_x_tr_sl=auto&_x_tr_tl=th';
    const cnbcUrl = 'https://www.cnbc.com/quotes/' + encodeURIComponent(symbol) + '?tab=news';
    const googleFinUrl = 'https://www.google.com/finance/quote/' + encodeURIComponent(symbol) + ':NASDAQ';

    content.innerHTML = 
        '<div class="c-info-section" style="margin-bottom: 10px;">' +
            '<div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:10px;">' +
                '<div style="display:flex; align-items:center; gap:8px;">' +
                    '<span style="font-size:16px; font-weight:700; color:var(--text-main);">' + escapeHtml(symbol) + '</span>' +
                    '<span style="font-size:13px; color:var(--text-muted);">' + escapeHtml(name) + '</span>' +
                '</div>' +
                '<span class="badge idx-sp" style="font-size:11px;">' + escapeHtml(stock.sector || 'US Stock') + '</span>' +
            '</div>' +
            '<div style="font-size:11px; color:var(--text-muted); margin-bottom:8px;">ทางลัดอ่านข่าวสดทันที (Direct Portals):</div>' +
            '<div class="c-portal-links">' +
                '<a href="' + translateYahooUrl + '" target="_blank" rel="noopener noreferrer" class="c-portal-btn" style="background:rgba(56, 189, 248, 0.15); border-color:var(--accent); color:var(--accent); font-weight:600;">' +
                    '<i class="ri-translate-2"></i> อ่านข่าวแปลไทย (Yahoo)' +
                '</a>' +
                '<a href="' + yahooNewsUrl + '" target="_blank" rel="noopener noreferrer" class="c-portal-btn">' +
                    '<i class="ri-external-link-line"></i> Yahoo Finance' +
                '</a>' +
                '<a href="' + cnbcUrl + '" target="_blank" rel="noopener noreferrer" class="c-portal-btn">' +
                    '<i class="ri-external-link-line"></i> CNBC News' +
                '</a>' +
                '<a href="' + googleFinUrl + '" target="_blank" rel="noopener noreferrer" class="c-portal-btn">' +
                    '<i class="ri-external-link-line"></i> Google Finance' +
                '</a>' +
            '</div>' +
        '</div>' +

        '<div class="c-info-section">' +
            '<div class="c-info-title">' +
                '<i class="ri-newspaper-line"></i> ฟีดข่าวด่วนล่าสุด (' + escapeHtml(symbol) + ')' +
            '</div>' +
            '<div id="c-live-news-box">' +
                '<div style="display:flex; align-items:center; gap:6px; color:var(--text-muted); font-size:12px; padding: 15px 0;">' +
                    '<div class="spinner-small"></div> กำลังดึงข่าวสดล่าสุด...' +
                '</div>' +
            '</div>' +
        '</div>';

    fetchLiveCompanyNewsForTab(symbol);
}

async function fetchLiveCompanyNewsForTab(symbol) {
    const newsBox = document.getElementById('c-live-news-box');
    if (!newsBox) return;

    const finnhubKey = safeGet('FINNHUB_API_KEY', '');
    if (!finnhubKey) {
        newsBox.innerHTML = 
            '<div style="background:rgba(255,255,255,0.02); border:1px dashed var(--border-color); border-radius:10px; padding:16px; text-align:center; margin:8px 0;">' +
                '<div style="font-size:24px; margin-bottom:6px;">📰</div>' +
                '<div style="font-size:13px; font-weight:600; color:var(--text-main); margin-bottom:4px;">อ่านข่าวสดได้ทันทีผ่านปุ่มทางลัดด้านบน</div>' +
                '<div style="font-size:12px; color:var(--text-muted); max-width:420px; margin:0 auto 10px auto; line-height:1.5;">' +
                    'คลิกที่ปุ่ม <strong style="color:var(--accent);">"อ่านข่าวแปลไทย (Yahoo)"</strong> ด้านบน เพื่ออ่านข่าวสดของ ' + escapeHtml(symbol) + ' ในเวอร์ชันภาษาไทยได้ทันทีโดยไม่ต้องใช้ API Key ครับ' +
                '</div>' +
                '<div style="font-size:11px; color:#888;">(หากต้องการให้ดึงพาดหัวข่าวสดมาเรียงในกล่องนี้อัตโนมัติ สามารถใส่ Finnhub API Key ฟรีได้ที่ปุ่มเฟือง ⚙️ ด้านบนขวา)</div>' +
            '</div>';
        return;
    }

    try {
        const toDate = new Date().toISOString().split('T')[0];
        const fromDateObj = new Date();
        fromDateObj.setDate(fromDateObj.getDate() - 14);
        const fromDate = fromDateObj.toISOString().split('T')[0];

        const url = 'https://finnhub.io/api/v1/company-news?symbol=' + encodeURIComponent(symbol) + '&from=' + fromDate + '&to=' + toDate + '&token=' + encodeURIComponent(finnhubKey);
        const res = await fetch(url);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();

        if (Array.isArray(data) && data.length > 0) {
            const topNews = data.slice(0, 6);
            let html = '';
            topNews.forEach(item => {
                const dateStr = item.datetime ? new Date(item.datetime * 1000).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
                html += 
                    '<div class="c-news-item">' +
                        '<a href="' + (item.url || '#') + '" target="_blank" rel="noopener noreferrer" class="c-news-headline">' +
                            escapeHtml(item.headline) +
                        '</a>' +
                        (item.summary ? ('<div style="font-size:12px; color:var(--text-muted); margin-bottom:5px; line-height:1.45;">' + escapeHtml(item.summary.slice(0, 180)) + '...</div>') : '') +
                        '<div class="c-news-meta">' +
                            '<span style="color:var(--accent); font-weight:600;">' + escapeHtml(item.source || 'Financial Media') + '</span>' +
                            '<span>•</span>' +
                            '<span>' + dateStr + '</span>' +
                        '</div>' +
                    '</div>';
            });
            newsBox.innerHTML = html;
        } else {
            newsBox.innerHTML = '<div style="font-size:12px; color:var(--text-muted); padding:12px 0; text-align:center;">ไม่พบข่าวด่วนพิเศษในรอบ 14 วันที่ผ่านมา สามารถคลิกปุ่มอ่านข่าวสดจาก Yahoo หรือ CNBC ด้านบนได้ครับ</div>';
        }
    } catch (e) {
        console.warn('Finnhub news in tab error:', e);
        newsBox.innerHTML = '<div style="font-size:12px; color:var(--text-muted); padding:10px 0; text-align:center;">ไม่สามารถดึงข่าวอัตโนมัติได้ สามารถกดอ่านผ่านปุ่มทางลัดด้านบนได้ทันทีครับ</div>';
    }
}


// ==========================================
// Pro Workspace Layout & Focus Controls
// ==========================================
function resizeActiveChartSmoothly() {
    requestAnimationFrame(() => {
        if (typeof priceChart !== 'undefined' && priceChart) priceChart.resize();
    });
    setTimeout(() => {
        if (typeof priceChart !== 'undefined' && priceChart) {
            priceChart.resize();
        }
    }, 310);
}

function initWorkspaceControls() {
    const heroExpanded = safeGet('AZ_HERO_EXPANDED', '0') === '1';
    applyHeroCollapsedState(!heroExpanded);

    const canvasContainer = document.querySelector('.canvas-container');
    if (canvasContainer && typeof ResizeObserver !== 'undefined') {
        const ro = new ResizeObserver(() => {
            if (typeof priceChart !== 'undefined' && priceChart) {
                priceChart.resize();
            }
        });
        ro.observe(canvasContainer);
    }

    document.addEventListener('keydown', (e) => {
        const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
        if (tag === 'input' || tag === 'textarea' || tag === 'select' || (e.target && e.target.isContentEditable)) return;

        if (e.key === 'Escape' && document.body.classList.contains('chart-focus-mode')) {
            toggleChartFocusMode(false);
        } else if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'f') {
            if (elDetailContent && !elDetailContent.classList.contains('hidden')) {
                e.preventDefault();
                toggleChartFocusMode();
            }
        }
    });
}

window.toggleLeftPanel = function(forceCollapsed) {
    const panel = document.getElementById('list-panel');
    const icon = document.getElementById('panel-toggle-icon');
    if (!panel) return;
    const shouldCollapse = typeof forceCollapsed === 'boolean'
        ? forceCollapsed
        : !panel.classList.contains('collapsed');

    panel.classList.toggle('collapsed', shouldCollapse);
    if (icon) {
        icon.className = shouldCollapse ? 'ri-arrow-right-s-line' : 'ri-arrow-left-s-line';
    }
    resizeActiveChartSmoothly();
};

function applyHeroCollapsedState(collapsed) {
    const hero = document.getElementById('hero-card');
    const bar = document.getElementById('compact-telemetry-bar');
    const btn = document.getElementById('btn-toggle-hero');
    const lbl = document.getElementById('lbl-toggle-hero');
    const icon = document.getElementById('icon-toggle-hero');

    if (hero) hero.classList.toggle('is-collapsed', collapsed);
    if (bar) bar.classList.toggle('hidden-by-hero', !collapsed);
    if (btn) btn.classList.toggle('active', !collapsed);
    if (lbl) lbl.textContent = collapsed ? 'ข้อมูลครบชุด' : 'ย่อสรุป';
    if (icon) icon.className = collapsed ? 'ri-arrow-down-s-line' : 'ri-arrow-up-s-line';
}

window.toggleHeroCard = function(forceExpand) {
    const hero = document.getElementById('hero-card');
    if (!hero) return;
    const expand = typeof forceExpand === 'boolean' ? forceExpand : hero.classList.contains('is-collapsed');
    applyHeroCollapsedState(!expand);
    safeSet('AZ_HERO_EXPANDED', expand ? '1' : '0');
    resizeActiveChartSmoothly();
};

window.toggleChartFocusMode = function(forceFocus) {
    const enable = typeof forceFocus === 'boolean' ? forceFocus : !document.body.classList.contains('chart-focus-mode');
    document.body.classList.toggle('chart-focus-mode', enable);

    const btn = document.getElementById('btn-focus-chart');
    const lbl = document.getElementById('lbl-focus-chart');
    const icon = document.getElementById('icon-focus-chart');
    if (btn) btn.classList.toggle('active', enable);
    if (lbl) lbl.textContent = enable ? 'ออกจากเต็มจอ' : 'ขยายกราฟ';
    if (icon) icon.className = enable ? 'ri-fullscreen-exit-line' : 'ri-fullscreen-line';

    resizeActiveChartSmoothly();
};

function syncCompactTelemetry() {
    const priceEl = document.getElementById('d-price');
    const changeEl = document.getElementById('d-change');
    const extEl = document.getElementById('d-ext-price');
    const rsiEl = document.getElementById('d-rsi');
    const s1El = document.getElementById('d-s1');
    const r1El = document.getElementById('d-r1');

    const ctPrice = document.getElementById('ct-price');
    const ctChange = document.getElementById('ct-change');
    const ctExt = document.getElementById('ct-ext');
    const ctTrend = document.getElementById('ct-trend');
    const ctEma = document.getElementById('ct-ema');
    const ctS1 = document.getElementById('ct-s1');
    const ctR1 = document.getElementById('ct-r1');
    const ctTarget = document.getElementById('ct-target');

    if (ctPrice && priceEl) ctPrice.textContent = priceEl.textContent || '—';
    if (ctChange && changeEl) {
        ctChange.textContent = changeEl.textContent || '—';
        ctChange.className = 'ct-change mono' + (changeEl.classList.contains('up') ? ' up' : changeEl.classList.contains('down') ? ' down' : '');
    }
    if (ctExt && extEl) {
        if (extEl.style.display !== 'none' && extEl.textContent) {
            ctExt.style.display = 'inline-flex';
            ctExt.textContent = extEl.textContent
                .replace('Pre-Market:', 'Pre:')
                .replace('Post-Market:', 'Post:');
            ctExt.className = 'ct-ext mono' + (extEl.classList.contains('up') ? ' up' : extEl.classList.contains('down') ? ' down' : '');
        } else {
            ctExt.style.display = 'none';
        }
    }
    if (ctS1 && s1El) {
        ctS1.innerHTML = 'S1 ' + (s1El.innerHTML || '—');
    }
    if (ctR1 && r1El) {
        ctR1.innerHTML = 'R1 ' + (r1El.innerHTML || '—');
    }

    if (ctTrend) {
        const badge = document.querySelector('#trend-badge-wrap .trend-badge');
        if (badge) {
            const shortTrend = badge.textContent.trim().replace(/\s*\([^)]*\)\s*/g, '');
            ctTrend.textContent = shortTrend;
            const isUp = badge.classList.contains('up') || badge.classList.contains('strong-up');
            const isDown = badge.classList.contains('down') || badge.classList.contains('strong-down');
            ctTrend.className = 'ct-chip ' + (isUp ? 'up' : isDown ? 'down' : 'sideways');
        } else {
            ctTrend.textContent = 'กำลังโหลด...';
            ctTrend.className = 'ct-chip';
        }
    }

    if (ctEma) {
        if (currentLevelsData && currentLevelsData.ema && currentLevelsData.ema.daily) {
            const e = currentLevelsData.ema;
            ctEma.style.display = 'inline-flex';
            ctEma.textContent = 'EMA200D $' + e.daily + ' (' + e.pctD + '%)';
            ctEma.className = 'ct-chip mono ' + (e.position === 'above' ? 'up' : 'down');
        } else {
            ctEma.style.display = 'none';
        }
    }

    if (ctTarget) {
        const f = currentLevelsData && currentLevelsData.summary && currentLevelsData.summary.fundamentals;
        if (f && f.targetMeanPrice && f.targetMeanPrice !== '-') {
            const sign = f.upsideRaw > 0 ? '+' : '';
            ctTarget.style.display = 'inline-flex';
            ctTarget.textContent = 'Target $' + f.targetMeanPrice + ' (' + sign + f.upside + ')';
            ctTarget.className = 'ct-chip mono ' + (f.upsideRaw >= 0 ? 'up' : 'down');
        } else {
            ctTarget.style.display = 'none';
        }
    }
}

// Bridge helpers for AlphaZone AI Coach (Dynamic Context Injection & Chart Pinning)
window.getAlphaZoneContextData = function() {
    return {
        currentSymbol: currentSymbol || '',
        currentRange: currentRange || '1D',
        allStocks: Array.isArray(allStocks) ? allStocks : [],
        currentLevelsData: currentLevelsData || window.currentLevelsData || null,
        latestChartArgs: latestChartArgs || null,
        customWatchLines: (typeof getCustomWatchLines === 'function') ? getCustomWatchLines() : [],
        favorites: Array.isArray(favorites) ? favorites : [],
        watchlist: Array.isArray(watchlist) ? watchlist : [],
        fearGreed: window.alphaZoneFearGreed || null
    };
};

window.pinPriceFromAI = function(price) {
    const num = Number(price);
    if (!currentSymbol || !Number.isFinite(num) || num <= 0) return false;
    if (typeof addCustomWatchLineByPrice === 'function') {
        addCustomWatchLineByPrice(num);
        if (typeof renderCustomWatchLinesUI === 'function') renderCustomWatchLinesUI();
        return true;
    }
    return false;
};
