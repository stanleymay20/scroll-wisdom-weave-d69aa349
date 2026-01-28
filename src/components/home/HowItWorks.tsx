import { motion } from "framer-motion";

const steps = [
  {
    number: "01",
    title: "Define Your Book",
    description: "Choose your title, category, academic level, number of chapters, and tone."
  },
  {
    number: "02",
    title: "Select Book Type",
    description: "Academic Textbook, Professional Guide, Technical Manual, Workbook, or Standard Text."
  },
  {
    number: "03",
    title: "Generate with AI Governance",
    description: "ScrollLibrary applies structured generation rules, academic logic, and citation discipline."
  },
  {
    number: "04",
    title: "Review, Edit & Export",
    description: "Edit chapters, refine content, and export to PDF, DOCX, or EPUB."
  }
];

export function HowItWorks() {
  return (
    <section className="py-20 bg-muted/30">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-14"
        >
          <h2 className="text-3xl md:text-4xl font-display font-bold text-foreground mb-4">
            How ScrollLibrary Works
          </h2>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-6xl mx-auto">
          {steps.map((step, index) => (
            <motion.div
              key={step.number}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="relative"
            >
              <div className="text-5xl font-display font-bold text-primary/20 mb-4">
                {step.number}
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">
                {step.title}
              </h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {step.description}
              </p>
              {index < steps.length - 1 && (
                <div className="hidden lg:block absolute top-8 -right-4 w-8 border-t border-dashed border-border" />
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
