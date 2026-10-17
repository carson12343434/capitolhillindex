# Setup

Each part is optional. The site works without them; these switch on extra features.

## 1. Custom domain (capitolhillindex.com)

1. Buy the domain at Cloudflare Registrar or Porkbun.
2. In the domain's DNS settings, add these records:
   - Four `A` records for `@` pointing to `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - One `CNAME` record for `www` pointing to `YOUR-USERNAME.github.io`
   - On Cloudflare, set each record's proxy status to **DNS only** (gray cloud).
3. In the GitHub repo: **Settings → Pages → Custom domain**, enter `capitolhillindex.com`, click **Save**. Once the check passes, tick **Enforce HTTPS**.
4. In `assets/config.js`, set `siteUrl` to `https://capitolhillindex.com`.

DNS changes can take up to an hour to work.

## 2. Getting found on Google

1. Go to [Google Search Console](https://search.google.com/search-console), add the property `https://capitolhillindex.com`, and verify it with the DNS TXT record Google gives you.
2. Under **Sitemaps**, submit `sitemap.xml`.

New sites usually take a few weeks to show up in search. Specific searches ("name all senators quiz", "congress stock trades by member") are easier to rank for than broad ones ("election polls").

## 3. Visitor stats (GoatCounter, free)

1. Sign up at [goatcounter.com](https://www.goatcounter.com/signup). Pick a code such as `capitolhillindex`.
2. In GoatCounter, open **Settings**, tick **Allow adding visitor counts on your website**, and save. This feeds the `/stats/` page.
3. In `assets/config.js`, set `goatcounter: "capitolhillindex"`.

Your dashboard at `https://capitolhillindex.goatcounter.com` shows page views, unique visitors, where they came from, and events such as sign-ups, Capitle wins and quiz finishes. The site's own `/stats/` page shows the totals at a glance.

## 4. Accounts (Firebase, free)

1. Go to [console.firebase.google.com](https://console.firebase.google.com) → **Add project** → name it `capitolhillindex`. Google Analytics can be off.
2. **Build → Authentication → Get started → Email/Password → Enable → Save.**
3. **Authentication → Settings → Authorized domains → Add domain:** `capitolhillindex.com` and `YOUR-USERNAME.github.io`.
4. **Build → Firestore Database → Create database →** production mode, location `us-central`.
5. **Firestore → Rules:** replace the rules with the contents of `firestore.rules` from this repo → **Publish**.
6. **Project settings (gear icon) → General → Your apps → Web (</>)** → register an app named `site` → copy the `firebaseConfig` object.
7. Paste it into `assets/config.js` as the `firebase` value.

The Firebase web config is meant to be public; the Firestore rules are what keep each person's data private.
