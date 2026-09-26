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
    const saveApiBtn = document.getElementById('btn-save-ai-api');
    const cancelApiBtn = document.getElementById('btn-cancel-ai-api');

    // State
    let openaiApiKey = safeGet('OPENAI_API_KEY', '');
    let vercelTeamId = safeGet('VERCEL_TEAM_ID', '');
    let isWaitingForResponse = false;
    let messageHistory = [
        { role: 'system', content: 'You are AlphaZone AI, an expert stock market assistant. You help users analyze S&P500 and NASDAQ100 stocks. You use the provided context to answer questions in Thai.' }
    ];

    // Toggle Chat
    function toggleChat() {
        chatContainer.classList.toggle('ai-chat-hidden');
        if (!chatContainer.classList.contains('ai-chat-hidden')) {
            chatInput.focus();
        }
    }

    chatFab.addEventListener('click', toggleChat);
    closeBtn.addEventListener('click', toggleChat);

    // Settings Modal
    settingsBtn.addEventListener('click', () => {
        apiKeyInput.value = openaiApiKey;
        if(teamIdInput) teamIdInput.value = vercelTeamId;
        configModal.classList.add('active');
    });

    cancelApiBtn.addEventListener('click', () => {
        configModal.classList.remove('active');
    });

    saveApiBtn.addEventListener('click', () => {
        const key = apiKeyInput.value.trim();
        const teamId = teamIdInput ? teamIdInput.value.trim() : '';
        
        if (key) {
            safeSet('OPENAI_API_KEY', key);
            openaiApiKey = key.trim();
            
            safeSet('VERCEL_TEAM_ID', teamId);
            vercelTeamId = teamId.trim();
            
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

    function appendMessage(sender, text) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `chat-message ${sender}-message`;
        msgDiv.innerHTML = `<div class="message-bubble">${text}</div>`;
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

    // Context Gathering
    function getSystemContext() {
        let context = "นี่คือข้อมูลล่าสุดจากระบบ AlphaZone:\n";
        
        // ถ้าผู้ใช้เปิดดูหุ้นตัวไหนอยู่ ให้เน้นตัวนั้น
        if (typeof currentSymbol !== 'undefined' && currentSymbol && typeof allStocks !== 'undefined') {
            const stock = allStocks.find(s => s.symbol === currentSymbol);
            if (stock) {
                context += `\nหุ้นที่ผู้ใช้กำลังเปิดดู (Current Focus): ${stock.symbol} (${stock.name})\n`;
                context += `- ราคาล่าสุด: $${stock.price.toFixed(2)}\n`;
                context += `- เปลี่ยนแปลง: ${stock.change} (${stock.change_percent}%)\n`;
                context += `- Sector: ${stock.sector}\n`;
                if (stock.rsi) context += `- RSI(14): ${stock.rsi}\n`;
                
                // Add Support/Resistance levels if available
                if (typeof currentLevelsData !== 'undefined' && currentLevelsData && currentLevelsData.levels) {
                    context += `- แนวรับ-แนวต้าน: ${currentLevelsData.levels.map(l => l.price).join(', ')}\n`;
                }
            }
        }
        
        // ข้อมูลภาพรวมตลาดสั้นๆ
        if (typeof allStocks !== 'undefined' && allStocks.length > 0) {
            const up = allStocks.filter(s => parseFloat(s.change_percent) > 0).length;
            const down = allStocks.filter(s => parseFloat(s.change_percent) < 0).length;
            context += `\nภาพรวมตลาดวันนี้: หุ้นบวก ${up} ตัว, ลบ ${down} ตัว (จากทั้งหมด ${allStocks.length} ตัว)\n`;
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

        // Add context to the latest prompt
        const systemContext = getSystemContext();
        
        const apiMessages = [
            messageHistory[0], // System prompt
            { role: 'system', content: systemContext }, // Inject Real-time Context
            ...messageHistory.slice(1), // Previous chat history
            { role: 'user', content: text } // New user message
        ];

        const typingDiv = showTypingIndicator();

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
                    systemInstruction: { parts: [{ text: systemContext }] },
                    contents: geminiContents
                };

                const geminiPath = `v1beta/models/gemini-3.8-flash:generateContent?key=${openaiApiKey}`;
                const apiUrl = vercelTeamId 
                    ? `https://gateway.ai.vercel.com/v1/${vercelTeamId}/google-gemini/${geminiPath}`
                    : `https://generativelanguage.googleapis.com/${geminiPath}`;

                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(geminiPayload)
                });

                if (!response.ok) {
                    const errData = await response.json();
                    throw new Error(errData.error?.message || 'Google API Error');
                }

                const data = await response.json();
                aiReply = data.candidates[0].content.parts[0].text;

            } else {
                // --- OpenAI API Logic ---
                const apiUrl = vercelTeamId 
                    ? `https://gateway.ai.vercel.com/v1/${vercelTeamId}/openai/chat/completions`
                    : 'https://api.openai.com/v1/chat/completions';

                const apiMessages = [
                    messageHistory[0], // System prompt
                    { role: 'system', content: systemContext }, // Inject Real-time Context
                    ...messageHistory.slice(1), // Previous chat history
                    { role: 'user', content: text } // New user message
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
            appendMessage('ai', escapeHtmlForChat(aiReply));

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
        // Simple escape, but allow some basic markdown-like formatting (bold) if needed
        return escapeHtml(str).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
    }
});
