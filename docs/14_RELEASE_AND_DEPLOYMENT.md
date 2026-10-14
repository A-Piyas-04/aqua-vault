# Release, Security, and Zero-Cost Deployment

## Deployment mode
Prefer **static export** from Next.js for MVP, e.g. `output: 'export'` if supported by all used features, with a generated `out/` directory. Host on Vercel Hobby (noncommercial/personal-use eligibility must be checked), Netlify Free or GitHub Pages. No persistent Node server required. For GitHub Pages, consider `basePath` for repo subpath. No server APIs or SSR-dependent gameplay.

## Basic commands
`npm install`
`npm run dev`
`npm run test`
`npm run build`
Document exact commands in repository README. For Vercel import the Git repository and use automatic Next.js detection or static build output as appropriate.

## Free tier caveats
Vercel Hobby is free for eligible personal/non-commercial use with limits and changing policies; verify current terms before publishing. Supabase offers a free project tier with quotas if later needed, but no need to provision one now. Avoid asserting that a deploy will always stay free or that every backend must be paid.

## Security/privacy
No secrets, API keys, personal data or user tracking required. Save files remain local. Add clear local-save disclaimer. No account integration. No external fonts/audio if privacy/offline simplicity is a priority; prefer bundled assets. If adding cloud saves later, implement RLS and least privilege.

## Preflight checklist
- No TypeScript errors, build passes, tests pass.
- Browser devtools show no runtime exceptions.
- Fresh player can reach all core progression milestones.
- Mobile touch drag/erase works; layout tested 320–430px.
- Performance acceptable; tab pause prevents runaway simulation.
- Manual reload persists save; invalid save recovers gracefully.
- Credits and licenses included for third-party content.
- OG title/description, simple game icon and favicon.
- Test live production URL manually before sharing.
