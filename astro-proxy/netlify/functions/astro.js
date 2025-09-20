// netlify/functions/astro.js
// Node 18+ runtime. Returns JSON planetary data.

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: JSON.stringify({ error: 'Only POST allowed' }) };
    }

    const body = JSON.parse(event.body || '{}');
    const { year, month, date, hours, minutes, seconds = 0, place, timezone } = body;
    if (!year || !month || !date || hours == null || minutes == null || !place) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing fields: year, month, date, hours, minutes, place' }) };
    }

    // Geocode place
    const nomUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(place)}&limit=1`;
    const geoResp = await fetch(nomUrl, { headers: { 'User-Agent': 'DivineAstrology/1.0 (contact@example.com)' } });
    const geoJson = await geoResp.json();
    if (!geoJson || geoJson.length === 0) return { statusCode: 400, body: JSON.stringify({ error: 'Place not found' }) };
    const lat = parseFloat(geoJson[0].lat);
    const lon = parseFloat(geoJson[0].lon);

    const apiKey = process.env.FREE_ASTRO_API_KEY;
    if (!apiKey) return { statusCode: 500, body: JSON.stringify({ error: 'Server missing FREE_ASTRO_API_KEY' }) };

    const payload = {
      year: Number(year),
      month: Number(month),
      date: Number(date),
      hours: Number(hours),
      minutes: Number(minutes),
      seconds: Number(seconds),
      latitude: lat,
      longitude: lon,
      timezone: (typeof timezone === 'number') ? timezone : null,
      config: { observation_point: 'topocentric', ayanamsha: 'lahiri' }
    };

    // Endpoint for planetary positions JSON
    const apiUrl = 'https://json.freeastrologyapi.com/planets';
    const resp = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify(payload)
    });

    if (!resp.ok) {
      const txt = await resp.text();
      return { statusCode: 502, body: JSON.stringify({ error: 'Astrology provider error', details: txt }) };
    }

    const data = await resp.json();
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    };

  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
