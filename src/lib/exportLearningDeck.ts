/**
 * VLD-1.0: PowerPoint Export Utility
 * 
 * Generates .pptx files with embedded visuals and speaker notes
 * matching NotebookLM quality standards.
 */

import PptxGenJS from 'pptxgenjs';
import { LearningDeck, SlideData } from './learningDeckContract';

// Slide layout configurations
const SLIDE_LAYOUTS = {
  'title-visual': { bgColor: '1a1a2e', titleColor: 'e6c068' },
  'learning-objectives': { bgColor: '0d1b2a', titleColor: '4cc9f0' },
  'concept-text': { bgColor: '16213e', titleColor: 'ffffff' },
  'concept-visual': { bgColor: '0a2647', titleColor: '7ec8e3' },
  'diagram-focus': { bgColor: '1a1423', titleColor: 'c77dff' },
  'comparison': { bgColor: '2d2a32', titleColor: 'f4a261' },
  'example-walkthrough': { bgColor: '1e1e2e', titleColor: '89b4fa' },
  'summary-proof': { bgColor: '1f1f2e', titleColor: 'e6c068' },
};

/**
 * Export a learning deck to PowerPoint format
 */
export async function exportToPowerPoint(
  deck: LearningDeck,
  bookTitle: string
): Promise<Blob> {
  const pptx = new PptxGenJS();

  // Set presentation metadata
  pptx.author = 'ScrollLibrary';
  pptx.title = deck.title || `${bookTitle} - Learning Deck`;
  pptx.subject = 'Verified Learning Deck';
  pptx.company = 'ScrollLibrary';

  // Set default slide size (16:9)
  pptx.defineLayout({ name: 'LAYOUT_16x9', width: 10, height: 5.625 });
  pptx.layout = 'LAYOUT_16x9';

  // Generate slides
  for (const slideData of deck.slides) {
    await addSlide(pptx, slideData, deck);
  }

  // Generate blob
  const data = await pptx.write({ outputType: 'blob' });
  return data as Blob;
}

/**
 * Add a slide to the presentation
 */
async function addSlide(
  pptx: PptxGenJS,
  slideData: SlideData,
  deck: LearningDeck
): Promise<void> {
  const layout = SLIDE_LAYOUTS[slideData.layout as keyof typeof SLIDE_LAYOUTS] 
    || SLIDE_LAYOUTS['concept-text'];
  
  const slide = pptx.addSlide();
  slide.bkgd = layout.bgColor;

  // Check for visual
  const visualUrl = slideData.visual?.url || (slideData.visual as any)?.imageUrl;
  const hasVisual = !!visualUrl;

  // Add title
  slide.addText(slideData.heading, {
    x: 0.5,
    y: 0.3,
    w: hasVisual ? 5 : 9,
    h: 0.8,
    fontSize: 28,
    bold: true,
    color: layout.titleColor,
    fontFace: 'Arial',
  });

  // Content area
  const contentX = hasVisual ? 0.5 : 0.5;
  const contentW = hasVisual ? 5 : 9;
  const contentY = 1.3;

  if (slideData.layout === 'comparison' && slideData.content.length >= 2) {
    // Two-column comparison layout
    const midIndex = Math.ceil(slideData.content.length / 2);
    const leftItems = slideData.content.slice(0, midIndex);
    const rightItems = slideData.content.slice(midIndex);

    // Left column
    addBulletList(slide, leftItems, 0.5, contentY, 4.2);
    // Right column
    addBulletList(slide, rightItems, 5.2, contentY, 4.2);
  } else {
    // Standard bullet list
    addBulletList(slide, slideData.content, contentX, contentY, contentW);
  }

  // Add visual if present
  if (hasVisual && visualUrl) {
    try {
      // For external URLs, use path directly
      slide.addImage({
        path: visualUrl,
        x: 5.8,
        y: 1.0,
        w: 3.8,
        h: 3.0,
        sizing: { type: 'contain', w: 3.8, h: 3.0 },
      });

      // Add visual caption
      if (slideData.visual?.description) {
        slide.addText(
          slideData.visual.description.length > 60 
            ? slideData.visual.description.slice(0, 60) + '...'
            : slideData.visual.description,
          {
            x: 5.8,
            y: 4.1,
            w: 3.8,
            h: 0.3,
            fontSize: 9,
            color: '888888',
            fontFace: 'Arial',
            align: 'center',
          }
        );
      }
    } catch (err) {
      console.warn('[PPTX] Could not add image:', err);
    }
  }

  // Add source reference footer
  if (slideData.sourceReference) {
    slide.addText(`📖 ${slideData.sourceReference}`, {
      x: 0.5,
      y: 5.1,
      w: 6,
      h: 0.3,
      fontSize: 9,
      color: '666666',
      fontFace: 'Arial',
    });
  }

  // Add slide number
  slide.addText(`${deck.slides.indexOf(slideData) + 1} / ${deck.slides.length}`, {
    x: 9,
    y: 5.1,
    w: 0.8,
    h: 0.3,
    fontSize: 9,
    color: '666666',
    fontFace: 'Arial',
    align: 'right',
  });

  // Add speaker notes
  if (slideData.speakerNotes) {
    slide.addNotes(slideData.speakerNotes);
  }
}

/**
 * Add a bullet list to a slide
 */
function addBulletList(
  slide: PptxGenJS.Slide,
  items: string[],
  x: number,
  y: number,
  w: number
): void {
  const bulletItems = items.map(item => ({
    text: item,
    options: {
      bullet: { type: 'bullet' as const, code: '2022' },
      fontSize: 16,
      color: 'ffffff',
      fontFace: 'Arial',
      paraSpaceBefore: 0.1,
      paraSpaceAfter: 0.1,
    },
  }));

  slide.addText(bulletItems, {
    x,
    y,
    w,
    h: 3.5,
    valign: 'top',
  });
}

/**
 * Download a blob as a file
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
