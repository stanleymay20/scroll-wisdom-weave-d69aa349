import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Search, HelpCircle, Book, Download, Sparkles, Shield, CreditCard } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

import { SEO } from "@/components/SEO";
interface FAQ {
  id: string;
  question: string;
  answer: string;
  category: string;
}

const categoryIcons: Record<string, any> = {
  general: HelpCircle,
  generation: Sparkles,
  export: Download,
  rights: Shield,
  security: Shield,
  billing: CreditCard,
};

export default function Help() {
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchFAQs();
  }, []);

  const fetchFAQs = async () => {
    const { data } = await supabase
      .from("faqs")
      .select("*")
      .eq("is_published", true)
      .order("sort_order");

    if (data) {
      setFaqs(data);
    }
    setIsLoading(false);
  };

  const filteredFAQs = faqs.filter(faq =>
    faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
    faq.answer.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const categories = [...new Set(faqs.map(f => f.category))];

  const helpTopics = [
    {
      icon: Book,
      title: "Getting Started",
      description: "Learn how to generate your first book",
      link: "/generate",
    },
    {
      icon: Sparkles,
      title: "AI Generation",
      description: "Understand our AI writing system",
      link: "/about",
    },
    {
      icon: Download,
      title: "Exporting Books",
      description: "Download in PDF, EPUB, DOCX",
      link: "/library",
    },
    {
      icon: Shield,
      title: "Account & Security",
      description: "Manage your account settings",
      link: "/settings",
    },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <SEO
        title="Help Center | ScrollLibrary"
        description="Answers to common questions about generating books, earning certificates, billing, and institutional features."
        canonical="/help"
      />
      <Navbar />
      
      <main className="flex-1 pt-24 pb-16">
        <div className="container mx-auto px-4 max-w-4xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {/* Header */}
            <div className="text-center mb-12">
              <h1 className="text-4xl font-display font-bold text-gradient-gold mb-4">
                Help Center
              </h1>
              <p className="text-muted-foreground text-lg max-w-2xl mx-auto mb-8">
                Find answers to common questions and learn how to make the most of ScrollLibrary.
              </p>
              
              {/* Search */}
              <div className="relative max-w-md mx-auto">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search for help..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 bg-muted/50 border-border/50 h-12"
                />
              </div>
            </div>

            {/* Quick Links */}
            {!searchQuery && (
              <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4 mb-12">
                {helpTopics.map((topic, index) => (
                  <motion.div
                    key={topic.title}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                  >
                    <Card 
                      className="bg-gradient-card border-border/50 cursor-pointer hover:border-primary/50 transition-colors h-full"
                      onClick={() => navigate(topic.link)}
                    >
                      <CardContent className="p-4 text-center">
                        <topic.icon className="h-8 w-8 mx-auto mb-3 text-primary" />
                        <h3 className="font-medium text-foreground mb-1">{topic.title}</h3>
                        <p className="text-xs text-muted-foreground">{topic.description}</p>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            )}

            {/* FAQs */}
            <Card className="bg-gradient-card border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <HelpCircle className="h-5 w-5 text-primary" />
                  Frequently Asked Questions
                </CardTitle>
                <CardDescription>
                  {searchQuery 
                    ? `${filteredFAQs.length} result${filteredFAQs.length !== 1 ? 's' : ''} found`
                    : "Browse common questions and answers"
                  }
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="text-center py-8 text-muted-foreground">Loading FAQs...</div>
                ) : filteredFAQs.length === 0 ? (
                  <div className="text-center py-8">
                    <HelpCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-muted-foreground mb-4">
                      {searchQuery 
                        ? "No results found. Try a different search term."
                        : "No FAQs available yet."
                      }
                    </p>
                    <Button variant="outline" onClick={() => navigate("/support")}>
                      Contact Support
                    </Button>
                  </div>
                ) : (
                  <Accordion type="single" collapsible className="space-y-2">
                    {filteredFAQs.map((faq, index) => {
                      const Icon = categoryIcons[faq.category] || HelpCircle;
                      return (
                        <AccordionItem 
                          key={faq.id} 
                          value={faq.id}
                          className="border border-border/50 rounded-lg px-4 data-[state=open]:bg-muted/30"
                        >
                          <AccordionTrigger className="text-left hover:no-underline">
                            <div className="flex items-center gap-3">
                              <Icon className="h-4 w-4 text-primary flex-shrink-0" />
                              <span>{faq.question}</span>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="text-muted-foreground pl-7">
                            {faq.answer}
                          </AccordionContent>
                        </AccordionItem>
                      );
                    })}
                  </Accordion>
                )}
              </CardContent>
            </Card>

            {/* Still Need Help */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="mt-8 text-center"
            >
              <Card className="bg-gradient-card border-border/50">
                <CardContent className="py-8">
                  <h3 className="text-xl font-semibold text-foreground mb-2">
                    Still need help?
                  </h3>
                  <p className="text-muted-foreground mb-4">
                    Can't find what you're looking for? Our support team is here to help.
                  </p>
                  <Button onClick={() => navigate("/support")} variant="gold">
                    Contact Support
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>
        </div>
      </main>

      <Footer />
    </div>
  );
}