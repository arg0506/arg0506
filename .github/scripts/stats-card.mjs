// Generates dist/stats.svg — a GitHub stats card in the profile's
// "Kolkata night" style (ink, alpona gold, sindoor, teal).
// Runs in GitHub Actions with the built-in GITHUB_TOKEN; no dependencies.
// Local preview with fake data:  STATS_MOCK=1 node .github/scripts/stats-card.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const USER = process.env.GH_USER || "arg0506";
const OUT = process.env.OUT || "dist/stats.svg";
const TOKEN = process.env.GITHUB_TOKEN;

const C = {
  ink: "#0B1020", ink2: "#121A33", ink3: "#1A2347", line: "#2A3566",
  gold: "#E9B44C", gold2: "#F6D58E", sindoor: "#E4572E", teal: "#2EC4B6",
  violet: "#9B87FF", cream: "#F5ECDC", muted: "#8C93B0",
};
const SERIF = "Georgia, 'Times New Roman', Times, serif";
const MONO = "'JetBrains Mono', 'SFMono-Regular', Menlo, Consolas, monospace";
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

const QUERY = `query($login: String!) {
  user(login: $login) {
    followers { totalCount }
    pullRequests { totalCount }
    repositories(ownerAffiliations: OWNER, isFork: false, privacy: PUBLIC, first: 100) {
      totalCount
      nodes {
        stargazerCount
        languages(first: 10, orderBy: { field: SIZE, direction: DESC }) {
          edges { size node { name } }
        }
      }
    }
    contributionsCollection {
      totalCommitContributions
      totalPullRequestContributions
      contributionCalendar {
        totalContributions
        weeks { contributionDays { contributionCount } }
      }
    }
  }
}`;

