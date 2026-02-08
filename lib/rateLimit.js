// Simple in-memory rate limiter and spend tracker
// Note: On Vercel serverless, memory resets between cold starts.
// This provides basic protection. For bulletproof limiting, use Vercel KV or Upstash Redis (free tier).

const RATE_LIMIT = {
  maxQueriesPerUser: 20,    // per day per IP
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  dailySpendCapUSD: 50,     // hard stop for the whole app per day
  estimatedCostPerQuery: 0.15, // conservative estimate for Sonnet
};

// In-memory stores (reset on cold start)
const userRequests = new Map();  // IP -> { count, resetTime }
let dailySpend = { total: 0, resetTime: Date.now() + 24 * 60 * 60 * 1000 };

function resetIfNeeded() {
  const now = Date.now();
  if (now > dailySpend.resetTime) {
    dailySpend = { total: 0, resetTime: now + 24 * 60 * 60 * 1000 };
  }
}

function checkRateLimit(ip) {
  const now = Date.now();
  resetIfNeeded();

  // Check daily spend cap
  if (dailySpend.total >= RATE_LIMIT.dailySpendCapUSD) {
    return {
      allowed: false,
      reason: "The service has reached its daily usage limit. Please try again tomorrow.",
      remaining: 0,
    };
  }

  // Check per-user rate limit
  const userKey = ip || "unknown";
  const userData = userRequests.get(userKey);

  if (!userData || now > userData.resetTime) {
    // New window
    userRequests.set(userKey, {
      count: 1,
      resetTime: now + RATE_LIMIT.windowMs,
    });
    return { allowed: true, remaining: RATE_LIMIT.maxQueriesPerUser - 1 };
  }

  if (userData.count >= RATE_LIMIT.maxQueriesPerUser) {
    return {
      allowed: false,
      reason: `You've reached the limit of ${RATE_LIMIT.maxQueriesPerUser} questions per day. This resets in ${Math.ceil((userData.resetTime - now) / 3600000)} hours.`,
      remaining: 0,
    };
  }

  userData.count++;
  return { allowed: true, remaining: RATE_LIMIT.maxQueriesPerUser - userData.count };
}

function recordSpend() {
  resetIfNeeded();
  dailySpend.total += RATE_LIMIT.estimatedCostPerQuery;
}

module.exports = { checkRateLimit, recordSpend, RATE_LIMIT };
