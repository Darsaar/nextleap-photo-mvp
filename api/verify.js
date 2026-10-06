// Vercel serverless function: before the app remembers a search word for a photo,
// Gemini looks at the photo and says which of the words (or something closely related) it can actually see.
// Words it can't see are not saved. Without GEMINI_API_KEY nothing is saved.
const MODELS = (process.env.GEMINI_MODELS || "gemini-3.5-flash-lite,gemini-3.5-flash,gemini-flash-lite-latest,gemini-flash-latest").split(",");

const prompt = words => `Someone searched their photos with these words and later found this photo:
${JSON.stringify(words)}
For each word or phrase, decide if it, or something closely related (a synonym, a kind of it, or part of the same scene), is clearly visible in the photo, including printed text.
Return only JSON: {"seen":["..."]} listing the phrases exactly as given that are visible. Leave out anything you can't see. Be strict.`;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({});
  const key = process.env.GEMINI_API_KEY;
  const body = req.body || {};
  const id = String(body.id || "");
  const words = Array.isArray(body.words) ? body.words.slice(0, 6).map(w => String(w).slice(0, 40)).filter(Boolean) : [];
  if (!key || !/^[a-z0-9]{2,8}$/i.test(id) || !words.length) return res.status(200).json({ seen: null });
  let image;
  try {
    const r = await fetch(`https://${req.headers.host}/photos/${id}.jpg`);
    if (!r.ok) return res.status(200).json({ seen: null });
    image = Buffer.from(await r.arrayBuffer()).toString("base64");
  } catch (e) { return res.status(200).json({ seen: null }); }
  for (const model of MODELS) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{ parts: [{ inline_data: { mime_type: "image/jpeg", data: image } }, { text: prompt(words) }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 300, responseMimeType: "application/json" },
        }),
      });
      if (!r.ok) continue;
      const j = await r.json();
      const text = j?.candidates?.[0]?.content?.parts?.filter(p => !p.thought).map(p => p.text || "").join("") || "";
      const out = JSON.parse(text.replace(/^```json\s*|```$/g, ""));
      if (out && Array.isArray(out.seen)) return res.status(200).json({ seen: out.seen.filter(w => words.includes(w)), model });
    } catch (e) {}
  }
  return res.status(200).json({ seen: null });
}
