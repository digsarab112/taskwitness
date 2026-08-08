import type { EvidenceRecord, VerificationReport } from '../domain/schemas.js';
import { escapeHtml } from '../utils/text.js';

export function renderHtmlReport(report: VerificationReport): string {
  const evidence = new Map(report.evidence.map((record) => [record.id, record]));
  const requirementCards = report.requirements
    .map((finding) => {
      const records = finding.evidenceIds
        .map((id) => evidence.get(id))
        .filter((record): record is EvidenceRecord => record !== undefined);
      const evidenceList =
        records.length === 0
          ? '<em>No evidence.</em>'
          : `<ul>${records.map((record) => `<li><code>${record.id}</code> ${escapeHtml(record.summary)}</li>`).join('')}</ul>`;
      return `<article class="requirement">
  <div class="requirement-head">
    <span class="status status-${slug(finding.status)}">${statusIcon(finding.status)} ${escapeHtml(humanize(finding.status))}</span>
    <span class="proof">proof ${finding.strength}/3</span>
  </div>
  <h3><small>${escapeHtml(finding.requirementId)}</small>${escapeHtml(finding.text)}</h3>
  <p>${escapeHtml(finding.explanation)}</p>
  <div class="evidence"><strong>Evidence</strong>${evidenceList}</div>
</article>`;
    })
    .join('');

  const changeRows = report.changes
    .map(
      (change) => `<tr>
  <td><code>${escapeHtml(change.path)}</code></td>
  <td>${escapeHtml(change.status)}</td>
  <td><span class="classification class-${slug(change.classification)}">${escapeHtml(humanize(change.classification))}</span></td>
  <td class="lines"><span class="plus">+${change.additions ?? '—'}</span> <span class="minus">-${change.deletions ?? '—'}</span></td>
</tr>`,
    )
    .join('');

  const checkCards =
    report.verificationChecks.length === 0
      ? '<div class="empty">No verification commands were run.</div>'
      : report.verificationChecks
          .map(
            (
              check,
            ) => `<div class="check ${check.status === 'passed' ? 'check-pass' : 'check-fail'}">
  <span class="check-icon">${check.status === 'passed' ? '✓' : '×'}</span>
  <div><strong>${escapeHtml(check.label)}</strong><code>${escapeHtml(check.command)}</code></div>
  <span>${escapeHtml(check.status)}</span>
</div>`,
          )
          .join('');

  const warningSection =
    report.warnings.length === 0
      ? ''
      : `<section>
  <div class="eyebrow">Human attention</div>
  <h2>Things worth checking</h2>
  <div class="warning-grid">${report.warnings
    .map(
      (warning) => `<article class="warning warning-${warning.severity}">
    <span>${warning.severity === 'high' ? '🚨' : '⚠️'}</span>
    <div><h3>${escapeHtml(warning.title)}</h3><p>${escapeHtml(warning.message)}</p>${warning.files.map((file) => `<code>${escapeHtml(file)}</code>`).join('')}</div>
  </article>`,
    )
    .join('')}</div>
</section>`;

  const verifiedCount = report.requirements.filter(
    (item) => item.status === 'VERIFIED',
  ).length;
  const generated = new Date(report.generatedAt).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <title>TaskWitness — ${escapeHtml(report.verdict)}</title>
  <style>${styles}</style>
</head>
<body>
<main>
  <header><span class="brand">TASK<b>WITNESS</b></span><span>${escapeHtml(generated)}</span></header>
  <section class="hero">
    <div class="eyebrow">Evidence-backed completion report</div>
    <div class="verdict verdict-${slug(report.verdict)}">${verdictIcon(report.verdict)} ${escapeHtml(humanize(report.verdict))}</div>
    <h1>${escapeHtml(report.task)}</h1>
    <div class="reason-row">${report.verdictReasons.map((reason) => `<span>${escapeHtml(reason)}</span>`).join('')}</div>
  </section>
  <section class="metrics">
    <div><strong>${verifiedCount}/${report.requirements.length}</strong><span>requirements verified</span></div>
    <div><strong>${report.changeSummary.filesChanged}</strong><span>files changed</span></div>
    <div><strong class="plus">+${report.changeSummary.additions}</strong><span>lines added</span></div>
    <div><strong class="minus">-${report.changeSummary.deletions}</strong><span>lines removed</span></div>
  </section>
  <section><div class="eyebrow">Task Contract</div><h2>Requirements</h2><div class="requirements">${requirementCards}</div></section>
  <section><div class="eyebrow">Observable facts</div><h2>What changed</h2><div class="table-wrap"><table><thead><tr><th>File</th><th>Change</th><th>Classification</th><th>Lines</th></tr></thead><tbody>${changeRows || '<tr><td colspan="4">No file changes.</td></tr>'}</tbody></table></div></section>
  <section><div class="eyebrow">Approved execution</div><h2>Verification</h2><div class="checks">${checkCards}</div></section>
  ${warningSection}
  <section class="limitations"><div><div class="eyebrow">Honest limits</div><h2>What this report does not prove</h2></div><ul>${report.limitations.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></section>
  <footer><span>TaskWitness ${escapeHtml(report.taskWitnessVersion)}</span><span>No evidence = no green check.</span></footer>
</main>
</body>
</html>`;
}

function humanize(value: string): string {
  return value.replaceAll('_', ' ');
}
function slug(value: string): string {
  return value.toLowerCase().replaceAll('_', '-');
}
function statusIcon(status: string): string {
  if (status === 'VERIFIED') return '✓';
  if (status === 'FAILED') return '×';
  if (status === 'HUMAN_REVIEW_REQUIRED') return '!';
  if (status === 'SUPPORTED') return '◐';
  return '○';
}
function verdictIcon(verdict: string): string {
  if (verdict === 'VERIFIED') return '✓';
  if (verdict === 'VERIFICATION_FAILED') return '×';
  if (verdict === 'NEEDS_REVIEW') return '!';
  return '○';
}

const styles = `
:root{--bg:#f4f7f3;--surface:#fff;--surface2:#edf2ed;--text:#142019;--muted:#68746c;--line:#dae2db;--green:#35ce7b;--greenInk:#07512c;--blue:#3d71f3;--yellow:#d99b21;--red:#df4a4a;--shadow:0 20px 65px rgba(20,45,28,.08)}
@media(prefers-color-scheme:dark){:root{--bg:#0c110e;--surface:#141a16;--surface2:#1b231e;--text:#edf5ef;--muted:#9ba79f;--line:#2a352e;--green:#50dc91;--greenInk:#aaf2c8;--blue:#80a4ff;--yellow:#ffd16f;--red:#ff8181;--shadow:0 24px 70px rgba(0,0,0,.3)}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.55}main{width:min(1080px,calc(100% - 32px));margin:auto}header{height:84px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--line);font-size:12px;color:var(--muted)}.brand{font-weight:900;letter-spacing:.14em;color:var(--text)}.brand b{color:var(--green)}section{margin:78px 0}.hero{margin-top:0;padding:65px 0 48px}.eyebrow{text-transform:uppercase;letter-spacing:.15em;font-size:10px;font-weight:850;color:var(--muted);margin-bottom:11px}h1{font-size:clamp(35px,5vw,64px);line-height:1.06;letter-spacing:-.045em;max-width:900px;margin:19px 0 25px}h2{font-size:29px;letter-spacing:-.035em;margin:0 0 24px}.verdict,.status,.classification{display:inline-flex;align-items:center;border-radius:999px;font-weight:850;text-transform:uppercase;letter-spacing:.06em}.verdict{padding:8px 12px;font-size:12px}.verdict-verified,.status-verified{background:color-mix(in srgb,var(--green) 17%,transparent);color:var(--greenInk)}.verdict-needs-review,.verdict-insufficient-evidence,.status-unverified,.status-human-review-required{background:color-mix(in srgb,var(--yellow) 15%,transparent);color:var(--yellow)}.verdict-verification-failed,.status-failed{background:color-mix(in srgb,var(--red) 15%,transparent);color:var(--red)}.status-supported{background:color-mix(in srgb,var(--blue) 14%,transparent);color:var(--blue)}.reason-row{display:flex;flex-wrap:wrap;gap:8px}.reason-row span{border:1px solid var(--line);border-radius:8px;padding:7px 10px;font-size:12px;color:var(--muted)}.metrics{display:grid;grid-template-columns:repeat(4,1fr);background:var(--surface);border:1px solid var(--line);border-radius:17px;overflow:hidden;box-shadow:var(--shadow)}.metrics div{padding:23px;border-right:1px solid var(--line)}.metrics div:last-child{border:0}.metrics strong{display:block;font-size:28px;letter-spacing:-.04em}.metrics span{font-size:11px;color:var(--muted)}.plus{color:var(--green)}.minus{color:var(--red)}.requirements,.checks,.warning-grid{display:grid;gap:12px}.requirement{padding:22px 24px;border-radius:15px;background:var(--surface);border:1px solid var(--line)}.requirement-head{display:flex;justify-content:space-between;align-items:center}.status{font-size:9px;padding:5px 8px}.proof{font-size:10px;color:var(--muted)}.requirement h3{font-size:17px;margin:17px 0 6px}.requirement h3 small{font-size:10px;color:var(--muted);margin-right:8px}.requirement p{margin:0;color:var(--muted)}.evidence{margin-top:17px;padding-top:15px;border-top:1px solid var(--line);font-size:11px}.evidence strong{display:block;text-transform:uppercase;letter-spacing:.08em;font-size:9px;color:var(--muted)}.evidence ul{margin:7px 0 0;padding-left:18px}.evidence em{display:block;margin-top:7px;color:var(--muted)}code{font-family:"SFMono-Regular",Consolas,monospace}.table-wrap{overflow:auto;border:1px solid var(--line);border-radius:14px;background:var(--surface)}table{width:100%;border-collapse:collapse;font-size:12px}th,td{text-align:left;padding:14px 16px;border-bottom:1px solid var(--line)}th{background:var(--surface2);color:var(--muted);text-transform:uppercase;letter-spacing:.08em;font-size:9px}tr:last-child td{border:0}.classification{padding:4px 7px;font-size:8px;background:var(--surface2);color:var(--muted)}.class-high-risk-out-of-scope{color:var(--red)}.class-out-of-scope{color:var(--yellow)}.class-expected{color:var(--greenInk)}.lines{white-space:nowrap}.check{display:grid;grid-template-columns:32px 1fr auto;gap:11px;align-items:center;padding:15px 17px;background:var(--surface);border:1px solid var(--line);border-radius:12px}.check-icon{width:28px;height:28px;display:grid;place-items:center;border-radius:50%;font-weight:900}.check-pass .check-icon{color:var(--green);background:color-mix(in srgb,var(--green) 17%,transparent)}.check-fail .check-icon{color:var(--red);background:color-mix(in srgb,var(--red) 15%,transparent)}.check code{display:block;color:var(--muted);font-size:10px}.check>span:last-child{font-size:9px;text-transform:uppercase;color:var(--muted)}.empty{padding:20px;border:1px dashed var(--line);border-radius:12px;color:var(--muted)}.warning{display:grid;grid-template-columns:28px 1fr;gap:10px;padding:19px;background:var(--surface);border:1px solid var(--line);border-radius:13px}.warning-high{border-color:color-mix(in srgb,var(--red) 45%,var(--line))}.warning h3{margin:0;font-size:13px}.warning p{margin:4px 0 9px;color:var(--muted)}.warning code{display:block;font-size:10px}.limitations{display:grid;grid-template-columns:1fr 1.4fr;gap:35px;padding:31px;background:var(--surface2);border:1px solid var(--line);border-radius:17px}.limitations ul{margin:0;padding-left:18px;color:var(--muted)}.limitations li{margin:7px 0}footer{display:flex;justify-content:space-between;padding:34px 0 50px;border-top:1px solid var(--line);font-size:11px;color:var(--muted)}
@media(max-width:700px){section{margin:55px 0}.metrics{grid-template-columns:1fr 1fr}.metrics div:nth-child(2){border-right:0}.metrics div:nth-child(-n+2){border-bottom:1px solid var(--line)}.limitations{grid-template-columns:1fr}.check{grid-template-columns:30px 1fr}.check>span:last-child{display:none}footer{flex-direction:column;gap:10px}}
`;
