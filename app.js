// --- Constants & State ---
let API_URL = localStorage.getItem('SP_API_URL') || 'https://script.google.com/macros/s/AKfycbzKXQWPFCWqNG0MkZlvl4x4uhxYy9F2ppjXGfb523Ek3cgAhiYOpvNzDXlfvZYaP9IF/exec';
let allStocks = [];
let favorites = JSON.parse(localStorage.getItem('SP_FAVS') || '[]');
let watchlist = JSON.parse(localStorage.getItem('SP_WATCH') || '[]');
let currentSymbol = '';
let currentRange = '1M';
let currentSector = 'ทั้งหมด';
let currentIndex = 'all';
let priceChart = null;
let currentLevelsData = null;

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
    setupEventListeners();
    
    if (!API_URL) {
        showConfigModal();
    } else {
        fetchStocks();
    }
});

// --- Theme Management ---
function initTheme() {
    const savedTheme = localStorage.getItem('SP_THEME') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    
    document.getElementById('theme-toggle').addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('SP_THEME', next);
        if (priceChart) priceChart.update(); // Update chart colors
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
            localStorage.setItem('SP_API_URL', url);
            modal.classList.remove('active');
            fetchStocks();
        }
    });
}

// --- Event Listeners ---
let currentMover = null; // 'day_gainers' | 'day_losers' | 'most_actives' | null
let moverCache = {};

