/**
 * SCORM 1.2 Exporter
 * ===================
 * Packages a ScrollLibrary book + (optional) competency certificate
 * into a SCORM 1.2 compliant ZIP that can be uploaded to Moodle,
 * Canvas, Blackboard, TalentLMS, etc.
 *
 * Why SCORM 1.2 (not 2004 / xAPI)?
 *   - Universally supported by every major LMS in the enterprise market.
 *   - Smallest viable manifest, fastest path to institutional adoption.
 *
 * Output structure:
 *   imsmanifest.xml         (SCORM manifest)
 *   index.html              (course shell, navigates chapters)
 *   chapters/chapter-N.html (one file per chapter)
 *   certificate.html        (optional, if certificate is provided)
 *   scorm_api.js            (minimal SCORM 1.2 API wrapper)
 *   metadata.json           (ScrollLibrary export metadata)
 */

import JSZip from 'jszip';

export interface ScormChapter {
  chapter_number: number;
  title: string;
  content: string | null;
}

export interface ScormBook {
  id: string;
  title: string;
  description?: string | null;
  category?: string | null;
  total_chapters?: number | null;
}

export interface ScormCertificate {
  certificate_number: string;
  competency_level?: string | null;
  issued_at: string;
  verification_hash?: string | null;
  recipient_name?: string;
}

export interface ScormExportOptions {
  book: ScormBook;
  chapters: ScormChapter[];
  certificate?: ScormCertificate | null;
  organizationName?: string;
  verificationBaseUrl?: string;
}

const SCORM_VERSION = '1.2';
const PACKAGE_VERSION = '1.0';

// ---------- HTML helpers ----------

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeXml(s: string): string {
  return escapeHtml(s);
}

function chapterFileName(n: number): string {
  return `chapters/chapter-${n}.html`;
}

// ---------- Manifest ----------

function buildManifest(opts: ScormExportOptions): string {
  const { book, chapters, certificate } = opts;
  const orgId = `ORG-${book.id}`;
  const courseId = `COURSE-${book.id}`;

  const chapterItems = chapters
    .map(
      (c) => `
      <item identifier="ITEM-CH-${c.chapter_number}" identifierref="RES-CH-${c.chapter_number}">
        <title>${escapeXml(`Chapter ${c.chapter_number}: ${c.title}`)}</title>
      </item>`
    )
    .join('');

  const certItem = certificate
    ? `
      <item identifier="ITEM-CERT" identifierref="RES-CERT">
        <title>Certificate of Completion</title>
      </item>`
    : '';

  const chapterResources = chapters
    .map(
      (c) => `
    <resource identifier="RES-CH-${c.chapter_number}" type="webcontent" adlcp:scormtype="sco" href="${chapterFileName(c.chapter_number)}">
      <file href="${chapterFileName(c.chapter_number)}"/>
      <file href="scorm_api.js"/>
    </resource>`
    )
    .join('');

  const certResource = certificate
    ? `
    <resource identifier="RES-CERT" type="webcontent" adlcp:scormtype="sco" href="certificate.html">
      <file href="certificate.html"/>
      <file href="scorm_api.js"/>
    </resource>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="MANIFEST-${book.id}" version="${PACKAGE_VERSION}"
  xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd
                      http://www.imsglobal.org/xsd/imsmd_rootv1p2p1 imsmd_rootv1p2p1.xsd
                      http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>${SCORM_VERSION}</schemaversion>
  </metadata>
  <organizations default="${orgId}">
    <organization identifier="${orgId}">
      <title>${escapeXml(book.title)}</title>
      <item identifier="${courseId}">
        <title>${escapeXml(book.title)}</title>${chapterItems}${certItem}
      </item>
    </organization>
  </organizations>
  <resources>${chapterResources}${certResource}
  </resources>
</manifest>`;
}

// ---------- SCORM 1.2 API wrapper ----------

function buildScormApiJs(): string {
  // Minimal SCORM 1.2 wrapper: finds the API in parent frames,
  // reports completion + a basic score when chapter is read.
  return `(function(){
  function findAPI(win){
    var n=0;
    while(win && !win.API && win.parent && win.parent !== win && n < 10){ win = win.parent; n++; }
    return win ? win.API : null;
  }
  var api = findAPI(window) || (window.opener ? findAPI(window.opener) : null);
  window.SCORM = {
    init: function(){
      if(!api) return false;
      try{
        api.LMSInitialize("");
        api.LMSSetValue("cmi.core.lesson_status","incomplete");
        api.LMSCommit("");
        return true;
      }catch(e){ return false; }
    },
    complete: function(score){
      if(!api) return false;
      try{
        if(typeof score === 'number'){
          api.LMSSetValue("cmi.core.score.raw", String(Math.round(score)));
          api.LMSSetValue("cmi.core.score.min","0");
          api.LMSSetValue("cmi.core.score.max","100");
        }
        api.LMSSetValue("cmi.core.lesson_status","completed");
        api.LMSCommit("");
        return true;
      }catch(e){ return false; }
    },
    finish: function(){
      if(!api) return false;
      try{ api.LMSFinish(""); return true; }catch(e){ return false; }
    }
  };
  document.addEventListener("DOMContentLoaded", function(){ window.SCORM.init(); });
  window.addEventListener("beforeunload", function(){ window.SCORM.finish(); });
})();`;
}

