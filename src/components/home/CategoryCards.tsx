import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Upload, Sparkles, Database } from "lucide-react";

const cards = [
  {
    title: "My Library",
    description: "Your personal collection of uploaded books and generated study guides, with reading progress and mastery tracking.",
    icon: Database,
    to: "/library",
    gradient: "from-blue-500 to-blue-700",
  },
  {
    title: "Upload a Book",
    description: "Upload PDF or EPUB textbooks. We parse chapters, enable highlights, notes, and generate quizzes automatically.",
    icon: Upload,
    to: "/upload",
    gradient: "from-sky-400 to-cyan-600",
  },
  {
    title: "Generate Study Guide",
    description: "Enter any topic and get a structured book with chapters, summaries, quizzes, and a mastery certificate.",
    icon: Sparkles,
    to: "/generate",
    gradient: "from-indigo-500 to-purple-600",
  },
];

export function CategoryCards() {
  return (
    <section className="py-12 bg-background">
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="grid md:grid-cols-3 gap-5">
          {cards.map((card, i) => (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
            >
              <Link
                to={card.to}
                className={`group block relative overflow-hidden rounded-2xl bg-gradient-to-br ${card.gradient} p-7 h-56 transition-transform hover:scale-[1.02] hover:shadow-lg`}
              >
                {/* Decorative circle */}
                <div className="absolute -top-8 -left-8 w-32 h-32 rounded-full bg-white/10" />
                <div className="absolute bottom-0 right-0 w-40 h-40 rounded-full bg-white/5 translate-x-10 translate-y-10" />
                
                <div className="relative z-10 flex flex-col h-full justify-between">
                  <card.icon className="h-8 w-8 text-white/80 mb-3" />
                  <div>
                    <h3 className="text-xl font-display font-bold text-white mb-2">
                      {card.title}
                    </h3>
                    <p className="text-sm text-white/75 leading-relaxed line-clamp-3">
                      {card.description}
                    </p>
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
