export default async function handler(req, res) {
  const allowedOrigin = 'https://ps.kamacreative.my.id';
  const origin = req.headers.origin;

  // --- SECURITY PATCH: Strict CORS, Mayar Webhook & VERCEL PREVIEW SUPPORT ---
  const isLocal = origin === 'http://localhost:3000' || origin === 'http://localhost:5500';
  const isVercelPreview = origin && origin.endsWith('.vercel.app');
  const isMayar = origin && (origin.includes('mayar.id') || origin.includes('myr.id'));

  if (!origin || origin === allowedOrigin || isLocal || isVercelPreview || isMayar) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  } else {
    return res.status(403).json({ error: 'Akses ditolak: Beda Domain' });
  }

  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metode tidak diizinkan' });

  try {
    // Deteksi jika payload berasal dari Webhook Mayar (tidak memiliki field 'action')
    const isWebhook = req.body && (
      req.body.event || 
      req.body.data || 
      req.body.payment_id || 
      req.body.transaction_id || 
      req.body.invoice_id
    );

    if (!req.body || Object.keys(req.body).length === 0 || (!req.body.action && !isWebhook)) {
      return res.status(400).json({ error: 'Bad Request: Payload tidak valid' });
    }

    const { GAS_URL, SECRET_TOKEN } = process.env;

    if (!GAS_URL || !SECRET_TOKEN) {
      return res.status(500).json({ error: 'Server belum dikonfigurasi' });
    }

    const securePayload = { ...req.body, secret_token: SECRET_TOKEN };

    const gasResponse = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(securePayload),
      redirect: 'follow'
    });

    const textResponse = await gasResponse.text();
    let data;
    try {
      data = JSON.parse(textResponse);
    } catch (parseErr) {
      console.error("Non-JSON GAS response:", textResponse);
      return res.status(502).json({
        status: 'error',
        message: 'Server sedang memperbarui sinkronisasi. Harap refresh halaman kembali.',
        error: 'Non-JSON Response'
      });
    }

    return res.status(gasResponse.ok ? 200 : gasResponse.status || 500).json(data);
  } catch (error) {
    console.error("Bridge proxy error:", error);
    return res.status(500).json({ status: 'error', message: 'Koneksi ke server terganggu: ' + (error.message || String(error)), error: error.message || String(error) });
  }
}
