import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export function FinalCTA() {
  return (
    <section className="py-24 bg-primary/5">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center max-w-3xl mx-auto"
        >
          <h2 className="text-3xl md:text-4xl font-display font-bold text-foreground mb-4">
            Built for the Future of Learning
          </h2>
          <p className="text-muted-foreground mb-4 leading-relaxed">
            ScrollLibrary is not just a writing tool. It's an academic infrastructure layer for AI-assisted education.
          </p>
          <p className="text-muted-foreground mb-8 leading-relaxed">
            Whether you are building your first textbook or deploying AI across an institution, ScrollLibrary gives you control, structure, and credibility.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button asChild size="lg" className="gap-2">
              <Link to="/auth">
                Get Started Free
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link to="/generate">
                Generate a Demo Book
              </Link>
            </Button>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
