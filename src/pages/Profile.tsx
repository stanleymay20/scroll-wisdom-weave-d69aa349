import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { 
  User, Camera, BookOpen, Download, Award, Clock, 
  Loader2, Save, History
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";

interface ProfileData {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  country: string | null;
  plan: string | null;
  created_at: string | null;
}

interface UserBook {
  id: string;
  title: string;
  category: string;
  created_at: string;
  cover_image_url: string | null;
}

export default function Profile() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [userBooks, setUserBooks] = useState<UserBook[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [editedProfile, setEditedProfile] = useState({
    full_name: "",
    bio: "",
    country: "",
  });
  const { toast } = useToast();
  const navigate = useNavigate();
  const { t } = useLanguage();

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
    await fetchProfile(user.id);
    await fetchUserBooks(user.id);
    setIsLoading(false);
  };

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    if (data) {
      setProfile(data);
      setEditedProfile({
        full_name: data.full_name || "",
        bio: data.bio || "",
        country: data.country || "",
      });
    }
  };

  const fetchUserBooks = async (userId: string) => {
    const { data: libraryData } = await supabase
      .from("user_library")
      .select("book_id")
      .eq("user_id", userId);

    if (libraryData && libraryData.length > 0) {
      const bookIds = libraryData.map(l => l.book_id);
      const { data: books } = await supabase
        .from("books")
        .select("id, title, category, created_at, cover_image_url")
        .in("id", bookIds)
        .order("created_at", { ascending: false });

      if (books) {
        setUserBooks(books);
      }
    }
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    setIsSaving(true);

    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: editedProfile.full_name,
        bio: editedProfile.bio,
        country: editedProfile.country,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (error) {
      toast({
        title: t('common.error'),
        description: "Failed to update profile",
        variant: "destructive",
      });
    } else {
      toast({
        title: t('profile.title'),
        description: "Your profile has been saved successfully",
      });
      await fetchProfile(user.id);
    }
    setIsSaving(false);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    toast({
      title: t('profile.title'),
      description: t('profile.avatarUpload'),
    });
  };

  const getInitials = (name: string | null) => {
    if (!name) return "U";
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  };

  const getPlanLabel = () => {
    if (profile?.plan === "premium") return t('pricing.premium');
    if (profile?.plan === "prophet_tier") return t('pricing.prophet');
    return t('profile.freePlan');
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
            {/* Header */}
            <div className="flex flex-col md:flex-row items-center gap-6 mb-8">
              <div className="relative group">
                <Avatar className="h-24 w-24 border-2 border-primary">
                  <AvatarImage src={profile?.avatar_url || ""} />
                  <AvatarFallback className="bg-primary/10 text-primary text-2xl">
                    {getInitials(profile?.full_name)}
                  </AvatarFallback>
                </Avatar>
                <label className="absolute inset-0 flex items-center justify-center bg-background/80 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer rounded-full">
                  <Camera className="h-6 w-6 text-primary" />
                  <input type="file" className="hidden" accept="image/*" onChange={handleAvatarUpload} />
                </label>
              </div>
              
              <div className="text-center md:text-left">
                <h1 className="text-2xl font-display font-bold text-foreground">
                  {profile?.full_name || t('profile.anonymousUser')}
                </h1>
                <p className="text-muted-foreground">{user?.email}</p>
                <Badge variant="outline" className="mt-2 border-primary text-primary">
                  {getPlanLabel()}
                </Badge>
              </div>
            </div>

            <Tabs defaultValue="profile" className="space-y-6">
              <TabsList className="bg-muted/50">
                <TabsTrigger value="profile">
                  <User className="h-4 w-4 mr-2" />
                  {t('profile.title')}
                </TabsTrigger>
                <TabsTrigger value="books">
                  <BookOpen className="h-4 w-4 mr-2" />
                  {t('profile.myBooks')}
                </TabsTrigger>
                <TabsTrigger value="history">
                  <History className="h-4 w-4 mr-2" />
                  {t('profile.history')}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="profile" className="space-y-6">
                <Card className="bg-gradient-card border-border/50">
                  <CardHeader>
                    <CardTitle>{t('profile.personalInfo')}</CardTitle>
                    <CardDescription>{t('profile.updateDetails')}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="fullName">{t('profile.fullName')}</Label>
                        <Input
                          id="fullName"
                          value={editedProfile.full_name}
                          onChange={(e) => setEditedProfile(p => ({ ...p, full_name: e.target.value }))}
                          className="bg-muted/50 border-border/50"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="country">{t('profile.country')}</Label>
                        <Input
                          id="country"
                          value={editedProfile.country}
                          onChange={(e) => setEditedProfile(p => ({ ...p, country: e.target.value }))}
                          className="bg-muted/50 border-border/50"
                          placeholder="e.g., United States"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="bio">{t('profile.bio')}</Label>
                      <Textarea
                        id="bio"
                        value={editedProfile.bio}
                        onChange={(e) => setEditedProfile(p => ({ ...p, bio: e.target.value }))}
                        className="bg-muted/50 border-border/50 min-h-[100px]"
                        placeholder={t('profile.bioPlaceholder')}
                      />
                    </div>
                    <Button onClick={handleSaveProfile} disabled={isSaving}>
                      {isSaving ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          {t('profile.saving')}
                        </>
                      ) : (
                        <>
                          <Save className="h-4 w-4 mr-2" />
                          {t('profile.saveChanges')}
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>

                <Card className="bg-gradient-card border-border/50">
                  <CardHeader>
                    <CardTitle>{t('profile.stats')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div className="text-center p-4 bg-muted/30 rounded-lg">
                        <BookOpen className="h-8 w-8 mx-auto mb-2 text-primary" />
                        <p className="text-2xl font-bold text-foreground">{userBooks.length}</p>
                        <p className="text-sm text-muted-foreground">{t('profile.booksInLibrary')}</p>
                      </div>
                      <div className="text-center p-4 bg-muted/30 rounded-lg">
                        <Clock className="h-8 w-8 mx-auto mb-2 text-primary" />
                        <p className="text-2xl font-bold text-foreground">
                          {profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : "-"}
                        </p>
                        <p className="text-sm text-muted-foreground">{t('profile.memberSince')}</p>
                      </div>
                      <div className="text-center p-4 bg-muted/30 rounded-lg">
                        <Award className="h-8 w-8 mx-auto mb-2 text-primary" />
                        <p className="text-2xl font-bold text-foreground capitalize">
                          {profile?.plan || "Free"}
                        </p>
                        <p className="text-sm text-muted-foreground">{t('profile.currentPlan')}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="books" className="space-y-6">
                <Card className="bg-gradient-card border-border/50">
                  <CardHeader>
                    <CardTitle>{t('profile.generatedBooks')}</CardTitle>
                    <CardDescription>{t('profile.booksCreated')}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {userBooks.length === 0 ? (
                      <div className="text-center py-12">
                        <BookOpen className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                        <p className="text-muted-foreground mb-4">{t('profile.noBooks')}</p>
                        <Button onClick={() => navigate("/generate")}>
                          {t('profile.generateFirst')}
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {userBooks.map((book) => (
                          <div
                            key={book.id}
                            className="flex items-center gap-4 p-4 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                            onClick={() => navigate(`/book/${book.id}`)}
                          >
                            <div className="w-12 h-16 bg-gradient-gold rounded flex items-center justify-center flex-shrink-0">
                              <BookOpen className="h-6 w-6 text-primary-foreground" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="font-medium text-foreground truncate">{book.title}</h3>
                              <p className="text-sm text-muted-foreground capitalize">
                                {book.category.replace(/_/g, " ")}
                              </p>
                            </div>
                            <Button variant="ghost" size="sm">
                              <Download className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="history" className="space-y-6">
                <Card className="bg-gradient-card border-border/50">
                  <CardHeader>
                    <CardTitle>{t('profile.readingHistory')}</CardTitle>
                    <CardDescription>{t('profile.readingActivity')}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-center py-12">
                      <History className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                      <p className="text-muted-foreground">{t('profile.historyWillAppear')}</p>
                    </div>
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