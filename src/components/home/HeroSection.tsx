import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowRight, BookOpen } from "lucide-react";
import { useNavigate } from "react-router-dom";

export function HeroSection() {
  const navigate = useNavigate();

  return (
    <section className="relative pt-24 pb-20 overflow-hidden">
      {/* Subtle background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent pointer-events-none" />
      
      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-4xl mx-auto text-center">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium mb-6"
          >
            <BookOpen className="h-4 w-4" strokeWidth={1.5} />
            AI-Powered Academic Publishing Platform
          </motion.div>

          {/* Main Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="font-display text-4xl md:text-5xl lg:text-6xl font-bold text-foreground mb-6 leading-tight"
          >
            Generate High-Quality Academic Books with Advanced AI
          </motion.h1>

          {/* Subheadline */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-lg md:text-xl text-muted-foreground mb-4 max-w-3xl mx-auto leading-relaxed"
          >
            From syllabus to citation-ready textbooks — in hours, not months.
          </motion.p>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.25 }}
            className="text-base text-muted-foreground mb-6 max-w-2xl mx-auto"
          >
            ScrollLibrary is an AI-powered academic publishing platform that helps students, educators, and institutions generate structured, citation-compliant books, manuals, and learning materials with precision and integrity.
          </motion.p>

          {/* Differentiator statement */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="text-sm font-medium text-foreground mb-8"
          >
            No hallucinations. No fluff. Built for real academia.
          </motion.p>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.35 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Button 
              onClick={() => navigate('/auth')}
              size="lg" 
              className="gap-2 min-w-[180px]"
            >
              Get Started Free
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button 
              onClick={() => navigate('/explore')}
              variant="outline" 
              size="lg" 
              className="min-w-[180px]"
            >
              View Demo Book
            </Button>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
