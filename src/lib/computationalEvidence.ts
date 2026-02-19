// ===========================================
// SCROLLVERIFIED™ — Computational Evidence Engine
// Claim → Code → Visualization Pipeline
// ===========================================

// ===========================================
// QUANTITATIVE CLAIM TRIGGER DETECTION
// ===========================================

const CODE_TRIGGERS = [
  'regression', 'simulation', 'monte carlo', 'forecast',
  'panel data', 'statistical', 'optimization', 'statistically significant',
  'machine learning', 'neural network', 'model estimation',
  'time series', 'hypothesis test', 'confidence interval',
  'p-value', 'r-squared', 'chi-square', 'anova', 'bayesian',
  'clustering', 'classification', 'gradient descent',
  'eigenvalue', 'matrix', 'linear algebra', 'differential equation',
  'probability distribution', 'random variable', 'expected value',
  'variance', 'standard deviation', 'correlation coefficient',
];

const STEM_CATEGORIES = [
  'technology', 'science', 'data_science', 'data science',
  'finance', 'economics', 'mathematics', 'statistics',
  'engineering', 'physics', 'computer_science', 'computer science',
  'machine_learning', 'machine learning', 'artificial_intelligence',
];

export function requiresExecutableEvidence(text: string, category?: string): boolean {
  const lower = text.toLowerCase();
  const hasTrigger = CODE_TRIGGERS.some(t => lower.includes(t));
  const isStemCategory = category
    ? STEM_CATEGORIES.some(c => category.toLowerCase().includes(c))
    : false;
  return hasTrigger || isStemCategory;
}

export function detectQuantitativeClaims(text: string): QuantitativeClaim[] {
  const claims: QuantitativeClaim[] = [];
  const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.length > 20);
  let id = 0;

  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();
    const matchedTriggers = CODE_TRIGGERS.filter(t => lower.includes(t));
    if (matchedTriggers.length > 0) {
      claims.push({
        id: `qc_${id++}`,
        text: sentence.trim(),
        triggers: matchedTriggers,
        evidenceType: classifyEvidenceType(matchedTriggers),
        reproducible: true,
      });
    }
  }
  return claims;
}

// ===========================================
// TYPES
// ===========================================

export interface QuantitativeClaim {
  id: string;
  text: string;
  triggers: string[];
  evidenceType: 'regression' | 'simulation' | 'visualization' | 'statistical_test' | 'optimization' | 'general';
  reproducible: boolean;
}

export type EvidenceStatus = 'reproducible' | 'demonstrative' | 'non-executable';

export interface ComputationalEvidenceBlock {
  claimId: string;
  claimText: string;
  language: string;
  libraries: string[];
  code: string;
  expectedOutput?: string;
  visualizationType?: 'scatter' | 'line' | 'bar' | 'histogram' | 'heatmap' | 'distribution' | 'none';
  seed?: number;
  status: EvidenceStatus;
  dataSource: 'synthetic' | 'cited_dataset' | 'demonstrative';
  dataSourceDisclaimer: string;
  codeHash?: string;
  executionTimestamp?: string;
  auditLink?: {
    claimId: string;
    evidenceType: string;
    codeHash: string;
    executionTimestamp: string;
  };
}

export interface ComputationalEvidenceReport {
  totalQuantitativeClaims: number;
  evidenceBlocksGenerated: number;
  reproducibleBlocks: number;
  demonstrativeBlocks: number;
  nonExecutableBlocks: number;
  averageSeed: number;
  librariesUsed: string[];
  visualizationCount: number;
  complianceStatus: 'full' | 'partial' | 'none';
}

// ===========================================
// VISUALIZATION STANDARDS ENFORCEMENT
// ===========================================

const REQUIRED_VIZ_PATTERNS = [
  'plt.xlabel', 'plt.ylabel', // Axis labels required
];

const FORBIDDEN_VIZ_PATTERNS = [
  'plt.xscale.*log.*#.*exaggerat', // Exaggerated scaling
];

export function validateVisualizationCode(code: string): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  // Check for axis labels
  if (code.includes('plt.') || code.includes('matplotlib')) {
    if (!code.includes('plt.xlabel') && !code.includes('ax.set_xlabel')) {
      issues.push('Missing x-axis label (plt.xlabel required)');
    }
    if (!code.includes('plt.ylabel') && !code.includes('ax.set_ylabel')) {
      issues.push('Missing y-axis label (plt.ylabel required)');
    }
    if (!code.includes('plt.title') && !code.includes('ax.set_title')) {
      issues.push('Missing chart title (plt.title required)');
    }
  }

  // Check for random seed
  if ((code.includes('np.random') || code.includes('random.')) && !code.includes('seed')) {
    issues.push('Missing random seed for reproducibility (np.random.seed required)');
  }

  return { valid: issues.length === 0, issues };
}

