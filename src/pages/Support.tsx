import { useState } from "react";
import { motion } from "framer-motion";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  MessageSquare, Send, HelpCircle, FileQuestion, 
  Loader2, CheckCircle, Mail, Phone
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

export default function Support() {
  const [contactForm, setContactForm] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from("contact_submissions")
        .insert({
          user_id: user?.id || null,
          name: contactForm.name,
          email: contactForm.email,
          subject: contactForm.subject,
          message: contactForm.message,
        });

      if (error) throw error;

      setIsSubmitted(true);
      toast({
        title: "Message sent!",
        description: "We'll get back to you within 24-48 hours.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to send message. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
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
                Support Center
              </h1>
              <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                Need help? We're here to assist you with any questions about ScrollLibrary.
              </p>
            </div>

            <Tabs defaultValue="contact" className="space-y-6">
              <TabsList className="bg-muted/50 w-full justify-start">
                <TabsTrigger value="contact">
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Contact Us
                </TabsTrigger>
                <TabsTrigger value="issue">
                  <FileQuestion className="h-4 w-4 mr-2" />
                  Report Issue
                </TabsTrigger>
              </TabsList>

              <TabsContent value="contact">
                <div className="grid gap-6 md:grid-cols-3">
                  <Card className="bg-gradient-card border-border/50 md:col-span-2">
                    <CardHeader>
                      <CardTitle>Send us a message</CardTitle>
                      <CardDescription>Fill out the form and we'll respond shortly</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {isSubmitted ? (
                        <div className="text-center py-12">
                          <CheckCircle className="h-16 w-16 mx-auto mb-4 text-green-500" />
                          <h3 className="text-xl font-semibold mb-2">Thank you!</h3>
                          <p className="text-muted-foreground">
                            Your message has been sent. We'll get back to you soon.
                          </p>
                          <Button 
                            className="mt-4" 
                            variant="outline"
                            onClick={() => {
                              setIsSubmitted(false);
                              setContactForm({ name: "", email: "", subject: "", message: "" });
                            }}
                          >
                            Send Another Message
                          </Button>
                        </div>
                      ) : (
                        <form onSubmit={handleSubmit} className="space-y-4">
                          <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                              <Label htmlFor="name">Name</Label>
                              <Input
                                id="name"
                                value={contactForm.name}
                                onChange={(e) => setContactForm(f => ({ ...f, name: e.target.value }))}
                                className="bg-muted/50 border-border/50"
                                required
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="email">Email</Label>
                              <Input
                                id="email"
                                type="email"
                                value={contactForm.email}
                                onChange={(e) => setContactForm(f => ({ ...f, email: e.target.value }))}
                                className="bg-muted/50 border-border/50"
                                required
                              />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="subject">Subject</Label>
                            <Input
                              id="subject"
                              value={contactForm.subject}
                              onChange={(e) => setContactForm(f => ({ ...f, subject: e.target.value }))}
                              className="bg-muted/50 border-border/50"
                              required
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="message">Message</Label>
                            <Textarea
                              id="message"
                              value={contactForm.message}
                              onChange={(e) => setContactForm(f => ({ ...f, message: e.target.value }))}
                              className="bg-muted/50 border-border/50 min-h-[150px]"
                              required
                            />
                          </div>
                          <Button type="submit" disabled={isSubmitting} className="w-full">
                            {isSubmitting ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Sending...
                              </>
                            ) : (
                              <>
                                <Send className="h-4 w-4 mr-2" />
                                Send Message
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
                        <CardTitle className="text-lg">Quick Contact</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex items-center gap-3">
                          <Mail className="h-5 w-5 text-primary" />
                          <div>
                            <p className="text-sm text-muted-foreground">Email</p>
                            <a href="mailto:support@scrolllibrary.com" className="text-foreground hover:text-primary">
                              support@scrolllibrary.com
                            </a>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="bg-gradient-card border-border/50">
                      <CardHeader>
                        <CardTitle className="text-lg">Response Time</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-muted-foreground text-sm">
                          We typically respond within <span className="text-foreground font-medium">24-48 hours</span> during business days.
                        </p>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="issue">
                <Card className="bg-gradient-card border-border/50">
                  <CardHeader>
                    <CardTitle>Report an Issue</CardTitle>
                    <CardDescription>Help us improve by reporting bugs or problems</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="issue-name">Name</Label>
                          <Input
                            id="issue-name"
                            value={contactForm.name}
                            onChange={(e) => setContactForm(f => ({ ...f, name: e.target.value }))}
                            className="bg-muted/50 border-border/50"
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="issue-email">Email</Label>
                          <Input
                            id="issue-email"
                            type="email"
                            value={contactForm.email}
                            onChange={(e) => setContactForm(f => ({ ...f, email: e.target.value }))}
                            className="bg-muted/50 border-border/50"
                            required
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="issue-subject">Issue Type</Label>
                        <Input
                          id="issue-subject"
                          placeholder="e.g., Book generation failed, Export not working..."
                          value={contactForm.subject}
                          onChange={(e) => setContactForm(f => ({ ...f, subject: e.target.value }))}
                          className="bg-muted/50 border-border/50"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="issue-message">Describe the Issue</Label>
                        <Textarea
                          id="issue-message"
                          placeholder="Please describe what happened, what you expected, and any error messages you saw..."
                          value={contactForm.message}
                          onChange={(e) => setContactForm(f => ({ ...f, message: e.target.value }))}
                          className="bg-muted/50 border-border/50 min-h-[150px]"
                          required
                        />
                      </div>
                      <Button type="submit" disabled={isSubmitting} className="w-full">
                        {isSubmitting ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Submitting...
                          </>
                        ) : (
                          <>
                            <FileQuestion className="h-4 w-4 mr-2" />
                            Submit Issue Report
                          </>
                        )}
                      </Button>
                    </form>
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