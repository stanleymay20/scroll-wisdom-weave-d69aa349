/**
 * CONTRACT 6B — ASSESSMENT INTEGRITY HOOK
 * Provides real-time tracking and validation for quizzes
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  AssessmentResponse,
  AssessmentQuestion,
  AIDetectionResult,
  AntiCheatConfig,
  DEFAULT_ANTI_CHEAT_CONFIG,
  detectAIAssistance,
  validateAgainstAntiCheat,
  createTypingTracker,
  TypingPattern,
} from '@/lib/assessmentIntegrity';

interface UseAssessmentIntegrityOptions {
  questionId: string;
  config?: AntiCheatConfig;
  onViolation?: (violations: string[]) => void;
}

interface AssessmentIntegrityState {
  startTime: Date | null;
  focusLostCount: number;
  pasteDetected: boolean;
  typingPattern: TypingPattern | null;
  isActive: boolean;
}

export function useAssessmentIntegrity({
  questionId,
  config = DEFAULT_ANTI_CHEAT_CONFIG,
  onViolation,
}: UseAssessmentIntegrityOptions) {
  const [state, setState] = useState<AssessmentIntegrityState>({
    startTime: null,
    focusLostCount: 0,
    pasteDetected: false,
    typingPattern: null,
    isActive: false,
  });

  const typingTrackerRef = useRef(createTypingTracker());

  // Start tracking
  const startTracking = useCallback(() => {
    typingTrackerRef.current.reset();
    setState({
      startTime: new Date(),
      focusLostCount: 0,
      pasteDetected: false,
      typingPattern: null,
      isActive: true,
    });
  }, []);

  // Stop tracking and get results
  const stopTracking = useCallback((): Omit<AssessmentResponse, 'questionId' | 'answer'> => {
    const typingPattern = typingTrackerRef.current.getPattern();
    
    setState(prev => ({
      ...prev,
      typingPattern,
      isActive: false,
    }));

    return {
      startTime: state.startTime || new Date(),
      endTime: new Date(),
      typingPattern,
      pasteDetected: state.pasteDetected,
      focusLostCount: state.focusLostCount,
    };
  }, [state.startTime, state.pasteDetected, state.focusLostCount]);

  // Handle keyboard events
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!state.isActive || !config.enableTypingAnalysis) return;

    typingTrackerRef.current.recordKeystroke(Date.now());

    if (e.key === 'Backspace' || e.key === 'Delete') {
      typingTrackerRef.current.recordDelete();
    }
  }, [state.isActive, config.enableTypingAnalysis]);

  // Handle paste events
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    if (!state.isActive || !config.enablePasteDetection) return;

    typingTrackerRef.current.recordPaste();
    setState(prev => ({ ...prev, pasteDetected: true }));

    if (config.maxAllowedPastes === 0) {
      onViolation?.(['Pasting is not allowed during this assessment']);
    }
  }, [state.isActive, config.enablePasteDetection, config.maxAllowedPastes, onViolation]);

  // Track focus loss
  useEffect(() => {
    if (!state.isActive || !config.enableFocusTracking) return;

    const handleBlur = () => {
      setState(prev => {
        const newCount = prev.focusLostCount + 1;
        if (newCount > config.maxAllowedFocusLoss) {
          onViolation?.([`Focus lost ${newCount} times (max: ${config.maxAllowedFocusLoss})`]);
        }
        return { ...prev, focusLostCount: newCount };
      });
    };

    window.addEventListener('blur', handleBlur);
    return () => window.removeEventListener('blur', handleBlur);
  }, [state.isActive, config.enableFocusTracking, config.maxAllowedFocusLoss, onViolation]);

  // Validate response
  const validateResponse = useCallback((
    answer: string | number,
    question: AssessmentQuestion
  ): { response: AssessmentResponse; aiDetection: AIDetectionResult; antiCheat: { valid: boolean; violations: string[] } } => {
    const trackingData = stopTracking();
    
    const response: AssessmentResponse = {
      questionId,
      answer,
      ...trackingData,
    };

    const aiDetection = detectAIAssistance(response, question);
    const antiCheat = validateAgainstAntiCheat(response, config);

    if (!antiCheat.valid) {
      onViolation?.(antiCheat.violations);
    }

    return { response, aiDetection, antiCheat };
  }, [questionId, config, onViolation, stopTracking]);

  return {
    state,
    startTracking,
    stopTracking,
    handleKeyDown,
    handlePaste,
    validateResponse,
    isTracking: state.isActive,
    focusLostCount: state.focusLostCount,
    pasteDetected: state.pasteDetected,
  };
}

/**
 * Simple hook for basic quiz validation without full tracking
 */
export function useSimpleQuizValidation() {
  const [responses, setResponses] = useState<Map<string, AssessmentResponse>>(new Map());
  const [aiResults, setAIResults] = useState<Map<string, AIDetectionResult>>(new Map());

  const addResponse = useCallback((response: AssessmentResponse, question: AssessmentQuestion) => {
    setResponses(prev => new Map(prev).set(response.questionId, response));
    
    const aiResult = detectAIAssistance(response, question);
    setAIResults(prev => new Map(prev).set(response.questionId, aiResult));

    return aiResult;
  }, []);

  const getOverallIntegrity = useCallback((): number => {
    if (aiResults.size === 0) return 1;
    
    let totalConfidence = 0;
    aiResults.forEach(result => {
      totalConfidence += result.confidence;
    });
    
    return 1 - (totalConfidence / aiResults.size);
  }, [aiResults]);

  const getFlaggedQuestions = useCallback((): string[] => {
    const flagged: string[] = [];
    aiResults.forEach((result, questionId) => {
      if (result.recommendation !== 'accept') {
        flagged.push(questionId);
      }
    });
    return flagged;
  }, [aiResults]);

  return {
    responses: Array.from(responses.values()),
    aiResults: Array.from(aiResults.values()),
    addResponse,
    getOverallIntegrity,
    getFlaggedQuestions,
    totalResponses: responses.size,
  };
}
