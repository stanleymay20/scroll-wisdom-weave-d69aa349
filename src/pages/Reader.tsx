import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { 
  ChevronLeft, 
  ChevronRight, 
  BookOpen, 
  Settings, 
  Bookmark,
  X,
  Home
} from "lucide-react";

// Sample chapter content
const SAMPLE_CONTENT = `
The nature of prophetic communication has fascinated scholars, theologians, and seekers of wisdom throughout the ages. It represents one of humanity's most profound mysteries—the intersection of the divine with the human, the eternal with the temporal. In this opening chapter, we embark on a comprehensive exploration of what it means to receive and transmit messages that transcend ordinary human understanding.

## The Foundation of Prophetic Experience

At its core, prophetic communication involves a unique form of consciousness—one that bridges the gap between realms of existence that normally remain separate. The prophet serves as a conduit, a vessel through which wisdom from higher dimensions can flow into the material world. This is not merely a passive reception but an active participation in the cosmic dialogue between heaven and earth.

The scroll traditions of ancient cultures speak extensively of this phenomenon. In the Hebrew texts, we find the concept of "nevi'im"—those who speak forth divine messages. In the African traditions, particularly among the Yoruba and other West African peoples, the Ifa corpus contains thousands of verses of prophetic wisdom passed down through generations. The Chinese I Ching represents another systematic approach to receiving guidance from beyond ordinary consciousness.

What unites these diverse traditions is the recognition that human beings possess the capacity to access information and wisdom that transcends their individual experience. This capacity is not limited to a special few but represents a latent potential within all of humanity—though its full development requires discipline, purity of intention, and often years of dedicated practice.

## The Mechanics of Divine Communication

Understanding how prophetic messages are received requires us to examine the various mechanisms through which the divine communicates with humanity. These mechanisms can be broadly categorized into several distinct modalities:

First, there is the auditory mode—the literal hearing of a voice, whether internal or seemingly external. Many of the great prophets describe this experience in vivid terms. Samuel heard his name called in the night. Muhammad received revelations through the angel Jibril. The pattern repeats across cultures and centuries: a voice speaks, and the prophet listens.

Second, we find the visual mode—visions, dreams, and symbolic imagery that convey meaning beyond words. Ezekiel's chariot, John's Revelation, the complex symbolism of apocalyptic literature—all represent attempts to translate ineffable experiences into comprehensible form. These visions often require interpretation, as their symbolic nature points beyond literal meaning to deeper truths.

Third, there is the intuitive mode—a direct knowing that bypasses ordinary cognitive processes. This is perhaps the subtlest form of prophetic communication, as it leaves no obvious traces. The prophet simply knows, with a certainty that defies rational explanation. This form of communication is often described as the "still, small voice" that speaks not in thunder or earthquake but in the quiet depths of the soul.

## The Preparation of the Prophet

No genuine prophetic calling comes without preparation. The soul that would serve as a channel for divine communication must undergo purification and transformation. This process, known in various traditions as initiation, consecration, or sanctification, prepares the vessel to receive and transmit messages of cosmic significance.

The preparation often involves periods of isolation, fasting, and intense spiritual practice. Moses spent forty days on Mount Sinai. Jesus endured forty days in the wilderness. The prophet Muhammad regularly retreated to the cave of Hira for meditation. These periods of separation from ordinary life serve to quiet the noise of mundane concerns and open the consciousness to higher frequencies of awareness.

Beyond these intensive periods, the prophetic life typically requires ongoing disciplines of prayer, meditation, study, and ethical living. The prophet must maintain a state of receptivity, keeping the channels of communication clear and unobstructed. This is not a passive waiting but an active cultivation of the conditions necessary for divine-human dialogue.

## The Responsibility of the Prophetic Office

To receive prophetic communication is to assume tremendous responsibility. The prophet stands at the intersection of two worlds, tasked with translating messages from one realm to another. This position carries both privilege and burden—the privilege of access to divine wisdom and the burden of faithful transmission.

The temptation to distort or soften difficult messages is ever-present. Prophets throughout history have struggled with the weight of declaring truths that their audiences did not want to hear. Jeremiah wept over the destruction he was compelled to prophesy. Jonah literally ran away from his commission. The prophetic office demands a courage that transcends personal comfort and social acceptance.

Yet the faithful prophet perseveres, knowing that the message does not originate with them and therefore cannot be modified by them. They are stewards, not owners, of the words entrusted to their care. This understanding produces both humility and boldness—humility because the prophet recognizes they are merely a channel, and boldness because the message carries divine authority.

## The Community's Response to Prophecy

Prophetic communication does not occur in a vacuum but within the context of community. The relationship between prophet and community is complex and often fraught with tension. True prophets typically challenge the status quo, calling communities to higher standards of justice, righteousness, and spiritual faithfulness.

Communities may respond to prophetic messages with acceptance, rejection, or something in between. The history of prophecy is filled with examples of prophets who were ignored, persecuted, or killed for their messages. Only later, sometimes centuries later, did communities recognize the truth and value of what had been spoken.

This pattern reveals something important about the nature of prophetic communication: it is not primarily concerned with immediate acceptance but with eternal truth. The prophet speaks what must be spoken, trusting that the divine purposes will ultimately be fulfilled regardless of initial reception.

## Discerning True Prophecy

Given the significance of prophetic communication, the question of discernment becomes crucial. How can communities distinguish genuine prophecy from false claims? What criteria should be applied to evaluate prophetic messages?

The ancient traditions provide several guidelines. First, the character of the prophet matters. Does the messenger live in accordance with the principles they proclaim? A lifestyle of integrity lends credibility to prophetic claims. Second, the content of the message must align with established truth. Genuine prophecy will not contradict the core ethical and spiritual principles that have been validated across time and culture.

Third, the fruits of prophecy provide important evidence. Does the message produce life or death, building up or tearing down? While prophetic words may initially cause discomfort, their ultimate effect should be redemptive and transformative. Fourth, the manner of delivery carries significance. True prophets typically speak with humility, recognizing that they are vessels rather than sources of the message.

## The Ongoing Nature of Prophetic Communication

A crucial point must be emphasized: prophetic communication did not cease with the ancient prophets. While certain traditions teach that prophecy has ended, a broader view recognizes that the divine-human dialogue continues across all ages. The forms may change, but the fundamental reality of transcendent communication with humanity persists.

This ongoing nature of prophecy has implications for contemporary life. It suggests that wisdom from beyond ordinary consciousness remains available to those who seek it with sincerity and preparation. It implies that communities today can still receive guidance for their challenges through those who have cultivated the capacity to hear and transmit divine messages.

The responsibility to discern and respond to prophetic voices therefore remains as relevant today as it was in ancient times. Perhaps more so, given the cacophony of competing claims in the modern world. The principles of discernment outlined above provide a starting framework, but each generation must develop its own capacity to recognize truth when it speaks.

## Conclusion

As we conclude this opening exploration, we recognize that we have only begun to scratch the surface of prophetic communication's vast depths. The chapters that follow will delve more deeply into specific aspects of this phenomenon—its historical manifestations, its various forms, its challenges and possibilities.

What we have established here is a foundation: the recognition that prophetic communication represents a genuine and significant dimension of human experience. It connects us to realities beyond our ordinary perception, offering guidance, correction, and hope. The study of prophecy is therefore not merely an academic exercise but a practical engagement with one of the most important aspects of spiritual life.

May this exploration serve not only to inform but to transform—opening readers to deeper awareness of the prophetic dimension that surrounds and interpenetrates our world. For in the end, the goal is not merely to understand prophecy but to participate in the ongoing dialogue between heaven and earth.
`;

