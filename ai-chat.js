// --- AlphaZone AI Investment Coach v3 (Gemini Pro/Flash + Dynamic Context Injection + AI-to-Chart Pins) ---
document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const chatContainer = document.getElementById('ai-chat-container');
    const chatFab = document.getElementById('ai-chat-fab');
    const closeBtn = document.getElementById('ai-close-btn');
    const clearBtn = document.getElementById('ai-clear-btn');
    const expandBtn = document.getElementById('ai-expand-btn');
    const expandIcon = document.getElementById('ai-expand-icon');
    const settingsBtn = document.getElementById('ai-settings-btn');
    const chatMessages = document.getElementById('ai-chat-messages');
    const chatInput = document.getElementById('ai-chat-input');
    const sendBtn = document.getElementById('ai-send-btn');

    const modeFastBtn = document.getElementById('ai-mode-fast');
    const modeProBtn = document.getElementById('ai-mode-pro');
    const styleSwingBtn = document.getElementById('ai-style-swing');
    const styleInvestBtn = document.getElementById('ai-style-invest');
    const webSearchBtn = document.getElementById('ai-web-search-btn');
    const contextBadge = document.getElementById('ai-context-badge');
    const quickPromptsBox = document.getElementById('ai-quick-prompts');

    const configModal = document.getElementById('ai-config-modal');
    const apiKeyInput = document.getElementById('ai-api-key-input');
    const fastModelSelect = document.getElementById('ai-fast-model-select');
    const proModelSelect = document.getElementById('ai-pro-model-select');
    const fetchModelsBtn = document.getElementById('btn-fetch-models');
    const modelsStatus = document.getElementById('ai-models-status');
    const teamIdInput = document.getElementById('vercel-team-id-input');
    const discordWebhookInput = document.getElementById('discord-webhook-input');
    const finnhubApiKeyInput = document.getElementById('finnhub-api-key-input');
    const saveApiBtn = document.getElementById('btn-save-ai-api');
    const cancelApiBtn = document.getElementById('btn-cancel-ai-api');

    // Persisted State
    let apiKey = safeGet('OPENAI_API_KEY', '');
    let vercelTeamId = safeGet('VERCEL_TEAM_ID', '');
    let discordWebhookUrl = safeGet('DISCORD_WEBHOOK_URL', '');
    let finnhubApiKey = safeGet('FINNHUB_API_KEY', '');
    let aiMode = safeGet('AZ_AI_MODE', 'fast'); // 'fast' | 'pro'
    let investStyle = safeGet('AZ_INVEST_STYLE', 'swing'); // 'swing' | 'invest'
    let fastModel = safeGet('AZ_GEMINI_FAST_MODEL', 'gemini-3.8-flash');
    let proModel = safeGet('AZ_GEMINI_PRO_MODEL', 'gemini-3.1-pro');
    let webSearchEnabled = safeGet('AZ_AI_WEB_SEARCH', '1') === '1';

    let isWaitingForResponse = false;
    let messageHistory = [];

    const DEFAULT_FAST_MODELS = [
        { id: 'gemini-4-hydrogen', label: 'gemini-4-hydrogen (แนะนำ - ตอบไวรุ่นใหม่)' },
        { id: 'gemini-3.8-flash', label: 'gemini-3.8-flash (ประหยัด/เสถียร)' },
        { id: 'gemini-flash-latest', label: 'gemini-flash-latest' },
        { id: 'gemini-2.5-flash', label: 'gemini-2.5-flash' }
    ];
    const DEFAULT_PRO_MODELS = [
        { id: 'gemini-4-neon', label: 'gemini-4-neon (แนะนำ - สมดุลและลึก)' },
        { id: 'gemini-4-carbon', label: 'gemini-4-carbon (คิดลึกสุด)' },
        { id: 'gemini-3.1-pro', label: 'gemini-3.1-pro' },
        { id: 'gemini-2.5-pro', label: 'gemini-2.5-pro' }
    ];

    function isGeminiKey(key) {
        return !!key && (key.startsWith('AIza') || key.startsWith('AQ.'));
    }

    function getActiveModelId() {
        return aiMode === 'pro' ? proModel : fastModel;
    }

    function ensureOption(selectEl, value, label) {
        if (!selectEl || !value) return;
        const exists = Array.from(selectEl.options).some(o => o.value === value);
        if (!exists) {
            const opt = document.createElement('option');
            opt.value = value;
            opt.textContent = label || value;
            selectEl.appendChild(opt);
        }
    }

    function applyToolbarState() {
        if (modeFastBtn) modeFastBtn.classList.toggle('active', aiMode === 'fast');
        if (modeProBtn) modeProBtn.classList.toggle('active', aiMode === 'pro');
        if (styleSwingBtn) styleSwingBtn.classList.toggle('active', investStyle === 'swing');
        if (styleInvestBtn) styleInvestBtn.classList.toggle('active', investStyle === 'invest');
        if (webSearchBtn) {
            webSearchBtn.classList.toggle('active', webSearchEnabled);
            webSearchBtn.title = webSearchEnabled
                ? 'เปิดอยู่: Gemini จะค้นข่าวจากสำนักข่าวการเงินที่น่าเชื่อถือแบบเรียลไทม์'
                : 'ปิดอยู่: วิเคราะห์จากข้อมูล AlphaZone อย่างเดียว';
        }
    }

    function getAppCtx() {
        if (typeof window.getAlphaZoneContextData === 'function') {
            return window.getAlphaZoneContextData();
        }
        return {
            currentSymbol: typeof currentSymbol !== 'undefined' ? currentSymbol : '',
            currentRange: typeof currentRange !== 'undefined' ? currentRange : '1D',
            allStocks: typeof allStocks !== 'undefined' ? allStocks : [],
            currentLevelsData: typeof currentLevelsData !== 'undefined' ? currentLevelsData : null,
            latestChartArgs: typeof latestChartArgs !== 'undefined' ? latestChartArgs : null,
            customWatchLines: [],
            favorites: [],
            watchlist: [],
            fearGreed: null
        };
    }

    function refreshContextAndPrompts() {
        const ctx = getAppCtx();
        const sym = ctx.currentSymbol;

        if (contextBadge) {
            if (sym) {
                const st = ctx.allStocks.find(s => s.symbol === sym);
                const priceTxt = st && typeof st.price === 'number' ? ` $${st.price.toFixed(2)}` : '';
                contextBadge.textContent = `📊 ${sym}${priceTxt} (${ctx.currentRange})`;
                contextBadge.title = `กำลังส่งข้อมูลเชิงลึกของ ${sym} (Timeframe ${ctx.currentRange}, S/R, EMA, Chart, Pins) ให้ AI`;
            } else {
                contextBadge.textContent = '📊 ภาพรวมตลาด US';
                contextBadge.title = 'กำลังใช้ข้อมูลภาพรวมตลาด S&P 500 & NASDAQ 100';
            }
        }

        if (quickPromptsBox) {
            const prompts = sym
                ? [
                    {
                        label: `📊 วิเคราะห์ ${sym} (5-Pillar)`,
                        text: `วิเคราะห์หุ้น ${sym} แบบละเอียดครบถ้วนตามกรอบ 5-Pillar Conviction Framework พร้อมข่าวล่าสุดที่มีผลต่อราคา, Bear Case, Risk:Reward และแผนแบ่งไม้`
                    },
                    {
                        label: `📰 ข่าวกระทบราคา ${sym}`,
                        text: `อัปเดตข่าวล่าสุดที่มีผลกระทบต่อราคาหุ้น ${sym} ในรอบ 7-14 วัน จากสำนักข่าวการเงินที่น่าเชื่อถือ (เช่น Reuters, Bloomberg, CNBC, WSJ, Yahoo Finance) พร้อมประเมินผลกระทบต่อแนวรับ-ต้าน`
                    },
                    {
                        label: `📌 แผนเข้า-ออก ${sym}`,
                        text: `วางแผนจุดเข้าซื้อ (Entry), Stop Loss, TP1 และ TP2 สำหรับ ${sym} พร้อมคำนวณ R:R และสรุปจุดปักหมุดลงกราฟ`
                    },
                    {
                        label: '🔍 สแกนหุ้นใกล้ S1',
                        text: 'ช่วยสแกนหาหุ้นเด่นในตลาดวันนี้ที่ราคาอยู่ใกล้แนวรับ S1 พร้อมปัจจัยพื้นฐานและข่าวประกอบ'
                    }
                ]
                : [
                    {
                        label: '🌍 สรุปตลาดวันนี้',
                        text: 'ช่วยสรุปภาพรวมตลาดหุ้นสหรัฐฯ วันนี้ Fear & Greed, ข่าวเศรษฐกิจ/Fed สำคัญล่าสุด และจุดที่ควรระวัง'
                    },
                    {
                        label: '🔍 สแกนหุ้นใกล้ S1',
                        text: 'ช่วยคัด 5 หุ้นเด่นที่อยู่ใกล้แนวรับ S1 ที่สุดวันนี้ พร้อมประเมินความน่าสนใจเชิงพื้นฐานและเทคนิค'
                    },
                    {
                        label: '⚡ เทียบ NVDA vs AMD',
                        text: 'ช่วยเปรียบเทียบ NVDA กับ AMD แบบ 5-Pillar จากข้อมูลเทคนิค พื้นฐาน และข่าวล่าสุด ตัวไหนได้เปรียบกว่า'
                    }
                ];

            quickPromptsBox.innerHTML = '';
            prompts.forEach(p => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'ai-quick-chip';
                btn.textContent = p.label;
                btn.addEventListener('click', () => {
                    chatInput.value = p.text;
                    handleSend();
                });
                quickPromptsBox.appendChild(btn);
            });
        }
    }
    window.refreshAICoachContextUI = refreshContextAndPrompts;

    // Toggle Chat
    function toggleChat() {
        chatContainer.classList.toggle('ai-chat-hidden');
        if (!chatContainer.classList.contains('ai-chat-hidden')) {
            refreshContextAndPrompts();
            chatInput.focus();
            chatFab.style.display = 'none';
        } else {
            chatFab.style.display = 'flex';
        }
    }

    chatFab.addEventListener('click', toggleChat);
    closeBtn.addEventListener('click', toggleChat);

    if (expandBtn) {
        expandBtn.addEventListener('click', () => {
            const expanded = chatContainer.classList.toggle('ai-chat-expanded');
            if (expandIcon) {
                expandIcon.className = expanded ? 'ri-fullscreen-exit-line' : 'ri-fullscreen-line';
            }
        });
    }

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            messageHistory = [];
            chatMessages.innerHTML = `
                <div class="chat-message ai-message">
                    <div class="message-bubble">ล้างประวัติการสนทนาแล้วครับ ถามวิเคราะห์หุ้นตัวใหม่ได้เลย!</div>
                </div>`;
        });
    }

    if (modeFastBtn) {
        modeFastBtn.addEventListener('click', () => {
            aiMode = 'fast';
            safeSet('AZ_AI_MODE', 'fast');
            applyToolbarState();
        });
    }
    if (modeProBtn) {
        modeProBtn.addEventListener('click', () => {
            aiMode = 'pro';
            safeSet('AZ_AI_MODE', 'pro');
            applyToolbarState();
        });
    }
    if (styleSwingBtn) {
        styleSwingBtn.addEventListener('click', () => {
            investStyle = 'swing';
            safeSet('AZ_INVEST_STYLE', 'swing');
            applyToolbarState();
        });
    }
    if (styleInvestBtn) {
        styleInvestBtn.addEventListener('click', () => {
            investStyle = 'invest';
            safeSet('AZ_INVEST_STYLE', 'invest');
            applyToolbarState();
        });
    }
    if (webSearchBtn) {
        webSearchBtn.addEventListener('click', () => {
            webSearchEnabled = !webSearchEnabled;
            safeSet('AZ_AI_WEB_SEARCH', webSearchEnabled ? '1' : '0');
            applyToolbarState();
        });
    }

    // Populate model dropdowns
    function initModelSelects(extraModels = []) {
        if (fastModelSelect) {
            fastModelSelect.innerHTML = '';
            DEFAULT_FAST_MODELS.forEach(m => ensureOption(fastModelSelect, m.id, m.label));
            extraModels.forEach(m => ensureOption(fastModelSelect, m.id, m.label));
            ensureOption(fastModelSelect, fastModel, fastModel);
            fastModelSelect.value = fastModel;
        }
        if (proModelSelect) {
            proModelSelect.innerHTML = '';
            DEFAULT_PRO_MODELS.forEach(m => ensureOption(proModelSelect, m.id, m.label));
            extraModels.forEach(m => ensureOption(proModelSelect, m.id, m.label));
            ensureOption(proModelSelect, proModel, proModel);
            proModelSelect.value = proModel;
        }
    }

    // Live Model Discovery from Google Gemini API (using x-goog-api-key header, never URL query)
    async function fetchAvailableGeminiModels() {
        const key = (apiKeyInput ? apiKeyInput.value : apiKey).trim();
        if (!isGeminiKey(key)) {
            if (modelsStatus) modelsStatus.textContent = '⚠️ กรุณากรอก Gemini API Key (ขึ้นต้นด้วย AIza...) ก่อนโหลดรายชื่อโมเดล';
            return;
        }
        if (fetchModelsBtn) fetchModelsBtn.disabled = true;
        if (modelsStatus) modelsStatus.textContent = '⏳ กำลังดึงรายชื่อโมเดลที่ Key ของคุณใช้งานได้...';

        try {
            const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
                method: 'GET',
                headers: { 'x-goog-api-key': key }
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error?.message || `HTTP ${res.status}`);
            }
            const data = await res.json();
            const NON_CHAT_RE = /(-image|-tts|-transcribe|robotics|computer-use|nano-banana|embedding|aqa|veo|imagen)/i;
            const list = (data.models || [])
                .filter(m => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
                .map(m => {
                    const id = String(m.name || '').replace(/^models\//, '');
                    return { id, label: m.displayName ? `${id} (${m.displayName})` : id };
                })
                .filter(m => m.id.includes('gemini') && !NON_CHAT_RE.test(m.id));

            if (list.length === 0) {
                throw new Error('ไม่พบโมเดล Gemini สำหรับแชทที่รองรับ generateContent');
            }

            // Sort flash/hydrogen and pro/neon/carbon nicely while keeping user's current selection if valid
            const flashCandidates = list.filter(m => /hydrogen|flash|lite/i.test(m.id));
            const proCandidates = list.filter(m => /neon|carbon|pro/i.test(m.id));

            initModelSelects(list);
            if (fastModelSelect && flashCandidates.length > 0 && !list.some(m => m.id === fastModelSelect.value)) {
                fastModelSelect.value = flashCandidates[0].id;
            }
            if (proModelSelect && proCandidates.length > 0 && !list.some(m => m.id === proModelSelect.value)) {
                proModelSelect.value = proCandidates[0].id;
            }

            if (modelsStatus) {
                modelsStatus.textContent = `✅ โหลดสำเร็จ ${list.length} โมเดลแชทวิเคราะห์หุ้นจาก Gemini API แล้ว`;
            }
        } catch (err) {
            if (modelsStatus) {
                modelsStatus.textContent = `❌ โหลดรายชื่อไม่สำเร็จ: ${err.message}`;
            }
        } finally {
            if (fetchModelsBtn) fetchModelsBtn.disabled = false;
        }
    }

    if (fetchModelsBtn) {
        fetchModelsBtn.addEventListener('click', fetchAvailableGeminiModels);
    }

    // Settings Modal
    settingsBtn.addEventListener('click', () => {
        initModelSelects();
        apiKeyInput.value = apiKey;
        if (teamIdInput) teamIdInput.value = vercelTeamId;
        if (discordWebhookInput) discordWebhookInput.value = discordWebhookUrl;
        if (finnhubApiKeyInput) finnhubApiKeyInput.value = finnhubApiKey;
        if (modelsStatus) modelsStatus.textContent = '';
        configModal.classList.add('active');
    });

    cancelApiBtn.addEventListener('click', () => {
        configModal.classList.remove('active');
    });

    saveApiBtn.addEventListener('click', () => {
        const key = apiKeyInput.value.trim();
        const teamId = teamIdInput ? teamIdInput.value.trim() : '';
        const webhook = discordWebhookInput ? discordWebhookInput.value.trim() : '';
        const finnhubKey = finnhubApiKeyInput ? finnhubApiKeyInput.value.trim() : '';

        if (!key) {
            alert('กรุณากรอก API Key');
            return;
        }

        safeSet('OPENAI_API_KEY', key);
        apiKey = key;

        if (fastModelSelect && fastModelSelect.value) {
            fastModel = fastModelSelect.value;
            safeSet('AZ_GEMINI_FAST_MODEL', fastModel);
        }
        if (proModelSelect && proModelSelect.value) {
            proModel = proModelSelect.value;
            safeSet('AZ_GEMINI_PRO_MODEL', proModel);
        }

        safeSet('VERCEL_TEAM_ID', teamId);
        vercelTeamId = teamId;

        safeSet('DISCORD_WEBHOOK_URL', webhook);
        discordWebhookUrl = webhook;

        safeSet('FINNHUB_API_KEY', finnhubKey);
        finnhubApiKey = finnhubKey;

        configModal.classList.remove('active');
        appendMessage('ai', escapeHtmlForChat(`บันทึกการตั้งค่าเรียบร้อยแล้วครับ! (Fast: \`${fastModel}\` / Deep Pro: \`${proModel}\`) 🚀`));
    });

    // Auto-resize textarea
    chatInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 120) + 'px';
    });

    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    });

    sendBtn.addEventListener('click', handleSend);

    async function copyToClipboard(text) {
        if (navigator.clipboard && window.isSecureContext) {
            return navigator.clipboard.writeText(text);
        }
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
            document.execCommand('copy');
            textArea.remove();
            return Promise.resolve();
        } catch (err) {
            textArea.remove();
            return Promise.reject(err);
        }
    }

    // Parse [[ALERTS: entry=123.45, sl=118.00, tp1=135.00]] from AI text
    function extractAlertPlan(rawText) {
        const pins = [];
        const match = rawText.match(/\[\[ALERTS:\s*([^\]]+)\]\]/i);
        const cleanedText = rawText.replace(/\[\[ALERTS:\s*[^\]]+\]\]/gi, '').trim();

        if (match && match[1]) {
            const labelMap = {
                entry: { icon: '📌', label: 'Entry', order: 1 },
                buy: { icon: '📌', label: 'Entry', order: 1 },
                sl: { icon: '🛑', label: 'SL', order: 2 },
                stop: { icon: '🛑', label: 'SL', order: 2 },
                tp1: { icon: '🎯', label: 'TP1', order: 3 },
                tp2: { icon: '🎯', label: 'TP2', order: 4 },
                target: { icon: '🎯', label: 'Target', order: 5 }
            };
            const pairs = match[1].split(',');
            pairs.forEach(pair => {
                const kv = pair.split('=');
                if (kv.length === 2) {
                    const key = kv[0].trim().toLowerCase();
                    const val = parseFloat(kv[1].replace(/[^0-9.]/g, ''));
                    if (Number.isFinite(val) && val > 0) {
                        const meta = labelMap[key] || { icon: '📌', label: key.toUpperCase(), order: 99 };
                        pins.push({ ...meta, price: val });
                    }
                }
            });
            pins.sort((a, b) => a.order - b.order);
        }
        return { cleanedText, pins };
    }

    function appendMessage(sender, text, options = {}) {
        const { rawText = '', metaLabel = '', pinPlans = [], sources = [] } = options;
        const msgDiv = document.createElement('div');
        msgDiv.className = `chat-message ${sender}-message`;

        const bubble = document.createElement('div');
        bubble.className = 'message-bubble';

        if (sender === 'ai' && metaLabel) {
            const tag = document.createElement('div');
            tag.className = 'ai-meta-tag';
            tag.textContent = metaLabel;
            bubble.appendChild(tag);
        }

        const bodySpan = document.createElement('div');
        bodySpan.innerHTML = text;
        bubble.appendChild(bodySpan);

        // Render Google Search Grounding Citations safely
        if (sender === 'ai' && Array.isArray(sources) && sources.length > 0) {
            const srcWrap = document.createElement('div');
            srcWrap.className = 'ai-grounding-sources';
            const lbl = document.createElement('span');
            lbl.textContent = '🌐 แหล่งข่าว:';
            srcWrap.appendChild(lbl);

            sources.slice(0, 4).forEach(s => {
                if (s && s.uri && /^https?:\/\//i.test(s.uri)) {
                    const a = document.createElement('a');
                    a.href = s.uri;
                    a.target = '_blank';
                    a.rel = 'noopener noreferrer';
                    a.className = 'ai-source-link';
                    a.title = s.title || s.uri;
                    a.innerHTML = `<i class="ri-external-link-line"></i> ${escapeHtml(s.title || 'Source')}`;
                    srcWrap.appendChild(a);
                }
            });
            bubble.appendChild(srcWrap);
        }

        msgDiv.appendChild(bubble);

        // One-Click Chart Pin Buttons from AI Plan
        const ctx = getAppCtx();
        if (sender === 'ai' && pinPlans.length > 0 && ctx.currentSymbol) {
            const pinRow = document.createElement('div');
            pinRow.className = 'ai-pin-actions';
            pinPlans.forEach(p => {
                const pinBtn = document.createElement('button');
                pinBtn.type = 'button';
                pinBtn.className = 'msg-action-btn pin-btn';
                pinBtn.textContent = `${p.icon} ปักหมุด ${p.label} $${p.price.toFixed(2)}`;
                pinBtn.addEventListener('click', () => {
                    if (typeof window.pinPriceFromAI === 'function' && window.pinPriceFromAI(p.price)) {
                        pinBtn.textContent = `✅ ปักหมุด $${p.price.toFixed(2)} แล้ว`;
                        pinBtn.classList.add('success');
                        pinBtn.disabled = true;
                    }
                });
                pinRow.appendChild(pinBtn);
            });
            msgDiv.appendChild(pinRow);
        }

        // Action buttons (Copy & Share to Discord)
        if (sender === 'ai' && rawText) {
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'message-actions';

            const copyBtn = document.createElement('button');
            copyBtn.className = 'msg-action-btn';
            copyBtn.innerHTML = '<i class="ri-file-copy-line"></i> คัดลอก';
            copyBtn.title = 'คัดลอกบทวิเคราะห์นี้';
            copyBtn.addEventListener('click', async () => {
                try {
                    await copyToClipboard(rawText);
                    const origHtml = copyBtn.innerHTML;
                    copyBtn.innerHTML = '<i class="ri-check-line" style="color:#10b981;"></i> คัดลอกแล้ว!';
                    copyBtn.classList.add('success');
                    setTimeout(() => {
                        copyBtn.innerHTML = origHtml;
                        copyBtn.classList.remove('success');
                    }, 2000);
                } catch (err) {
                    alert('ไม่สามารถคัดลอกได้อัตโนมัติ กรุณาลองเลือกคลุมดำเพื่อคัดลอกครับ');
                }
            });
            actionsDiv.appendChild(copyBtn);

            const discordBtn = document.createElement('button');
            discordBtn.className = 'msg-action-btn btn-discord';
            discordBtn.innerHTML = '<i class="ri-discord-fill" style="color:#5865F2;"></i> แชร์เข้า Discord';
            discordBtn.title = 'ส่งบทวิเคราะห์นี้ไปยังห้องแชท Discord';
            discordBtn.addEventListener('click', async () => {
                if (!discordWebhookUrl) {
                    alert('ยังไม่ได้ใส่ Discord Webhook URL ครับ!\n\nกรุณากดไอคอนฟันเฟือง ⚙️ ด้านบนขวา แล้วใส่ลิงก์ Webhook จาก Discord แล้วกดบันทึก');
                    configModal.classList.add('active');
                    if (discordWebhookInput) discordWebhookInput.focus();
                    return;
                }

                const origHtml = discordBtn.innerHTML;
                discordBtn.disabled = true;
                discordBtn.innerHTML = '<i class="ri-loader-4-line ri-spin"></i> กำลังส่ง...';

                try {
                    let title = '📊 บทวิเคราะห์ AlphaZone AI Coach';
                    const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
                    if (lines.length > 0) {
                        const cleanFirst = lines[0].replace(/[#*`_]/g, '').trim();
                        if (cleanFirst.length > 0 && cleanFirst.length < 100) {
                            title = cleanFirst;
                        }
                    }

                    const description = rawText.length > 3900
                        ? rawText.slice(0, 3900) + '\n\n...(ข้อความยาวเกิน ขอยกมาบางส่วน)...'
                        : rawText;

                    const payload = {
                        username: 'AlphaZone AI Coach',
                        avatar_url: 'https://cdn-icons-png.flaticon.com/512/4712/4712109.png',
                        embeds: [{
                            title,
                            description,
                            color: 0x38bdf8,
                            timestamp: new Date().toISOString(),
                            footer: { text: `AlphaZone Market Intelligence • ${getActiveModelId()}` }
                        }]
                    };

                    const res = await fetch(discordWebhookUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });

                    if (res.ok || res.status === 204) {
                        discordBtn.innerHTML = '<i class="ri-check-line" style="color:#10b981;"></i> แชร์สำเร็จแล้ว!';
                        discordBtn.classList.add('success');
                        setTimeout(() => {
                            discordBtn.innerHTML = origHtml;
                            discordBtn.disabled = false;
                            discordBtn.classList.remove('success');
                        }, 2500);
                    } else {
                        throw new Error(`HTTP ${res.status}`);
                    }
                } catch (sendErr) {
                    discordBtn.innerHTML = '<i class="ri-error-warning-line" style="color:#ef4444;"></i> ส่งไม่สำเร็จ';
                    setTimeout(() => {
                        discordBtn.innerHTML = origHtml;
                        discordBtn.disabled = false;
                    }, 2500);
                    alert('ส่งเข้า Discord ไม่สำเร็จ! กรุณาตรวจสอบ Discord Webhook URL');
                }
            });
            actionsDiv.appendChild(discordBtn);

            msgDiv.appendChild(actionsDiv);
        }

        chatMessages.appendChild(msgDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function showTypingIndicator() {
        const msgDiv = document.createElement('div');
        msgDiv.className = 'chat-message ai-message typing-indicator-container';
        msgDiv.innerHTML = `
            <div class="message-bubble">
                <div class="typing-indicator">
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                </div>
            </div>
        `;
        chatMessages.appendChild(msgDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return msgDiv;
    }

    // Fetch Company News from Finnhub safely (3.5s timeout)
    async function fetchCompanyNews(symbol, key) {
        if (!symbol || !key) return [];
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3500);
            const toDate = new Date().toISOString().split('T')[0];
            const fromDateObj = new Date();
            fromDateObj.setDate(fromDateObj.getDate() - 7);
            const fromDate = fromDateObj.toISOString().split('T')[0];

            const url = `https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(symbol)}&from=${fromDate}&to=${toDate}&token=${encodeURIComponent(key)}`;
            const res = await fetch(url, { signal: controller.signal });
            clearTimeout(timeoutId);
            if (!res.ok) return [];
            const data = await res.json();
            if (!Array.isArray(data)) return [];

            return data
                .filter(item => item && item.headline && item.headline.trim().length > 0)
                .slice(0, 4)
                .map(item => ({
                    headline: item.headline.trim(),
                    summary: (item.summary || '').trim().slice(0, 220),
                    source: item.source || 'Financial Media',
                    date: item.datetime ? new Date(item.datetime * 1000).toLocaleDateString('th-TH') : ''
                }));
        } catch (e) {
            return [];
        }
    }

    // Fetch deep levels + fundamentals from cache or GAS backend (3.5s timeout)
    async function fetchStockLevelsAndSummary(symbol, ctx) {
        if (!symbol) return null;
        if (ctx.currentLevelsData && ctx.currentLevelsData.symbol === symbol) {
            return ctx.currentLevelsData;
        }
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3500);
            const baseUrl = (typeof API_URL !== 'undefined' && API_URL)
                ? API_URL
                : (safeGet('SP_API_URL', '') || 'https://script.google.com/macros/s/AKfycbzKXQWPFCWqNG0MkZlvl4x4uhxYy9F2ppjXGfb523Ek3cgAhiYOpvNzDXlfvZYaP9IF/exec');

            const res = await fetch(`${baseUrl}?action=getLiveLevels&symbol=${encodeURIComponent(symbol)}`, { signal: controller.signal });
            clearTimeout(timeoutId);
            if (!res.ok) return null;
            const data = await res.json();
            return (data && data.success) ? data : null;
        } catch (e) {
            return null;
        }
    }

    function summarizeChartTrajectory(chartArgs, rangeLabel) {
        if (!chartArgs || !Array.isArray(chartArgs.points) || chartArgs.points.length < 3) return '';
        const pts = chartArgs.points.filter(p => typeof p.close === 'number' && Number.isFinite(p.close));
        if (pts.length < 3) return '';

        const closes = pts.map(p => p.close);
        const first = closes[0];
        const last = closes[closes.length - 1];
        const min = Math.min(...closes);
        const max = Math.max(...closes);
        const rangePct = first ? (((last - first) / first) * 100).toFixed(2) : '0.00';
        const recentSlice = closes.slice(-8).map(v => v.toFixed(2)).join(' -> ');

        return [
            `- กรอบเวลาบนกราฟปัจจุบัน (${rangeLabel}): จาก $${first.toFixed(2)} -> $${last.toFixed(2)} (${Number(rangePct) >= 0 ? '+' : ''}${rangePct}%)`,
            `- กรอบ High / Low บนกราฟ ${rangeLabel}: $${max.toFixed(2)} / $${min.toFixed(2)}`,
            `- ลำดับราคาปิด 8 ช่วงล่าสุด: ${recentSlice}`
        ].join('\n');
    }

    // 6-Layer Dynamic Context Injection
    async function getSystemContext(userText = '') {
        const ctx = getAppCtx();
        const nowDate = new Date();
        const nowStr = nowDate.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
        const isoDate = nowDate.toISOString().split('T')[0];
        let context = `=== ข้อมูลสดจากระบบ AlphaZone (วันที่: ${isoDate} | เวลาไทย: ${nowStr}) ===\n`;
        context += `- สไตล์การวิเคราะห์ที่ผู้ใช้เลือก: ${investStyle === 'invest' ? 'Invest ระยะกลาง-ยาว (เน้นคุณภาพธุรกิจ, Valuation, แนวรับ Weekly, ทยอยสะสม)' : 'Swing Trade (เน้นจังหวะเข้า-ออก S1/S2, EMA200, R:R, Catalyst ระยะสั้น)'}\n`;

        // Layer 1: Multi-symbol extraction (up to 3 symbols from prompt + active screen stock)
        const foundStocks = [];
        const ignoreList = new Set([
            'AI', 'API', 'USD', 'THB', 'SET', 'MAI', 'BUY', 'SELL', 'HOLD', 'RSI', 'EMA',
            'PE', 'PBV', 'EPS', 'CEO', 'IPO', 'USA', 'US', 'CHAT', 'HELP', 'WHAT', 'HOW',
            'WHEN', 'WHY', 'VS', 'AND', 'OR', 'FOR', 'TOP', 'SL', 'TP', 'TP1', 'TP2',
            'PART', 'PRO', 'FAST', 'S1', 'S2', 'S3', 'R1', 'R2', 'R3', 'YTD'
        ]);

        if (userText && ctx.allStocks.length > 0) {
            const rawWords = userText.toUpperCase().match(/\b[A-Z]{1,5}\b/g) || [];
            rawWords.forEach(w => {
                if (!ignoreList.has(w)) {
                    const match = ctx.allStocks.find(s => s.symbol && s.symbol.toUpperCase() === w);
                    if (match && !foundStocks.some(f => f.symbol === match.symbol) && foundStocks.length < 3) {
                        foundStocks.push(match);
                    }
                }
            });
        }

        if (ctx.currentSymbol && ctx.allStocks.length > 0) {
            const currentStock = ctx.allStocks.find(s => s.symbol === ctx.currentSymbol);
            if (currentStock && !foundStocks.some(f => f.symbol === currentStock.symbol)) {
                foundStocks.push(currentStock);
            }
        }

        // Layer 2: Fetch deep live levels & Wall Street summary for up to 2 primary stocks in parallel
        const targetSymbols = foundStocks.slice(0, 2).map(s => s.symbol);
        const liveDetailsMap = {};
        if (targetSymbols.length > 0) {
            const fetched = await Promise.all(targetSymbols.map(sym => fetchStockLevelsAndSummary(sym, ctx)));
            targetSymbols.forEach((sym, i) => {
                if (fetched[i]) liveDetailsMap[sym] = fetched[i];
            });
        }

        // Layer 3: Inject technicals, levels (with scores/tiers), EMA200D/W, chart trajectory, pins, fundamentals
        for (const stock of foundStocks) {
            const live = liveDetailsMap[stock.symbol];
            const curPrice = (live && live.price) || stock.price;
            context += `\n[ข้อมูลเชิงลึกหุ้น ${stock.symbol} (${stock.name || ''})]\n`;
            context += `- ตลาด / หมวด: ${stock.index || 'S&P500 / NASDAQ100'} | Sector: ${stock.sector || 'N/A'}\n`;
            context += `- ราคาล่าสุด: $${typeof curPrice === 'number' ? curPrice.toFixed(2) : (curPrice || 'N/A')}\n`;
            if (stock.change || stock.change_percent) {
                context += `- เปลี่ยนแปลงวันนี้: ${stock.change || 0} (${stock.change_percent || 0}%)\n`;
            }
            context += `- สถานะเทรนด์: ${(live && live.trend) || stock.status || 'N/A'}\n`;
            if (stock.rsi) context += `- RSI(14) Daily: ${stock.rsi}\n`;

            if (live && live.ema) {
                const emaParts = [];
                if (live.ema.daily) emaParts.push(`EMA200 Daily: $${live.ema.daily} (${live.ema.pctD}%)`);
                if (live.ema.weekly) emaParts.push(`EMA200 Weekly: $${live.ema.weekly} (${live.ema.pctW}%)`);
                if (emaParts.length) context += `- เส้นค่าเฉลี่ย: ${emaParts.join(' | ')}\n`;
            }

            if (live && (Array.isArray(live.supports) || Array.isArray(live.resists))) {
                const supStr = (live.supports || []).slice(0, 3)
                    .map((s, idx) => `S${idx + 1}=$${Number(s.price).toFixed(2)} (Score ${s.score || '-'}, Tier ${s.tier || '-'})`)
                    .join(' | ');
                const rstStr = (live.resists || []).slice(0, 3)
                    .map((r, idx) => `R${idx + 1}=$${Number(r.price).toFixed(2)} (Score ${r.score || '-'}, Tier ${r.tier || '-'})`)
                    .join(' | ');
                if (supStr) context += `- แนวรับสำคัญ: ${supStr}\n`;
                if (rstStr) context += `- แนวต้านสำคัญ: ${rstStr}\n`;
            } else {
                context += `- แนวรับ: S1=$${stock.s1 || 'N/A'}, S2=$${stock.s2 || 'N/A'}, S3=$${stock.s3 || 'N/A'}\n`;
                context += `- แนวต้าน: R1=$${stock.r1 || 'N/A'}, R2=$${stock.r2 || 'N/A'}, R3=$${stock.r3 || 'N/A'}\n`;
            }

            // Custom Watchline Pins on active stock
            if (stock.symbol === ctx.currentSymbol && Array.isArray(ctx.customWatchLines) && ctx.customWatchLines.length > 0) {
                context += `- หมุดราคาที่ผู้ใช้ปักไว้เอง (Custom Pins 📌): ${ctx.customWatchLines.map(p => '$' + Number(p).toFixed(2)).join(', ')}\n`;
            }

            // Price Action trajectory from visible chart
            if (stock.symbol === ctx.currentSymbol && ctx.latestChartArgs) {
                const traj = summarizeChartTrajectory(ctx.latestChartArgs, ctx.currentRange);
                if (traj) context += `${traj}\n`;
            }

            // Wall Street Fundamentals
            if (live && live.summary && live.summary.fundamentals) {
                const f = live.summary.fundamentals;
                context += `- Wall Street Consensus: ${live.summary.rating ? String(live.summary.rating).toUpperCase() : 'N/A'}`;
                if (f.targetMeanPrice && f.targetMeanPrice !== '-') {
                    context += ` | Target Mean: $${f.targetMeanPrice} (Upside: ${f.upside || 'N/A'})`;
                }
                context += '\n';
                const fParts = [];
                if (f.extPrice != null && f.extChangePct != null) {
                    fParts.push(`${f.extType === 'PRE' ? 'Pre-Market' : 'After-Hours'}: $${f.extPrice.toFixed(2)} (${f.extChangePct > 0 ? '+' : ''}${f.extChangePct.toFixed(2)}%)`);
                }
                if (f.trailingPE && f.trailingPE !== '-') fParts.push(`P/E: ${f.trailingPE}`);
                if (f.marketCap && f.marketCap !== '-') fParts.push(`MktCap: ${f.marketCap}`);
                if (f.revenueGrowth && f.revenueGrowth !== '-') fParts.push(`RevGrowth: ${f.revenueGrowth}`);
                if (f.beta && f.beta !== '-') fParts.push(`Beta: ${f.beta}`);
                if (f.shortRatio && f.shortRatio !== '-') fParts.push(`ShortRatio: ${f.shortRatio}`);
                if (f.fiftyTwoWeekHigh && f.fiftyTwoWeekHigh !== '-') fParts.push(`52W: ${f.fiftyTwoWeekLow}-${f.fiftyTwoWeekHigh}`);
                if (fParts.length) context += `- พื้นฐาน & Valuation: ${fParts.join(' | ')}\n`;
                if (live.summary.desc && live.summary.desc.length > 20) {
                    context += `- ธุรกิจหลัก: ${live.summary.desc.slice(0, 260)}...\n`;
                }
            }
        }

        // Layer 4: Finnhub News for primary stock (if configured)
        if (targetSymbols.length > 0 && finnhubApiKey) {
            const newsList = await fetchCompanyNews(targetSymbols[0], finnhubApiKey);
            if (newsList.length > 0) {
                context += `\n[ข่าวสดรอบ 7 วันจาก Finnhub สำหรับ ${targetSymbols[0]}]\n`;
                newsList.forEach((n, idx) => {
                    context += `${idx + 1}. [${n.source}] ${n.headline} (${n.date})\n`;
                    if (n.summary) context += `   สรุป: ${n.summary}\n`;
                });
            }
        }

        // Layer 5: Market Breadth, Fear & Greed + Top S1 Proximity Scanner
        if (ctx.allStocks.length > 0) {
            const up = ctx.allStocks.filter(s => parseFloat(s.change_percent) > 0).length;
            const down = ctx.allStocks.filter(s => parseFloat(s.change_percent) < 0).length;
            context += `\n[ภาพรวมตลาดหุ้นสหรัฐฯ วันนี้]\n`;
            context += `- หุ้นบวก: ${up} ตัว | หุ้นลบ: ${down} ตัว (รวม ${ctx.allStocks.length} ตัวในระบบ)\n`;

            const isScanIntent = foundStocks.length === 0 || /สแกน|ใกล้|แนวรับ|น่าซื้อ|น่าเก็บ|คัด|แนะนำ|ตัวไหน|ตลาด/i.test(userText);
            if (isScanIntent) {
                const nearS1 = ctx.allStocks
                    .filter(s => typeof s.price === 'number' && typeof s.s1 === 'number' && s.s1 > 0 && s.price >= s.s1 * 0.985)
                    .map(s => ({
                        symbol: s.symbol,
                        price: s.price,
                        s1: s.s1,
                        distPct: ((s.price - s.s1) / s.s1) * 100,
                        rsi: s.rsi,
                        status: s.status
                    }))
                    .sort((a, b) => Math.abs(a.distPct) - Math.abs(b.distPct))
                    .slice(0, 6);

                if (nearS1.length > 0) {
                    context += `- หุ้นใกล้แนวรับ S1 มากที่สุดตอนนี้:\n`;
                    nearS1.forEach(item => {
                        context += `  • ${item.symbol}: $${item.price.toFixed(2)} (ห่าง S1 $${item.s1.toFixed(2)} อยู่ ${item.distPct.toFixed(2)}%, RSI: ${item.rsi || 'N/A'}, ${item.status || ''})\n`;
                    });
                }
            }
        }

        // Fear & Greed (from bridge or DOM fallback)
        const fg = ctx.fearGreed;
        const fgDomScore = document.getElementById('fg-score')?.textContent?.trim();
        const fgDomLabel = document.getElementById('fg-label')?.textContent?.trim();
        if (fg && fg.score != null) {
            context += `- CNN Fear & Greed Index: ${fg.score} (${fg.rating || ''})${fg.vix != null ? ` | VIX Score: ${fg.vix}` : ''}\n`;
        } else if (fgDomScore && fgDomScore !== '--') {
            context += `- CNN Fear & Greed Index: ${fgDomScore} (${fgDomLabel || ''})\n`;
        }

        if (ctx.favorites.length > 0) {
            context += `- รายการโปรดของผู้ใช้: ${ctx.favorites.slice(0, 10).join(', ')}\n`;
        }

        return context;
    }

    async function callGeminiDirectOrGateway(fullSystemInstruction, userText, modelId, useSearchGrounding, useThinkingConfig = true) {
        const geminiContents = messageHistory.map(msg => ({
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: msg.content }]
        }));
        geminiContents.push({ role: 'user', parts: [{ text: userText }] });

        const generationConfig = {
            temperature: aiMode === 'pro' ? 0.55 : 0.7,
            maxOutputTokens: aiMode === 'pro' ? 16384 : 8192
        };

        // Keep thinking depth balanced so models never exhaust tokens before emitting visible text
        if (useThinkingConfig) {
            if (/gemini-(4|3)/i.test(modelId)) {
                generationConfig.thinkingConfig = {
                    thinkingLevel: aiMode === 'pro' ? 'medium' : 'low'
                };
            } else if (/gemini-2\.5/i.test(modelId)) {
                generationConfig.thinkingConfig = {
                    thinkingBudget: aiMode === 'pro' ? 4096 : 1024
                };
            }
        }

        const payload = {
            systemInstruction: { parts: [{ text: fullSystemInstruction }] },
            contents: geminiContents,
            generationConfig
        };

        if (useSearchGrounding && !vercelTeamId) {
            payload.tools = [{ google_search: {} }];
        }

        const cleanKey = apiKey.trim();
        const endpoint = vercelTeamId
            ? `https://gateway.ai.vercel.com/v1/${encodeURIComponent(vercelTeamId)}/google-gemini/v1beta/models/${encodeURIComponent(modelId)}:generateContent`
            : `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent`;

        const res = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': cleanKey
            },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            const msg = errData.error?.message || `Google API Error (${res.status})`;
            // Graceful retry without thinkingConfig if a model variant rejects it
            if (useThinkingConfig && res.status === 400 && /thinking/i.test(msg)) {
                return callGeminiDirectOrGateway(fullSystemInstruction, userText, modelId, useSearchGrounding, false);
            }
            // Graceful retry without google_search tool if a specific model rejects search tool
            if (useSearchGrounding && res.status === 400 && /search|tool|grounding/i.test(msg)) {
                return callGeminiDirectOrGateway(fullSystemInstruction, userText, modelId, false, useThinkingConfig);
            }
            throw new Error(msg);
        }

        const data = await res.json();
        const candidate = data.candidates && data.candidates[0];
        if (!candidate) {
            const blockReason = data.promptFeedback && data.promptFeedback.blockReason;
            throw new Error(blockReason ? `คำขอถูกบล็อก (${blockReason})` : 'ไม่พบคำตอบจาก Gemini API');
        }

        const parts = (candidate.content && Array.isArray(candidate.content.parts)) ? candidate.content.parts : [];
        const reply = parts.filter(p => !p.thought && p.text).map(p => p.text).join('');

        if (!reply.trim()) {
            const reason = candidate.finishReason || 'EMPTY_RESPONSE';
            throw new Error(`โมเดลไม่ได้ส่งข้อความกลับมา (finishReason: ${reason}) ลองกดส่งอีกครั้งหรือเปลี่ยนโมเดลใน ⚙️`);
        }

        const sources = [];
        const chunks = candidate.groundingMetadata && candidate.groundingMetadata.groundingChunks;
        if (Array.isArray(chunks)) {
            chunks.forEach(c => {
                if (c.web && c.web.uri) {
                    sources.push({ uri: c.web.uri, title: c.web.title || c.web.uri });
                }
            });
        }
        return { reply, sources };
    }

    async function handleSend() {
        const text = chatInput.value.trim();
        if (!text || isWaitingForResponse) return;

        if (!apiKey) {
            appendMessage('ai', 'กรุณาตั้งค่า API Key ก่อนเริ่มใช้งานนะครับ โดยกดปุ่มตั้งค่า (รูปเฟือง ⚙️) ที่มุมขวาบนของแชท');
            return;
        }

        appendMessage('user', escapeHtml(text));
        chatInput.value = '';
        chatInput.style.height = 'auto';
        isWaitingForResponse = true;

        const typingDiv = showTypingIndicator();

        try {
            const systemContext = await getSystemContext(text);

            const styleHint = investStyle === 'invest'
                ? 'เน้นมุมมองลงทุนระยะกลาง-ยาว (3-12 เดือน): ให้ความสำคัญกับคุณภาพธุรกิจ (Moat), Valuation เทียบการเติบโต, Wall Street Target, แนวรับแข็งระดับ Weekly (S2/S3) และการทยอยสะสม'
                : 'เน้นมุมมอง Swing Trade (ระยะสั้น-กลาง): ให้ความสำคัญกับโครงสร้างราคาเทียบ EMA200, จังหวะเข้าที่แนวรับสำคัญ/Breakout, จุด Stop Loss ที่ชัดเจน, R:R >= 1:2 และ Catalyst ระยะใกล้';

            const searchCredibilityRule = webSearchEnabled
                ? `3. **กฎการค้นหาและตรวจสอบข่าวสด (Credible Live News)**:
   - เมื่อค้นข้อมูลผ่าน Google Search ให้ยึดข้อมูลจากแหล่งการเงินที่น่าเชื่อถือระดับ Tier-1 เท่านั้น ได้แก่ **Reuters, Bloomberg, CNBC, Wall Street Journal (WSJ), Financial Times, Yahoo Finance, MarketWatch, SEC Filings / ข้อมูลทางการบริษัท** (หลีกเลี่ยงบล็อกปั่นกระแสหรือข่าวลือที่ไม่มีแหล่งอ้างอิง)
   - สรุปเฉพาะข่าวที่มีผลต่อราคาจริงในรอบ 7–14 วันล่าสุด, ผลประกอบการ/Guidance ล่าสุด, การปรับ Rating/Target ของนักวิเคราะห์ หรือข่าว Macro/Sector ที่กระทบโดยตรง พร้อมระบุ **วันที่/ช่วงเวลาและชื่อสำนักข่าว** ให้ชัด`
                : `3. **กฎเรื่องข่าว**: ใช้ข่าวจาก Finnhub ที่แนบมา (ถ้ามี) และห้ามแต่งข่าวลือเองเด็ดขาด หากไม่มีข่าวให้ระบุตรงๆ ว่าไม่มีข่าวด่วนในระบบ และวิเคราะห์จาก Valuation / Revenue Growth แทน`;

            const coachInstruction = `คุณคือ "AlphaZone AI Investment Coach" นักวิเคราะห์หลักทรัพย์และโค้ชบริหารความเสี่ยงหุ้นสหรัฐฯ (S&P 500 & NASDAQ 100) ประจำแพลตฟอร์ม AlphaZone
กติกาหลัก:
1. ฐานข้อมูล AlphaZone คือหุ้นตลาดสหรัฐอเมริกา (US Market) เท่านั้น ไม่ใช่หุ้นไทยและไม่ใช่คริปโต
2. ตอบเป็นภาษาไทยอย่างมืออาชีพ ชัดเจน มีเหตุผลอ้างอิงตัวเลขจริงทุกจุด ${styleHint}
${searchCredibilityRule}
4. **รูปแบบการตอบตามประเภทคำถาม**:
   - **หากวิเคราะห์หุ้นเดี่ยว** ให้ใช้ **"5-Pillar Conviction Framework"** อย่างละเอียดครบถ้วนดังนี้:
     * **0. Verdict & Market Regime (สรุปฟันธงทันที)**: ฟันธงสถานะ (**น่าเข้าซื้อ / รอสัญญาณยืนยัน / ทยอยสะสมแนวรับ / หลีกเลี่ยง**), ระดับความมั่นใจ (**สูง / กลาง / ต่ำ**) และประเมินสภาพตลาดรวม (จาก Fear & Greed Index และ Market Breadth)
     * **1. Fundamental & Valuation (พื้นฐาน & ความคุ้มค่า)**: วิเคราะห์โมเดลธุรกิจ/Moat, Revenue Growth, Trailing P/E (ถูกหรือแพงเทียบการเติบโต), Wall Street Consensus & Target Mean Upside % เพื่อแยก "หุ้นดีราคาย่อ" ออกจาก "Value Trap"
     * **2. Technical & Price Structure (โครงสร้างกราฟ & แนวรับ-ต้าน)**: ประเมินเทรนด์เทียบ EMA200 Daily & Weekly, RSI(14), พฤติกรรมราคาบน Timeframe ปัจจุบัน, คุณภาพแนวรับ-ต้าน (Score/Tier ของ S1–S3, R1–R3) และวิเคราะห์ร่วมกับ Custom Watchline Pins (📌) ที่ผู้ใช้ปักไว้ (ถ้ามี)
     * **3. Live News, Catalysts & Bear Case (ข่าวกระทบราคา & ปัจจัยเสี่ยง)**:
       - **ข่าวล่าสุด & Bullish Catalysts**: สรุปข่าว/งบ/Guidance ที่มีผลกระทบต่อราคาจริงพร้อมแหล่งข่าว
       - **Bear Case (ข้อควรระวัง & จุดสมมติฐานพัง)**: ระบุความเสี่ยงจาก Beta, Short Ratio, อุปสรรคธุรกิจ และเงื่อนไขที่หากเกิดขึ้นแปลว่าแผนผิดทาง (Thesis Invalidated)
     * **4. Action Plan & Position Sizing (แผนเทรด & การแบ่งไม้)**: ระบุโซนเข้าซื้อ (Entry 1 / Entry 2), จุด Stop Loss, เป้าทำกำไร (TP1 / TP2), **คำนวณ Risk:Reward Ratio (R:R) เป็นตัวเลขจริง**, และแนะนำการแบ่งไม้ (Position Sizing เช่น คุมความเสี่ยงไม่เกิน 1-2% ของพอร์ต หรือแบ่งเข้า 25-30% หากสวนเทรนด์)
   - **หากถามเน้นอัปเดตข่าวหุ้น**: ให้ขึ้นต้นด้วย **สรุปผลกระทบต่อราคา (บวก/ลบ/เป็นกลาง)** แล้วเรียง **ไทม์ไลน์ข่าวล่าสุดจากแหล่งน่าเชื่อถือ** พร้อมเชื่อมโยงว่าข่าวนั้นส่งผลให้ต้องจับตาแนวรับ-ต้านใดเป็นพิเศษ
   - **หากถามเปรียบเทียบหลายหุ้นหรือสแกนตลาด**: ให้เทียบแบบตาราง/หัวข้อชัดเจนครบทั้ง Trend, Valuation, แนวรับ-ต้าน, Catalyst และสรุปตัวที่ได้เปรียบที่สุด
5. **แท็กปักหมุดลงกราฟอัตโนมัติ**: เมื่อมีแผนราคาเข้า-ออกสำหรับหุ้นที่เปิดดูอยู่ ให้ปิดท้ายบรรทัดสุดท้ายด้วยรูปแบบนี้เสมอ (ตัวเลขเท่านั้น ไม่ใส่ $):
   [[ALERTS: entry=000.00, sl=000.00, tp1=000.00, tp2=000.00]]`;

            const fullSystemInstruction = `${coachInstruction}\n\n${systemContext}`;

            let rawReply = '';
            let sources = [];
            let metaLabel = '';

            if (isGeminiKey(apiKey)) {
                const chosenModel = getActiveModelId();
                const resObj = await callGeminiDirectOrGateway(fullSystemInstruction, text, chosenModel, webSearchEnabled);
                rawReply = resObj.reply;
                sources = resObj.sources || [];
                metaLabel = `${aiMode === 'pro' ? '🧠 Deep Pro' : '⚡ Fast'} • ${investStyle === 'invest' ? '🏛️ Invest' : '🎯 Swing'} • ${chosenModel}${sources.length ? ' • 🌐 Grounded' : ''}`;
            } else {
                // OpenAI Fallback
                const endpoint = vercelTeamId
                    ? `https://gateway.ai.vercel.com/v1/${encodeURIComponent(vercelTeamId)}/openai/chat/completions`
                    : 'https://api.openai.com/v1/chat/completions';

                const apiMessages = [
                    { role: 'system', content: fullSystemInstruction },
                    ...messageHistory,
                    { role: 'user', content: text }
                ];

                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    },
                    body: JSON.stringify({
                        model: aiMode === 'pro' ? 'gpt-4o' : 'gpt-4o-mini',
                        messages: apiMessages,
                        temperature: 0.6,
                        max_tokens: 1400
                    })
                });

                if (!response.ok) {
                    const errData = await response.json().catch(() => ({}));
                    throw new Error(errData.error?.message || `OpenAI API Error (${response.status})`);
                }
                const data = await response.json();
                rawReply = data.choices?.[0]?.message?.content || '';
                metaLabel = aiMode === 'pro' ? '🧠 gpt-4o' : '⚡ gpt-4o-mini';
            }

            const { cleanedText, pins } = extractAlertPlan(rawReply);

            typingDiv.remove();
            appendMessage('ai', escapeHtmlForChat(cleanedText), {
                rawText: cleanedText,
                metaLabel,
                pinPlans: pins,
                sources
            });

            // Save clean history (keep last 10 turns)
            messageHistory.push({ role: 'user', content: text });
            messageHistory.push({ role: 'assistant', content: cleanedText });
            if (messageHistory.length > 12) {
                messageHistory = messageHistory.slice(messageHistory.length - 12);
            }
        } catch (error) {
            console.error('AI Chat Error:', error);
            typingDiv.remove();
            appendMessage('ai', `<span style="color:#ef4444;">เกิดข้อผิดพลาด: ${escapeHtml(error.message)}</span>`);
        } finally {
            isWaitingForResponse = false;
        }
    }

    function escapeHtmlForChat(str) {
        if (!str) return '';
        let html = escapeHtml(str);
        html = html.replace(/`([^`]+)`/g, '<code style="background:rgba(148,163,184,0.18);padding:1px 5px;border-radius:4px;font-size:12px;">$1</code>');
        html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/^####\s+(.*$)/gim, '<strong style="color:var(--cyan,#22d3ee);font-size:13.5px;">$1</strong>');
        html = html.replace(/^###\s+(.*$)/gim, '<strong style="color:var(--blue,#38bdf8);font-size:14px;">$1</strong>');
        html = html.replace(/^##\s+(.*$)/gim, '<strong style="color:var(--blue,#38bdf8);font-size:15px;">$1</strong>');
        html = html.replace(/^&gt;\s?(.*$)/gim, '<blockquote>$1</blockquote>');
        html = html.replace(/^---+\s*$/gim, '<hr style="border:none;border-top:1px solid var(--border);margin:6px 0;">');
        html = html.replace(/^\*\s+(.*$)/gim, '• $1');
        html = html.replace(/^-\s+(.*$)/gim, '• $1');
        html = html.replace(/\n/g, '<br>');
        return html;
    }

    // Initialize Toolbar & Prompts
    initModelSelects();
    applyToolbarState();
    refreshContextAndPrompts();
});
