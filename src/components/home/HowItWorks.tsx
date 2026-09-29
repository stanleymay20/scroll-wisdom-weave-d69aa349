import { motion } from "framer-motion";
import { Lightbulb, PenLine, ShieldCheck, Send, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

const steps = [
  { number: "1", title: "Idea", description: "Describe the book you want to create. ScrollLibrary helps shape the direction and structure.", icon: Lightbulb },
  { number: "2", title: "Create", description: "Build a structured manuscript with the GA authoring workflow and keep the project in one workspace.", icon: PenLine },
  { number: "3", title: "Review", description: "Read the work, assess understanding, and refine the project using the capabilities available in the current GA scope.", icon: ShieldCheck },
  { number: "4", title: "Publish", description: "Advanced exports and controlled publishing workflows become available only after their GA validation gates pass.", icon: Send },
  { number: "5", title: "Grow", description: "As validated publishing workflows open, extend the same project toward distribution, audience, and future releases.", icon: TrendingUp },
];

export function HowItWorks() {
  const navigate = useNavigate();

  return (
    <section className="py-20 bg-muted/30" aria-labelledby="how-it-works-heading">
      <div className="container mx-auto px-4">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-14">
          <h2 id="how-it-works-heading" className="text-3xl md:text-4xl font-display font-bold text-foreground">
            One workspace. From idea to readers.
          </h2>
          <p className="text-muted-foreground mt-3 max-w-2xl mx-auto">
            Start with the capabilities that are validated today. Advanced publishing infrastructure stays gated until it is proven ready.
          </p>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4 max-w-6xl mx-auto">
          {steps.map((step, index) => (
            <motion.div
              key={step.number}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.08 }}
              className="bg-card border border-border rounded-xl p-5"
            >
              <div className="flex items-center justify-between mb-5">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <step.icon className="h-5 w-5 text-primary" />
                </div>
                <span className="text-xs font-semibold text-muted-foreground">{step.number.padStart(2, "0")}</span>
              </div>
              <h3 className="font-semibold text-foreground mb-2">{step.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{step.description}</p>
            </motion.div>
          ))}
        </div>

        <div className="flex justify-center mt-10">
          <Button size="lg" onClick={() => navigate("/generate")}>
            Start creating
          </Button>
        </div>
      </div>
    </section>
  );
}
