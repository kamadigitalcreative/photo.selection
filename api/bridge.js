export default async function handler(req, res) {
  const allowedOrigin = 'https://ps.kamacreative.my.id'; // Domain resmi Anda
  const origin = req.headers.origin;

  if (origin === allowedOrigin || origin?.includes('localhost')) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    return res.status(403).json({ error: 'Akses ditolak: Beda Domain' });
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metode tidak diizinkan' });

  try {
    const { GAS_URL, SECRET_TOKEN } = process.env;

    if (!GAS_URL || !SECRET_TOKEN) {
      return res.status(500).json({ error: 'Server belum dikonfigurasi' });
    }

    const securePayload = { ...req.body, secret_token: SECRET_TOKEN };

    const response = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(securePayload),
    });

    const data = await response.json();
    return res.status(data.code || 200).json(data);

  } catch (error) {
    return res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
}