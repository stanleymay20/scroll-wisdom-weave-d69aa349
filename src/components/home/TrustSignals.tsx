import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import type { Language } from "@/lib/i18n";

const signalsByLanguage: Record<Language, string[]> = {
  en: [
    "Structured multi-chapter book creation",
    "Books stay together in your library",
    "Reading and learning stay connected",
    "Advanced features fail closed until GA validation",
  ],
  fr: [
    "Création structurée de livres en plusieurs chapitres",
    "Vos livres restent réunis dans votre bibliothèque",
    "Lecture et apprentissage restent connectés",
    "Les fonctions avancées restent fermées jusqu’à la validation GA",
  ],
  de: [
    "Strukturierte Erstellung mehrteiliger Bücher",
    "Bücher bleiben gemeinsam in deiner Bibliothek",
    "Lesen und Lernen bleiben verbunden",
    "Erweiterte Funktionen bleiben bis zur GA-Validierung deaktiviert",
  ],
  es: [
    "Creación estructurada de libros de varios capítulos",
    "Tus libros permanecen juntos en tu biblioteca",
    "La lectura y el aprendizaje permanecen conectados",
    "Las funciones avanzadas permanecen cerradas hasta la validación GA",
  ],
  ar: [
    "إنشاء منظم لكتب متعددة الفصول",
    "تبقى كتبك معًا في مكتبتك",
    "تظل القراءة والتعلّم مترابطين",
    "تظل الميزات المتقدمة مغلقة حتى اجتياز التحقق للإطلاق العام",
  ],
  sw: [
    "Uundaji uliopangiliwa wa vitabu vya sura nyingi",
    "Vitabu vyako hubaki pamoja kwenye maktaba yako",
    "Kusoma na kujifunza hubaki vimeunganishwa",
    "Vipengele vya juu hubaki vimefungwa hadi uthibitishaji wa GA",
  ],
};

export function TrustSignals() {
  const { language } = useLanguage();
  const signals = signalsByLanguage[language] ?? signalsByLanguage.en;

  return (
    <section className="py-10 border-y border-border bg-muted/20">
      <div className="container mx-auto px-4">
        <div className="flex flex-wrap justify-center gap-x-8 gap-y-3">
          {signals.map((signal, index) => (
            <motion.div
              key={signal}
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="flex items-center gap-2 text-sm text-foreground"
            >
              <Check className="h-4 w-4 text-primary" strokeWidth={2} />
              <span>{signal}</span>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
