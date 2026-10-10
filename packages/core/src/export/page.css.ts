import { darkThemeVariables, diagramCss } from '../render/theme';

/** CSS của trang HTML export (không tải font hay tài nguyên ngoài). */
export function pageCss(): string {
  return `
:root{--bg:#f8fafc;--card:#ffffff;--fg:#0f172a;--muted:#64748b;--line:#e2e8f0;--accent:#2563eb;--err:#dc2626;--warn:#d97706;--ok:#16a34a;color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{--bg:#0b1120;--card:#111827;--fg:#e5e7eb;--muted:#9ca3af;--line:#1f2937;--accent:#60a5fa;--err:#f87171;--warn:#fbbf24;--ok:#4ade80;${darkThemeVariables()}}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
code{font:13px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;background:var(--line);padding:1px 5px;border-radius:4px}
.wrap{max-width:1280px;margin:0 auto;padding:0 24px}
header.hero{background:var(--card);border-bottom:1px solid var(--line)}
header.hero .wrap{display:flex;gap:32px;justify-content:space-between;align-items:flex-end;padding-top:32px;padding-bottom:24px;flex-wrap:wrap}
.eyebrow{margin:0;color:var(--muted);font-size:13px;text-transform:uppercase;letter-spacing:.06em}
h1{margin:4px 0 6px;font-size:30px;line-height:1.2}
.lead{margin:0;color:var(--muted);max-width:640px}
.stats{display:flex;gap:10px;margin:0;flex-wrap:wrap}
.stats div{background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:8px 14px;min-width:92px}
.stats dt{font-size:12px;color:var(--muted)}.stats dd{margin:0;font-size:22px;font-weight:650}
.stats .err dd{color:var(--err)}.stats .warn dd{color:var(--warn)}
nav.toc{position:sticky;top:0;z-index:5;background:color-mix(in srgb,var(--bg) 88%,transparent);backdrop-filter:blur(6px);border-bottom:1px solid var(--line)}
nav.toc .wrap{display:flex;gap:20px;padding-top:10px;padding-bottom:10px;font-size:14px}
section{margin:32px 0}
h2{font-size:20px;margin:0 0 14px}
h3{font-size:16px;margin:0}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px}
.tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}
.tabs button{font:inherit;font-size:14px;border:1px solid var(--line);background:var(--card);color:var(--fg);padding:6px 14px;border-radius:999px;cursor:pointer}
.tabs button[aria-selected=true]{background:var(--accent);border-color:var(--accent);color:#fff}
html:not(.js) .tabs,html:not(.js) .zoom{display:none}
.view{margin-bottom:16px;overflow:hidden}
.view-head{display:flex;gap:16px;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--line);flex-wrap:wrap}
.view-head p{margin:2px 0 0;color:var(--muted);font-size:13px}
.zoom{display:flex;gap:4px;align-items:center}
.zoom span{color:var(--muted);font-size:12px;margin-right:8px}
.zoom button{font:inherit;font-size:13px;min-width:32px;border:1px solid var(--line);background:var(--bg);color:var(--fg);border-radius:6px;padding:3px 8px;cursor:pointer}
.canvas{overflow:hidden;touch-action:none;cursor:grab;user-select:none;max-height:75vh;margin:0 auto}
.canvas.panning{cursor:grabbing}
.canvas svg{display:block;width:100%;height:100%}
table{width:100%;border-collapse:collapse;font-size:14px}
th,td{text-align:left;padding:9px 12px;border-bottom:1px solid var(--line);vertical-align:top}
th{font-size:12px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.04em;background:var(--bg)}
tbody tr:last-child td{border-bottom:0}
tr.flash{animation:flash 1.6s ease-out}
@keyframes flash{from{background:color-mix(in srgb,var(--accent) 22%,transparent)}to{background:transparent}}
td .desc{color:var(--muted);font-size:13px;margin-top:2px}
.pill{display:inline-block;font-size:12px;padding:1px 8px;border-radius:999px;border:1px solid var(--line);white-space:nowrap}
.links a{margin-right:6px;white-space:nowrap}
.none{color:var(--muted)}
.sev{font-size:12px;font-weight:650;text-transform:uppercase}
.sev.error{color:var(--err)}.sev.warning{color:var(--warn)}
.hint{color:var(--muted);font-size:13px}
.empty{padding:24px;color:var(--muted)}
footer{color:var(--muted);font-size:13px;padding:24px 0 40px}
@media print{
  nav.toc,.tabs,.zoom{display:none}
  .view[hidden]{display:block!important}
  .view{break-inside:avoid;page-break-inside:avoid}
  .canvas{max-height:none}
  body{background:#fff}
}
${diagramCss()}
`;
}
