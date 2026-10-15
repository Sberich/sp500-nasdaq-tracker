import discord
import requests
import json
import re
import os
from dotenv import load_dotenv

load_dotenv()

DISCORD_TOKEN = os.getenv('DISCORD_TOKEN')
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
GAS_API_URL = 'https://script.google.com/macros/s/AKfycbzKXQWPFCWqNG0MkZlvl4x4uhxYy9F2ppjXGfb523Ek3cgAhiYOpvNzDXlfvZYaP9IF/exec'

class AlphaZoneBot(discord.Client):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

    async def on_ready(self):
        print(f'Logged in as {self.user}')

    async def on_message(self, message):
        if message.author == self.user:
            return

        if self.user.mentioned_in(message):
            clean_content = message.clean_content.replace(f'@{self.user.name}', '').strip()
            match = re.search(r'\b[A-Z]{1,5}\b', clean_content)
            symbol = match.group(0) if match else None

            system_context = ""
            if symbol:
                await message.channel.send(f"⏳ กำลังดึงข้อมูล **{symbol}** จากหน้าจอ AlphaZone และวิเคราะห์...")
                try:
                    res = requests.get(f"{GAS_API_URL}?action=getLiveLevels&symbol={symbol}", timeout=10)
                    if res.status_code == 200:
                        data = res.json()
                        if 'data' in data and data['data']:
                            stock_data = data['data']
                            system_context = f'''
                            ข้อมูลหุ้น: {symbol}
                            ราคาปัจจุบัน: {stock_data.get('Current Price', 'N/A')}
                            แนวโน้ม (Trend): {stock_data.get('Trend', 'N/A')}
                            
                            -- โซนแนวรับแนวต้าน (Support/Resistance) --
                            R3 (แนวต้าน 3): {stock_data.get('R3', 'N/A')}
                            R2 (แนวต้าน 2): {stock_data.get('R2', 'N/A')}
                            R1 (แนวต้าน 1): {stock_data.get('R1', 'N/A')}
                            Pivot Point (จุดหมุน): {stock_data.get('Pivot', 'N/A')}
                            S1 (แนวรับ 1): {stock_data.get('S1', 'N/A')}
                            S2 (แนวรับ 2): {stock_data.get('S2', 'N/A')}
                            S3 (แนวรับ 3): {stock_data.get('S3', 'N/A')}
                            '''
                except Exception as e:
                    pass
            else:
                await message.channel.send("⏳ กำลังประมวลผลคำตอบ...")

            coach_instruction = '''คุณคือ "AlphaZone AI Investment Coach" โค้ชและที่ปรึกษาการลงทุนหุ้นสหรัฐอเมริกา (S&P 500 & NASDAQ 100) ประจำแพลตฟอร์ม AlphaZone
กฎเหล็กที่ต้องปฏิบัติ:
1. ฐานข้อมูล AlphaZone ทั้งหมดคือหุ้นในตลาดสหรัฐอเมริกา (US Market) เท่านั้น ไม่ใช่ตลาดหุ้นไทย (SET/mai) และไม่ใช่เหรียญคริปโตเคอร์เรนซี (เช่น CRWV คือหุ้น CoreWeave ในตลาด NASDAQ ไม่ใช่เหรียญคริปโต CRV Curve)
2. หากมีข้อมูลหุ้นแนบมาให้ แสดงว่าจดทะเบียนซื้อขายในตลาดสหรัฐฯ เรียบร้อยแล้ว ห้ามบอกว่ายังไม่เข้าตลาด หรือรอ IPO/S-1 เด็ดขาด
3. ตอบเป็นภาษาไทยอย่างมืออาชีพ กระชับ ชัดเจน มีวินัยในการลงทุน ไม่เว้นบรรทัดพร่ำเพรื่อ ไม่ใช้เส้นคั่น Markdown
4. เมื่อผู้ใช้ถามถึงหุ้นตัวใด ให้วิเคราะห์อย่างเป็นระบบตามกรอบ "P-A-R-T Framework":
   - P (Position & Trend): ประเมินทิศทางและโครงสร้างราคาปัจจุบันจากข้อมูลของระบบ (เช่น strong_up = ขาขึ้นแข็งแกร่ง, strong_down = ขาลง)
   - A (Action Plan): วางแผนจุดเข้า โซนแนวรับ (S1, S2) สำหรับทยอยสะสม และเป้าหมายทำกำไรที่แนวต้าน (R1, R2)
   - R (Risk Management): จุดตัดขาดทุน (Stop Loss) ที่แนะนำ และประเมินความคุ้มค่า (Risk:Reward) หากสถานะเป็น strong_down ให้เตือนอย่าเพิ่งรีบรับมีด
   - T (Trigger & News): ปัจจัยพื้นฐาน สรุปสภาวะอุตสาหกรรม หรือเหตุการณ์สำคัญที่ขับเคลื่อนราคา
5. อ้างอิงตัวเลขราคา แนวรับ-แนวต้าน จากข้อมูลระบบ AlphaZone ที่แนบมาให้เสมอ'''

            prompt = f'''
            คำถามจากผู้ใช้: {clean_content}
            
            ข้อมูลระบบ AlphaZone:
            {system_context if system_context else "ผู้ใช้ไม่ได้ระบุชื่อหุ้น หรือเป็นการสนทนาทั่วไป"}
            '''

            clean_gemini_key = (GEMINI_API_KEY or '').strip()
            gemini_url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key={clean_gemini_key}"
            payload = {
                "systemInstruction": {
                    "parts": [{"text": coach_instruction}]
                },
                "contents": [{"role": "user", "parts": [{"text": prompt}]}]
            }
            headers = {
                'Content-Type': 'application/json',
                'x-goog-api-key': clean_gemini_key
            }
            try:
                ai_res = requests.post(gemini_url, headers=headers, json=payload, timeout=12)
                if ai_res.status_code == 200:
                    candidates = ai_res.json().get('candidates', [])
                    if candidates and 'content' in candidates[0] and 'parts' in candidates[0]['content']:
                        reply_text = "".join([p.get('text', '') for p in candidates[0]['content']['parts']])
                    else:
                        reply_text = "⚠️ ไม่พบคำตอบจาก AI"
                    if len(reply_text) > 2000:
                        for chunk in [reply_text[i:i+2000] for i in range(0, len(reply_text), 2000)]:
                            await message.channel.send(chunk)
                    else:
                        await message.channel.send(reply_text)
                else:
                    err_msg = ai_res.json().get('error', {}).get('message', 'Unknown Error')
                    await message.channel.send(f"❌ Google API Error (Code {ai_res.status_code}): {err_msg}")
            except Exception as e:
                await message.channel.send(f"❌ Code Error: {str(e)}")

intents = discord.Intents.default()
intents.message_content = True

from keep_alive import keep_alive
keep_alive()

client = AlphaZoneBot(intents=intents)
if not DISCORD_TOKEN:
    print("No Discord Token found in .env")
else:
    client.run(DISCORD_TOKEN)
