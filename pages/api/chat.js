// API Route: /api/chat
// This serverless function acts as a secure proxy between the frontend and Anthropic's API.
// The API key is stored as an environment variable on Vercel — never exposed to the browser.

const DOCUMENT_TEXT = require("../../data/document.js");
const { checkRateLimit, recordSpend } = require("../../lib/rateLimit.js");

const CLAUSE_PAGE_MAP = {"1":5,"2":5,"3":5,"4":5,"5":5,"6":6,"7":6,"8":6,"9":7,"10":9,"11":9,"12":10,"13":16,"14":16,"15":17,"16":17,"17":18,"18":18,"19":19,"20":19,"21":19,"22":19,"23":20,"24":22,"25":23,"26":27,"27":28,"28":29,"29":29,"30":30,"31":30,"32":31,"33":31,"34":31,"35":31,"36":32,"37":32,"38":32,"39":32,"40":33,"41":33,"42":33,"43":34,"44":35,"45":35,"46":36,"47":36,"48":36,"49":37,"50":37,"51":37,"52":38,"53":38,"54":39,"55":39,"56":39,"57":40,"58":40,"59":41,"60":41,"61":42,"62":42,"63":42,"64":43,"65":43,"66":43,"67":43,"68":43,"69":44,"70":45,"71":46,"72":48,"73":49,"74":52,"75":52,"76":52,"77":54,"78":54,"79":55,"80":57,"81":57,"82":62,"83":64,"84":65,"85":66,"86":68,"87":70,"88":70,"89":70,"90":70,"91":71,"92":71,"93":71,"94":72,"95":73};

const SYSTEM_PROMPT = `You are the QPS EB Agreement Assistant — a helpful, accurate tool that helps Queensland Police Service officers understand their Certified Agreement 2025.

YOUR ROLE:
- Answer questions about the QPS Certified Agreement 2025 using ONLY the document provided below.
- Always cite the specific clause number(s) in your answers using the format "Clause X" or "Schedule X" (e.g., "Clause 26", "Clause 12.2", "Schedule 1"). Be consistent with this format so references can be linked to the source document.
- When referencing sub-clauses, always include the parent clause number (e.g., "Clause 25.7" not just "subclause 25.7").
- Use plain language. Avoid legal jargon where possible.
- Be concise but thorough — if a question touches on multiple clauses, walk through each one.
- If a question falls outside the agreement, say so honestly and suggest contacting a union delegate or HR.
- NEVER make up information. If the answer isn't in the document, say so.
- When discussing dollar amounts, rates, or percentages, quote the exact figures from the document.
- Be warm and professional. You're a helpful colleague, not a robot.

CRITICAL INTERPRETATION RULES:
- NEVER claim the agreement contains "drafting errors", "quirks", or mistakes. The agreement has been negotiated and certified by the QIRC — treat every word as intentional.
- If two clauses appear to contradict each other, or a cross-reference seems unusual, explain BOTH clauses accurately and say: "This is an area where interpretation may vary — I'd recommend checking with your union delegate or HR for a definitive answer."
- When a clause says "Subject to clause X", always explain what clause X says and how it relates. Do not dismiss the cross-reference.
- Do not speculate about the intent behind provisions. Stick to what the text actually says.
- If you're not 100% certain of an interpretation, say so clearly. Officers rely on this information for real decisions — accuracy matters more than confidence.
- When challenged or asked a follow-up question about something you said, re-read the relevant clauses carefully before responding. Do not double down on an error, but also do not flip your position without a clear textual basis for doing so.

FORMAT:
- Use short paragraphs for readability.
- Use **bold** for clause references and key terms.
- Use bullet points for lists of entitlements or conditions.
- Use markdown tables for pay rates and allowance amounts.
- Keep answers focused — don't dump the entire clause if only part is relevant.

THE FULL AGREEMENT TEXT:
${DOCUMENT_TEXT}`;

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // --- Bot Protection ---
  // 1. Check for required headers (bots often skip these)
  const contentType = req.headers["content-type"];
  if (!contentType || !contentType.includes("application/json")) {
    return res.status(400).json({ error: "Invalid request." });
  }

  // 2. Check access code
  const accessCode = process.env.ACCESS_CODE || "QPS2025";
  const providedCode = req.headers["x-access-code"];
  if (!providedCode || providedCode !== accessCode) {
    return res.status(403).json({ error: "Invalid access code." });
  }

  // 3. Honeypot field — if filled, it's a bot
  if (req.body.website || req.body.email) {
    // Silently accept but don't process (bot thinks it worked)
    return res.status(200).json({ reply: "Thanks for your question! The answer can be found in the agreement.", remaining: 99 });
  }

  // 4. Check message timing — reject if messages arrive faster than humanly possible
  const userMsg = req.body.messages?.[req.body.messages.length - 1]?.content;
  if (userMsg && userMsg.length > 500 && req.body.messages.length === 1) {
    // First message over 500 chars is suspicious — likely automated
    return res.status(429).json({ error: "Please try a shorter question." });
  }

  // Check API key is configured
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY not set in environment variables");
    return res.status(500).json({ error: "Service not configured. Please contact the administrator." });
  }

  // Rate limiting
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim()
    || req.headers["x-real-ip"]
    || req.socket?.remoteAddress
    || "unknown";

  const rateCheck = checkRateLimit(ip);
  if (!rateCheck.allowed) {
    return res.status(429).json({ error: rateCheck.reason, remaining: 0 });
  }

  // Validate request body
  const { messages } = req.body;
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "Invalid request. Messages array is required." });
  }

  // Trim to last 10 messages to stay within context limits
  const trimmedMessages = messages.slice(-10);

  // Validate message format
  for (const msg of trimmedMessages) {
    if (!msg.role || !msg.content || !["user", "assistant"].includes(msg.role)) {
      return res.status(400).json({ error: "Invalid message format." });
    }
    // Prevent prompt injection via very long messages
    if (msg.content.length > 2000) {
      return res.status(400).json({ error: "Message too long. Please keep questions under 2000 characters." });
    }
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: trimmedMessages,
      }),
    });

    const data = await response.json();

    if (data.error) {
      console.error("Anthropic API error:", data.error);
      return res.status(502).json({
        error: "The AI service is temporarily unavailable. Please try again in a moment.",
      });
    }

    const reply = data.content
      ?.filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    if (!reply) {
      return res.status(502).json({ error: "No response received from AI. Please try again." });
    }

    // Record the spend
    recordSpend();

    return res.status(200).json({
      reply,
      remaining: rateCheck.remaining,
    });

  } catch (err) {
    console.error("Server error:", err);
    return res.status(500).json({
      error: "Something went wrong. Please try again in a moment.",
    });
  }
}