async function fetchData() {
  if (process.env.STATS_MOCK) {
    const weeks = Array.from({ length: 53 }, (_, i) => ({
      contributionDays: Array.from({ length: 7 }, (_, d) => ({
        contributionCount: Math.max(0, Math.round(6 + 5 * Math.sin(i / 4) + 4 * Math.sin(i * d) + (i > 40 ? 6 : 0))),
      })),
    }));
    return {
      followers: { totalCount: 128 }, pullRequests: { totalCount: 64 },
      repositories: {
        totalCount: 42,
        nodes: [
          { stargazerCount: 12, languages: { edges: [{ size: 900000, node: { name: "TypeScript" } }, { size: 300000, node: { name: "CSS" } }] } },
          { stargazerCount: 5, languages: { edges: [{ size: 400000, node: { name: "JavaScript" } }, { size: 200000, node: { name: "HTML" } }] } },
          { stargazerCount: 3, languages: { edges: [{ size: 250000, node: { name: "Rust" } }, { size: 120000, node: { name: "Solidity" } }, { size: 90000, node: { name: "Python" } }] } },
        ],
      },
      contributionsCollection: {
        totalCommitContributions: 1234, totalPullRequestContributions: 51,
        contributionCalendar: { totalContributions: 1890, weeks },
      },
    };
  }
  if (!TOKEN) throw new Error("GITHUB_TOKEN is not set");
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${TOKEN}`, "Content-Type": "application/json", "User-Agent": "profile-stats-card" },
    body: JSON.stringify({ query: QUERY, variables: { login: USER } }),
  });
  const json = await res.json();
  if (json.errors || !json.data?.user) throw new Error(JSON.stringify(json.errors || json));
  return json.data.user;
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fmt = (n) => (n >= 10000 ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "k" : n.toLocaleString("en-US"));

function render(u) {
  const W = 1200, H = 340;
  const cc = u.contributionsCollection;
  const stars = u.repositories.nodes.reduce((a, r) => a + r.stargazerCount, 0);
  const stats = [
    ["CONTRIBUTIONS · 12 MO", cc.contributionCalendar.totalContributions, C.gold],
    ["COMMITS · 12 MO", cc.totalCommitContributions, C.cream],
    ["PULL REQUESTS", u.pullRequests.totalCount, C.cream],
    ["STARS EARNED", stars, C.gold],
    ["PUBLIC REPOS", u.repositories.totalCount, C.cream],
    ["FOLLOWERS", u.followers.totalCount, C.cream],
  ];

  // weekly totals → area chart
  const weeks = cc.contributionCalendar.weeks.map((w) => w.contributionDays.reduce((a, d) => a + d.contributionCount, 0));
  const cx0 = 460, cx1 = 850, cy0 = 96, cy1 = 262;
  const max = Math.max(1, ...weeks);
  const pts = weeks.map((v, i) => [cx0 + ((cx1 - cx0) * i) / Math.max(1, weeks.length - 1), cy1 - ((cy1 - cy0) * v) / max]);
  let line = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const [px, py] = pts[i - 1], [x, y] = pts[i], mx = (px + x) / 2;
    line += ` C${mx.toFixed(1)},${py.toFixed(1)} ${mx.toFixed(1)},${y.toFixed(1)} ${x.toFixed(1)},${y.toFixed(1)}`;
  }
  const area = `${line} L${cx1},${cy1} L${cx0},${cy1}Z`;
  const best = weeks.indexOf(max);
  const [bx, by] = pts[best];

  // languages
  const langs = {};
  for (const r of u.repositories.nodes) for (const e of r.languages.edges) langs[e.node.name] = (langs[e.node.name] || 0) + e.size;
  const total = Object.values(langs).reduce((a, b) => a + b, 0) || 1;
  const top = Object.entries(langs).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const pal = [C.gold, C.teal, C.sindoor, C.violet, C.cream, C.muted];

  const o = [];
  o.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img"><title>GitHub stats for ${esc(USER)}</title>`);
  o.push(`<defs><style>
.serif{font-family:${SERIF}}.mono{font-family:${MONO};letter-spacing:.14em;text-transform:uppercase}.sans{font-family:${SANS}}
.draw{stroke-dasharray:2000;stroke-dashoffset:2000;animation:dw 2.6s ease-out .3s forwards}@keyframes dw{to{stroke-dashoffset:0}}
.fade{animation:fd 1.4s ease 1s both}@keyframes fd{from{opacity:0}to{opacity:1}}
.rise{animation:rs .8s ease both}@keyframes rs{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.ping{animation:pg 2s ease-out infinite}@keyframes pg{0%{r:4;opacity:.9}100%{r:16;opacity:0}}
.grow{animation:gr 1.2s ease both}@keyframes gr{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@media (prefers-reduced-motion: reduce){*{animation:none!important}}
</style>
<radialGradient id="bg" cx="50%" cy="0%" r="120%"><stop offset="0" stop-color="${C.ink3}"/><stop offset=".65" stop-color="${C.ink}"/></radialGradient>
<linearGradient id="ar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.gold}" stop-opacity=".45"/><stop offset="1" stop-color="${C.gold}" stop-opacity="0"/></linearGradient>
</defs>`);
  o.push(`<rect width="${W}" height="${H}" rx="18" fill="url(#bg)"/>`);
  o.push(`<rect x="10" y="10" width="${W - 20}" height="${H - 20}" rx="12" fill="none" stroke="${C.gold}" stroke-opacity=".22"/>`);

  // stat grid
  stats.forEach(([label, val, col], i) => {
    const x = 50 + (i % 2) * 190, y = 70 + Math.floor(i / 2) * 92;
    o.push(`<g class="rise" style="animation-delay:${(i * 0.12).toFixed(2)}s">`);
    o.push(`<text x="${x}" y="${y}" class="mono" font-size="10.5" fill="${C.muted}">${label}</text>`);
    o.push(`<text x="${x}" y="${y + 44}" class="serif" font-size="40" fill="${col}"${i === 0 ? ' font-style="italic"' : ""}>${fmt(val)}</text>`);
    o.push(`<line x1="${x}" y1="${y + 58}" x2="${x + 150}" y2="${y + 58}" stroke="${C.line}"/>`);
    o.push(`</g>`);
  });

  // chart
  o.push(`<text x="${cx0}" y="58" class="mono" font-size="11" fill="${C.muted}">CONTRIBUTION TOPOGRAPHY · 52 WEEKS</text>`);
  for (let k = 0; k <= 3; k++) {
    const y = cy0 + ((cy1 - cy0) * k) / 3;
    o.push(`<line x1="${cx0}" y1="${y.toFixed(1)}" x2="${cx1}" y2="${y.toFixed(1)}" stroke="${C.line}" stroke-dasharray="2 5"/>`);
  }
  o.push(`<path d="${area}" fill="url(#ar)" class="fade"/>`);
  o.push(`<path d="${line}" fill="none" stroke="${C.gold}" stroke-width="2" class="draw"/>`);
  o.push(`<g class="fade"><circle cx="${bx.toFixed(1)}" cy="${by.toFixed(1)}" r="4" fill="${C.sindoor}"/><circle cx="${bx.toFixed(1)}" cy="${by.toFixed(1)}" r="4" fill="none" stroke="${C.sindoor}" class="ping"/>`);
  const lblX = Math.min(cx1 - 4, Math.max(cx0 + 4, bx));
  const anchor = bx > cx1 - 80 ? "end" : bx < cx0 + 80 ? "start" : "middle";
  o.push(`<text x="${lblX.toFixed(1)}" y="${(by - 14).toFixed(1)}" class="mono" font-size="10" fill="${C.sindoor}" text-anchor="${anchor}">PEAK · ${max}</text></g>`);
  o.push(`<text x="${cx0}" y="${cy1 + 26}" class="mono" font-size="10" fill="${C.muted}">12 MO AGO</text>`);
  o.push(`<text x="${cx1}" y="${cy1 + 26}" class="mono" font-size="10" fill="${C.gold}" text-anchor="end">NOW</text>`);

  // languages
  const lx = 890, lw = 270;
  o.push(`<text x="${lx}" y="58" class="mono" font-size="11" fill="${C.muted}">LANGUAGES</text>`);
  let acc = 0;
  o.push(`<g class="grow" style="transform-origin:${lx}px 84px">`);
  top.forEach(([, size], i) => {
    const w = (lw * size) / total;
    o.push(`<rect x="${(lx + acc).toFixed(1)}" y="78" width="${Math.max(2, w - 2).toFixed(1)}" height="12" rx="3" fill="${pal[i]}"/>`);
    acc += w;
  });
  o.push(`</g>`);
  top.forEach(([name, size], i) => {
    const y = 128 + i * 27;
    const pct = ((100 * size) / total).toFixed(1);
    o.push(`<g class="rise" style="animation-delay:${(0.4 + i * 0.1).toFixed(2)}s"><circle cx="${lx + 6}" cy="${y - 4}" r="5" fill="${pal[i]}"/>`);
    o.push(`<text x="${lx + 22}" y="${y}" class="sans" font-size="14" fill="${C.cream}">${esc(name)}</text>`);
    o.push(`<text x="${lx + lw}" y="${y}" class="mono" font-size="11" fill="${C.muted}" text-anchor="end">${pct}%</text></g>`);
  });

  const today = new Date().toISOString().slice(0, 10);
  o.push(`<text x="${W - 40}" y="${H - 28}" class="mono" font-size="9.5" fill="${C.muted}" text-anchor="end">@${esc(USER)} · UPDATED ${today}</text>`);
  o.push(`</svg>`);
  return o.join("\n");
}

const data = await fetchData();
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, render(data));
console.log(`wrote ${OUT}`);
