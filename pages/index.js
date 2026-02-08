import { useState, useRef, useEffect } from "react";
import Head from "next/head";

const PDF_URL = "https://www.qirc.qld.gov.au/sites/default/files/2025-10/2025_cb116.pdf";

const CLAUSE_PAGE_MAP = {"1":5,"2":5,"3":5,"4":5,"5":5,"6":6,"7":6,"8":6,"9":7,"10":9,"11":9,"12":10,"13":16,"14":16,"15":17,"16":17,"17":18,"18":18,"19":19,"20":19,"21":19,"22":19,"23":20,"24":22,"25":23,"26":27,"27":28,"28":29,"29":29,"30":30,"31":30,"32":31,"33":31,"34":31,"35":31,"36":32,"37":32,"38":32,"39":32,"40":33,"41":33,"42":33,"43":34,"44":35,"45":35,"46":36,"47":36,"48":36,"49":37,"50":37,"51":37,"52":38,"53":38,"54":39,"55":39,"56":39,"57":40,"58":40,"59":41,"60":41,"61":42,"62":42,"63":42,"64":43,"65":43,"66":43,"67":43,"68":43,"69":44,"70":45,"71":46,"72":48,"73":49,"74":52,"75":52,"76":52,"77":54,"78":54,"79":55,"80":57,"81":57,"82":62,"83":64,"84":65,"85":66,"86":68,"87":70,"88":70,"89":70,"90":70,"91":71,"92":71,"93":71,"94":72,"95":73};

const SCHEDULE_PAGE_MAP = {"1":74,"2":77,"3":88,"4":91,"5":96,"6":99,"7":102};

const SUGGESTED_QUESTIONS = [
  "What are the pay scales for Senior Constables?",
  "How does the Late Night Operational Shift Allowance work?",
  "What are the rules around 10-hour breaks?",
  "How do lateral transfers work?",
  "Am I eligible for the General Duties payment?",
  "What are my annual leave entitlements?",
  "How much is the On-Call allowance?",
  "Explain the CUA (CPI Uplift Adjustment)",
];

// ─── Markdown Renderer ─────────────────────────────────────────────

