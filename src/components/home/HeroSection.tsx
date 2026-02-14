import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowRight, BookOpen, Upload } from "lucide-react";
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
            AI Competency Verification Engine
          </motion.div>

          {/* Main Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="font-display text-4xl md:text-5xl lg:text-6xl font-bold text-foreground mb-6 leading-tight"
          >
            Upload. Learn. <span className="text-primary">Prove Mastery.</span>
          </motion.h1>

          {/* Subheadline */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-lg md:text-xl text-muted-foreground mb-4 max-w-3xl mx-auto leading-relaxed"
          >
            Turn any document into a structured learning pathway with competency verification and verifiable certificates.
          </motion.p>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.25 }}
            className="text-base text-muted-foreground mb-6 max-w-2xl mx-auto"
          >
            Not a chatbot. Not a summary tool. A competency engine that proves you actually learned it.
          </motion.p>

          {/* How it works */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="flex items-center justify-center gap-3 text-sm font-medium text-foreground mb-8 flex-wrap"
          >
            <span className="px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20">1. Upload or Generate</span>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            <span className="px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20">2. Structured Reading</span>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            <span className="px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20">3. Competency Quiz</span>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            <span className="px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20">4. Verified Certificate</span>
          </motion.div>

          {/* Dual CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.35 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Button 
              onClick={() => navigate('/upload')}
              size="lg" 
              className="gap-2 min-w-[200px]"
            >
              <Upload className="h-4 w-4" />
              Upload a Document
            </Button>
            <Button 
              onClick={() => navigate('/generate')}
              variant="outline" 
              size="lg" 
              className="gap-2 min-w-[200px]"
            >
              Generate a Study Guide
              <ArrowRight className="h-4 w-4" />
            </Button>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
