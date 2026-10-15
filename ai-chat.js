// --- AI Chatbot Logic ---
document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const chatContainer = document.getElementById('ai-chat-container');
    const chatFab = document.getElementById('ai-chat-fab');
    const closeBtn = document.getElementById('ai-close-btn');
    const settingsBtn = document.getElementById('ai-settings-btn');
    const chatMessages = document.getElementById('ai-chat-messages');
    const chatInput = document.getElementById('ai-chat-input');
    const sendBtn = document.getElementById('ai-send-btn');
    
    const configModal = document.getElementById('ai-config-modal');
    const apiKeyInput = document.getElementById('ai-api-key-input');
    const teamIdInput = document.getElementById('vercel-team-id-input');
    const discordWebhookInput = document.getElementById('discord-webhook-input');
    const finnhubApiKeyInput = document.getElementById('finnhub-api-key-input');
    const saveApiBtn = document.getElementById('btn-save-ai-api');
    const cancelApiBtn = document.getElementById('btn-cancel-ai-api');

    // State
    let openaiApiKey = safeGet('OPENAI_API_KEY', '');
    let vercelTeamId = safeGet('VERCEL_TEAM_ID', '');
    let discordWebhookUrl = safeGet('DISCORD_WEBHOOK_URL', '');
    let finnhubApiKey = safeGet('FINNHUB_API_KEY', '');
    let isWaitingForResponse = false;
    let messageHistory = [
        { role: 'system', content: 'You are AlphaZone AI, an expert stock market assistant. You help users analyze S&P500 and NASDAQ100 stocks. You use the provided context to answer questions in Thai.' }
    ];

    // Toggle Chat
    function toggleChat() {
        chatContainer.classList.toggle('ai-chat-hidden');
        if (!chatContainer.classList.contains('ai-chat-hidden')) {
            chatInput.focus();
            chatFab.style.display = 'none';
        } else {
            chatFab.style.display = 'flex';
        }
    }

    chatFab.addEventListener('click', toggleChat);
    closeBtn.addEventListener('click', toggleChat);

    // Settings Modal
    settingsBtn.addEventListener('click', () => {
        apiKeyInput.value = openaiApiKey;
        if(teamIdInput) teamIdInput.value = vercelTeamId;
        if(discordWebhookInput) discordWebhookInput.value = discordWebhookUrl;
        if(finnhubApiKeyInput) finnhubApiKeyInput.value = finnhubApiKey;
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
        
        if (key) {
            safeSet('OPENAI_API_KEY', key);
            openaiApiKey = key.trim();
            
            safeSet('VERCEL_TEAM_ID', teamId);
            vercelTeamId = teamId.trim();

            safeSet('DISCORD_WEBHOOK_URL', webhook);
            discordWebhookUrl = webhook.trim();

            safeSet('FINNHUB_API_KEY', finnhubKey);
            finnhubApiKey = finnhubKey.trim();
            
            configModal.classList.remove('active');
            appendMessage('ai', 'บันทึกการตั้งค่าเรียบร้อยแล้วครับ! พร้อมใช้งานแล้ว 🚀');
        } else {
            alert('กรุณากรอก API Key');
        }
    });

    // Auto-resize textarea
    chatInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
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
        } else {
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
    }

    function appendMessage(sender, text, rawText = '') {
        const msgDiv = document.createElement('div');
        msgDiv.className = `chat-message ${sender}-message`;
        msgDiv.innerHTML = `<div class="message-bubble">${text}</div>`;

        // If message is from AI and we have raw analysis text, add action buttons (Copy & Share to Discord)
        if (sender === 'ai' && rawText) {
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'message-actions';

            // 1. ปุ่มคัดลอก (Copy)
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
                    console.error('Clipboard copy error:', err);
                    alert('ไม่สามารถคัดลอกได้อัตโนมัติ กรุณาลองเลือกคลุมดำเพื่อคัดลอกครับ');
                }
            });
            actionsDiv.appendChild(copyBtn);

            // 2. ปุ่มแชร์เข้า Discord
            const discordBtn = document.createElement('button');
            discordBtn.className = 'msg-action-btn';
            discordBtn.innerHTML = '<i class="ri-discord-fill" style="color:#5865F2;"></i> แชร์เข้า Discord';
            discordBtn.title = 'ส่งบทวิเคราะห์นี้ไปยังห้องแชท Discord';
            discordBtn.addEventListener('click', async () => {
                if (!discordWebhookUrl) {
                    alert('ยังไม่ได้ใส่ Discord Webhook URL ครับ!\n\nกรุณากดไอคอนฟันเฟือง ⚙️ ด้านบนขวา แล้วใส่ลิงก์ Webhook จาก Discord ในช่องที่ 3 แล้วกดบันทึก');
                    configModal.classList.add('active');
                    if (discordWebhookInput) discordWebhookInput.focus();
                    return;
                }

                const origHtml = discordBtn.innerHTML;
                discordBtn.disabled = true;
                discordBtn.innerHTML = '<i class="ri-loader-4-line ri-spin"></i> กำลังส่ง...';

                try {
                    // Extract title from first line of analysis if available
                    let title = '📊 บทวิเคราะห์ AlphaZone AI Coach';
                    const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
                    if (lines.length > 0) {
                        const cleanFirst = lines[0].replace(/[#*`_]/g, '').trim();
                        if (cleanFirst.length > 0 && cleanFirst.length < 100) {
                            title = cleanFirst;
                        }
                    }

                    // Format text for Discord (embed description limit is 4096 chars)
                    let description = rawText;
                    if (description.length > 3900) {
                        description = description.slice(0, 3900) + '\n\n...(ข้อความยาวเกิน ขอยกมาบางส่วน)...';
                    }

                    const payload = {
                        username: 'AlphaZone AI Coach',
                        avatar_url: 'https://cdn-icons-png.flaticon.com/512/4712/4712109.png',
                        embeds: [
                            {
                                title: title,
                                description: description,
                                color: 0x38bdf8,
                                timestamp: new Date().toISOString(),
                                footer: {
                                    text: 'AlphaZone Market Intelligence • P-A-R-T Framework'
                                }
                            }
                        ]
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
                        const errTxt = await res.text().catch(() => '');
                        throw new Error(`HTTP ${res.status}: ${errTxt}`);
                    }
                } catch (sendErr) {
                    console.error('Discord Webhook Error:', sendErr);
                    discordBtn.innerHTML = '<i class="ri-error-warning-line" style="color:#ef4444;"></i> ส่งไม่สำเร็จ';
                    setTimeout(() => {
                        discordBtn.innerHTML = origHtml;
                        discordBtn.disabled = false;
                    }, 2500);
                    alert('ส่งเข้า Discord ไม่สำเร็จ! กรุณาตรวจสอบว่า Discord Webhook URL ถูกต้องหรือไม่');
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

    // Fetch Company News from Finnhub safely (with 3.5s timeout & zero blocking)
    async function fetchCompanyNews(symbol, apiKey) {
        if (!symbol || !apiKey) return [];
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3500);

            const toDate = new Date().toISOString().split('T')[0];
            const fromDateObj = new Date();
            fromDateObj.setDate(fromDateObj.getDate() - 7);
            const fromDate = fromDateObj.toISOString().split('T')[0];

            const url = `https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(symbol)}&from=${fromDate}&to=${toDate}&token=${encodeURIComponent(apiKey)}`;
            
            const res = await fetch(url, { signal: controller.signal });
            clearTimeout(timeoutId);

            if (!res.ok) {
                console.warn(`Finnhub news status: ${res.status}`);
                return [];
            }

            const data = await res.json();
            if (!Array.isArray(data)) return [];

            return data
                .filter(item => item && item.headline && item.headline.trim().length > 0)
                .slice(0, 3)
                .map(item => ({
                    headline: item.headline.trim(),
                    summary: (item.summary || '').trim().slice(0, 250),
                    source: item.source || 'Financial Media',
                    date: item.datetime ? new Date(item.datetime * 1000).toLocaleDateString('th-TH') : ''
                }));
        } catch (e) {
            console.warn('Finnhub news fetch skipped:', e.message || e);
            return [];
        }
    }

    // Context Gathering with Smart Symbol Extraction
    async function getSystemContext(userText = '') {
        let context = "=== ข้อมูลสดจากระบบ AlphaZone (US Stock S&P 500 / NASDAQ 100) ===\n";
        
        // 1. ตรวจจับชื่อหุ้นจากข้อความที่ผู้ใช้พิมพ์ (เช่น CRWV, NVDA, AAPL)
        const foundStocks = [];
        if (userText && typeof allStocks !== 'undefined' && Array.isArray(allStocks)) {
            const rawWords = userText.toUpperCase().match(/\b[A-Z]{1,5}\b/g) || [];
            const ignoreList = new Set(['AI', 'API', 'USD', 'THB', 'SET', 'MAI', 'BUY', 'SELL', 'RSI', 'PE', 'PBV', 'EPS', 'CEO', 'IPO', 'USA', 'US', 'CHAT', 'HELP', 'WHAT', 'HOW', 'WHEN', 'WHY']);
            
            rawWords.forEach(w => {
                if (!ignoreList.has(w)) {
                    const match = allStocks.find(s => s.symbol && s.symbol.toUpperCase() === w);
                    if (match && !foundStocks.some(f => f.symbol === match.symbol)) {
                        foundStocks.push(match);
                    }
                }
            });
        }

        // 2. ถ้าผู้ใช้เปิดดูหุ้นตัวไหนค้างไว้บนหน้าจอ ให้ดึงมาเสริมด้วย
        if (typeof currentSymbol !== 'undefined' && currentSymbol && typeof allStocks !== 'undefined') {
            const currentStock = allStocks.find(s => s.symbol === currentSymbol);
            if (currentStock && !foundStocks.some(f => f.symbol === currentStock.symbol)) {
                foundStocks.push(currentStock);
            }
        }

        // 3. แนบข้อมูลสถิติของหุ้นแต่ละตัวที่ตรวจพบ
        if (foundStocks.length > 0) {
            foundStocks.forEach(stock => {
                context += `\n[ข้อมูลทางเทคนิคของหุ้น ${stock.symbol} (${stock.name || ''})]\n`;
                context += `- สถานะการจดทะเบียน: บริษัทนี้จดทะเบียนซื้อขายในตลาดหลักทรัพย์สหรัฐฯ เรียบร้อยแล้ว (Symbol: ${stock.symbol})\n`;
                context += `- หมวดตลาด: ${stock.index || 'S&P500 / NASDAQ100'} | กลุ่มอุตสาหกรรม (Sector): ${stock.sector || 'N/A'}\n`;
                context += `- ราคาล่าสุด: $${typeof stock.price === 'number' ? stock.price.toFixed(2) : (stock.price || 'N/A')}\n`;
                if (stock.change || stock.change_percent) {
                    context += `- การเปลี่ยนแปลง: ${stock.change || 0} (${stock.change_percent || 0}%)\n`;
                }
                context += `- สถานะแนวโน้มอัลกอริทึม (Status): ${stock.status || 'N/A'}\n`;
                context += `- โซนแนวรับ (Support Zones): S1=$${stock.s1 || 'N/A'}, S2=$${stock.s2 || 'N/A'}, S3=$${stock.s3 || 'N/A'}\n`;
                context += `- โซนแนวต้าน (Resistance Zones): R1=$${stock.r1 || 'N/A'}, R2=$${stock.r2 || 'N/A'}, R3=$${stock.r3 || 'N/A'}\n`;
                if (stock.pivot) context += `- จุดหมุนราคา (Pivot Point): $${stock.pivot}\n`;
                if (stock.rsi) context += `- RSI(14): ${stock.rsi}\n`;
            });

            // 3.1 แนบข่าวสดล่าสุดจาก Finnhub (ถ้ามี API Key)
            if (finnhubApiKey) {
                const primarySymbol = foundStocks[0].symbol;
                try {
                    const newsList = await fetchCompanyNews(primarySymbol, finnhubApiKey);
                    if (newsList && newsList.length > 0) {
                        context += `\n[ข่าวสดล่าสุดในรอบ 7 วันจากสำนักข่าวชั้นนำ (Reuters/CNBC/Bloomberg) สำหรับ ${primarySymbol}]\n`;
                        newsList.forEach((n, idx) => {
                            context += `${idx + 1}. [${n.source}] ${n.headline} (${n.date})\n`;
                            if (n.summary) context += `   สรุป: ${n.summary}\n`;
                        });
                        context += `(คำแนะนำโค้ช: นำประเด็นข่าวข้างต้นไปร่วมวิเคราะห์ในข้อ T: Trigger & News เพื่อชี้ให้เห็นว่าข่าวส่งผลต่อจิตวิทยาตลาดและกรอบราคาอย่างไร)\n`;
                    }
                } catch (newsErr) {
                    console.warn('Error appending news to context:', newsErr);
                }
            }
        }

        // 4. ข้อมูลภาพรวมตลาดสหรัฐฯ
        if (typeof allStocks !== 'undefined' && allStocks.length > 0) {
            const up = allStocks.filter(s => parseFloat(s.change_percent) > 0).length;
            const down = allStocks.filter(s => parseFloat(s.change_percent) < 0).length;
            context += `\n[ภาพรวมตลาดหุ้นสหรัฐฯ วันนี้]\n`;
            context += `- หุ้นบวก: ${up} ตัว | หุ้นลบ: ${down} ตัว (จากฐานข้อมูล AlphaZone ทั้งหมด ${allStocks.length} ตัว)\n`;
        }
        if (typeof fearGreedScore !== 'undefined' && fearGreedScore !== null) {
            context += `- ดัชนีความกลัวและความโลภ (Fear & Greed Index): ${fearGreedScore} (${typeof fearGreedRating !== 'undefined' ? fearGreedRating : ''})\n`;
        }

        return context;
    }

    async function handleSend() {
        const text = chatInput.value.trim();
        if (!text || isWaitingForResponse) return;

        if (!openaiApiKey) {
            appendMessage('ai', 'กรุณาตั้งค่า API Key ก่อนเริ่มใช้งานนะครับ โดยกดปุ่มตั้งค่า (รูปเฟือง) ที่มุมขวาบนของแชท');
            return;
        }

        // Add user message
        appendMessage('user', text);
        chatInput.value = '';
        chatInput.style.height = 'auto';
        isWaitingForResponse = true;

        const typingDiv = showTypingIndicator();

        // 1. Gather Real-time System Context (async with live news)
        const systemContext = await getSystemContext(text);
        
        // 2. Define Master Coach System Instruction (P-A-R-T Framework)
        const coachInstruction = `คุณคือ "AlphaZone AI Investment Coach" โค้ชและที่ปรึกษาการลงทุนหุ้นสหรัฐอเมริกา (S&P 500 & NASDAQ 100) ประจำแพลตฟอร์ม AlphaZone
กฎเหล็กที่ต้องปฏิบัติ:
1. ฐานข้อมูล AlphaZone ทั้งหมดคือหุ้นในตลาดสหรัฐอเมริกา (US Market) เท่านั้น ไม่ใช่ตลาดหุ้นไทย (SET/mai) และไม่ใช่เหรียญคริปโตเคอร์เรนซี (เช่น CRWV คือหุ้น CoreWeave ในตลาด NASDAQ ไม่ใช่เหรียญคริปโต CRV Curve)
2. หากหุ้นตัวใดมีข้อมูลในระบบ AlphaZone แนบมาให้ แสดงว่าจดทะเบียนซื้อขายในตลาดสหรัฐฯ แล้ว ห้ามตอบว่ายังไม่เข้าตลาด หรือรอ IPO/S-1 เด็ดขาด
3. ตอบเป็นภาษาไทยอย่างมืออาชีพ กระชับ ชัดเจน มีวินัยในการลงทุน
4. เมื่อผู้ใช้ถามถึงหุ้นตัวใด ให้วิเคราะห์อย่างเป็นระบบตามกรอบ "P-A-R-T Framework":
   - P (Position & Trend): ประเมินทิศทางและโครงสร้างราคาปัจจุบันจากข้อมูลของระบบ (เช่น strong_up = ขาขึ้นแข็งแกร่ง, strong_down = ขาลง)
   - A (Action Plan): วางแผนจุดเข้า โซนแนวรับ (S1, S2) สำหรับทยอยสะสม และเป้าหมายทำกำไรที่แนวต้าน (R1, R2)
   - R (Risk Management): จุดตัดขาดทุน (Stop Loss) ที่แนะนำ และประเมินความคุ้มค่า (Risk:Reward) หากสถานะเป็น strong_down ให้เตือนอย่าเพิ่งรีบรับมีด
   - T (Trigger & News): ปัจจัยขับเคลื่อนราคาและข่าวสาร หากมีข้อมูลข่าวสารสดแนบมา ให้เจาะลึกวิเคราะห์ว่าข่าวนี้ (Catalyst) มีผลต่อจิตวิทยาตลาดและทิศทางราคาอย่างไร หากไม่มีข่าว ให้สรุปแนวโน้มอุตสาหกรรมและปัจจัยขับเคลื่อนสำคัญ
5. อ้างอิงตัวเลขราคา แนวรับ-แนวต้าน จากข้อมูลระบบ AlphaZone ที่แนบมาให้เสมอ
6. จัดรูปแบบข้อความให้อ่านง่าย เว้นบรรทัดชัดเจน ไม่ใช้เส้นคั่น Markdown`;

        const fullSystemInstruction = `${coachInstruction}\n\n${systemContext}`;

        try {
            let aiReply = "";

            if (openaiApiKey.startsWith('AIza') || openaiApiKey.startsWith('AQ.')) {
                // --- Google Gemini API Logic ---
                // Convert message history to Gemini format
                const geminiContents = messageHistory.slice(1).map(msg => ({
                    role: msg.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: msg.content }]
                }));
                // Add current user message
                geminiContents.push({ role: 'user', parts: [{ text: text }] });

                const geminiPayload = {
                    systemInstruction: { parts: [{ text: fullSystemInstruction }] },
                    contents: geminiContents
                };

                const cleanKey = (openaiApiKey || '').trim();
                const geminiPath = `v1beta/models/gemini-3.8-flash:generateContent?key=${encodeURIComponent(cleanKey)}`;
                const apiUrl = vercelTeamId 
                    ? `https://gateway.ai.vercel.com/v1/${vercelTeamId}/google-gemini/${geminiPath}`
                    : `https://generativelanguage.googleapis.com/${geminiPath}`;

                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'x-goog-api-key': cleanKey
                    },
                    body: JSON.stringify(geminiPayload)
                });

                if (!response.ok) {
                    const errData = await response.json();
                    throw new Error(errData.error?.message || 'Google API Error');
                }

                const data = await response.json();
                const candidate = data.candidates && data.candidates[0];
                if (candidate && candidate.content && candidate.content.parts) {
                    aiReply = candidate.content.parts.map(p => p.text || '').join('');
                } else {
                    throw new Error('ไม่พบคำตอบจาก AI');
                }

            } else {
                // --- OpenAI API Logic ---
                const apiUrl = vercelTeamId 
                    ? `https://gateway.ai.vercel.com/v1/${vercelTeamId}/openai/chat/completions`
                    : 'https://api.openai.com/v1/chat/completions';

                const apiMessages = [
                    { role: 'system', content: fullSystemInstruction },
                    ...messageHistory.slice(1),
                    { role: 'user', content: text }
                ];

                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${openaiApiKey}`
                    },
                    body: JSON.stringify({
                        model: 'gpt-4o-mini',
                        messages: apiMessages,
                        temperature: 0.7,
                        max_tokens: 500
                    })
                });

                if (!response.ok) {
                    const errData = await response.json();
                    throw new Error(errData.error?.message || 'OpenAI API Error');
                }

                const data = await response.json();
                aiReply = data.choices[0].message.content;
            }

            typingDiv.remove();
            appendMessage('ai', escapeHtmlForChat(aiReply), aiReply);

            // Save to history (limit to last 10 messages)
            messageHistory.push({ role: 'user', content: text });
            messageHistory.push({ role: 'assistant', content: aiReply });
            if (messageHistory.length > 11) {
                messageHistory = [messageHistory[0], ...messageHistory.slice(messageHistory.length - 10)];
            }

        } catch (error) {
            console.error('AI Chat Error:', error);
            typingDiv.remove();
            appendMessage('ai', `<span style="color:#ff4a4a;">เกิดข้อผิดพลาด: ${error.message}</span>`);
        } finally {
            isWaitingForResponse = false;
        }
    }

    function escapeHtmlForChat(str) {
        if (!str) return '';
        let html = escapeHtml(str);
        html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/^###\s+(.*$)/gim, '<strong style="color:var(--accent,#4da6ff);">$1</strong>');
        html = html.replace(/^##\s+(.*$)/gim, '<strong style="color:var(--accent,#4da6ff);">$1</strong>');
        html = html.replace(/^\*\s+(.*$)/gim, '• $1');
        html = html.replace(/^-\s+(.*$)/gim, '• $1');
        html = html.replace(/\n/g, '<br>');
        return html;
    }
});
