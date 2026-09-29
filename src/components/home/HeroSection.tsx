import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowRight, BookOpen, CheckCircle2, PenLine, Rocket, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import heroCinematicBook from "@/assets/hero-cinematic-book.png";

const FEATURES = [
  { icon: PenLine, title: "Create", desc: "Turn an idea into a structured, full-length book." },
  { icon: CheckCircle2, title: "Learn", desc: "Read, assess understanding, and keep your work in one place." },
  { icon: BookOpen, title: "Refine", desc: "Build a strong manuscript before advanced publishing workflows open." },
  { icon: Rocket, title: "Publishing path", desc: "Advanced publishing tools unlock only after their GA validation gates pass." },
];

interface HeroSectionProps {
  onStartDemo: () => void;
}

export function HeroSection({ onStartDemo: _onStartDemo }: HeroSectionProps) {
  const navigate = useNavigate();

  return (
    <section className="relative pt-20 pb-20 overflow-hidden min-h-[700px]">
      <div className="absolute inset-0 z-0">
        <img src={heroCinematicBook} alt="" className="w-full h-full object-cover" loading="eager" />
        <div className="absolute inset-0 bg-gradient-to-b from-background/95 via-background/80 to-background" />
        <div className="absolute inset-0 bg-gradient-to-r from-background/90 via-transparent to-background/90" />
      </div>

      <div className="container mx-auto px-4 relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 items-center pt-8">
          <div className="max-w-xl">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-sm text-primary mb-6"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              AI-native publishing platform
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="font-display text-4xl md:text-5xl lg:text-6xl font-bold text-foreground mb-5 leading-[1.1]"
            >
              From idea to{" "}
              <span className="text-primary">publishable book.</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="text-base md:text-lg text-muted-foreground mb-8 leading-relaxed"
            >
              Create, refine, verify, and prepare books for publication in one intelligent workspace.
              ScrollLibrary handles the complexity behind the scenes so you can stay focused on the work.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.15 }}
              className="flex flex-col sm:flex-row items-start gap-3 mb-10"
            >
              <Button onClick={() => navigate("/generate")} size="lg" className="gap-2 min-w-[190px]">
                Create a Book
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Button onClick={() => navigate("/explore")} variant="outline" size="lg" className="gap-2">
                Explore Books
                <BookOpen className="h-4 w-4" />
              </Button>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground"
            >
              <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Structured book generation</span>
              <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Reading and mastery tools</span>
              <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Fail-closed GA feature gates</span>
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="hidden lg:grid grid-cols-2 gap-3"
          >
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.3 + i * 0.1 }}
                className="bg-card/90 backdrop-blur-md border border-border rounded-xl p-5 hover:border-primary/40 hover:shadow-lg transition-all duration-300"
              >
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
                  <f.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground text-sm mb-1">{f.title}</h3>
                <p className="text-xs text-muted-foreground">{f.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.25 }}
          className="grid grid-cols-2 gap-3 mt-10 lg:hidden"
        >
          {FEATURES.map((f) => (
            <div key={f.title} className="bg-card/90 backdrop-blur-sm border border-border rounded-xl p-4 text-center">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center mx-auto mb-2">
                <f.icon className="h-4 w-4 text-primary" />
              </div>
              <h3 className="font-semibold text-foreground text-xs mb-0.5">{f.title}</h3>
              <p className="text-[10px] text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