function setupEventListeners() {
    // Search
    elSearchInput.addEventListener('input', () => {
        if (currentMover) return; // disable search in mover mode
        renderList();
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
    });

    // Reset Zoom
    document.getElementById('btn-reset-zoom').addEventListener('click', () => {
        if(priceChart) priceChart.resetZoom();
    });

    // Sector Select
    document.getElementById('sector-select').addEventListener('change', (e) => {
        currentSector = e.target.value;
        renderList();
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
async function fetchStocks() {
    try {
        const res = await fetch(`${API_URL}?action=getStockList`);
        const data = await res.json();
        
        if (data.success) {
            allStocks = data.data || [];
            buildSectorTabs();
            renderList();
        } else {
            showErrorList(data.error || 'Failed to load data');
        }
    } catch (err) {
        showErrorList('Network Error. Please check API URL. ' + err.message);
        if(!API_URL) showConfigModal();
    }
}

function showErrorList(msg) {
    elStockList.innerHTML = `<div class="loader-container"><i class="ri-error-warning-line" style="font-size:32px;color:var(--red);"></i><p>${msg}</p></div>`;
}

// --- List Rendering ---
function buildSectorTabs() {
    const filtered = allStocks.filter(s => {
        if (currentIndex === 'all') return true;
        const angels = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA'];
          if (currentIndex === '7MAG') return angels.includes(s.symbol);
          if (currentIndex === 'S&P500') return s.index === 'S&P500' || s.index === 'Both';
          if (currentIndex === 'NASDAQ100') return s.index === 'NASDAQ100' || s.index === 'Both';
          return s.index === currentIndex;
    });
    const sectors = ['ทั้งหมด', ...new Set(filtered.map(s => s.sector).filter(Boolean))];
    
    const select = document.getElementById('sector-select');
    if (!select) return;
    
    select.innerHTML = sectors.map(s => 
        `<option value="${s}" ${s === currentSector ? 'selected' : ''}>
            ${s === 'ทั้งหมด' ? 'All Sectors (ทั้งหมด)' : s}
        </option>`
    ).join('');
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
        if (query) return s.symbol.includes(query) || (s.name || '').toUpperCase().includes(query);
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
    
    const nearCount = stocks.filter(s => s.pctS1 != null && Math.abs(s.pctS1) < 5).length;
    elStatsBar.innerHTML = `แสดง <span>${stocks.length}</span> หุ้น · ใกล้ Support: <span style="color:var(--red)">${nearCount}</span> หุ้น`;
    
    elStockList.innerHTML = stocks.map(s => createStockCard(s)).join('');
    
    // Add click events to cards
    document.querySelectorAll('.stock-card').forEach(card => {
        card.addEventListener('click', (e) => {
            // Prevent opening detail if clicking star
            if(e.target.closest('.sc-star')) return;
            
            document.querySelectorAll('.stock-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            openDetail(card.dataset.symbol);
        });
    });
    
    // Add click events to stars
    document.querySelectorAll('.sc-star').forEach(star => {
        star.addEventListener('click', (e) => {
            const sym = e.currentTarget.dataset.symbol;
            toggleFavorite(sym);
            renderList();
        });
    });

    document.querySelectorAll('.sc-watch').forEach(watch => {
        watch.addEventListener('click', (e) => {
            const sym = e.currentTarget.dataset.symbol;
            toggleWatchlist(sym);
            renderList();
        });
    });
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
    
    let idxBadge = '';
    if (s.index === 'NASDAQ100') idxBadge = 'idx-nq';
    else if (s.index === 'Both') idxBadge = 'idx-both';
    else idxBadge = 'idx-sp';

    return `
    <div class="stock-card ${colorClass} ${currentSymbol === s.symbol ? 'active' : ''}" data-symbol="${s.symbol}">
        <div class="sc-logo-wrapper">
            <button class="sc-watch ${isWatch ? 'is-watch' : ''}" data-symbol="${s.symbol}">
                <i class="${isWatch ? 'ri-eye-fill' : 'ri-eye-line'}"></i>
            </button>
            <button class="sc-star ${isFav ? 'is-fav' : ''}" data-symbol="${s.symbol}">
                <i class="${isFav ? 'ri-star-fill' : 'ri-star-line'}"></i>
            </button>
            <img class="sc-logo" src="${logoUrl}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
            <div class="sc-logo-fallback" style="display:none">${initials}</div>
        </div>
        
        <div class="sc-info">
            <div class="sc-top">
                <span class="sc-symbol">${s.symbol}</span>
                <span class="sc-price mono">${priceStr}</span>
            </div>
            <div class="sc-mid">
                <span class="sc-name">${s.name || ''}</span>
                <span class="sc-pct ${pctClass} mono">${pctStr}</span>
            </div>
            <div class="sc-bot">
                <span class="badge ${idxBadge}">${s.index === 'Both' ? 'S&P+NQ' : (s.index || 'S&P500')}</span>
                ${levelsHtml}
            </div>
        </div>
    </div>`;
}

function toggleFavorite(symbol) {
    const idx = favorites.indexOf(symbol);
    if (idx === -1) favorites.push(symbol);
    else favorites.splice(idx, 1);
    localStorage.setItem('SP_FAVS', JSON.stringify(favorites));
}

function toggleWatchlist(symbol) {
    const idx = watchlist.indexOf(symbol);
    if (idx === -1) watchlist.push(symbol);
    else watchlist.splice(idx, 1);
    localStorage.setItem('SP_WATCH', JSON.stringify(watchlist));
}

// --- Detail View ---
function openDetail(symbol) {
    const stock = allStocks.find(s => s.symbol === symbol);
    if (!stock) return;
    
    currentSymbol = symbol;
    
    // UI Transitions
    elEmptyState.classList.add('hidden');
    elDetailContent.classList.remove('hidden');
    elDetailPanel.classList.add('active'); // For mobile
    
    // Populate Header
    document.getElementById('d-symbol').textContent = symbol;
    document.getElementById('d-fullname').textContent = stock.name || '';
    document.getElementById('d-sector').textContent = stock.sector || '';
    
    const idxBadge = document.getElementById('d-idx-badge');
    idxBadge.textContent = stock.index || 'S&P500';
    idxBadge.className = 'badge ' + (stock.index === 'NASDAQ100' ? 'idx-nq' : stock.index === 'Both' ? 'idx-both' : 'idx-sp');
    
    document.getElementById('d-price').textContent = stock.price ? '$' + stock.price.toFixed(2) : '—';
    document.getElementById('d-change').textContent = '—';
    document.getElementById('d-change').className = 'price-change mono';
    
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
        return ` <span style="font-size:11px;color:var(--${pct>=0?'green':'red'})">(${pct>0?'+':''}${pct.toFixed(2)}%)</span>`;
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
    
    loadLiveLevels();
    loadChartData();
}

async function loadLiveLevels() {
    try {
        const res = await fetch(`${API_URL}?action=getLiveLevels&symbol=${currentSymbol}`);
        const data = await res.json();
        
        if (data.success) {
            currentLevelsData = data;
            renderLiveLevels(data);
            if (data.summary) {
                renderSummary(data.summary);
            }
            addChartAnnotations();
        } else {
            document.getElementById('levels-list').innerHTML = `<p class="help-text" style="color:var(--red)"><i class="ri-error-warning-line"></i> ${data.error}</p>`;
            document.getElementById('ema-bar').innerHTML = '<span class="ema-chip na">ไม่สามารถโหลดข้อมูล EMA</span>';
        }
    } catch (err) {
        document.getElementById('levels-list').innerHTML = `<p class="help-text" style="color:var(--red)"><i class="ri-wifi-off-line"></i> การเชื่อมต่อขัดข้อง</p>`;
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
    const mStr = (lvl.methods || '').split('+').map(m => mLabel[m] || m).join(' · ');
    
    return `
    <div class="level-row ${type} glass">
        <div class="lr-left">
            <span class="lr-label ${type}">${label}</span>
            <div class="score-bar">${dots}</div>
            <span class="lr-method">${mStr}</span>
        </div>
        <div class="lr-right">
            <div class="lr-price">$${lvl.price.toFixed(2)}</div>
            <div class="lr-pct ${type}">${pctStr}</div>
        </div>
    </div>`;
}

function renderSummary(summary) {
    if (!summary) return;
    
    // Analyst Rating Badge
    const badgeWrap = document.getElementById('d-analyst-badge');
    if (summary.rating && badgeWrap) {
        const r = summary.rating.replace(/_/g, ' ').toUpperCase();
        let colorClass = 'rating-hold';
        if (r.includes('BUY')) colorClass = 'rating-buy';
        if (r.includes('SELL')) colorClass = 'rating-sell';
        badgeWrap.innerHTML = `<span class="rating-badge ${colorClass}">${r}</span>`;
    } else if (badgeWrap) {
        badgeWrap.innerHTML = '';
    }

    // Company Description
    const descBox = document.getElementById('d-company-desc');
    if (summary.desc && descBox) {
        descBox.innerHTML = `<h3><i class="ri-building-4-line"></i> About Company</h3><p>${summary.desc}</p>`;
        descBox.style.display = 'block';
    } else if (descBox) {
        descBox.style.display = 'none';
    }
    
    // Fundamentals
    const fundBox = document.getElementById('d-fundamentals');
    if (summary.fundamentals && fundBox) {
        const f = summary.fundamentals;
        const upsideColor = f.upsideRaw > 0 ? 'text-green' : (f.upsideRaw < 0 ? 'text-red' : '');
        fundBox.innerHTML = `
            <div class="fund-card glass">
                <div class="fund-card-title"><i class="ri-pie-chart-2-line"></i> Valuation</div>
                <div class="fund-row"><span>P/E Ratio</span><strong>${f.trailingPE}</strong></div>
                <div class="fund-row"><span>Market Cap</span><strong>${f.marketCap}</strong></div>
                <div class="fund-row"><span>Div Yield</span><strong>${f.dividendYield}</strong></div>
            </div>
            <div class="fund-card glass">
                <div class="fund-card-title"><i class="ri-focus-2-line"></i> Analyst Target</div>
                <div class="fund-row"><span>Rating</span><strong>${summary.rating ? summary.rating.replace(/_/g, ' ') : '-'}</strong></div>
                <div class="fund-row"><span>Target Price</span><strong>${f.targetMeanPrice !== '-' ? '$' + f.targetMeanPrice : '-'}</strong></div>
                <div class="fund-row"><span>Upside</span><strong class="${upsideColor}">${f.upsideRaw > 0 ? '+' : ''}${f.upside}</strong></div>
            </div>
            <div class="fund-card glass">
                <div class="fund-card-title"><i class="ri-dashboard-3-line"></i> Risk & Growth</div>
                <div class="fund-row"><span>Beta</span><strong>${f.beta}</strong></div>
                <div class="fund-row"><span>52W Range</span><strong>${f.fiftyTwoWeekLow !== '-' ? '$' + f.fiftyTwoWeekLow : '-'} - ${f.fiftyTwoWeekHigh !== '-' ? '$' + f.fiftyTwoWeekHigh : '-'}</strong></div>
                <div class="fund-row"><span>Rev Growth</span><strong>${f.revenueGrowth}</strong></div>
            </div>
        `;
        fundBox.style.display = 'grid';
    } else if (fundBox) {
        fundBox.style.display = 'none';
    }
}

// --- Chart ---
async function loadChartData() {
    document.getElementById('chart-loading').classList.add('active');
    
    try {
        const res = await fetch(`${API_URL}?action=getStockChart&symbol=${currentSymbol}&range=${currentRange}`);
        const data = await res.json();
        
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
                if (low && high && data.currentPrice) {
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
                if (dLow && dHigh && data.currentPrice) {
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
            }
            
            const emaLabels = (data.emaData || []).map(e => `EMA${e.period}`).join(', ');
            document.getElementById('ema-label').textContent = emaLabels || 'EMA';
            
            renderChart(data.points, data.emaData || [], data.currentPrice);
        }
    } catch (err) {
        document.getElementById('chart-loading').classList.remove('active');
        console.error(err);
    }
}

function calcRSI(prices, period = 14) {
    if (prices.length < period + 1) return null;
    let avgG = 0, avgL = 0;
    for (let i = 1; i <= period; i++) { const d = prices[i] - prices[i-1]; d > 0 ? avgG += d : avgL -= d; }
    avgG /= period; avgL /= period;
    for (let i = period + 1; i < prices.length; i++) {
        const d = prices[i] - prices[i-1];
        avgG = (avgG * 13 + (d > 0 ? d : 0)) / 14;
        avgL = (avgL * 13 + (d < 0 ? -d : 0)) / 14;
    }
    return Math.round((100 - 100 / (1 + avgG / (avgL || 0.0001))) * 100) / 100;
}

function renderChart(points, emaData, livePrice) {
    const canvas = document.getElementById('priceChart');
    if (priceChart) { priceChart.destroy(); }
    
    if (!points || !points.length) return;
    
    const closes = points.map(p => p.close);
    const labels = points.map(p => p.label);
    
    // RSI
    const rsi = calcRSI(closes);
    const rsiEl = document.getElementById('d-rsi');
    if (rsi != null) {
        let c = rsi < 30 ? 'var(--green)' : rsi > 70 ? 'var(--red)' : 'var(--text-main)';
        rsiEl.innerHTML = `RSI: <span style="color:${c}">${rsi}</span>`;
    } else {
        rsiEl.textContent = 'RSI: —';
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

    priceChart = new Chart(canvas, {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: isDark ? 'rgba(24,24,27,0.9)' : 'rgba(255,255,255,0.9)',
                    titleColor: isDark ? '#f8fafc' : '#0f172a',
                    bodyColor: isDark ? '#f8fafc' : '#0f172a',
                    borderColor: isDark ? '#3f3f46' : '#e2e8f0',
                    borderWidth: 1,
                    padding: 12,
                    titleFont: { family: 'Inter', size: 12 },
                    bodyFont: { family: 'IBM Plex Mono', size: 14, weight: '600' },
                    callbacks: {
                        label: (ctx) => ` ${ctx.dataset.label}: $${ctx.parsed.y.toFixed(2)}`
                    }
                },
                zoom: {
                    pan: { enabled: true, mode: 'x' },
                    zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { display: !hideTicks, color: textColor, maxTicksLimit: 6, font: { size: 11 }, align: 'inner' }, bounds: 'data', offset: false
                },
                y: {
                    position: 'right',
                    grid: { color: gridColor, drawBorder: false },
                    ticks: { color: textColor, font: { size: 11, family: 'IBM Plex Mono' }, callback: v => '$' + v }
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
    const supports = currentLevelsData.supports || [];
    const resists = currentLevelsData.resists || [];
    
    supports.forEach((s, i) => {
        annotations['s'+i] = {
            type: 'line', yMin: s.price, yMax: s.price,
            borderColor: sColor, borderWidth: 1.5, borderDash: [4, 4],
            label: { display: true, content: 'S'+(i+1)+' $'+s.price.toFixed(2), position: 'end', yAdjust: -10, backgroundColor: 'transparent', color: sColor, font: {family: 'IBM Plex Mono', size: 10, weight: '600'} }
        };
    });
    
    [...resists].reverse().forEach((r, i) => {
        annotations['r'+i] = {
            type: 'line', yMin: r.price, yMax: r.price,
            borderColor: rColor, borderWidth: 1.5, borderDash: [4, 4],
            label: { display: true, content: 'R'+(resists.length-i)+' $'+r.price.toFixed(2), position: 'end', yAdjust: -10, backgroundColor: 'transparent', color: rColor, font: {family: 'IBM Plex Mono', size: 10, weight: '600'} }
        };
    });
    
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
        const res = await fetch(`${API_URL}?action=getMarketMovers&scrId=${scrId}`);
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
    
    elStatsBar.innerHTML = `<span>${titleMap[data.scrId] || ''}</span> · ${stocks.length} หุ้น · อัปเดต: ${data.fetchTime || ''}`;
    
    if (!stocks.length) {
        elStockList.innerHTML = `<div class="loader-container"><p>ไม่พบข้อมูล</p></div>`;
        return;
    }
    
    elStockList.innerHTML = stocks.map(s => createMoverCard(s)).join('');
    
    // Click events for mover cards
    document.querySelectorAll('.stock-card').forEach(card => {
        card.addEventListener('click', () => {
            document.querySelectorAll('.stock-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            openDetail(card.dataset.symbol);
        });
    });
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
    <div class="stock-card" data-symbol="${s.symbol}">
        <div class="sc-logo-wrapper">
            <img class="sc-logo" src="${logoUrl}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
            <div class="sc-logo-fallback" style="display:none">${initials}</div>
        </div>
        
        <div class="sc-info">
            <div class="sc-top">
                <span class="sc-symbol">${s.symbol}</span>
                <span class="sc-price mono">${priceStr}</span>
            </div>
            <div class="sc-mid">
                <span class="sc-name">${s.name || ''}</span>
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
    fetch('https://api.counterapi.dev/v1/alphazone_dashboard/visits/up')
        .then(res => res.json())
        .then(data => {
            let count = data.count || 1;
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

// --- Layout Toggles ---
function toggleLeftPanel() {
    const leftPanel = document.getElementById('list-panel');
    const icon = document.getElementById('panel-toggle-icon');
    
    if (!leftPanel || !icon) return;
    
    leftPanel.classList.toggle('collapsed');
    
    if (leftPanel.classList.contains('collapsed')) {
        icon.className = 'ri-arrow-right-s-line';
    } else {
        icon.className = 'ri-arrow-left-s-line';
    }
}