// ===========================================
// EVIDENCE TYPE CLASSIFICATION
// ===========================================

function classifyEvidenceType(triggers: string[]): QuantitativeClaim['evidenceType'] {
  const triggerSet = new Set(triggers.map(t => t.toLowerCase()));

  if (triggerSet.has('regression') || triggerSet.has('model estimation') || triggerSet.has('panel data')) {
    return 'regression';
  }
  if (triggerSet.has('simulation') || triggerSet.has('monte carlo')) {
    return 'simulation';
  }
  if (triggerSet.has('optimization') || triggerSet.has('gradient descent')) {
    return 'optimization';
  }
  if (triggerSet.has('hypothesis test') || triggerSet.has('p-value') || triggerSet.has('anova') || triggerSet.has('chi-square')) {
    return 'statistical_test';
  }
  return 'general';
}

// ===========================================
// CODE TEMPLATE GENERATION
// ===========================================

export function generateEvidenceTemplate(claim: QuantitativeClaim): string {
  switch (claim.evidenceType) {
    case 'regression':
      return `# ScrollVerified™ Executable Evidence
# Claim: ${claim.text.slice(0, 80)}...
# Status: Reproducible | Seed: 42

import numpy as np
import pandas as pd
import statsmodels.api as sm
import matplotlib.pyplot as plt

np.random.seed(42)

# Synthetic dataset (for demonstration purposes)
n = 200
X = np.random.normal(0, 1, n)
Y = 2.5 * X + np.random.normal(0, 0.8, n)

df = pd.DataFrame({'X': X, 'Y': Y})
X_const = sm.add_constant(df['X'])
model = sm.OLS(df['Y'], X_const).fit()

print(model.summary())

# Visualization
plt.figure(figsize=(8, 5))
plt.scatter(X, Y, alpha=0.5, label='Observations (n=${200})')
plt.plot(np.sort(X), model.predict(sm.add_constant(np.sort(X))), color='red', label='OLS Fit')
plt.xlabel('Independent Variable (X)')
plt.ylabel('Dependent Variable (Y)')
plt.title('Linear Regression — OLS Estimation')
plt.legend()
plt.tight_layout()
plt.show()`;

    case 'simulation':
      return `# ScrollVerified™ Executable Evidence
# Claim: ${claim.text.slice(0, 80)}...
# Status: Reproducible | Seed: 42

import numpy as np
import matplotlib.pyplot as plt

np.random.seed(42)

# Monte Carlo Simulation
n_simulations = 10000
results = np.random.normal(loc=0.08, scale=0.15, size=n_simulations)

mean_result = np.mean(results)
std_result = np.std(results)
percentile_5 = np.percentile(results, 5)
percentile_95 = np.percentile(results, 95)

print(f"Mean: {mean_result:.4f}")
print(f"Std Dev: {std_result:.4f}")
print(f"5th Percentile: {percentile_5:.4f}")
print(f"95th Percentile: {percentile_95:.4f}")

# Visualization
plt.figure(figsize=(8, 5))
plt.hist(results, bins=50, alpha=0.7, edgecolor='black')
plt.axvline(mean_result, color='red', linestyle='--', label=f'Mean = {mean_result:.4f}')
plt.axvline(percentile_5, color='orange', linestyle=':', label=f'5th pctile = {percentile_5:.4f}')
plt.xlabel('Simulated Returns')
plt.ylabel('Frequency')
plt.title(f'Monte Carlo Simulation (n={n_simulations})')
plt.legend()
plt.tight_layout()
plt.show()`;

    case 'statistical_test':
      return `# ScrollVerified™ Executable Evidence
# Claim: ${claim.text.slice(0, 80)}...
# Status: Reproducible | Seed: 42

import numpy as np
from scipy import stats

np.random.seed(42)

# Generate two sample groups
group_a = np.random.normal(loc=50, scale=10, size=100)
group_b = np.random.normal(loc=55, scale=10, size=100)

# Two-sample t-test
t_stat, p_value = stats.ttest_ind(group_a, group_b)

print(f"Group A: mean={np.mean(group_a):.2f}, std={np.std(group_a):.2f}")
print(f"Group B: mean={np.mean(group_b):.2f}, std={np.std(group_b):.2f}")
print(f"t-statistic: {t_stat:.4f}")
print(f"p-value: {p_value:.6f}")
print(f"Significant at α=0.05: {p_value < 0.05}")`;

    default:
      return `# ScrollVerified™ Executable Evidence
# Claim: ${claim.text.slice(0, 80)}...
# Status: Demonstrative

import numpy as np
import matplotlib.pyplot as plt

np.random.seed(42)

# Computational demonstration
# [Insert domain-specific code here]

print("Computational evidence generated successfully")`;
  }
}

