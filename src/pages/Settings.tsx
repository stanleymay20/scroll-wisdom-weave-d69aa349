import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { 
  Settings as SettingsIcon, Palette, Bell, Brain, Shield, 
  Loader2, Save, Trash2, Download, Moon, Sun, Type, Volume2
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface SettingsData {
  theme_preference: string;
  font_size: string;
  reader_theme: string;
  tts_enabled: boolean;
  animations_enabled: boolean;
  email_updates: boolean;
  new_book_alerts: boolean;
  course_reminders: boolean;
  writing_tone: string;
  spiritual_strictness: string;
  complexity_level: string;
  study_speed: string;
  ai_voice_preference: string;
}

const defaultSettings: SettingsData = {
  theme_preference: "dark",
  font_size: "medium",
  reader_theme: "default",
  tts_enabled: true,
  animations_enabled: true,
  email_updates: true,
  new_book_alerts: true,
  course_reminders: true,
  writing_tone: "scholarly",
  spiritual_strictness: "balanced",
  complexity_level: "intermediate",
  study_speed: "normal",
  ai_voice_preference: "natural",
};

export default function Settings() {
  const [user, setUser] = useState<any>(null);
  const [settings, setSettings] = useState<SettingsData>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      navigate("/auth");
      return;
    }
    setUser(user);
    await fetchSettings(user.id);
    setIsLoading(false);
  };

  const fetchSettings = async (userId: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("theme_preference, font_size, reader_theme, tts_enabled, animations_enabled, email_updates, new_book_alerts, course_reminders, writing_tone, spiritual_strictness, complexity_level, study_speed, ai_voice_preference")
      .eq("id", userId)
      .maybeSingle();

    if (data) {
      setSettings({
        theme_preference: data.theme_preference || "dark",
        font_size: data.font_size || "medium",
        reader_theme: data.reader_theme || "default",
        tts_enabled: data.tts_enabled ?? true,
        animations_enabled: data.animations_enabled ?? true,
        email_updates: data.email_updates ?? true,
        new_book_alerts: data.new_book_alerts ?? true,
        course_reminders: data.course_reminders ?? true,
        writing_tone: data.writing_tone || "scholarly",
        spiritual_strictness: data.spiritual_strictness || "balanced",
        complexity_level: data.complexity_level || "intermediate",
        study_speed: data.study_speed || "normal",
        ai_voice_preference: data.ai_voice_preference || "natural",
      });
    }
  };

  const handleSaveSettings = async () => {
    if (!user) return;
    setIsSaving(true);

    const { error } = await supabase
      .from("profiles")
      .update({
        ...settings,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to save settings",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Settings saved",
        description: "Your preferences have been updated",
      });
    }
    setIsSaving(false);
  };

  const handleDeleteAccount = async () => {
    toast({
      title: "Account deletion",
      description: "Please contact support@scrolllibrary.com to delete your account",
    });
  };

  const handleExportData = async () => {
    toast({
      title: "Data export",
      description: "Your data export is being prepared. You'll receive an email when ready.",
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      
      <main className="flex-1 pt-24 pb-16">
        <div className="container mx-auto px-4 max-w-4xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="mb-8">
              <h1 className="text-3xl font-display font-bold text-gradient-gold mb-2">
                Settings
              </h1>
              <p className="text-muted-foreground">Customize your ScrollLibrary experience</p>
            </div>

            <Tabs defaultValue="system" className="space-y-6">
              <TabsList className="bg-muted/50 flex-wrap h-auto gap-1 p-1">
                <TabsTrigger value="system">
                  <Palette className="h-4 w-4 mr-2" />
                  System
                </TabsTrigger>
                <TabsTrigger value="notifications">
                  <Bell className="h-4 w-4 mr-2" />
                  Notifications
                </TabsTrigger>
                <TabsTrigger value="ai">
                  <Brain className="h-4 w-4 mr-2" />
                  AI Preferences
                </TabsTrigger>
                <TabsTrigger value="privacy">
                  <Shield className="h-4 w-4 mr-2" />
                  Privacy
                </TabsTrigger>
              </TabsList>

              <TabsContent value="system" className="space-y-6">
                <Card className="bg-gradient-card border-border/50">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Palette className="h-5 w-5 text-primary" />
                      Appearance
                    </CardTitle>
                    <CardDescription>Customize how ScrollLibrary looks</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Theme</Label>
                        <p className="text-sm text-muted-foreground">Select your preferred color scheme</p>
                      </div>
                      <Select
                        value={settings.theme_preference}
                        onValueChange={(value) => setSettings(s => ({ ...s, theme_preference: value }))}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="dark">
                            <div className="flex items-center gap-2">
                              <Moon className="h-4 w-4" />
                              Dark
                            </div>
                          </SelectItem>
                          <SelectItem value="light">
                            <div className="flex items-center gap-2">
                              <Sun className="h-4 w-4" />
                              Light
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <Separator className="bg-border/50" />

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Font Size</Label>
                        <p className="text-sm text-muted-foreground">Adjust text size for reading</p>
                      </div>
                      <Select
                        value={settings.font_size}
                        onValueChange={(value) => setSettings(s => ({ ...s, font_size: value }))}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="small">Small</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="large">Large</SelectItem>
                          <SelectItem value="xlarge">Extra Large</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <Separator className="bg-border/50" />

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Reader Theme</Label>
                        <p className="text-sm text-muted-foreground">Choose reading background</p>
                      </div>
                      <Select
                        value={settings.reader_theme}
                        onValueChange={(value) => setSettings(s => ({ ...s, reader_theme: value }))}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="default">Default</SelectItem>
                          <SelectItem value="sepia">Sepia</SelectItem>
                          <SelectItem value="dark">Dark</SelectItem>
                          <SelectItem value="paper">Paper</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <Separator className="bg-border/50" />

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Text-to-Speech Voice</Label>
                        <p className="text-sm text-muted-foreground">AI voice for reading aloud</p>
                      </div>
                      <Select
                        value={settings.ai_voice_preference}
                        onValueChange={(value) => setSettings(s => ({ ...s, ai_voice_preference: value }))}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="natural">Natural</SelectItem>
                          <SelectItem value="professional">Professional</SelectItem>
                          <SelectItem value="warm">Warm</SelectItem>
                          <SelectItem value="clear">Clear</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <Separator className="bg-border/50" />

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Enable Text-to-Speech</Label>
                        <p className="text-sm text-muted-foreground">Allow audio reading of books</p>
                      </div>
                      <Switch
                        checked={settings.tts_enabled}
                        onCheckedChange={(checked) => setSettings(s => ({ ...s, tts_enabled: checked }))}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Enable Animations</Label>
                        <p className="text-sm text-muted-foreground">Show motion effects</p>
                      </div>
                      <Switch
                        checked={settings.animations_enabled}
                        onCheckedChange={(checked) => setSettings(s => ({ ...s, animations_enabled: checked }))}
                      />
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="notifications" className="space-y-6">
                <Card className="bg-gradient-card border-border/50">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Bell className="h-5 w-5 text-primary" />
                      Notification Preferences
                    </CardTitle>
                    <CardDescription>Control what notifications you receive</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Email Updates</Label>
                        <p className="text-sm text-muted-foreground">Receive platform updates via email</p>
                      </div>
                      <Switch
                        checked={settings.email_updates}
                        onCheckedChange={(checked) => setSettings(s => ({ ...s, email_updates: checked }))}
                      />
                    </div>

                    <Separator className="bg-border/50" />

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>New Book Alerts</Label>
                        <p className="text-sm text-muted-foreground">Notifications when books are ready</p>
                      </div>
                      <Switch
                        checked={settings.new_book_alerts}
                        onCheckedChange={(checked) => setSettings(s => ({ ...s, new_book_alerts: checked }))}
                      />
                    </div>

                    <Separator className="bg-border/50" />

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Course Reminders</Label>
                        <p className="text-sm text-muted-foreground">Reminders for learning progress</p>
                      </div>
                      <Switch
                        checked={settings.course_reminders}
                        onCheckedChange={(checked) => setSettings(s => ({ ...s, course_reminders: checked }))}
                      />
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="ai" className="space-y-6">
                <Card className="bg-gradient-card border-border/50">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Brain className="h-5 w-5 text-primary" />
                      AI Generation Preferences
                    </CardTitle>
                    <CardDescription>Customize how AI generates content for you</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Writing Tone</Label>
                        <p className="text-sm text-muted-foreground">Style of generated content</p>
                      </div>
                      <Select
                        value={settings.writing_tone}
                        onValueChange={(value) => setSettings(s => ({ ...s, writing_tone: value }))}
                      >
                        <SelectTrigger className="w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="scholarly">Scholarly</SelectItem>
                          <SelectItem value="conversational">Conversational</SelectItem>
                          <SelectItem value="formal">Formal</SelectItem>
                          <SelectItem value="inspirational">Inspirational</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <Separator className="bg-border/50" />

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Spiritual Alignment</Label>
                        <p className="text-sm text-muted-foreground">Strictness of scroll alignment</p>
                      </div>
                      <Select
                        value={settings.spiritual_strictness}
                        onValueChange={(value) => setSettings(s => ({ ...s, spiritual_strictness: value }))}
                      >
                        <SelectTrigger className="w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="relaxed">Relaxed</SelectItem>
                          <SelectItem value="balanced">Balanced</SelectItem>
                          <SelectItem value="strict">Strict</SelectItem>
                          <SelectItem value="prophetic">Prophetic</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <Separator className="bg-border/50" />

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Complexity Level</Label>
                        <p className="text-sm text-muted-foreground">Depth of generated content</p>
                      </div>
                      <Select
                        value={settings.complexity_level}
                        onValueChange={(value) => setSettings(s => ({ ...s, complexity_level: value }))}
                      >
                        <SelectTrigger className="w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="beginner">Beginner</SelectItem>
                          <SelectItem value="intermediate">Intermediate</SelectItem>
                          <SelectItem value="advanced">Advanced</SelectItem>
                          <SelectItem value="expert">Expert</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <Separator className="bg-border/50" />

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Study Speed</Label>
                        <p className="text-sm text-muted-foreground">Pace of learning content</p>
                      </div>
                      <Select
                        value={settings.study_speed}
                        onValueChange={(value) => setSettings(s => ({ ...s, study_speed: value }))}
                      >
                        <SelectTrigger className="w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="relaxed">Relaxed</SelectItem>
                          <SelectItem value="normal">Normal</SelectItem>
                          <SelectItem value="intensive">Intensive</SelectItem>
                          <SelectItem value="accelerated">Accelerated</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="privacy" className="space-y-6">
                <Card className="bg-gradient-card border-border/50">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Shield className="h-5 w-5 text-primary" />
                      Privacy & Data
                    </CardTitle>
                    <CardDescription>Manage your account and data</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Export Your Data</Label>
                        <p className="text-sm text-muted-foreground">Download all your data</p>
                      </div>
                      <Button variant="outline" onClick={handleExportData}>
                        <Download className="h-4 w-4 mr-2" />
                        Export
                      </Button>
                    </div>

                    <Separator className="bg-border/50" />

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="text-destructive">Delete Account</Label>
                        <p className="text-sm text-muted-foreground">Permanently delete your account and data</p>
                      </div>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive">
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This action cannot be undone. This will permanently delete your account
                              and remove all your data from our servers.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={handleDeleteAccount} className="bg-destructive text-destructive-foreground">
                              Delete Account
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            <div className="mt-6 flex justify-end">
              <Button onClick={handleSaveSettings} disabled={isSaving} variant="gold">
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save All Settings
                  </>
                )}
              </Button>
            </div>
          </motion.div>
        </div>
      </main>

      <Footer />
    </div>
  );
}