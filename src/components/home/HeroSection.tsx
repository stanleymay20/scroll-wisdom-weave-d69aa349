import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Upload, BookOpen, CheckCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";

export function HeroSection() {
  const navigate = useNavigate();

  return (
    <section className="relative pt-28 pb-20 overflow-hidden">
      {/* Subtle academic background */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-primary/3 to-transparent pointer-events-none" />
      
      <div className="container mx-auto px-4 relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 items-center max-w-6xl mx-auto">
          {/* Left: Headline & CTAs */}
          <div>
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="font-display text-4xl md:text-5xl lg:text-[3.25rem] font-bold text-foreground mb-6 leading-tight"
            >
              Your Personal Academic Library.{" "}
              <span className="text-primary">Powered by AI.</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="text-lg text-muted-foreground mb-8 leading-relaxed max-w-xl"
            >
              Upload textbooks or generate structured study guides.
              <br />
              Read. Learn. Test mastery. Track competency.
            </motion.p>

            {/* Dual CTAs */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="flex flex-col sm:flex-row items-start gap-3 mb-8"
            >
              <Button 
                onClick={() => navigate('/upload')}
                size="lg" 
                className="gap-2 min-w-[180px]"
              >
                <Upload className="h-4 w-4" />
                Upload a Book
              </Button>
              <Button 
                onClick={() => navigate('/generate')}
                variant="outline" 
                size="lg" 
                className="gap-2 min-w-[200px]"
              >
                Generate Study Guide
              </Button>
            </motion.div>

            {/* Social proof */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="flex items-center gap-2 text-sm text-muted-foreground"
            >
              <CheckCircle className="h-4 w-4 text-primary" />
              <span>Over <strong className="text-foreground">500,000</strong> chapters mastered</span>
            </motion.div>
          </div>

          {/* Right: Step Cards */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="space-y-4 hidden lg:block"
          >
            {/* Step 1 */}
            <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Upload className="h-4 w-4 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground">Upload or Generate</h3>
              </div>
              <div className="bg-muted/50 rounded-lg p-3 flex items-center gap-3">
                <BookOpen className="h-5 w-5 text-primary" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">AI Fundamentals.pdf</p>
                  <p className="text-xs text-muted-foreground">Drag your book or choose to upload</p>
                </div>
              </div>
            </div>

            {/* Step 2 */}
            <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-primary font-bold text-sm">2</span>
                <h3 className="font-semibold text-foreground">Structured Reading</h3>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-24 bg-primary rounded-full" />
                  <span className="text-xs text-muted-foreground">Learning progress</span>
                </div>
                <div className="flex gap-2">
                  <div className="h-1.5 flex-1 bg-primary/30 rounded-full">
                    <div className="h-full w-3/4 bg-primary rounded-full" />
                  </div>
                </div>
              </div>
            </div>

            {/* Step 3 */}
            <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-primary font-bold text-sm">3</span>
                <h3 className="font-semibold text-foreground">Adaptive Quiz</h3>
              </div>
              <div className="space-y-1.5 text-sm text-muted-foreground">
                <p className="flex items-center gap-2"><span className="text-primary">○</span> Choose one of the following...</p>
                <p className="flex items-center gap-2"><span className="text-primary">□</span> While working on a research test...</p>
                <p className="flex items-center gap-2"><span className="text-primary">□</span> Describe the process of...</p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