// ---------- Chapter / certificate HTML ----------

const SHARED_STYLES = `
  :root { --fg:#1a1a1a; --muted:#666; --bg:#fafafa; --primary:#1d4ed8; --border:#e5e7eb; }
  *{box-sizing:border-box}
  body{font-family:Georgia,'Times New Roman',serif;max-width:780px;margin:0 auto;padding:32px 24px;background:var(--bg);color:var(--fg);line-height:1.7}
  header{border-bottom:1px solid var(--border);padding-bottom:16px;margin-bottom:24px}
  .crumb{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:1px}
  h1{font-size:28px;margin:8px 0 4px}
  h2{font-size:22px;margin-top:32px}
  h3{font-size:18px;margin-top:24px}
  pre,code{font-family:Menlo,Consolas,monospace;background:#f4f4f4;border-radius:4px}
  pre{padding:12px;overflow:auto}
  code{padding:2px 6px;font-size:0.9em}
  blockquote{border-left:4px solid var(--primary);margin:16px 0;padding:8px 16px;color:#333;background:#fff}
  table{border-collapse:collapse;width:100%;margin:16px 0}
  th,td{border:1px solid var(--border);padding:8px;text-align:left}
  .actions{margin-top:40px;padding-top:16px;border-top:1px solid var(--border);display:flex;justify-content:space-between;gap:12px}
  .btn{background:var(--primary);color:#fff;border:none;padding:10px 18px;border-radius:6px;cursor:pointer;font-size:14px}
  .btn.secondary{background:#fff;color:var(--primary);border:1px solid var(--primary)}
`;