// ===========================================
// EVIDENCE STATUS BADGE HELPERS
// ===========================================

export function getEvidenceStatusColor(status: EvidenceStatus): string {
  switch (status) {
    case 'reproducible':
      return 'text-green-600 dark:text-green-400 bg-green-500/10 border-green-500/30';
    case 'demonstrative':
      return 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/30';
    case 'non-executable':
      return 'text-destructive bg-destructive/10 border-destructive/30';
  }
}

export function getEvidenceStatusLabel(status: EvidenceStatus): string {
  switch (status) {
    case 'reproducible': return '🟢 Reproducible';
    case 'demonstrative': return '🟡 Demonstrative';
    case 'non-executable': return '🔴 Non-executable';
  }
}

// ===========================================
// PARSE [EVIDENCE_BLOCK] FROM GENERATED CONTENT
// ===========================================

export interface ParsedEvidenceBlock {
  claimId: string;
  code: string;
  language: string;
  output: string;
  status: EvidenceStatus;
  dataDisclaimer: string;
  seed: number;
  libraries: string[];
}

export function parseEvidenceBlocks(content: string): { blocks: ParsedEvidenceBlock[]; cleanedText: string } {
  const blocks: ParsedEvidenceBlock[] = [];
  let cleanedText = content;
  const blockRegex = /\[EVIDENCE_BLOCK\]([\s\S]*?)\[\/EVIDENCE_BLOCK\]/g;
  let match;
  let idx = 0;

  while ((match = blockRegex.exec(content)) !== null) {
    const inner = match[1];

    const extractField = (field: string): string => {
      const rx = new RegExp(`^${field}:\\s*["']?(.+?)["']?\\s*$`, 'mi');
      const m = inner.match(rx);
      return m?.[1]?.trim() || '';
    };

    const codeMatch = inner.match(/code:\s*\n```\w*\n([\s\S]*?)```/);
    const code = codeMatch?.[1]?.trim() || '';

    const outputMatch = inner.match(/output:\s*\n([\s\S]*?)(?=^(?:status|data_disclaimer|seed|libraries):|$)/mi);
    const output = outputMatch?.[1]?.trim() || '';

    const status = (extractField('status') || 'demonstrative') as EvidenceStatus;

    blocks.push({
      claimId: extractField('claim_id') || `evidence_${idx}`,
      code,
      language: extractField('language') || 'python',
      output,
      status,
      dataDisclaimer: extractField('data_disclaimer') || 'Simulated dataset for demonstration purposes.',
      seed: parseInt(extractField('seed') || '42'),
      libraries: (extractField('libraries') || 'numpy,matplotlib').split(',').map(l => l.trim()),
    });

    cleanedText = cleanedText.replace(match[0], `<!--EVIDENCE_BLOCK_${idx}-->`);
    idx++;
  }

  return { blocks, cleanedText };
}

// ===========================================
// BUILD REPORT FROM PARSED BLOCKS
// ===========================================

export function buildEvidenceReport(blocks: ParsedEvidenceBlock[]): ComputationalEvidenceReport {
  const reproducible = blocks.filter(b => b.status === 'reproducible').length;
  const demonstrative = blocks.filter(b => b.status === 'demonstrative').length;
  const nonExecutable = blocks.filter(b => b.status === 'non-executable').length;
  const allLibs = [...new Set(blocks.flatMap(b => b.libraries))];

  return {
    totalQuantitativeClaims: blocks.length,
    evidenceBlocksGenerated: blocks.length,
    reproducibleBlocks: reproducible,
    demonstrativeBlocks: demonstrative,
    nonExecutableBlocks: nonExecutable,
    averageSeed: blocks.length > 0 ? Math.round(blocks.reduce((s, b) => s + b.seed, 0) / blocks.length) : 0,
    librariesUsed: allLibs,
    visualizationCount: blocks.filter(b => b.code.includes('plt.')).length,
    complianceStatus: reproducible === blocks.length ? 'full' : reproducible > 0 ? 'partial' : 'none',
  };
}
