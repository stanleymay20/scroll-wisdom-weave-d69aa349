import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { HelpCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface FAQ {
  id: string;
  question: string;
  answer: string;
}

export function FAQSection() {
  const [faqs, setFaqs] = useState<FAQ[]>([]);

  useEffect(() => {
    supabase
      .from("faqs")
      .select("id, question, answer")
      .eq("is_published", true)
      .order("sort_order")
      .limit(6)
      .then(({ data }) => {
        if (data) setFaqs(data);
      });
  }, []);

  if (faqs.length === 0) return null;

  return (
    <section className="py-16 bg-background">
      <div className="container mx-auto px-4 max-w-3xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-10"
        >
          <h2 className="text-3xl md:text-4xl font-display font-bold text-foreground mb-3">
            Frequently Asked Questions
          </h2>
          <p className="text-muted-foreground">
            Quick answers to common questions about ScrollLibrary
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <Accordion type="single" collapsible className="space-y-2">
            {faqs.map((faq) => (
              <AccordionItem
                key={faq.id}
                value={faq.id}
                className="border border-border/50 rounded-lg px-4 data-[state=open]:bg-muted/30"
              >
                <AccordionTrigger className="text-left hover:no-underline">
                  <div className="flex items-center gap-3">
                    <HelpCircle className="h-4 w-4 text-primary flex-shrink-0" />
                    <span className="font-medium">{faq.question}</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pl-7">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </motion.div>

        <div className="text-center mt-8">
          <Link
            to="/help"
            className="text-sm text-primary hover:underline"
          >
            View all FAQs →
          </Link>
        </div>
      </div>
    </section>
  );
}
