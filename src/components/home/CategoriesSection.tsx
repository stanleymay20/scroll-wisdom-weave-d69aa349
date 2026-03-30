import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { 
  BookOpen, 
  Sparkles, 
  FlaskConical, 
  Cpu, 
  Briefcase, 
  Coins, 
  TrendingUp,
  Heart,
  Scale,
  Building,
  Clock,
  Globe,
  Palette,
  Brain,
  Music,
  Feather,
  ScrollText,
  Lightbulb,
  HeartPulse,
  Users
} from "lucide-react";

const CATEGORIES = [
  { id: "theology", labelKey: "categories.theology", icon: BookOpen, color: "from-amber-500/20 to-amber-600/20" },
  { id: "prophecy", labelKey: "categories.prophecy", icon: Sparkles, color: "from-purple-500/20 to-purple-600/20" },
  { id: "science", labelKey: "categories.science", icon: FlaskConical, color: "from-blue-500/20 to-blue-600/20" },
  { id: "technology", labelKey: "categories.technology", icon: Cpu, color: "from-cyan-500/20 to-cyan-600/20" },
  { id: "business", labelKey: "categories.business", icon: Briefcase, color: "from-emerald-500/20 to-emerald-600/20" },
  { id: "finance", labelKey: "categories.finance", icon: Coins, color: "from-yellow-500/20 to-yellow-600/20" },
  { id: "economics", labelKey: "categories.economics", icon: TrendingUp, color: "from-green-500/20 to-green-600/20" },
  { id: "medicine", labelKey: "categories.medicine", icon: Heart, color: "from-red-500/20 to-red-600/20" },
  { id: "law", labelKey: "categories.law", icon: Scale, color: "from-slate-500/20 to-slate-600/20" },
  { id: "governance", labelKey: "categories.governance", icon: Building, color: "from-indigo-500/20 to-indigo-600/20" },
  { id: "history", labelKey: "categories.history", icon: Clock, color: "from-orange-500/20 to-orange-600/20" },
  { id: "african_studies", labelKey: "categories.african_studies", icon: Globe, color: "from-amber-600/20 to-orange-600/20" },
  { id: "culture", labelKey: "categories.culture", icon: Palette, color: "from-pink-500/20 to-pink-600/20" },
  { id: "philosophy", labelKey: "categories.philosophy", icon: Brain, color: "from-violet-500/20 to-violet-600/20" },
  { id: "arts", labelKey: "categories.arts", icon: Music, color: "from-rose-500/20 to-rose-600/20" },
  { id: "fiction", labelKey: "categories.fiction", icon: Feather, color: "from-teal-500/20 to-teal-600/20" },
  { id: "non_fiction", labelKey: "categories.non_fiction", icon: ScrollText, color: "from-sky-500/20 to-sky-600/20" },
  { id: "poetry", labelKey: "categories.poetry", icon: Lightbulb, color: "from-fuchsia-500/20 to-fuchsia-600/20" },
  { id: "psychology", labelKey: "categories.psychology", icon: Users, color: "from-violet-400/20 to-violet-500/20" },
  { id: "health", labelKey: "categories.health", icon: HeartPulse, color: "from-lime-500/20 to-lime-600/20" },
];

export function CategoriesSection() {
  const { t } = useLanguage();

  return (
    <section className="py-24 bg-gradient-to-b from-transparent via-muted/20 to-transparent">
      <div className="container mx-auto px-4">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
            {t('categories.title')} <span className="text-gradient-gold">{t('categories.highlight')}</span>
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            {t('categories.subtitle')}
          </p>
        </motion.div>

        {/* Categories Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {CATEGORIES.map((category, index) => {
            const Icon = category.icon;
            return (
              <motion.div
                key={category.id}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.05, duration: 0.4 }}
              >
                <Link
                  to={`/explore?category=${category.id}`}
                  className="group block"
                >
                  <div className={`
                    relative p-4 rounded-xl border border-border/50 
                    bg-gradient-to-br ${category.color}
                    hover:border-primary/50 transition-all duration-300
                    hover:shadow-lg hover:shadow-primary/10
                    hover:-translate-y-1
                  `}>
                    <div className="flex flex-col items-center text-center gap-3">
                      <div className="p-3 rounded-lg bg-background/50 backdrop-blur-sm group-hover:bg-primary/10 transition-colors">
                        <Icon className="h-5 w-5 text-primary" />
                      </div>
                      <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                        {t(category.labelKey)}
                      </span>
                    </div>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}