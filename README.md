# QPS EB Agreement Assistant — Deployment Guide

## What You're Deploying

A Next.js app with:
- **Frontend**: Chat interface at `pages/index.js`
- **Backend API**: Serverless function at `pages/api/chat.js` (holds your API key securely)
- **Rate limiting**: 20 queries/user/day + $50/day spend cap
- **Full EB Agreement**: Embedded in `data/document.js` (~260KB)

---

## Step-by-Step Deployment

### 1. Get Your Anthropic API Key (2 minutes)

1. Go to https://console.anthropic.com
2. Sign up / sign in
3. Go to **Settings → API Keys**
4. Click **Create Key**, name it "QPS EB Assistant"
5. Copy the key (starts with `sk-ant-...`) — you'll need it in Step 4
6. Add credit to your account (Settings → Billing). Start with $20 to test.

### 2. Push to GitHub (5 minutes)

The project needs to be in a GitHub repo so Vercel can deploy it.

**If you don't have Git/GitHub set up:**

1. Go to https://github.com and sign up / sign in
2. Click the **+** icon → **New repository**
3. Name it `qps-eb-assistant`, set it to **Private**, click **Create repository**
4. Upload the project files:
   - On the repo page, click **"uploading an existing file"**
   - Drag and drop ALL the project files/folders (except node_modules and .env)
   - Make sure the folder structure looks like:
     ```
     pages/
       api/
         chat.js
       index.js
     data/
       document.js
     lib/
       rateLimit.js
     package.json
     next.config.js
     .gitignore
     ```
   - Click **Commit changes**

**If you have Git installed (terminal method):**

```bash
cd qps-eb-assistant
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/qps-eb-assistant.git
git branch -M main
git push -u origin main
```

### 3. Deploy to Vercel (5 minutes)

1. Go to https://vercel.com and sign up with your GitHub account
2. Click **"Add New..."** → **Project**
3. Find and select your `qps-eb-assistant` repo
4. Leave all settings as default (Vercel auto-detects Next.js)
5. Click **Deploy**
6. Wait ~60 seconds for the build to complete

Your app is now live at `https://qps-eb-assistant.vercel.app` (or similar).
It won't work yet because we haven't added the API key.

### 4. Add Your API Key (1 minute)

1. In your Vercel dashboard, click on the project
2. Go to **Settings → Environment Variables**
3. Add:
   - **Key**: `ANTHROPIC_API_KEY`
   - **Value**: paste your `sk-ant-...` key
   - **Environment**: select all (Production, Preview, Development)
4. Add another variable:
   - **Key**: `ACCESS_CODE`
   - **Value**: whatever code you want officers to use (e.g. `QPS2025`)
   - **Environment**: select all
5. Click **Save**
6. Go to **Deployments** tab → click the **...** menu on the latest deployment → **Redeploy**

Test it by visiting your Vercel URL. The chatbot should now respond to questions.

### 5. Connect Your Custom Domain (5 minutes)

1. In your Vercel project, go to **Settings → Domains**
2. Add `eb.aiwave.com.au`
3. Vercel will show you DNS records to add. You'll need to add a **CNAME record**.
4. Log in to **Hostinger** → go to **DNS Zone Editor** for aiwave.com.au
5. Add a new record:
   - **Type**: CNAME
   - **Name**: `eb`
   - **Target**: `cname.vercel-dns.com`
   - **TTL**: 3600 (or default)
6. Save and wait 5-30 minutes for DNS to propagate
7. Back in Vercel, click **Refresh** — it should verify the domain
8. Vercel automatically provisions an SSL certificate (HTTPS)

Your app is now live at **https://eb.aiwave.com.au** 🎉

---

## Cost Management

### Current Settings (in `lib/rateLimit.js`)

| Setting | Value | What It Does |
|---------|-------|-------------|
| `maxQueriesPerUser` | 20/day | Per-IP daily limit |
| `dailySpendCapUSD` | $50/day | Hard stop for the whole app |
| `estimatedCostPerQuery` | $0.15 | Conservative Sonnet estimate |

### Monthly Cost Estimates

| Daily Queries | Monthly Cost | Notes |
|--------------|-------------|-------|
| 50 | ~$225 | Light testing / soft launch |
| 200 | ~$900 | Growing usage |
| 333 | ~$1,500 | Spend cap kicks in at $50/day |

### How to Adjust

Edit `lib/rateLimit.js`:
```javascript
const RATE_LIMIT = {
  maxQueriesPerUser: 20,     // increase/decrease per-user limit
  dailySpendCapUSD: 50,      // increase/decrease daily budget
  estimatedCostPerQuery: 0.15, // adjust if using a different model
};
```

After editing, push to GitHub and Vercel auto-redeploys.

### Monitor Your Actual Costs

- **Anthropic Console**: https://console.anthropic.com → Usage
  Shows exact API spend in real-time.
- **Vercel Analytics**: Dashboard → Analytics
  Shows request counts and response times.

---

## Updating the Agreement

When a new EB Agreement is certified (next expected ~2028):

1. Extract the text from the new PDF
2. Replace the content in `data/document.js`
3. Update the clause-to-page mapping in `pages/api/chat.js` and `pages/index.js`
4. Update the PDF_URL in `pages/index.js`
5. Push to GitHub — Vercel auto-deploys

---

## Important Notes

- **API Key Security**: Your key is stored in Vercel's encrypted environment variables.
  It's NEVER sent to the browser. Only the serverless function can access it.
- **Rate Limiting**: The in-memory rate limiter resets on cold starts (Vercel serverless).
  For production-grade limiting, consider Vercel KV or Upstash Redis (both have free tiers).
- **The spend cap is approximate**: It's based on estimated cost per query, not actual API billing.
  Always monitor your real spend on the Anthropic console.
- **No user data is stored**: Messages are processed and forgotten. No conversation history is saved.

### Access Code

The app requires an access code before officers can use it. This prevents random internet users and bots from burning through your API credits.

- **Default code**: `QPS2025` (change this in your Vercel environment variables)
- **How it works**: Officers enter the code once, it's saved in their browser. They won't need to re-enter it unless they clear their browser data.
- **How to share**: Post the code in QPS internal channels, email lists, or union communications. You can change it anytime via Vercel environment variables.
- **To change the code**: Update `ACCESS_CODE` in Vercel → Settings → Environment Variables → Redeploy. Existing users will be prompted for the new code on their next visit.
- **Additional bot protection**: The API also checks for honeypot fields, suspicious request patterns, and requires proper headers.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Service not configured" | API key not set. Check Vercel Environment Variables and redeploy. |
| Chat works but domain doesn't | DNS not propagated yet. Wait 30 min and check DNS with `dig eb.aiwave.com.au` |
| "Daily usage limit reached" | Spend cap hit. Increase `dailySpendCapUSD` or wait until tomorrow. |
| Responses seem slow | Normal — Sonnet takes 3-8 seconds per response. The typing indicator shows it's working. |
| Build fails on Vercel | Check the build logs. Usually a syntax error in the code. |

---

## Future Improvements

- [ ] Upgrade rate limiting to Upstash Redis (persistent across cold starts)
- [ ] Add analytics to track popular questions
- [ ] Add a feedback button (thumbs up/down)
- [ ] QPU partnership for funding
- [ ] Consider Gemini Flash to reduce costs 50x