export default function Reader() {
  const { bookId, chapterId } = useParams();
  const navigate = useNavigate();
  const [fontSize, setFontSize] = useState(18);
  const [showSettings, setShowSettings] = useState(false);
  
  const currentChapter = parseInt(chapterId || "1");
  const totalChapters = 12; // In real app, get from book data

  return (
    <div className="min-h-screen bg-scroll-indigo-deep">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/90 backdrop-blur-xl border-b border-border/50">
        <div className="container mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => navigate(`/book/${bookId}`)}
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-sm font-medium line-clamp-1">
                The Prophetic Voice
              </h1>
              <p className="text-xs text-muted-foreground">
                Chapter {currentChapter} of {totalChapters}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon">
              <Bookmark className="h-5 w-5" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => setShowSettings(!showSettings)}
            >
              <Settings className="h-5 w-5" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => navigate("/")}
            >
              <Home className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Settings Panel */}
      {showSettings && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed top-14 right-4 z-50 bg-card rounded-lg border border-border shadow-lg p-4 w-64"
        >
          <div className="flex items-center justify-between mb-4">
            <span className="font-medium">Reading Settings</span>
            <Button variant="ghost" size="icon" onClick={() => setShowSettings(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-muted-foreground mb-2 block">
                Font Size: {fontSize}px
              </label>
              <input
                type="range"
                min="14"
                max="24"
                value={fontSize}
                onChange={(e) => setFontSize(parseInt(e.target.value))}
                className="w-full"
              />
            </div>
          </div>
        </motion.div>
      )}

      {/* Content */}
      <main className="pt-24 pb-24">
        <article className="container mx-auto px-4 max-w-3xl">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="font-display text-3xl md:text-4xl font-bold mb-2 text-gradient-gold">
              Chapter {currentChapter}
            </h2>
            <h3 className="font-display text-xl md:text-2xl text-foreground/80 mb-8">
              The Nature of Prophetic Communication
            </h3>
            
            <div 
              className="reading-content text-foreground/90"
              style={{ fontSize: `${fontSize}px` }}
            >
              {SAMPLE_CONTENT.split('\n\n').map((paragraph, index) => {
                if (paragraph.startsWith('## ')) {
                  return (
                    <h4 key={index} className="text-2xl font-display font-bold text-scroll-gold mt-12 mb-6">
                      {paragraph.replace('## ', '')}
                    </h4>
                  );
                }
                return (
                  <p key={index} className="mb-6 leading-relaxed">
                    {paragraph}
                  </p>
                );
              })}
            </div>
          </motion.div>
        </article>
      </main>

      {/* Navigation Footer */}
      <footer className="fixed bottom-0 left-0 right-0 bg-background/90 backdrop-blur-xl border-t border-border/50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => navigate(`/read/${bookId}/${currentChapter - 1}`)}
            disabled={currentChapter <= 1}
            className="gap-2"
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>
          
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-scroll-gold" />
            <span className="text-sm text-muted-foreground">
              {currentChapter} / {totalChapters}
            </span>
          </div>

          <Button
            variant="ghost"
            onClick={() => navigate(`/read/${bookId}/${currentChapter + 1}`)}
            disabled={currentChapter >= totalChapters}
            className="gap-2"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </footer>
    </div>
  );
}