function renderMarkdown(text) {
  if (!text) return null;
  const lines = text.split("\n");
  const elements = [];
  let i = 0;
  let listItems = [];

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`list-${elements.length}`} style={{ margin: "8px 0", paddingLeft: 20, listStyleType: "disc" }}>
          {listItems.map((item, idx) => <li key={idx} style={{ marginBottom: 4 }}>{renderInline(item)}</li>)}
        </ul>
      );
      listItems = [];
    }
  };

  const linkifyClauses = (str) => {
    const parts = [];
    let key = 0;
    const clauseRegex = /(Clause\s+(\d+)(?:\.\d+)?(?:\([a-z0-9]+\))*|Schedule\s+(\d+))/g;
    let match;
    let lastIndex = 0;
    const allMatches = [];
    while ((match = clauseRegex.exec(str)) !== null) {
      allMatches.push({ text: match[0], index: match.index, clauseNum: match[2], scheduleNum: match[3] });
    }
    if (allMatches.length === 0) return str;
    for (const m of allMatches) {
      if (m.index > lastIndex) parts.push(str.slice(lastIndex, m.index));
      let page = null;
      if (m.clauseNum && CLAUSE_PAGE_MAP[m.clauseNum]) page = CLAUSE_PAGE_MAP[m.clauseNum];
      else if (m.scheduleNum && SCHEDULE_PAGE_MAP[m.scheduleNum]) page = SCHEDULE_PAGE_MAP[m.scheduleNum];
      if (page) {
        parts.push(
          <a key={`cl-${key++}`} href={`${PDF_URL}#page=${page}`} target="_blank" rel="noopener noreferrer"
            style={{ color: "#1e3a5f", textDecoration: "underline", textDecorationColor: "#93a3b8",
              textUnderlineOffset: 2, fontWeight: 600, cursor: "pointer" }}
            title={`View ${m.text} in source PDF (page ${page})`}
          >{m.text} 📄</a>
        );
      } else {
        parts.push(<strong key={`cl-${key++}`} style={{ fontWeight: 600 }}>{m.text}</strong>);
      }
      lastIndex = m.index + m.text.length;
    }
    if (lastIndex < str.length) parts.push(str.slice(lastIndex));
    return parts;
  };

  const renderInline = (str) => {
    const parts = [];
    let remaining = str;
    let key = 0;
    while (remaining.length > 0) {
      const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
      const italicMatch = !boldMatch ? remaining.match(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/) : null;
      let firstMatch = null;
      if (boldMatch) {
        firstMatch = { type: "bold", match: boldMatch, idx: remaining.indexOf(boldMatch[0]) };
      }
      if (italicMatch) {
        const iIdx = remaining.indexOf(italicMatch[0]);
        if (!firstMatch || iIdx < firstMatch.idx) {
          firstMatch = { type: "italic", match: italicMatch, idx: iIdx };
        }
      }
      if (firstMatch) {
        if (firstMatch.idx > 0) parts.push(<span key={key++}>{linkifyClauses(remaining.slice(0, firstMatch.idx))}</span>);
        if (firstMatch.type === "bold") {
          parts.push(<strong key={key++} style={{ fontWeight: 600 }}>{linkifyClauses(firstMatch.match[1])}</strong>);
        } else {
          parts.push(<em key={key++}>{linkifyClauses(firstMatch.match[1])}</em>);
        }
        remaining = remaining.slice(firstMatch.idx + firstMatch.match[0].length);
      } else {
        parts.push(<span key={key++}>{linkifyClauses(remaining)}</span>);
        break;
      }
    }
    return parts;
  };

  while (i < lines.length) {
    const line = lines[i];

    // Tables
    if (line.trim().startsWith("|") && line.trim().endsWith("|")) {
      flushList();
      const tableRows = [];
      let j = i;
      while (j < lines.length && lines[j].trim().startsWith("|") && lines[j].trim().endsWith("|")) {
        const row = lines[j].trim();
        if (!/^\|[\s\-:|]+\|$/.test(row)) {
          const cells = row.split("|").filter((_, idx, arr) => idx > 0 && idx < arr.length - 1).map(c => c.trim());
          tableRows.push(cells);
        }
        j++;
      }
      if (tableRows.length > 0) {
        const headerRow = tableRows[0];
        const bodyRows = tableRows.slice(1);
        elements.push(
          <div key={`table-${i}`} style={{ overflowX: "auto", margin: "10px 0" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, border: "1px solid #cbd5e1" }}>
              <thead>
                <tr style={{ backgroundColor: "#e2e8f0" }}>
                  {headerRow.map((cell, ci) => (
                    <th key={ci} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, borderBottom: "2px solid #94a3b8", fontSize: 13 }}>{renderInline(cell)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bodyRows.map((row, ri) => (
                  <tr key={ri} style={{ backgroundColor: ri % 2 === 0 ? "white" : "#f8fafc" }}>
                    {row.map((cell, ci) => (
                      <td key={ci} style={{ padding: "7px 12px", borderBottom: "1px solid #e2e8f0" }}>{renderInline(cell)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      i = j;
      continue;
    }

    if (line.startsWith("### ")) { flushList(); elements.push(<h4 key={i} style={{ fontSize: 14, fontWeight: 700, margin: "12px 0 4px" }}>{renderInline(line.slice(4))}</h4>); }
    else if (line.startsWith("## ")) { flushList(); elements.push(<h3 key={i} style={{ fontSize: 15, fontWeight: 700, margin: "14px 0 6px" }}>{renderInline(line.slice(3))}</h3>); }
    else if (line.startsWith("# ")) { flushList(); elements.push(<h2 key={i} style={{ fontSize: 16, fontWeight: 700, margin: "16px 0 8px" }}>{renderInline(line.slice(2))}</h2>); }
    else if (/^[-*•]\s/.test(line.trim())) { listItems.push(line.trim().replace(/^[-*•]\s/, "")); }
    else if (/^\d+\.\s/.test(line.trim())) { listItems.push(line.trim().replace(/^\d+\.\s/, "")); }
    else if (/^---+$/.test(line.trim())) { flushList(); elements.push(<hr key={i} style={{ border: "none", borderTop: "1px solid #cbd5e1", margin: "12px 0" }} />); }
    else if (line.trim() === "") { flushList(); elements.push(<div key={i} style={{ height: 8 }} />); }
    else { flushList(); elements.push(<p key={i} style={{ margin: "4px 0" }}>{renderInline(line)}</p>); }
    i++;
  }
  flushList();
  return elements;
}

// ─── Message Bubble ─────────────────────────────────────────────

function MessageBubble({ role, content }) {
  const isUser = role === "user";
  return (
    <div style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start", marginBottom: 16,
      paddingLeft: isUser ? 48 : 0, paddingRight: isUser ? 0 : 48 }}>
      {!isUser && (
        <div style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg, #1e3a5f, #2d5a8e)",
          display: "flex", alignItems: "center", justifyContent: "center", marginRight: 10, flexShrink: 0,
          marginTop: 2, fontSize: 14, color: "#e2e8f0", fontWeight: 700 }}>EB</div>
      )}
      <div style={{ padding: "12px 16px", borderRadius: isUser ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
        backgroundColor: isUser ? "#1e3a5f" : "#f1f5f9", color: isUser ? "#f0f4f8" : "#1e293b",
        fontSize: 14.5, lineHeight: 1.65, maxWidth: "85%", wordBreak: "break-word",
        boxShadow: isUser ? "none" : "0 1px 3px rgba(0,0,0,0.06)" }}>
        {isUser ? content : renderMarkdown(content)}
      </div>
    </div>
  );
}

// ─── Typing Indicator ─────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
      <div style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg, #1e3a5f, #2d5a8e)",
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "#e2e8f0", fontWeight: 700 }}>EB</div>
      <div style={{ display: "flex", gap: 4, padding: "12px 16px", borderRadius: "16px 16px 16px 4px",
        backgroundColor: "#f1f5f9", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "#94a3b8",
            animation: `pulse 1.4s ease-in-out ${i * 0.2}s infinite` }} />
        ))}
      </div>
      <style>{`@keyframes pulse { 0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); } 40% { opacity: 1; transform: scale(1); } }`}</style>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────

