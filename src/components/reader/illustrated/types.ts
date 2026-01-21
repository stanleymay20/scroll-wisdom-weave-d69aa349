/**
 * ILLUSTRATED READER TYPES
 * 
 * Types for the illustrated content reader experience
 */

import type { IllustrationType, VisualSubType, IllustrationMeta, IllustrationInteraction } from '@/lib/illustratedContentContract';

export interface IllustratedImageProps {
  illustration: IllustrationMeta;
  bookType: 'text' | 'illustrated' | 'comic' | 'workbook' | 'children';
  onExpand?: () => void;
  onExplain?: () => void;
  className?: string;
}

export interface ImageExpanderProps {
  illustration: IllustrationMeta;
  isOpen: boolean;
  onClose: () => void;
  onExplain?: () => void;
  onStepThrough?: () => void;
}

export interface ChartExplainerProps {
  illustration: IllustrationMeta;
  isOpen: boolean;
  onClose: () => void;
  chapterContent?: string;
}

export interface ImageCaptionProps {
  caption: string;
  learningObjective?: string;
  type: IllustrationType;
  subType: VisualSubType;
  showObjective?: boolean;
}

export interface IllustratedContentProps {
  content: string;
  illustrations: IllustrationMeta[];
  bookType: 'text' | 'illustrated' | 'comic' | 'workbook' | 'children';
  chapterId: string;
  onImageInteraction?: (illustration: IllustrationMeta, interaction: IllustrationInteraction['type']) => void;
}

export interface StepThroughViewProps {
  illustration: IllustrationMeta;
  steps: StepData[];
  currentStep: number;
  onStepChange: (step: number) => void;
  onClose: () => void;
}

export interface StepData {
  index: number;
  title: string;
  description: string;
  highlightArea?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

// Utility type for extracting illustrations from chapter content
export interface ExtractedIllustration {
  id: string;
  type: IllustrationType;
  subType: VisualSubType;
  caption: string;
  altText: string;
  url: string;
  position: number; // Position in content (character index)
  learningObjective?: string;
}

// Context for illustration interactions
export interface IllustrationContext {
  chapterId: string;
  chapterTitle: string;
  bookType: 'text' | 'illustrated' | 'comic' | 'workbook' | 'children';
  category: string;
  isAcademic: boolean;
}
