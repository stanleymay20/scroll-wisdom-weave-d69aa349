/**
 * CONTRACT 6 — HARD RUNTIME GATE
 * Status: CORE · HARD-ENFORCED
 * 
 * This hook enforces Contract 6 as a HARD RUNTIME GATE:
 * - Content is blocked before display if it violates rules
 * - Generation stops on first violation
 * - User prompts cannot override book type rules
 * - Export/audio is disabled until Contract 6 passes
 */

import { useState, useCallback, useMemo } from 'react';
import { 
  validateContract6, 
  validateForExport, 
  GovernedBookType, 
  Contract6ValidationResult,
  isValidGovernedBookType,
  getBookTypeDisplayName
} from '@/lib/contract6-governance';
import { useToast } from '@/hooks/use-toast';

export interface Contract6GateState {
  isBlocked: boolean;
  violations: string[];
  blockReason: string | null;
  canDisplayContent: boolean;
  canExport: boolean;
  canPlayAudio: boolean;
  bookType: GovernedBookType | null;
}

export interface Contract6GateActions {
  validateContent: (content: string, bookType: string, title?: string) => Contract6GateState;
  validateBeforeDisplay: (content: string, bookType: string, title?: string) => boolean;
  validateBeforeExport: (content: string, bookType: string, title?: string) => boolean;
  validateBeforeAudio: (content: string, bookType: string, title?: string) => boolean;
  resetGate: () => void;
}

const initialState: Contract6GateState = {
  isBlocked: false,
  violations: [],
  blockReason: null,
  canDisplayContent: true,
  canExport: true,
  canPlayAudio: true,
  bookType: null,
};

/**
 * CONTRACT 6 HARD RUNTIME GATE HOOK
 * 
 * RULE 6.2: Content MUST be blocked before display if it violates Contract 6
 * RULE 6.4: Generation STOPS on first violation
 * RULE 6.6: Export/audio DISABLED until Contract 6 passes
 */
export function useContract6Gate(): [Contract6GateState, Contract6GateActions] {
  const [state, setState] = useState<Contract6GateState>(initialState);
  const { toast } = useToast();

  /**
   * HARD VALIDATION: Full Contract 6 check
   * Returns gate state with blocking decisions
   */
  const validateContent = useCallback((
    content: string, 
    bookType: string, 
    title?: string
  ): Contract6GateState => {
    // Validate book type first
    const validatedType: GovernedBookType = isValidGovernedBookType(bookType) 
      ? bookType 
      : 'text';
    
    // Run Contract 6 validation
    const result = validateContract6(content, validatedType, title);
    
    // Check export eligibility
    const exportResult = validateForExport(content, validatedType, title);
    
    const hasCriticalViolations = result.violations.some(v => v.severity === 'critical');
    const violations = result.violations.map(v => v.message);
    
    const newState: Contract6GateState = {
      isBlocked: hasCriticalViolations,
      violations,
      blockReason: hasCriticalViolations 
        ? `CONTRACT 6 VIOLATION: ${result.violations[0].message}`
        : null,
      canDisplayContent: !hasCriticalViolations,
      canExport: exportResult.canExport,
      canPlayAudio: exportResult.canExport, // Audio follows same rules as export
      bookType: validatedType,
    };
    
    setState(newState);
    
    // Show toast for violations (RULE 6.5: Transparency)
    if (hasCriticalViolations) {
      toast({
        title: `Contract 6 Violation: ${getBookTypeDisplayName(validatedType)}`,
        description: result.userMessage || violations[0],
        variant: "destructive",
      });
    }
    
    return newState;
  }, [toast]);

  /**
   * GATE: Validate BEFORE displaying content
   * Returns false if content should be blocked
   */
  const validateBeforeDisplay = useCallback((
    content: string,
    bookType: string,
    title?: string
  ): boolean => {
    const gateState = validateContent(content, bookType, title);
    return gateState.canDisplayContent;
  }, [validateContent]);

  /**
   * GATE: Validate BEFORE export
   * Returns false if export should be blocked
   */
  const validateBeforeExport = useCallback((
    content: string,
    bookType: string,
    title?: string
  ): boolean => {
    const validatedType: GovernedBookType = isValidGovernedBookType(bookType) 
      ? bookType 
      : 'text';
    
    const exportResult = validateForExport(content, validatedType, title);
    
    if (!exportResult.canExport) {
      toast({
        title: "Export Blocked",
        description: exportResult.blockReason || "Content does not meet Contract 6 requirements",
        variant: "destructive",
      });
    }
    
    return exportResult.canExport;
  }, [toast]);

  /**
   * GATE: Validate BEFORE audio playback
   * Returns false if audio should be blocked
   */
  const validateBeforeAudio = useCallback((
    content: string,
    bookType: string,
    title?: string
  ): boolean => {
    // Audio uses same validation as export
    return validateBeforeExport(content, bookType, title);
  }, [validateBeforeExport]);

  /**
   * Reset gate state
   */
  const resetGate = useCallback(() => {
    setState(initialState);
  }, []);

  const actions = useMemo(() => ({
    validateContent,
    validateBeforeDisplay,
    validateBeforeExport,
    validateBeforeAudio,
    resetGate,
  }), [validateContent, validateBeforeDisplay, validateBeforeExport, validateBeforeAudio, resetGate]);

  return [state, actions];
}

/**
 * CONTRACT 6 VIOLATION DISPLAY COMPONENT DATA
 */
export interface Contract6ViolationDisplay {
  title: string;
  message: string;
  severity: 'critical' | 'high' | 'medium';
  suggestedAction: string;
}

export function formatViolationForDisplay(
  violations: string[],
  bookType: GovernedBookType
): Contract6ViolationDisplay | null {
  if (violations.length === 0) return null;
  
  return {
    title: `Contract 6 Violation: ${getBookTypeDisplayName(bookType)}`,
    message: violations[0],
    severity: 'critical',
    suggestedAction: 'Content is being regenerated with proper structure...',
  };
}
