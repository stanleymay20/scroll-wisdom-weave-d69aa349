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
            AI-Powered Study Guide Generator
          </motion.div>

          {/* Main Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="font-display text-4xl md:text-5xl lg:text-6xl font-bold text-foreground mb-6 leading-tight"
          >
            Generate AI-Powered Study Guides.{" "}
            <span className="text-primary">Prove You Learned It.</span>
          </motion.h1>

          {/* Subheadline */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-lg md:text-xl text-muted-foreground mb-4 max-w-3xl mx-auto leading-relaxed"
          >
            Turn any topic into a structured study guide with quizzes and competency certificates — in minutes.
          </motion.p>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.25 }}
            className="text-base text-muted-foreground mb-6 max-w-2xl mx-auto"
          >
            Perfect for university students preparing for exams, professionals upskilling, and self-learners who want proof of mastery.
          </motion.p>

          {/* How it works in one line */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="flex items-center justify-center gap-3 text-sm font-medium text-foreground mb-8 flex-wrap"
          >
            <span className="px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20">1. Generate Book</span>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            <span className="px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20">2. Read & Learn</span>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            <span className="px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20">3. Take Quiz</span>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            <span className="px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20">4. Earn Certificate</span>
          </motion.div>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.35 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Button 
              onClick={() => navigate('/generate')}
              size="lg" 
              className="gap-2 min-w-[180px]"
            >
              Generate Your First Book Free
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button 
              onClick={() => navigate('/explore')}
              variant="outline" 
              size="lg" 
              className="min-w-[180px]"
            >
              See Example Books
            </Button>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
