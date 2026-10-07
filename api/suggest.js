export default async function handler(req, res) {
  const query = (req.query && req.query.q) || '';
  if (!query) {
    return res.status(200).json([]);
  }

  try {
    const url = `https://suggestqueries.google.com/complete/search?client=chrome&q=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (!response.ok) {
      return res.status(200).json([]);
    }

    const data = await response.json();
    const results = Array.isArray(data[1]) ? data[1].slice(0, 8) : [];

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).json(results);
  } catch {
    return res.status(200).json([]);
  }
}
