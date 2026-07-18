// api/chat.js
// Serverless function that powers the "Ask AI" chat feature.
// Now calls Google's Gemini API instead of Anthropic.
//
// Requires an environment variable GEMINI_API_KEY to be set in
// your Vercel project (Settings -> Environment Variables).

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const { system, messages } = req.body || {};

    if (!messages || !Array.isArray(messages)) {
      res.status(400).json({ error: "Missing or invalid 'messages' array" });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: "Server misconfigured: GEMINI_API_KEY is not set" });
      return;
    }

    // Convert the { role: "user" | "assistant", content: string }[] format
    // (used by the frontend / previously by Anthropic) into Gemini's
    // { role: "user" | "model", parts: [{ text }] }[] format.
    const contents = messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const model = "gemini-2.0-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const geminiResponse = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        systemInstruction: system
          ? { parts: [{ text: system }] }
          : undefined,
        generationConfig: {
          maxOutputTokens: 512,
          temperature: 0.7,
        },
      }),
    });

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text();
      console.error("Gemini API error:", geminiResponse.status, errText);
      res.status(502).json({ error: "Upstream AI request failed" });
      return;
    }

    const data = await geminiResponse.json();

    // Pull the text out of Gemini's response shape:
    // { candidates: [ { content: { parts: [ { text } ] } } ] }
    const text =
      data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("\n") ||
      "";

    // Respond in the same shape the frontend already expects
    // ( { content: [ { type: "text", text: "..." } ] } ), so no
    // changes are needed in index.html.
    res.status(200).json({
      content: [{ type: "text", text: text || "Sorry, I couldn't generate a response just now." }],
    });
  } catch (err) {
    console.error("chat.js error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}
