import { useState } from "react";
import { motion } from "framer-motion";
import { z } from "zod";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  MessageSquare, Send, FileQuestion, 
  Loader2, CheckCircle, Mail
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";

// Validation schema for support form
const supportSchema = z.object({
  name: z.string()
    .trim()
    .min(1, "Name is required")
    .max(100, "Name must be less than 100 characters"),
  email: z.string()
    .trim()
    .email("Invalid email address")
    .max(255, "Email must be less than 255 characters"),
  subject: z.string()
    .trim()
    .min(1, "Subject is required")
    .max(200, "Subject must be less than 200 characters"),
  message: z.string()
    .trim()
    .min(10, "Message must be at least 10 characters")
    .max(5000, "Message must be less than 5000 characters"),
});

export default function Support() {
  const { t } = useLanguage();
  const [contactForm, setContactForm] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    // Validate form data
    const result = supportSchema.safeParse(contactForm);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        if (err.path[0]) {
          fieldErrors[err.path[0] as string] = err.message;
        }
      });
      setErrors(fieldErrors);
      toast({
        title: t('support.validationError'),
        description: result.error.errors[0]?.message || t('support.checkInput'),
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from("contact_submissions")
        .insert({
          user_id: user?.id || null,
          name: result.data.name,
          email: result.data.email,
          subject: result.data.subject,
          message: result.data.message,
        });

      if (error) throw error;

      setIsSubmitted(true);
      toast({
        title: t('support.messageSent'),
        description: t('support.responseTime'),
      });
    } catch (error) {
      toast({
        title: t('common.error'),
        description: t('support.failedToSend'),
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setIsSubmitted(false);
    setContactForm({ name: "", email: "", subject: "", message: "" });
    setErrors({});
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      
      <main className="flex-1 pt-24 pb-16">
        <div className="container mx-auto px-4 max-w-4xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="text-center mb-12">
              <h1 className="text-4xl font-display font-bold text-gradient-gold mb-4">
                {t('support.title')}
              </h1>
              <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                {t('support.subtitle')}
              </p>
            </div>

            <Tabs defaultValue="contact" className="space-y-6">
              <TabsList className="bg-muted/50 w-full justify-start">
                <TabsTrigger value="contact">
                  <MessageSquare className="h-4 w-4 mr-2" />
                  {t('support.contactUs')}
                </TabsTrigger>
                <TabsTrigger value="issue">
                  <FileQuestion className="h-4 w-4 mr-2" />
                  {t('support.reportIssue')}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="contact">
                <div className="grid gap-6 md:grid-cols-3">
                  <Card className="bg-gradient-card border-border/50 md:col-span-2">
                    <CardHeader>
                      <CardTitle>{t('support.sendMessage')}</CardTitle>
                      <CardDescription>{t('support.sendMessageDesc')}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {isSubmitted ? (
                        <div className="text-center py-12">
                          <CheckCircle className="h-16 w-16 mx-auto mb-4 text-green-500" />
                          <h3 className="text-xl font-semibold mb-2">{t('support.thankYou')}</h3>
                          <p className="text-muted-foreground">
                            {t('support.messageSentDesc')}
                          </p>
                          <Button 
                            className="mt-4" 
                            variant="outline"
                            onClick={resetForm}
                          >
                            {t('support.sendAnother')}
                          </Button>
                        </div>
                      ) : (
                        <form onSubmit={handleSubmit} className="space-y-4">
                          <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                              <Label htmlFor="name">{t('support.name')}</Label>
                              <Input
                                id="name"
                                value={contactForm.name}
                                onChange={(e) => setContactForm(f => ({ ...f, name: e.target.value }))}
                                className={`bg-muted/50 border-border/50 ${errors.name ? 'border-destructive' : ''}`}
                                maxLength={100}
                              />
                              {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="email">{t('support.email')}</Label>
                              <Input
                                id="email"
                                type="email"
                                value={contactForm.email}
                                onChange={(e) => setContactForm(f => ({ ...f, email: e.target.value }))}
                                className={`bg-muted/50 border-border/50 ${errors.email ? 'border-destructive' : ''}`}
                                maxLength={255}
                              />
                              {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="subject">{t('support.subject')}</Label>
                            <Input
                              id="subject"
                              value={contactForm.subject}
                              onChange={(e) => setContactForm(f => ({ ...f, subject: e.target.value }))}
                              className={`bg-muted/50 border-border/50 ${errors.subject ? 'border-destructive' : ''}`}
                              maxLength={200}
                            />
                            {errors.subject && <p className="text-xs text-destructive">{errors.subject}</p>}
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="message">{t('support.message')}</Label>
                            <Textarea
                              id="message"
                              value={contactForm.message}
                              onChange={(e) => setContactForm(f => ({ ...f, message: e.target.value }))}
                              className={`bg-muted/50 border-border/50 min-h-[150px] ${errors.message ? 'border-destructive' : ''}`}
                              maxLength={5000}
                            />
                            <div className="flex justify-between text-xs text-muted-foreground">
                              {errors.message && <p className="text-destructive">{errors.message}</p>}
                              <span className="ml-auto">{contactForm.message.length}/5000</span>
                            </div>
                          </div>
                          <Button type="submit" disabled={isSubmitting} className="w-full">
                            {isSubmitting ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                {t('support.sending')}
                              </>
                            ) : (
                              <>
                                <Send className="h-4 w-4 mr-2" />
                                {t('support.sendMessageBtn')}
                              </>
                            )}
                          </Button>
                        </form>
                      )}
                    </CardContent>
                  </Card>

                  <div className="space-y-6">
                    <Card className="bg-gradient-card border-border/50">
                      <CardHeader>
                        <CardTitle className="text-lg">{t('support.quickContact')}</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex items-center gap-3">
                          <Mail className="h-5 w-5 text-primary" />
                          <div>
                            <p className="text-sm text-muted-foreground">{t('support.email')}</p>
                            <a href="mailto:support@scrolllibrary.com" className="text-foreground hover:text-primary">
                              support@scrolllibrary.com
                            </a>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="bg-gradient-card border-border/50">
                      <CardHeader>
                        <CardTitle className="text-lg">{t('support.responseTimeTitle')}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-muted-foreground text-sm">
                          {t('support.responseTimeDesc')}
                        </p>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="issue">
                <Card className="bg-gradient-card border-border/50">
                  <CardHeader>
                    <CardTitle>{t('support.reportIssue')}</CardTitle>
                    <CardDescription>{t('support.reportIssueDesc')}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {isSubmitted ? (
                      <div className="text-center py-12">
                        <CheckCircle className="h-16 w-16 mx-auto mb-4 text-green-500" />
                        <h3 className="text-xl font-semibold mb-2">{t('support.issueReported')}</h3>
                        <p className="text-muted-foreground">
                          {t('support.issueReportedDesc')}
                        </p>
                        <Button 
                          className="mt-4" 
                          variant="outline"
                          onClick={resetForm}
                        >
                          {t('support.reportAnother')}
                        </Button>
                      </div>
                    ) : (
                      <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor="issue-name">{t('support.name')}</Label>
                            <Input
                              id="issue-name"
                              value={contactForm.name}
                              onChange={(e) => setContactForm(f => ({ ...f, name: e.target.value }))}
                              className={`bg-muted/50 border-border/50 ${errors.name ? 'border-destructive' : ''}`}
                              maxLength={100}
                            />
                            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="issue-email">{t('support.email')}</Label>
                            <Input
                              id="issue-email"
                              type="email"
                              value={contactForm.email}
                              onChange={(e) => setContactForm(f => ({ ...f, email: e.target.value }))}
                              className={`bg-muted/50 border-border/50 ${errors.email ? 'border-destructive' : ''}`}
                              maxLength={255}
                            />
                            {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="issue-subject">{t('support.issueType')}</Label>
                          <Input
                            id="issue-subject"
                            placeholder={t('support.issueTypePlaceholder')}
                            value={contactForm.subject}
                            onChange={(e) => setContactForm(f => ({ ...f, subject: e.target.value }))}
                            className={`bg-muted/50 border-border/50 ${errors.subject ? 'border-destructive' : ''}`}
                            maxLength={200}
                          />
                          {errors.subject && <p className="text-xs text-destructive">{errors.subject}</p>}
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="issue-message">{t('support.describeIssue')}</Label>
                          <Textarea
                            id="issue-message"
                            placeholder={t('support.describeIssuePlaceholder')}
                            value={contactForm.message}
                            onChange={(e) => setContactForm(f => ({ ...f, message: e.target.value }))}
                            className={`bg-muted/50 border-border/50 min-h-[150px] ${errors.message ? 'border-destructive' : ''}`}
                            maxLength={5000}
                          />
                          <div className="flex justify-between text-xs text-muted-foreground">
                            {errors.message && <p className="text-destructive">{errors.message}</p>}
                            <span className="ml-auto">{contactForm.message.length}/5000</span>
                          </div>
                        </div>
                        <Button type="submit" disabled={isSubmitting} className="w-full">
                          {isSubmitting ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              {t('common.submitting')}
                            </>
                          ) : (
                            <>
                              <FileQuestion className="h-4 w-4 mr-2" />
                              {t('support.submitIssue')}
                            </>
                          )}
                        </Button>
                      </form>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </motion.div>
        </div>
      </main>

      <Footer />
    </div>
  );
}