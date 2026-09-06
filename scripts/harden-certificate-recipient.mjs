import { readFile, writeFile } from "node:fs/promises";

const path = "supabase/functions/validate-certificate/index.ts";
let source = await readFile(path, "utf8");

function replaceOnce(needle, replacement, label) {
  const i = source.indexOf(needle);
  if (i < 0) throw new Error(`${label}: pattern not found`);
  if (source.indexOf(needle, i + needle.length) >= 0) throw new Error(`${label}: pattern not unique`);
  source = source.slice(0, i) + replacement + source.slice(i + needle.length);
}

replaceOnce(
`interface CertificateRequest {
  bookId: string;
  userId: string;
  userName: string;
  userEmail?: string;
  requestedType?: 'completion' | 'mastery';
}
`,
`interface CertificateRequest {
  bookId: string;
  requestedType?: 'completion' | 'mastery';
}
`,
"request authority",
);

replaceOnce(
`function generateCertificateNumber(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return \`SL-CERT-\${timestamp}-\${random}\`;
}

function generateVerificationHash(data: {
  bookId: string;
  certificateNumber: string;
  issuedAt: string;
  certificateType: string;
}): string {
  // Simple hash for demo - in production use crypto
  const str = \`\${data.bookId}|\${data.certificateNumber}|\${data.issuedAt}|\${data.certificateType}\`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).toUpperCase().padStart(8, '0');
}
`,
`function randomHex(bytes: number): string {
  const buffer = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(buffer, (value) => value.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function generateCertificateNumber(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  return \`SL-CERT-\${timestamp}-\${randomHex(8)}\`;
}

function generateVerificationHash(): string {
  // High-entropy verification token. Legacy 8-character hashes remain readable,
  // but every newly issued certificate receives a 256-bit token.
  return randomHex(32);
}
`,
"cryptographic certificate identifiers",
);

replaceOnce(
`    const body: CertificateRequest = await req.json();
    const { bookId, userName, userEmail, requestedType } = body;

    if (!bookId || !userName) {
`,
`    const body: CertificateRequest = await req.json();
    const { bookId, requestedType } = body;

    if (!bookId) {
`,
"remove client recipient fields",
);

replaceOnce(
`    console.log(\`[validate-certificate] Processing for user \${user.id}, book \${bookId}\`);

    // ============================================================
    // SERVER-SIDE PROGRESS RECALCULATION
`,
`    const { data: recipientProfile } = await supabase
      .from('profiles')
      .select('full_name')
      .or(\`user_id.eq.\${user.id},id.eq.\${user.id}\`)
      .maybeSingle();
    const recipientName = recipientProfile?.full_name?.trim()
      || user.email?.split('@')[0]
      || 'ScrollLibrary learner';
    const recipientEmail = user.email ?? null;

    console.log(\`[validate-certificate] Processing for user \${user.id}, book \${bookId}\`);

    // ============================================================
    // SERVER-SIDE PROGRESS RECALCULATION
`,
"derive recipient from authenticated account",
);

source = source.replaceAll('name: userName,\n              email: userEmail,', 'name: recipientName,\n              email: recipientEmail,');
source = source.replaceAll('recipientName: userName,', 'recipientName,');
source = source.replaceAll('recipientEmail: userEmail,', 'recipientEmail,');
source = source.replaceAll('recipient: { name: userName, email: userEmail },', 'recipient: { name: recipientName, email: recipientEmail },');
source = source.replaceAll('name: userName,\n            email: userEmail,', 'name: recipientName,\n            email: recipientEmail,');

replaceOnce(
`    const verificationHash = generateVerificationHash({
      bookId,
      certificateNumber,
      issuedAt,
      certificateType: eligibility.certificateType!,
    });
`,
`    const verificationHash = generateVerificationHash();
`,
"verification token generation",
);

if (/\buserName\b|\buserEmail\b/.test(source)) throw new Error('client recipient identity reference remains');
if (source.includes('Math.random')) throw new Error('Math.random remains in certificate issuance');
await writeFile(path, source);
console.log('Certificate recipient and token authority hardened.');
