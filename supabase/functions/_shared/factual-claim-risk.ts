/**
 * Universal high-risk factual claim detector.
 *
 * These signals identify claims that are too consequential to be treated as
 * ordinary prose. They must be prioritized by the evidence verifier so a
 * single acquisition, valuation, legal threshold, dated requirement, or
 * quantitative assertion cannot hide inside an otherwise polished chapter.
 */

const TRANSACTION_RE =
  /\b(?:acquir(?:e|es|ed|ing)|acquisition|merg(?:e|es|ed|er)|rais(?:e|es|ed|ing)|funding round|valu(?:e|es|ed|ation)|sold to|bought by|partner(?:ed|ship)|announc(?:e|es|ed)|launch(?:e|es|ed)|found(?:ed|er))\b/i;

const REGULATORY_RE =
  /(?:§\s*\d+|\b(?:law|act|regulation|directive|statute|ordinance|gdpr|ai act|data act|nis2|cyber resilience act|blue card|minimum wage|share capital|legal requirement|mandatory|required by law|prohibited|fine|penalty|threshold)\b)/i;

const QUANTIFIED_RE =
  /(?:[$€£]\s?\d|\b\d+(?:[.,]\d+)?\s*%|\b20\d{2}\b|\b\d+(?:[.,]\d+)?\s*(?:million|billion|trillion|thousand|employees?|vacancies|users?|customers?|days?|months?|years?)\b)/i;

export function isHighRiskFactualSentence(sentence: string): boolean {
  const text = sentence.trim();
  if (!text) return false;
  return TRANSACTION_RE.test(text) || REGULATORY_RE.test(text) || QUANTIFIED_RE.test(text);
}
