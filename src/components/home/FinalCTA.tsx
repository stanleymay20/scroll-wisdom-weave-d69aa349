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
            Start mastering what you read
          </h2>
          <p className="text-muted-foreground mb-8 leading-relaxed">
            ScrollLibrary is an AI-powered academic library engine. It transforms books into structured mastery pathways — helping serious learners prove what they know.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button asChild size="lg" className="gap-2">
              <Link to="/upload">
                Upload a Book
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link to="/generate">
                Generate a Study Guide
              </Link>
            </Button>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
