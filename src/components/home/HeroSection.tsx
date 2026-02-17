import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Upload, BookOpen, CheckCircle, ChevronDown, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import heroLibraryBg from "@/assets/hero-library-bg.png";

export function HeroSection() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/explore?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <section className="relative pt-24 pb-16 overflow-hidden min-h-[600px]">
      {/* Background library illustration */}
      <div className="absolute inset-0 z-0">
        <img
          src={heroLibraryBg}
          alt=""
          className="w-full h-full object-cover opacity-30"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/60 to-background" />
      </div>

      <div className="container mx-auto px-4 relative z-10">
        <div className="grid lg:grid-cols-2 gap-10 items-start max-w-6xl mx-auto">
          {/* Left: Headline, Search & CTAs */}
          <div className="pt-4">
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="font-display text-4xl md:text-5xl lg:text-[3.25rem] font-bold text-foreground mb-5 leading-tight"
            >
              Your Personal Academic
              <br />
              Library.{" "}
              <span className="text-primary">Powered by AI.</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="text-base text-muted-foreground mb-5 leading-relaxed max-w-lg"
            >
              Upload textbooks or generate structured study guides.
              <br />
              Read. Learn. Test mastery. Track competency.
            </motion.p>

            {/* Search Bar — inspired by UE Future Library */}
            <motion.form
              onSubmit={handleSearch}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.15 }}
              className="relative mb-6 max-w-lg"
            >
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search your library or explore topics..."
                className="w-full h-12 pl-12 pr-28 rounded-xl border border-border bg-card/90 backdrop-blur-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
              />
              <Button
                type="submit"
                size="sm"
                className="absolute right-2 top-1/2 -translate-y-1/2"
              >
                Search
              </Button>
            </motion.form>

            {/* Dual CTAs */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="flex flex-col sm:flex-row items-start gap-3 mb-7"
            >
              <Button
                onClick={() => navigate("/upload")}
                size="lg"
                className="gap-2 min-w-[170px]"
              >
                <Upload className="h-4 w-4" />
                Upload a Book
              </Button>
              <Button
                onClick={() => navigate("/generate")}
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
              <span>
                Over <strong className="text-foreground">500,000</strong>{" "}
                chapters mastered
              </span>
            </motion.div>
          </div>

          {/* Right: Step Cards */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="space-y-3 hidden lg:block"
          >
            {/* Step 1 */}
            <div className="bg-card/90 backdrop-blur-sm border border-border rounded-xl p-5 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Upload className="h-4 w-4 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground">Upload or Generate</h3>
              </div>
              <div className="bg-muted/50 rounded-lg p-3 flex items-center gap-3">
                <BookOpen className="h-5 w-5 text-primary flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">AI Fundamentals.pdf</p>
                  <p className="text-xs text-muted-foreground">Drag your book or choose to upload</p>
                </div>
                <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              </div>
            </div>

            {/* Step 2 */}
            <div className="bg-card/90 backdrop-blur-sm border border-border rounded-xl p-5 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-primary font-bold text-sm">2</span>
                <h3 className="font-semibold text-foreground">Structured Reading</h3>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="h-6 px-3 bg-primary rounded text-[10px] font-medium text-primary-foreground flex items-center">
                    Learning progress
                  </div>
                  <div className="flex-1 h-1.5 bg-primary/20 rounded-full">
                    <div className="h-full w-2/3 bg-primary rounded-full" />
                  </div>
                </div>
                <div className="h-1.5 bg-primary/20 rounded-full">
                  <div className="h-full w-3/4 bg-primary rounded-full" />
                </div>
              </div>
            </div>

            {/* Step 3 */}
            <div className="bg-card/90 backdrop-blur-sm border border-border rounded-xl p-5 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-primary font-bold text-sm">3</span>
                <h3 className="font-semibold text-foreground">Adaptive Quiz</h3>
              </div>
              <div className="space-y-1.5 text-sm text-muted-foreground mb-3">
                <p className="flex items-center gap-2"><span className="text-primary">○</span> Choose one of the following...</p>
                <p className="flex items-center gap-2"><span className="text-primary">□</span> While working on a research test...</p>
                <p className="flex items-center gap-2"><span className="text-primary">□</span> Describe the process of...</p>
                <p className="flex items-center gap-2"><span className="text-primary">◆</span> The salients of foundation and practice...</p>
              </div>
              <Button onClick={() => navigate("/generate")} size="sm" className="gap-1">
                Generate Study Guide
              </Button>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
