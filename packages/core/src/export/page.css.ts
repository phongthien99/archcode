import { darkThemeVariables, diagramCss } from '../render/theme';
import { tokensCss } from '../tokens';

/** CSS của trang HTML export (không tải font hay tài nguyên ngoài). */
export function pageCss(): string {
  return `
${tokensCss('media', { dark: darkThemeVariables() })}
*{box-sizing:border-box}
body{margin:0;background:var(--ac-color-bg);color:var(--ac-color-text);font:15px/var(--ac-line-height-relaxed) var(--ac-font-sans)}
a{color:var(--ac-color-accent);text-decoration:none}a:hover{text-decoration:underline}
code{font:var(--ac-font-size-md) var(--ac-font-mono);background:var(--ac-color-border);padding:1px 5px;border-radius:4px}
.wrap{max-width:1280px;margin:0 auto;padding:0 24px}
header.hero{background:var(--ac-color-surface);border-bottom:1px solid var(--ac-color-border)}
header.hero .wrap{display:flex;gap:32px;justify-content:space-between;align-items:flex-end;padding-top:32px;padding-bottom:24px;flex-wrap:wrap}
.eyebrow{margin:0;color:var(--ac-color-text-muted);font-size:13px;text-transform:uppercase;letter-spacing:.06em}
h1{margin:4px 0 6px;font-size:30px;line-height:1.2}
.lead{margin:0;color:var(--ac-color-text-muted);max-width:640px}
.stats{display:flex;gap:10px;margin:0;flex-wrap:wrap}
.stats div{background:var(--ac-color-bg);border:1px solid var(--ac-color-border);border-radius:10px;padding:8px 14px;min-width:92px}
.stats dt{font-size:12px;color:var(--ac-color-text-muted)}.stats dd{margin:0;font-size:22px;font-weight:650}
.stats .err dd{color:var(--ac-color-danger-text)}.stats .warn dd{color:var(--ac-color-warning-text)}
nav.toc{position:sticky;top:0;z-index:5;background:color-mix(in srgb,var(--ac-color-bg) 88%,transparent);backdrop-filter:blur(6px);border-bottom:1px solid var(--ac-color-border)}
nav.toc .wrap{display:flex;gap:20px;padding-top:10px;padding-bottom:10px;font-size:14px}
section{margin:32px 0}
h2{font-size:20px;margin:0 0 14px}
h3{font-size:16px;margin:0}
.card{background:var(--ac-color-surface);border:1px solid var(--ac-color-border);border-radius:12px}
.tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}
.tabs button{font:inherit;font-size:14px;border:1px solid var(--ac-color-border);background:var(--ac-color-surface);color:var(--ac-color-text);padding:6px 14px;border-radius:999px;cursor:pointer}
.tabs button[aria-selected=true]{background:var(--ac-color-accent);border-color:var(--ac-color-accent);color:var(--ac-color-text-on-accent)}
html:not(.js) .tabs,html:not(.js) .zoom{display:none}
.view{margin-bottom:16px;overflow:hidden}
.view-head{display:flex;gap:16px;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--ac-color-border);flex-wrap:wrap}
.view-head p{margin:2px 0 0;color:var(--ac-color-text-muted);font-size:13px}
.zoom{display:flex;gap:4px;align-items:center}
.zoom span{color:var(--ac-color-text-muted);font-size:12px;margin-right:8px}
.zoom button{font:inherit;font-size:13px;min-width:32px;border:1px solid var(--ac-color-border);background:var(--ac-color-bg);color:var(--ac-color-text);border-radius:6px;padding:3px 8px;cursor:pointer}
.canvas{overflow:hidden;touch-action:none;cursor:grab;user-select:none;max-height:75vh;margin:0 auto}
.canvas.panning{cursor:grabbing}
.canvas svg{display:block;width:100%;height:100%}
table{width:100%;border-collapse:collapse;font-size:14px}
th,td{text-align:left;padding:9px 12px;border-bottom:1px solid var(--ac-color-border);vertical-align:top}
th{font-size:12px;color:var(--ac-color-text-muted);font-weight:600;text-transform:uppercase;letter-spacing:.04em;background:var(--ac-color-bg)}
tbody tr:last-child td{border-bottom:0}
tr.flash{animation:flash 1.6s ease-out}
@keyframes flash{from{background:color-mix(in srgb,var(--ac-color-accent) 22%,transparent)}to{background:transparent}}
td .desc{color:var(--ac-color-text-muted);font-size:13px;margin-top:2px}
.pill{display:inline-block;font-size:12px;padding:1px 8px;border-radius:999px;border:1px solid var(--ac-color-border);white-space:nowrap}
.links a{margin-right:6px;white-space:nowrap}
.none{color:var(--ac-color-text-muted)}
.sev{font-size:12px;font-weight:650;text-transform:uppercase}
.sev.error{color:var(--ac-color-danger-text)}.sev.warning{color:var(--ac-color-warning-text)}
.hint{color:var(--ac-color-text-muted);font-size:13px}
.empty{padding:24px;color:var(--ac-color-text-muted)}
footer{color:var(--ac-color-text-muted);font-size:13px;padding:24px 0 40px}
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
