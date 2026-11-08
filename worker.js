// Cloudflare Worker: وسيط آمن بين WAZN وموديل Claude. مفتاح الـ API بيتخزن هنا كـ Secret ومش بيظهر في الموقع.
// Secrets/Vars: ANTHROPIC_API_KEY (secret) · ALLOWED_ORIGIN (مثلاً https://yourname.github.io) · MODEL (اختياري)
const SYSTEM = `أنت "جرومي"، مساعد مالي داخل تطبيق WAZN لإدارة المصروفات. رد بالعامية المصرية بشكل ودود ومختصر (٥ جمل كحد أقصى).
اعتمد فقط على الأرقام الموجودة في سياق المستخدم، ولو المعلومة مش موجودة قول كده ومتخترعش أرقام.
أنت مش مستشار مالي أو قانوني مرخّص؛ النصائح عامة وتعليمية. لا تطلب بيانات حساسة (باسوردات، أرقام كروت).
ولو المستخدم عايز يسجل مصروف أو يحدد ميزانية، قوله يكتب مثلاً: "ضيف 50 جنيه مواصلات" أو "حدد الميزانية 4000".`;
export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') || '';
    const allowed = env.ALLOWED_ORIGIN || '*';
    const cors = { 'Access-Control-Allow-Origin': allowed === '*' ? '*' : allowed, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Vary': 'Origin' };
    const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (req.method !== 'POST') return json({ error: 'method' }, 405);
    if (allowed !== '*' && origin !== allowed) return json({ error: 'origin' }, 403);
    let body; try { body = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
    const msgs = (Array.isArray(body.messages) ? body.messages : []).slice(-8)
      .filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
      .map(m => ({ role: m.role, content: m.content.slice(0, 800) }));
    if (!msgs.length || msgs[msgs.length - 1].role !== 'user') return json({ error: 'no message' }, 400);
    const ctx = JSON.stringify(body.context || {}).slice(0, 4000);
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: env.MODEL || 'claude-sonnet-5-5', max_tokens: 500, system: SYSTEM + '\n\nبيانات المستخدم (JSON):\n' + ctx, messages: msgs })
    });
    if (!r.ok) return json({ error: 'upstream', status: r.status }, 502);
    const d = await r.json();
    const reply = (d.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    return json({ reply: reply || 'معنديش رد دلوقتي، جرّب تاني.' });
  }
};
