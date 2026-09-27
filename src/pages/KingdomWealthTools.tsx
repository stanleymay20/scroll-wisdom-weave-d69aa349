import JSZip from "jszip";
import { Download, FileSpreadsheet, Users, ClipboardCheck, BookOpen } from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { SEO } from "@/components/SEO";

type Row = Array<string | number>;

const stages = [
  "RECEIVE AND RECOGNISE","WORK AND CULTIVATE","REST WITHOUT ENSLAVEMENT","SURVIVE","STABILISE",
  "INCREASE EARNING POWER","CREATE SURPLUS","PROTECT SURPLUS","ACQUIRE RESPONSIBLE OWNERSHIP","MULTIPLY",
  "COMPOUND AND DEFEND","GIVE AND SERVE","BUILD LEGACY","REACH ENOUGH","REMAIN FAITHFUL",
];

const csvEscape = (value: string | number) => {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (rows: Row[]) => rows.map((row) => row.map(csvEscape).join(",")).join("\n") + "\n";

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

const workbookSheets = (): Record<string, string> => ({
  "01-stage-assessment.csv": csv([
    ["#", "Stage", "Status", "Start here?", "Your evidence / note"],
    ...stages.map((stage, index) => [index + 1, stage, "", "", ""]),
    [],
    ["Rule", "Start at the earliest material stage that is not Stable — whether it is In progress or Not yet."],
    ["Control", "This is a navigation aid, not a spiritual score or a measure of human worth."],
  ]),
  "02-flow-to-stock.csv": csv([
    ["Monthly flow item", "Amount", "Note"],
    ["Net household income", "", ""],["Essential consumption / commitments", "", ""],["Debt principal repaid", "", ""],
    ["Cash retained / saving", "", ""],["Money moved into assets / ownership", "", ""],["Other recurring outflows", "", ""],
    [],["Balance-sheet stock item", "Current value", "What this month changed"],["", "", ""],["", "", ""],["", "", ""],
  ]),
  "03-rights-audit.csv": csv([
    ["Question", "Your record"],["Asset / position", ""],["Legal owner", ""],["Custodian / intermediary", ""],
    ["Cash-flow rights", ""],["Control / voting / use rights", ""],["Claims ahead of me", ""],
    ["Fees / taxes / dilution risks", ""],["Liquidity / exit limits", ""],["What could impair the position", ""],
    ["Responsibility attached to ownership", ""],
  ]),
  "04-binding-constraint.csv": csv([
    ["Field", "Entry"],["Activity", ""],["Current useful output / baseline", ""],["Primary constraint", ""],
    ["30-day change to test", ""],["Expected cost", ""],["Expected output", ""],["Evidence of real demand", ""],
    ["Result after 30 days", ""],["What I learned / next action", ""],
  ]),
  "05-compounding-assumptions.csv": csv([
    ["Input", "Value", "Comment"],["Starting base", "", ""],["Annual contribution", "", ""],
    ["Annual net return assumption", "", ""],["Years", "", ""],["Fees / tax drag included in return?", "", ""],
    ["Loss path / interruption risk", "", ""],
  ]),
  "06-forced-seller-test.csv": csv([
    ["Exposure / obligation", "Amount", "Due / horizon", "Forced-sale trigger", "Mitigation / next action"],
    ["", "", "", "", ""],["", "", "", "", ""],["", "", "", "", ""],["", "", "", "", ""],
  ]),
  "07-price-of-credit.csv": csv([
    ["Product", "Stated rate", "APR / effective", "Fees", "Collateral", "Term", "Repayment / total cost", "Notes"],
    ["", "", "", "", "", "", "", ""],["", "", "", "", "", "", "", ""],["", "", "", "", "", "", "", ""],
  ]),
  "08-opportunity-network.csv": csv([
    ["Type", "Name / channel", "Why relevant", "Next ethical action"],
    ["Information source", "", "", ""],["Information source", "", "", ""],["Bridge / weak tie", "", "", ""],
    ["Bridge / weak tie", "", "", ""],["Institution", "", "", ""],["Credibility signal", "", "", ""],
  ]),
  "09-personal-balance-sheet.csv": csv([
    ["Type", "Item", "Value", "Liquidity class (L/M/I)", "Note", "Rate/currency mismatch flag"],
    ["Asset", "", "", "", "", ""],["Asset", "", "", "", "", ""],["Asset", "", "", "", "", ""],
    ["Liability", "", "", "", "", ""],["Liability", "", "", "", "", ""],["Liability", "", "", "", "", ""],
    [],["Chapter 33 diagnostic", "Your calculation / observation"],
    ["1. Net worth", ""],["2. Liquid resources", ""],["3. Liquidity runway (months)", ""],["4. Debt-to-assets", ""],
    ["5. Largest concentration / common-factor concentration", ""],["6. Rate/currency mismatch", ""],
  ]),
  "10-next-euro.csv": csv([
    ["Option", "Required capital", "Expected benefit", "Certainty", "Time horizon", "Liquidity", "Downside", "Concentration", "Net-of-cost return", "Reversibility"],
    ["Liquidity reserve", "", "", "", "", "", "", "", "", ""],["Debt reduction", "", "", "", "", "", "", "", "", ""],
    ["Skills / education", "", "", "", "", "", "", "", "", ""],["Business reinvestment", "", "", "", "", "", "", "", "", ""],
    ["Long-horizon ownership / investment", "", "", "", "", "", "", "", "", ""],["Generosity / giving", "", "", "", "", "", "", "", "", ""],
    ["Retained optionality", "", "", "", "", "", "", "", "", ""],
  ]),
  "11-protection-register.csv": csv([
    ["Risk / loss", "Prevent", "Absorb", "Transfer", "Continuity step", "Review date"],
    ["", "", "", "", "", ""],["", "", "", "", "", ""],["", "", "", "", "", ""],
  ]),
  "12-legacy-access-map.csv": csv([
    ["Asset / obligation / document", "Where record is kept", "Person who should know", "Authority needed", "Action / review"],
    ["", "", "", "", ""],["", "", "", "", ""],["", "", "", "", ""],
  ]),
  "13-enough-statement.csv": csv([
    ["Prompt", "Your statement"],["The life I define as enough includes:", ""],
    ["The commitments and resilience I want reliably funded are:", ""],["Surplus beyond enough is for:", ""],
    ["The warning sign that 'more' is becoming the master is:", ""],["I will revisit this statement when:", ""],
    ["Date written:", ""],["Signature / initials:", ""],
  ]),
  "14-annual-review.csv": csv([
    ["Review question", "Response"],["What changed in my stage assessment?", ""],["What became more resilient?", ""],
    ["What became more fragile?", ""],["What ownership did I acquire, reduce or clarify?", ""],
    ["What did I learn about earning power?", ""],["What did I give or serve by allocation rather than leftovers?", ""],
    ["What single point of failure remains?", ""],["Does my Enough Statement still fit my responsibilities?", ""],
    ["What is the next faithful action?", ""],
  ]),
});

const groupGuide = `# KINGDOM WEALTH — 12-Week Small-Group Guide

This is a route through the book, not a substitute for it. Do not require anyone to disclose balances, debts, income or giving amounts.

1. RECEIVE / WORK / REST — Preface, Ch.1, Ch.36 conclusion. Practice: list what has been entrusted and what behaves as though it owns you.
2. SURVIVE — Ch.26, Ch.33. Practice: first-pass balance sheet + next 30 days of essential obligations.
3. STABILISE — Ch.33, Ch.35. Practice: liquidity/maturity ladder + one single point of failure.
4. INCREASE EARNING POWER — Ch.28, Ch.31, Ch.32. Practice: identify one binding constraint and design a 30-day test.
5. CREATE SURPLUS — Ch.26, Ch.28, Ch.34. Practice: give the next euro an explicit job.
6. PROTECT SURPLUS — Ch.30, Ch.35. Practice: forced-seller test + one protection response.
7. ACQUIRE RESPONSIBLE OWNERSHIP — Ch.27. Practice: audit one asset for rights, priority, liquidity and responsibility.
8. MULTIPLY — Ch.28, Ch.32. Practice: identify where systems, tools, distribution or networks could increase useful output.
9. COMPOUND AND DEFEND — Ch.29, Ch.30. Practice: write the assumptions behind one compounding claim and what can interrupt it.
10. GIVE AND SERVE — Ch.34. Practice: decide how generosity appears as an allocation rather than an afterthought.
11. BUILD LEGACY — Ch.35. Practice: complete a legacy-and-access map without storing credentials or secret keys.
12. REACH ENOUGH / REMAIN FAITHFUL — Ch.36. Practice: write and date the Enough Statement and set a review trigger.

Group covenant: truth without shame; confidentiality without secrecy; no prosperity promises; no comparison of human worth by income, assets or stage.
Educational and pastoral companion only — not individualized financial, legal, tax, investment, accounting or insurance advice.
`;

const pilotProtocol = `# KINGDOM WEALTH — Two-Week Mini-Pilot

Participants: 5–10 readers who were not involved in producing the manuscript.

Test only:
- Stage Assessment
- Reading Paths
- Ch.26–36 Steward's Practice boxes
- Enough Statement
- Companion-tool access

Day 0:
1. Complete the Stage Assessment.
2. Start at the earliest material stage that is not Stable, whether In progress or Not yet.
3. Choose the matching Reading Path.
4. Confirm this tools page works on phone and desktop.

During the two weeks:
- Use at least three practical tools.
- Include the personal balance sheet, next-euro table and Enough Statement.

End-of-pilot questions:
- Did the assessment send you to the right starting point?
- Which instruction was unclear?
- Which practice did you actually complete?
- Which tool was too difficult, duplicative or intrusive?
- Could you find and download the companion tools without help?
- What should be removed before freeze?

Only evidence-backed corrections should enter the first edition after the pilot.
`;

async function downloadWorkbook() {
  const zip = new JSZip();
  const folder = zip.folder("KINGDOM_WEALTH_STEWARDS_WORKBOOK");
  for (const [name, content] of Object.entries(workbookSheets())) folder?.file(name, content);
  folder?.file("README.txt", "Open the CSV files in Excel, Numbers, LibreOffice or Google Sheets. Start with 01-stage-assessment.csv.\n");
  downloadBlob(await zip.generateAsync({ type: "blob" }), "KINGDOM_WEALTH_STEWARDS_WORKBOOK_CSV_PACK.zip");
}
function downloadGuide() {
  downloadBlob(new Blob([groupGuide], { type: "text/markdown;charset=utf-8" }), "KINGDOM_WEALTH_12_WEEK_GROUP_GUIDE.md");
}
async function downloadPilotPack() {
  const zip = new JSZip();
  const workbook = zip.folder("stewards-workbook");
  for (const [name, content] of Object.entries(workbookSheets())) workbook?.file(name, content);
  zip.file("KINGDOM_WEALTH_12_WEEK_GROUP_GUIDE.md", groupGuide);
  zip.file("KINGDOM_WEALTH_TWO_WEEK_MINI_PILOT.md", pilotProtocol);
  zip.file("README.txt", "KINGDOM WEALTH official companion tools. Educational only; not individualized professional advice.\n");
  downloadBlob(await zip.generateAsync({ type: "blob" }), "KINGDOM_WEALTH_COMPANION_PILOT_PACK.zip");
}

export default function KingdomWealthTools() {
  return (
    <div className="min-h-screen flex flex-col">
      <SEO
        title="Kingdom Wealth Companion Tools | ScrollLibrary"
        description="Official companion tools for Kingdom Wealth: Steward's Workbook, 12-week small-group guide and two-week pilot pack."
        canonical="/kingdom-wealth/tools"
      />
      <Navbar />
      <main className="flex-1 pt-24 pb-16">
        <section className="container mx-auto px-4 max-w-5xl">
          <div className="rounded-2xl border border-border bg-gradient-card p-8 md:p-12">
            <p className="text-sm font-semibold tracking-wide text-primary mb-3">KINGDOM WEALTH</p>
            <h1 className="text-4xl md:text-5xl font-display font-bold text-foreground mb-5">Companion Tools</h1>
            <p className="text-lg text-muted-foreground max-w-3xl">
              Official practice companions for <em>Kingdom Wealth: The Biblical Code Behind Money</em>.
              They use the book's own 15-stage sequence and the practical tools in Chapters 26–36.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 mt-8">
            <article className="rounded-xl border border-border bg-card p-6">
              <FileSpreadsheet className="h-8 w-8 text-primary mb-4" />
              <h2 className="text-xl font-semibold mb-2">Steward's Workbook</h2>
              <p className="text-muted-foreground mb-5">Spreadsheet templates for the assessment, balance sheet, next-euro table, protection, legacy and Enough Statement.</p>
              <button onClick={downloadWorkbook} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-primary-foreground font-medium">
                <Download className="h-4 w-4" /> Download workbook
              </button>
            </article>

            <article className="rounded-xl border border-border bg-card p-6">
              <Users className="h-8 w-8 text-primary mb-4" />
              <h2 className="text-xl font-semibold mb-2">12-Week Group Guide</h2>
              <p className="text-muted-foreground mb-5">A small-group route through the book with privacy boundaries, weekly practices and commitments.</p>
              <button onClick={downloadGuide} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-primary-foreground font-medium">
                <Download className="h-4 w-4" /> Download guide
              </button>
            </article>

            <article className="rounded-xl border border-border bg-card p-6">
              <ClipboardCheck className="h-8 w-8 text-primary mb-4" />
              <h2 className="text-xl font-semibold mb-2">Two-Week Pilot Pack</h2>
              <p className="text-muted-foreground mb-5">The workbook templates, group guide and mini-pilot protocol in one ZIP.</p>
              <button onClick={downloadPilotPack} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-primary-foreground font-medium">
                <Download className="h-4 w-4" /> Download pilot pack
              </button>
            </article>
          </div>

          <div className="mt-10 rounded-xl border border-border bg-muted/30 p-6">
            <div className="flex items-start gap-3">
              <BookOpen className="h-6 w-6 text-primary mt-1" />
              <div>
                <h2 className="text-xl font-semibold mb-2">Start with the book's own rule</h2>
                <p className="text-muted-foreground">
                  Start at the earliest material stage that is not <strong>Stable</strong> — whether it is marked
                  <strong> In progress</strong> or <strong>Not yet</strong>. The assessment is navigation, not a spiritual score
                  and not a measure of human worth.
                </p>
              </div>
            </div>
          </div>

          <p className="mt-8 text-sm text-muted-foreground">
            Do not store passwords, PINs, recovery phrases or private keys in these tools. The companions are educational and do not provide individualized financial, investment, legal, tax, accounting, insurance or pastoral advice.
          </p>
        </section>
      </main>
      <Footer />
    </div>
  );
}
