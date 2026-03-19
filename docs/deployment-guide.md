# Deployment Guide

## Method 1: Sandbox Deploy (Recommended — No Account Needed)

The project includes a **bundled deploy script** that deploys to Vercel's sandbox without requiring a Vercel account, CLI installation, or login.

### How to Deploy
```bash
# First, make sure the build works
cd site && npm run build

# Then deploy using the bundled script
bash .claude/skills/vercel-deploy/scripts/deploy.sh site
```

### What Happens
1. The script detects the framework (Next.js) automatically
2. Packages the project into a tarball (excludes node_modules, .git, .env)
3. Uploads to Vercel's deployment endpoint
4. Polls until the build is complete (up to 5 minutes)
5. Returns a **preview URL** and a **claim URL**

### Output
```
Preview URL: https://site-xxxxx.vercel.app
Claim URL:   https://vercel.com/claim/xxxxx
```

- **Preview URL**: The live page — share this with anyone
- **Claim URL**: Optional — lets the user transfer the deployment to their own Vercel account for permanent hosting

### Tell the User
> "Your page is live! Here's the link: [previewUrl]"
> "Anyone can see it right now. If you want to keep it permanently or add a custom domain, claim it at [claimUrl] with a free Vercel account."

---

## Method 2: Vercel CLI (For Users With a Vercel Account)

If the user already has the Vercel CLI installed and authenticated:

### Quick Deploy
```bash
cd site && npx vercel --yes
```

### First-Time Setup
If the user hasn't logged in before:
1. Run `npx vercel login`
2. A browser window opens for authentication
3. Log in with GitHub, GitLab, Bitbucket, or email
4. Once authenticated, re-run `npx vercel --yes`

### Production Deploy
For a production deployment (custom domain support):
```bash
npx vercel --prod --yes
```

---

## Troubleshooting

**Build error before deploy:**
Run `npm run build` locally first. Fix any TypeScript or build errors before deploying.

**Sandbox deploy script fails:**
- Check internet connection
- Verify the `site/` directory exists and has a `package.json`
- Try running from the project root: `bash .claude/skills/vercel-deploy/scripts/deploy.sh site`

**Vercel CLI auth error:**
```
Error: No existing credentials found.
```
Use the sandbox deploy method instead (no account needed), or run `npx vercel login`.

**Port 3000 in use (during local preview):**
```bash
npm run dev -- --port 3001
```

**Deploy times out:**
The sandbox script waits up to 5 minutes. If it times out, the deployment may still be building. Check the preview URL manually after a few minutes.

---

## Notes
- Sandbox deployments stay live as preview URLs
- To keep a deployment permanently, claim it with a free Vercel account
- Custom domains require a Vercel account + DNS configuration
- The user can manage claimed deployments at vercel.com/dashboard
