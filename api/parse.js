// Vercel serverless function: turns one sentence into search tags with Gemini.
// The AI only reads the sentence. Searching and the "what matched" line are done by rules in the browser.
// Needs GEMINI_API_KEY in the Vercel project's environment variables; without it the page uses its rule-based reader.
const MODELS = (process.env.GEMINI_MODELS || "gemini-3.5-flash-lite,gemini-3.5-flash,gemini-flash-lite-latest,gemini-flash-latest").split(",");

const prompt = (sentence, people, today) => `You turn one sentence, in which someone describes a photo they are trying to find, into search tags.
Today is ${today}. People in this library: ${people.join(", ")}. The owner is Aarav ("me", "I"). Family: sister = Isha, wife = Riya, son = Kabir, mother = Mom, father = Dad.
Diwali dates: 2024-11-01, 2025-10-20. "Summer" means April to June. "Last year" means the previous calendar year.
Return only JSON with this shape, leaving out anything the sentence does not say:
{"people":["Riya"],"places":["goa"],"time":{"label":"around Diwali 2025","windows":[["2025-10-13","2025-10-27"]]},"details":[{"thing":"hoodie","colour":"yellow"}],"text":["indigo"]}
Rules: people only from the list above, and include Aarav only when the sentence is about the owner and names no one else. places are lower-case place words as said ("hauz khas", "offsite", "park"). details are things visible in the photo, one noun each, with a colour only if said. text is brand names or words printed in the photo. Never invent details.
Sentence: ${JSON.stringify(sentence)}`;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({});
  const key = process.env.GEMINI_API_KEY;
  const body = req.body || {};
  const sentence = String(body.sentence || "").slice(0, 400);
  const people = Array.isArray(body.people) ? body.people.slice(0, 30).map(String) : [];
  const today = /^\d{4}-\d\d-\d\d$/.test(body.today) ? body.today : new Date().toISOString().slice(0, 10);
  if (!key || !sentence) return res.status(200).json({ tags: null });
  for (const model of MODELS) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt(sentence, people, today) }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 800, responseMimeType: "application/json" },
        }),
      });
      if (!r.ok) continue;
      const j = await r.json();
      const text = j?.candidates?.[0]?.content?.parts?.filter(p => !p.thought).map(p => p.text || "").join("") || "";
      const tags = JSON.parse(text.replace(/^```json\s*|```$/g, ""));
      if (tags && typeof tags === "object") return res.status(200).json({ tags, model });
    } catch (e) {}
  }
  return res.status(200).json({ tags: null });
}