function renderMarkdownLite(content: string): string {
  // Very small markdown subset: headings, bold, italic, code fences, paragraphs.
  // Avoids pulling a heavy MD library into the SCORM payload.
  const escaped = escapeHtml(content);
  let html = escaped
    .replace(/^### (.*)$/gm, '<h3>$1</h3>')
    .replace(/^## (.*)$/gm, '<h2>$1</h2>')
    .replace(/^# (.*)$/gm, '<h1>$1</h1>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
    .replace(/```([\s\S]*?)```/g, (_, code) => `<pre><code>${code}</code></pre>`)
    .replace(/`([^`\n]+)`/g, '<code>$1</code>');
  // Paragraph wrapping for blank-line-separated blocks
  html = html
    .split(/\n{2,}/)
    .map((block) => {
      if (/^\s*<(h\d|pre|blockquote|ul|ol|table)/.test(block)) return block;
      return `<p>${block.replace(/\n/g, '<br/>')}</p>`;
    })
    .join('\n');
  return html;
}

function buildChapterHtml(book: ScormBook, chapter: ScormChapter, prev?: number, next?: number): string {
  const body = chapter.content ? renderMarkdownLite(chapter.content) : '<p><em>No content available.</em></p>';
  const prevLink = prev != null ? `<a class="btn secondary" href="chapter-${prev}.html">← Previous</a>` : '<span></span>';
  const nextLink =
    next != null
      ? `<a class="btn" href="chapter-${next}.html" onclick="window.SCORM&&window.SCORM.complete(100)">Next →</a>`
      : `<button class="btn" onclick="window.SCORM&&window.SCORM.complete(100);alert('Chapter complete.')">Mark complete</button>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${escapeHtml(book.title)} — Chapter ${chapter.chapter_number}</title>
<style>${SHARED_STYLES}</style>
<script src="../scorm_api.js"></script>
</head>
<body>
<header>
  <div class="crumb">${escapeHtml(book.title)}</div>
  <h1>Chapter ${chapter.chapter_number}: ${escapeHtml(chapter.title)}</h1>
</header>
<main>${body}</main>
<div class="actions">${prevLink}${nextLink}</div>
</body>
</html>`;
}

function buildCertificateHtml(book: ScormBook, cert: ScormCertificate, opts: ScormExportOptions): string {
  const verifyUrl = opts.verificationBaseUrl
    ? `${opts.verificationBaseUrl.replace(/\/$/, '')}/${cert.certificate_number}`
    : `https://scrolllibrary.org/certificate/${cert.certificate_number}`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Certificate — ${escapeHtml(cert.certificate_number)}</title>
<style>${SHARED_STYLES}
  .cert{background:#fff;border:2px solid var(--primary);padding:48px;text-align:center;border-radius:12px}
  .cert h1{font-size:32px;margin-bottom:8px}
  .cert .num{font-family:Menlo,Consolas,monospace;font-size:14px;color:var(--muted);margin-top:24px}
</style>
<script src="scorm_api.js"></script>
</head>
<body>
<div class="cert">
  <div class="crumb">ScrollLibrary Certification</div>
  <h1>Certificate of ${escapeHtml(cert.competency_level || 'Completion')}</h1>
  <p>Awarded for successful completion of</p>
  <h2 style="margin:8px 0 24px">${escapeHtml(book.title)}</h2>
  ${cert.recipient_name ? `<p><strong>${escapeHtml(cert.recipient_name)}</strong></p>` : ''}
  <p>Issued ${escapeHtml(new Date(cert.issued_at).toLocaleDateString())}</p>
  <div class="num">Certificate № ${escapeHtml(cert.certificate_number)}</div>
  <p style="margin-top:24px;font-size:13px"><a href="${escapeHtml(verifyUrl)}" target="_blank" rel="noopener">Verify online →</a></p>
</div>
<script>document.addEventListener("DOMContentLoaded",function(){window.SCORM&&window.SCORM.complete(100)});</script>
</body>
</html>`;
}

function buildIndexHtml(book: ScormBook, chapters: ScormChapter[], hasCert: boolean): string {
  const list = chapters
    .map(
      (c) =>
        `<li><a href="${chapterFileName(c.chapter_number)}">Chapter ${c.chapter_number}: ${escapeHtml(c.title)}</a></li>`
    )
    .join('');
  const certLink = hasCert
    ? `<li><a href="certificate.html"><strong>🏅 Certificate</strong></a></li>`
    : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>${escapeHtml(book.title)}</title>
<style>${SHARED_STYLES}
  ul{list-style:none;padding:0}
  li{padding:10px 0;border-bottom:1px solid var(--border)}
  a{color:var(--primary);text-decoration:none}
  a:hover{text-decoration:underline}
</style>
<script src="scorm_api.js"></script>
</head>
<body>
<header>
  <div class="crumb">SCORM 1.2 Course</div>
  <h1>${escapeHtml(book.title)}</h1>
  ${book.description ? `<p>${escapeHtml(book.description)}</p>` : ''}
</header>
<ul>${list}${certLink}</ul>
<p style="font-size:12px;color:var(--muted);margin-top:32px">
  Exported from ScrollLibrary · SCORM ${SCORM_VERSION}
</p>
</body>
</html>`;
}

// ---------- Public API ----------

export async function buildScormPackage(opts: ScormExportOptions): Promise<Blob> {
  const zip = new JSZip();
  const sortedChapters = [...opts.chapters].sort((a, b) => a.chapter_number - b.chapter_number);

  zip.file('imsmanifest.xml', buildManifest({ ...opts, chapters: sortedChapters }));
  zip.file('scorm_api.js', buildScormApiJs());
  zip.file('index.html', buildIndexHtml(opts.book, sortedChapters, !!opts.certificate));

  const chaptersFolder = zip.folder('chapters')!;
  sortedChapters.forEach((c, i) => {
    const prev = i > 0 ? sortedChapters[i - 1].chapter_number : undefined;
    const next = i < sortedChapters.length - 1 ? sortedChapters[i + 1].chapter_number : undefined;
    chaptersFolder.file(`chapter-${c.chapter_number}.html`, buildChapterHtml(opts.book, c, prev, next));
  });

  if (opts.certificate) {
    zip.file('certificate.html', buildCertificateHtml(opts.book, opts.certificate, opts));
  }

  zip.file(
    'metadata.json',
    JSON.stringify(
      {
        exporter: 'ScrollLibrary',
        scormVersion: SCORM_VERSION,
        packageVersion: PACKAGE_VERSION,
        exportedAt: new Date().toISOString(),
        book: { id: opts.book.id, title: opts.book.title, totalChapters: sortedChapters.length },
        certificate: opts.certificate
          ? {
              number: opts.certificate.certificate_number,
              issuedAt: opts.certificate.issued_at,
              level: opts.certificate.competency_level,
            }
          : null,
        organization: opts.organizationName ?? null,
      },
      null,
      2
    )
  );

  return await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function suggestedFilename(book: ScormBook): string {
  const slug = (book.title || 'course')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return `scrolllibrary-${slug}-scorm12.zip`;
}