export default function Home() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [remaining, setRemaining] = useState(null);
  const [accessCode, setAccessCode] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [codeError, setCodeError] = useState("");
  const messagesEndRef = useRef(null);

  // Check for stored access code on mount
  useEffect(() => {
    const stored = localStorage.getItem("qps_eb_access_code");
    if (stored) {
      setAccessCode(stored);
      setIsAuthenticated(true);
    }
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleCodeSubmit = () => {
    const code = codeInput.trim();
    if (!code) return;
    // Store optimistically — the API will reject if wrong
    localStorage.setItem("qps_eb_access_code", code);
    setAccessCode(code);
    setIsAuthenticated(true);
    setCodeError("");
  };

  const sendMessage = async (text) => {
    if (!text.trim() || loading) return;
    const userMsg = { role: "user", content: text.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Access-Code": accessCode,
        },
        body: JSON.stringify({
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
        }),
      });

      const data = await res.json();

      // If access code is wrong, kick back to code screen
      if (res.status === 403) {
        localStorage.removeItem("qps_eb_access_code");
        setIsAuthenticated(false);
        setAccessCode("");
        setCodeError("That access code didn't work. Please check and try again.");
        setMessages([]);
        setLoading(false);
        return;
      }

      if (!res.ok) {
        throw new Error(data.error || "Request failed");
      }

      if (data.remaining !== undefined) setRemaining(data.remaining);
      setMessages([...newMessages, { role: "assistant", content: data.reply }]);
    } catch (err) {
      console.error("Error:", err);
      setMessages([
        ...newMessages,
        { role: "assistant", content: err.message || "Something went wrong. Please try again in a moment." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  };

  const showWelcome = messages.length === 0;

  return (
    <>
      <Head>
        <title>QPS EB Agreement Assistant</title>
        <meta name="description" content="AI-powered assistant for the Queensland Police Service Certified Agreement 2025" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600;700&display=swap" rel="stylesheet" />
      </Head>

      {!isAuthenticated ? (
        /* ─── Access Code Gate ─── */
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          height: "100vh", fontFamily: "'Source Sans 3', -apple-system, BlinkMacSystemFont, sans-serif",
          background: "linear-gradient(135deg, #0f2b4a 0%, #1e3a5f 50%, #2d5a8e 100%)", padding: 20 }}>
          <div style={{ backgroundColor: "white", borderRadius: 16, padding: "40px 32px", maxWidth: 400,
            width: "100%", textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>👮‍♂️</div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1e293b", margin: "0 0 8px" }}>QPS EB Agreement Assistant</h1>
            <p style={{ fontSize: 14, color: "#64748b", margin: "0 0 24px" }}>
              Enter your access code to continue.<br />This was shared through QPS internal channels.
            </p>
            {codeError && (
              <div style={{ backgroundColor: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8,
                padding: "10px 14px", marginBottom: 16, fontSize: 13.5, color: "#dc2626" }}>
                {codeError}
              </div>
            )}
            <input
              type="text"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleCodeSubmit(); }}
              placeholder="Enter access code"
              autoFocus
              style={{ width: "100%", padding: "12px 16px", borderRadius: 10, border: "1px solid #cbd5e1",
                fontSize: 16, fontFamily: "inherit", textAlign: "center", letterSpacing: 2, fontWeight: 600,
                outline: "none", boxSizing: "border-box", marginBottom: 12 }}
            />
            <button onClick={handleCodeSubmit} disabled={!codeInput.trim()}
              style={{ width: "100%", padding: "12px 16px", borderRadius: 10, border: "none",
                backgroundColor: codeInput.trim() ? "#1e3a5f" : "#cbd5e1",
                color: "white", fontSize: 15, fontWeight: 600, fontFamily: "inherit",
                cursor: codeInput.trim() ? "pointer" : "default", transition: "background-color 0.15s" }}>
              Continue
            </button>
            <p style={{ fontSize: 11.5, color: "#94a3b8", marginTop: 16, marginBottom: 0 }}>
              Don't have a code? Contact your union delegate.
            </p>
          </div>
        </div>
      ) : (

      /* ─── Main Chat Interface ─── */
      <div style={{ display: "flex", flexDirection: "column", height: "100vh", maxWidth: 800, margin: "0 auto",
        fontFamily: "'Source Sans 3', -apple-system, BlinkMacSystemFont, sans-serif", backgroundColor: "#ffffff" }}>

        {/* Header */}
        <div style={{ background: "linear-gradient(135deg, #0f2b4a 0%, #1e3a5f 50%, #2d5a8e 100%)",
          padding: "16px 20px", color: "white", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.15)",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 700 }}>EB</div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.01em" }}>QPS EB Agreement Assistant</div>
              <div style={{ fontSize: 12.5, opacity: 0.8, marginTop: 1 }}>Certified Agreement 2025 • AI-Powered Reference Tool</div>
            </div>
          </div>
        </div>

        {/* Messages Area */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px" }}>
          {showWelcome ? (
            <div style={{ textAlign: "center", paddingTop: 30 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>👮‍♂️</div>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: "#1e293b", marginBottom: 6 }}>G'day! How can I help?</h2>
              <p style={{ fontSize: 14.5, color: "#64748b", marginBottom: 28, maxWidth: 420, margin: "0 auto 28px" }}>
                Ask me anything about the QPS Certified Agreement 2025 — pay, allowances, leave, rostering, transfers, and more.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", maxWidth: 600, margin: "0 auto" }}>
                {SUGGESTED_QUESTIONS.map((q, i) => (
                  <button key={i} onClick={() => sendMessage(q)}
                    style={{ padding: "8px 14px", borderRadius: 20, border: "1px solid #cbd5e1", backgroundColor: "white",
                      fontSize: 13.5, color: "#334155", cursor: "pointer", transition: "all 0.15s", lineHeight: 1.3 }}
                    onMouseEnter={e => { e.target.style.backgroundColor = "#f1f5f9"; e.target.style.borderColor = "#94a3b8"; }}
                    onMouseLeave={e => { e.target.style.backgroundColor = "white"; e.target.style.borderColor = "#cbd5e1"; }}
                  >{q}</button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, i) => <MessageBubble key={i} role={m.role} content={m.content} />)
          )}
          {loading && <TypingIndicator />}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div style={{ borderTop: "1px solid #e2e8f0", padding: "12px 16px", backgroundColor: "#fafbfc", flexShrink: 0 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
            <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown}
              placeholder="Ask about your EB Agreement..." disabled={loading}
              style={{ flex: 1, padding: "10px 14px", borderRadius: 12, border: "1px solid #cbd5e1", fontSize: 14.5,
                fontFamily: "inherit", resize: "none", outline: "none", minHeight: 44, maxHeight: 120,
                backgroundColor: loading ? "#f1f5f9" : "white" }}
              rows={1}
            />
            <button onClick={() => sendMessage(input)} disabled={loading || !input.trim()}
              style={{ padding: "10px 18px", borderRadius: 12, border: "none", fontSize: 14.5, fontWeight: 600,
                cursor: loading || !input.trim() ? "default" : "pointer",
                backgroundColor: loading || !input.trim() ? "#cbd5e1" : "#1e3a5f",
                color: "white", transition: "background-color 0.15s", flexShrink: 0 }}>
              {loading ? "..." : "Send"}
            </button>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
            <p style={{ fontSize: 11, color: "#94a3b8", margin: 0 }}>
              ⚠️ AI-generated answers — always verify important decisions with your union delegate or HR.
              {" "}<a href={PDF_URL} target="_blank" rel="noopener noreferrer"
                style={{ color: "#64748b", textDecoration: "underline" }}>View full agreement (PDF)</a>
            </p>
            {remaining !== null && remaining <= 5 && (
              <span style={{ fontSize: 11, color: "#f59e0b", fontWeight: 600 }}>{remaining} questions remaining today</span>
            )}
          </div>
        </div>
      </div>
      )}
    </>
  );
}
