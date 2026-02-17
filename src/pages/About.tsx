import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { 
  Book, Brain, Sparkles, Users, Globe, Award,
  Target, Lightbulb, Shield, GraduationCap, AlertTriangle,
  FileText, Mail, Check, X
} from "lucide-react";

export default function About() {
  const features = [
    {
      icon: Brain,
      title: "AI-Powered Content Generation",
      description: "Our system uses advanced AI models to create structured, well-organized study guides and learning materials tailored to your topic and level."
    },
    {
      icon: Book,
      title: "Comprehensive Subject Coverage",
      description: "Generate or upload books across technology, science, business, finance, health, psychology, and many other academic and professional fields."
    },
    {
      icon: Sparkles,
      title: "Structured Learning Pathways",
      description: "Every book follows a structured curriculum: chapters build progressively, quizzes test understanding, and certificates track mastery."
    },
    {
      icon: Shield,
      title: "Quality & Transparency",
      description: "All AI-generated content is clearly labeled. We enforce quality checks to minimize repetition and ensure coherent, well-structured output."
    },
  ];

  const stats = [
    { value: "5,000+", label: "Words per chapter (avg)" },
    { value: "Up to 30", label: "Chapters per book" },
    { value: "10+", label: "Categories" },
    { value: "Free", label: "To get started" },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      
      <main className="flex-1 pt-24 pb-16">
        {/* Hero Section */}
        <section className="relative py-20 overflow-hidden">
          <div className="absolute inset-0 bg-hero-pattern opacity-30" />
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-scroll-gold/10 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-scroll-bronze/10 rounded-full blur-3xl" />
          
          <div className="container mx-auto px-4 relative z-10">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center max-w-4xl mx-auto"
            >
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/30 text-primary text-sm font-medium mb-6">
                <GraduationCap className="h-4 w-4" />
                AI-Powered Digital Publishing Platform
              </span>
              <h1 className="text-5xl md:text-6xl font-display font-bold text-gradient-gold mb-6">
                About ScrollLibrary™
              </h1>
              <p className="text-xl text-muted-foreground mb-8">
                The AI-Powered Digital Publishing & Learning Platform — Where structured AI meets academic rigor
              </p>
            </motion.div>
          </div>
        </section>

        {/* Platform Clarification - Authority Signal */}
        <section className="py-16 bg-muted/20">
          <div className="container mx-auto px-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="max-w-4xl mx-auto"
            >
              <div className="text-center mb-10">
                <h2 className="text-3xl font-display font-bold text-foreground mb-4">
                  Platform Classification
                </h2>
                <p className="text-muted-foreground">
                  Understanding exactly what ScrollLibrary is and what it is not
                </p>
              </div>

              <div className="grid md:grid-cols-2 gap-8">
                {/* What ScrollLibrary IS */}
                <div className="bg-gradient-card rounded-xl border border-border/50 p-6">
                  <h3 className="text-xl font-semibold text-foreground mb-4 flex items-center gap-2">
                    <span className="bg-primary/20 p-1.5 rounded-full">
                      <Check className="h-4 w-4 text-primary" />
                    </span>
                    What ScrollLibrary IS
                  </h3>
                  <ul className="space-y-3">
                    <li className="flex items-start gap-3">
                      <Book className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                      <span className="text-muted-foreground">An AI-powered digital publishing platform for generating, reading, and interacting with books</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <GraduationCap className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                      <span className="text-muted-foreground">A structured learning system for academic texts, professional manuals, and workbooks</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <Lightbulb className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                      <span className="text-muted-foreground">An educational technology platform with citations, references, and guided learning</span>
                    </li>
                  </ul>
                </div>

                {/* What ScrollLibrary IS NOT */}
                <div className="bg-gradient-card rounded-xl border border-border/50 p-6">
                  <h3 className="text-xl font-semibold text-foreground mb-4 flex items-center gap-2">
                    <span className="bg-destructive/20 p-1.5 rounded-full">
                      <X className="h-4 w-4 text-destructive" />
                    </span>
                    What ScrollLibrary IS NOT
                  </h3>
                  <ul className="space-y-3">
                    <li className="flex items-start gap-3">
                      <X className="h-5 w-5 text-muted-foreground/50 mt-0.5 flex-shrink-0" />
                      <span className="text-muted-foreground">Not a scrolling animation library or CSS utility</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <X className="h-5 w-5 text-muted-foreground/50 mt-0.5 flex-shrink-0" />
                      <span className="text-muted-foreground">Not a frontend developer tool or JavaScript framework</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <X className="h-5 w-5 text-muted-foreground/50 mt-0.5 flex-shrink-0" />
                      <span className="text-muted-foreground">Not a UI animation or scroll-effect plugin</span>
                    </li>
                  </ul>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Mission Section */}
        <section className="py-16">
          <div className="container mx-auto px-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="max-w-4xl mx-auto"
            >
              <div className="bg-gradient-card rounded-2xl border border-border/50 p-8 md:p-12">
                <div className="flex items-center gap-4 mb-6">
                  <div className="bg-gradient-gold p-3 rounded-xl">
                    <Target className="h-8 w-8 text-primary-foreground" />
                  </div>
                  <h2 className="text-3xl font-display font-bold text-foreground">Our Mission</h2>
                </div>
                <p className="text-lg text-muted-foreground leading-relaxed mb-6">
                  ScrollLibrary™ is designed to be more than a digital library—it's a comprehensive AI-powered 
                  digital publishing and learning platform that provides structured, rigorous content generation 
                  with academic standards.
                </p>
                <p className="text-lg text-muted-foreground leading-relaxed">
                  We believe in democratizing access to deep, transformative knowledge. Through our multi-agent 
                  AI system, we generate books that don't just inform—they transform, equipping readers with 
                  structured learning experiences that span academic texts, professional manuals, workbooks, 
                  and guided learning content.
                </p>
              </div>
            </motion.div>
          </div>
        </section>

        {/* AI Transparency Section - Critical for Credibility */}
        <section className="py-16 bg-muted/20">
          <div className="container mx-auto px-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="max-w-4xl mx-auto"
            >
              <div className="bg-gradient-card rounded-2xl border border-border/50 p-8 md:p-12">
                <div className="flex items-center gap-4 mb-6">
                  <div className="bg-primary/20 p-3 rounded-xl">
                    <AlertTriangle className="h-8 w-8 text-primary" />
                  </div>
                  <h2 className="text-3xl font-display font-bold text-foreground">AI Transparency & Authorship</h2>
                </div>
                
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground mb-2">AI-Assisted Content Generation</h3>
                    <p className="text-muted-foreground leading-relaxed">
                      All books generated through ScrollLibrary are created using AI language models. While our 
                      system ensures structured, high-quality output, users should understand that 
                      this is AI-generated material and should be reviewed accordingly.
                    </p>
                  </div>
                  
                  <div>
                    <h3 className="text-lg font-semibold text-foreground mb-2">Reference Generation</h3>
                    <p className="text-muted-foreground leading-relaxed">
                      When Academic Mode is enabled, our system generates citations and references based on 
                      training data and research patterns. While we strive for accuracy, users should verify 
                      critical references independently, especially for academic submissions or professional use.
                    </p>
                  </div>
                  
                  <div>
                    <h3 className="text-lg font-semibold text-foreground mb-2">Quality Commitment</h3>
                    <p className="text-muted-foreground leading-relaxed">
                      We employ type-aware pipelines (Academic, Professional, Workbook, Bestseller, Comic) with 
                      strict quality controls. Each pipeline enforces different standards—academic content follows 
                      scholarly conventions, while creative content follows narrative best practices.
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Stats Section */}
        <section className="py-16">
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              {stats.map((stat, index) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  className="text-center"
                >
                  <p className="text-4xl md:text-5xl font-display font-bold text-gradient-gold mb-2">
                    {stat.value}
                  </p>
                  <p className="text-muted-foreground">{stat.label}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section className="py-16 bg-muted/20">
          <div className="container mx-auto px-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-12"
            >
              <h2 className="text-3xl font-display font-bold text-foreground mb-4">
                What Makes Us Different
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                ScrollLibrary combines cutting-edge AI technology with structured learning methodologies 
                to deliver an unparalleled educational publishing experience.
              </p>
            </motion.div>

            <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
              {features.map((feature, index) => (
                <motion.div
                  key={feature.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  className="bg-gradient-card rounded-xl border border-border/50 p-6"
                >
                  <div className="flex items-start gap-4">
                    <div className="bg-primary/10 p-3 rounded-lg">
                      <feature.icon className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-foreground mb-2">{feature.title}</h3>
                      <p className="text-muted-foreground text-sm">{feature.description}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Vision Section */}
        <section className="py-16">
          <div className="container mx-auto px-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="max-w-4xl mx-auto"
            >
              <div className="bg-gradient-card rounded-2xl border border-border/50 p-8 md:p-12">
                <div className="flex items-center gap-4 mb-6">
                  <div className="bg-gradient-gold p-3 rounded-xl">
                    <Lightbulb className="h-8 w-8 text-primary-foreground" />
                  </div>
                  <h2 className="text-3xl font-display font-bold text-foreground">Our Vision</h2>
                </div>
                <p className="text-lg text-muted-foreground leading-relaxed mb-6">
                  We envision a world where every learner has access to comprehensive, 
                  structured learning content across every discipline. From science to technology, from 
                  medicine to philosophy—ScrollLibrary aims to be the definitive platform for 
                  AI-powered educational publishing.
                </p>
                <div className="grid sm:grid-cols-3 gap-4 mt-8">
                  <div className="text-center p-4 bg-muted/30 rounded-lg">
                    <Globe className="h-8 w-8 mx-auto mb-2 text-primary" />
                    <p className="font-medium">Global Access</p>
                  </div>
                  <div className="text-center p-4 bg-muted/30 rounded-lg">
                    <Award className="h-8 w-8 mx-auto mb-2 text-primary" />
                    <p className="font-medium">Quality First</p>
                  </div>
                  <div className="text-center p-4 bg-muted/30 rounded-lg">
                    <Users className="h-8 w-8 mx-auto mb-2 text-primary" />
                    <p className="font-medium">Community Driven</p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Contact & Trust Section */}
        <section className="py-16 bg-muted/20">
          <div className="container mx-auto px-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="max-w-4xl mx-auto text-center"
            >
              <div className="bg-gradient-card rounded-2xl border border-border/50 p-8 md:p-12">
                <div className="flex items-center justify-center gap-4 mb-6">
                  <div className="bg-primary/20 p-3 rounded-xl">
                    <Mail className="h-8 w-8 text-primary" />
                  </div>
                </div>
                <h2 className="text-3xl font-display font-bold text-foreground mb-4">
                  Questions or Feedback?
                </h2>
                <p className="text-lg text-muted-foreground mb-6">
                  We're committed to transparency and continuous improvement. Reach out to our team 
                  for institutional partnerships, academic inquiries, or general feedback.
                </p>
                <div className="flex flex-wrap justify-center gap-4">
                  <Link 
                    to="/contact" 
                    className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                  >
                    <Mail className="h-5 w-5" />
                    Contact Us
                  </Link>
                  <Link 
                    to="/help" 
                    className="inline-flex items-center gap-2 px-6 py-3 bg-muted text-foreground rounded-lg hover:bg-muted/80 transition-colors"
                  >
                    <FileText className="h-5 w-5" />
                    Help Center
                  </Link>
                </div>
              </div>
            </motion.div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
