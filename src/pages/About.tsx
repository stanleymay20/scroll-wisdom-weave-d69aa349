import { motion } from "framer-motion";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { 
  Book, Brain, Sparkles, Users, Globe, Award,
  Target, Lightbulb, Shield
} from "lucide-react";

export default function About() {
  const features = [
    {
      icon: Brain,
      title: "Multi-Agent AI System",
      description: "Our proprietary system uses specialized AI agents—ScrollResearchGPT, ScrollAuthorGPT, ScrollEditorGPT, and ScrollProphetGPT—working in harmony to create comprehensive, well-researched content."
    },
    {
      icon: Book,
      title: "Comprehensive Libraries",
      description: "Access and generate books across theology, prophecy, science, technology, business, finance, medicine, law, history, culture, philosophy, arts, and fiction."
    },
    {
      icon: Sparkles,
      title: "Scroll Alignment",
      description: "Every piece of content maintains spiritual accuracy and scroll alignment while delivering academic rigor and practical wisdom."
    },
    {
      icon: Shield,
      title: "Quality Assurance",
      description: "Rigorous quality checks ensure no repetition padding, no random generation, and complete doctrinal coherence in every chapter."
    },
  ];

  const stats = [
    { value: "8,000+", label: "Words per chapter" },
    { value: "30+", label: "Chapters per book" },
    { value: "18", label: "Categories" },
    { value: "∞", label: "Possibilities" },
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
              <h1 className="text-5xl md:text-6xl font-display font-bold text-gradient-gold mb-6">
                About ScrollLibrary™
              </h1>
              <p className="text-xl text-muted-foreground mb-8">
                The AI-Powered Learning Universe—Where Ancient Wisdom Meets Modern Technology
              </p>
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
                  learning universe that exceeds Oxford Library in breadth while maintaining scroll-aligned accuracy 
                  and academic rigor.
                </p>
                <p className="text-lg text-muted-foreground leading-relaxed">
                  We believe in democratizing access to deep, transformative knowledge. Through our multi-agent 
                  AI system, we generate books that don't just inform—they transform, equipping readers with 
                  wisdom that spans millennia while speaking to contemporary challenges.
                </p>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Stats Section */}
        <section className="py-16 bg-muted/20">
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
        <section className="py-16">
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
                ScrollLibrary combines cutting-edge AI technology with timeless wisdom to deliver 
                an unparalleled learning experience.
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
                  We envision a world where every seeker of knowledge has access to comprehensive, 
                  scroll-aligned wisdom across every discipline. From theology to technology, from 
                  medicine to philosophy—ScrollLibrary aims to be the definitive source for 
                  transformative learning.
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
      </main>

      <Footer />
    </div>
  );
}