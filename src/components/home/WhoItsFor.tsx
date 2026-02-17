import { motion } from "framer-motion";
import { GraduationCap, BookMarked, Briefcase, Building, Search } from "lucide-react";

const audiences = [
  { icon: GraduationCap, label: "University Students" },
  { icon: BookMarked, label: "Lecturers & Educators" },
  { icon: Briefcase, label: "Professionals & Consultants" },
  { icon: Building, label: "Academic Institutions" },
  { icon: Search, label: "Independent Researchers" },
];

export function WhoItsFor() {
  return (
    <section className="py-16 bg-muted/30">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-8"
        >
          <h2 className="text-2xl md:text-3xl font-display font-bold text-foreground mb-2">
            Designed for serious learners
          </h2>
          <p className="text-muted-foreground">
            Structured, persistent, mastery-driven learning
          </p>
        </motion.div>

        <div className="flex flex-wrap justify-center gap-4 max-w-4xl mx-auto">
          {audiences.map((item, index) => {
            const Icon = item.icon;
            return (
              <motion.div
                key={item.label}
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.05 }}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-card border border-border text-sm"
              >
                <Icon className="h-4 w-4 text-primary" strokeWidth={1.5} />
                <span className="text-foreground">{item.label}</span>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
