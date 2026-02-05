import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  User, Camera, BookOpen, Download, Award, Clock, 
  Loader2, Save, History
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiCache } from "@/lib/cache";
import { cn } from "@/lib/utils";
import { clearAdminCache } from "@/hooks/useAdmin";

interface ProfileData {
  id: string;
  user_id?: string;
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

// Mobile Skeleton component
function MobileProfileSkeleton() {
  return (
    <div className="px-4 py-4 space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-16 w-16 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-24" />
        </div>
      </div>
      <Skeleton className="h-10 w-full" />
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    </div>
  );
}

// Desktop Skeleton component
function ProfileSkeleton() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 pt-24 pb-16">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="flex flex-col md:flex-row items-center gap-6 mb-8">
            <Skeleton className="h-24 w-24 rounded-full" />
            <div className="text-center md:text-left space-y-2">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-6 w-20" />
            </div>
          </div>
          <Skeleton className="h-10 w-full max-w-md mb-6" />
          <Card className="bg-gradient-card border-border/50">
            <CardHeader>
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-60" />
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-10 w-full" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-10 w-full" />
                </div>
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-24 w-full" />
              </div>
              <Skeleton className="h-10 w-32" />
            </CardContent>
          </Card>
        </div>
      </main>
      <Footer />
    </div>
  );
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
  const isMobile = useIsMobile();

  // CONTRACT 4A: Cache-first, skeleton-first strategy
  useEffect(() => {
    let mounted = true;
    
    // INSTANT: Check cache and render immediately
    const cachedProfile = apiCache.get<ProfileData>('profile:current');
    const cachedBooks = apiCache.get<UserBook[]>('profile:books');
    
    if (cachedProfile) {
      setProfile(cachedProfile);
      setEditedProfile({
        full_name: cachedProfile.full_name || "",
        bio: cachedProfile.bio || "",
        country: cachedProfile.country || "",
      });
      setIsLoading(false);
    }
    if (cachedBooks) {
      setUserBooks(cachedBooks);
    }
    
    // BACKGROUND: Check auth and fetch fresh data
    const initProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!mounted) return;
      
      if (!user) {
        navigate("/auth");
        return;
      }
      setUser(user);
      
      // Fetch fresh data in parallel
      await Promise.all([
        fetchProfile(user.id),
        fetchUserBooks(user.id)
      ]);
      
      if (mounted) setIsLoading(false);
    };
    
    // Defer to not block render
    setTimeout(initProfile, 0);
    
    return () => { mounted = false; };
  }, [navigate]);

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      console.error("Error fetching profile:", error);
    }
    
    if (data) {
      setProfile(data);
      setEditedProfile({
        full_name: data.full_name || "",
        bio: data.bio || "",
        country: data.country || "",
      });
      // Cache for 2 minutes
      apiCache.set('profile:current', data, 2 * 60 * 1000);
    }
  };

  const fetchUserBooks = async (userId: string) => {
    const { data: libraryData } = await supabase
      .from("user_library")
      .select("book_id")
      .eq("user_id", userId)
      .limit(10); // Limit for performance

    if (libraryData && libraryData.length > 0) {
      const bookIds = libraryData.map(l => l.book_id);
      const { data: books } = await supabase
        .from("books")
        .select("id, title, category, created_at, cover_image_url")
        .in("id", bookIds)
        .order("created_at", { ascending: false });

      if (books) {
        setUserBooks(books);
        // Cache for 2 minutes
        apiCache.set('profile:books', books, 2 * 60 * 1000);
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
      console.error("Profile update error:", error);
      toast({
        title: t('common.error'),
        description: error.message || "Failed to update profile",
        variant: "destructive",
      });
    } else {
      toast({
        title: t('profile.title'),
        description: "Your profile has been saved successfully",
      });
      // Invalidate cache and refetch
      apiCache.delete('profile:current');
      clearAdminCache(user.id);
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

  // Show skeleton immediately, not blocking spinner
  if (isLoading && !profile) {
    return isMobile ? (
      <MobileLayout><MobileProfileSkeleton /></MobileLayout>
    ) : (
      <ProfileSkeleton />
    );
  }

  // Profile content - shared between mobile and desktop
  const ProfileContent = (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={isMobile ? "px-4 py-4" : ""}
    >
      {/* Header */}
      <div className={cn(
        "flex items-center gap-4 mb-6",
        !isMobile && "flex-col md:flex-row gap-6 mb-8"
      )}>
        <div className="relative group">
          <Avatar className={cn("border-2 border-primary", isMobile ? "h-16 w-16" : "h-24 w-24")}>
            <AvatarImage src={profile?.avatar_url || ""} />
            <AvatarFallback className={cn("bg-primary/10 text-primary", isMobile ? "text-lg" : "text-2xl")}>
              {getInitials(profile?.full_name)}
            </AvatarFallback>
          </Avatar>
          <label className="absolute inset-0 flex items-center justify-center bg-background/80 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer rounded-full">
            <Camera className={cn("text-primary", isMobile ? "h-5 w-5" : "h-6 w-6")} />
            <input type="file" className="hidden" accept="image/*" onChange={handleAvatarUpload} />
          </label>
        </div>
        
        <div className={cn(!isMobile && "text-center md:text-left")}>
          <h1 className={cn("font-display font-bold text-foreground", isMobile ? "text-xl" : "text-2xl")}>
            {profile?.full_name || t('profile.anonymousUser')}
          </h1>
          <p className="text-muted-foreground text-sm">{user?.email}</p>
          <Badge variant="outline" className="mt-2 border-primary text-primary">
            {getPlanLabel()}
          </Badge>
        </div>
      </div>

      <Tabs defaultValue="profile" className="space-y-4">
        <TabsList className={cn("bg-muted/50", isMobile && "w-full grid grid-cols-3")}>
          <TabsTrigger value="profile" className={isMobile ? "text-xs" : ""}>
            <User className={cn("mr-1", isMobile ? "h-3 w-3" : "h-4 w-4 mr-2")} />
            {isMobile ? t('profile.title').slice(0, 7) : t('profile.title')}
          </TabsTrigger>
          <TabsTrigger value="books" className={isMobile ? "text-xs" : ""}>
            <BookOpen className={cn("mr-1", isMobile ? "h-3 w-3" : "h-4 w-4 mr-2")} />
            {isMobile ? "Books" : t('profile.myBooks')}
          </TabsTrigger>
          <TabsTrigger value="history" className={isMobile ? "text-xs" : ""}>
            <History className={cn("mr-1", isMobile ? "h-3 w-3" : "h-4 w-4 mr-2")} />
            {isMobile ? "History" : t('profile.history')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-4">
          <Card className="bg-gradient-card border-border/50">
            <CardHeader className={isMobile ? "pb-2" : ""}>
              <CardTitle className={isMobile ? "text-base" : ""}>{t('profile.personalInfo')}</CardTitle>
              {!isMobile && <CardDescription>{t('profile.updateDetails')}</CardDescription>}
            </CardHeader>
            <CardContent className="space-y-4">
              <div className={cn("gap-4", isMobile ? "space-y-4" : "grid md:grid-cols-2")}>
                <div className="space-y-2">
                  <Label htmlFor="fullName" className={isMobile ? "text-sm" : ""}>{t('profile.fullName')}</Label>
                  <Input
                    id="fullName"
                    value={editedProfile.full_name}
                    onChange={(e) => setEditedProfile(p => ({ ...p, full_name: e.target.value }))}
                    className="bg-muted/50 border-border/50"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="country" className={isMobile ? "text-sm" : ""}>{t('profile.country')}</Label>
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
                <Label htmlFor="bio" className={isMobile ? "text-sm" : ""}>{t('profile.bio')}</Label>
                <Textarea
                  id="bio"
                  value={editedProfile.bio}
                  onChange={(e) => setEditedProfile(p => ({ ...p, bio: e.target.value }))}
                  className={cn("bg-muted/50 border-border/50", isMobile ? "min-h-[80px]" : "min-h-[100px]")}
                  placeholder={t('profile.bioPlaceholder')}
                />
              </div>
              <Button onClick={handleSaveProfile} disabled={isSaving} className={isMobile ? "w-full" : ""}>
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
            <CardHeader className={isMobile ? "pb-2" : ""}>
              <CardTitle className={isMobile ? "text-base" : ""}>{t('profile.stats')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={cn("gap-4", isMobile ? "grid grid-cols-3 gap-2" : "grid sm:grid-cols-3")}>
                <div className={cn("text-center rounded-lg bg-muted/30", isMobile ? "p-3" : "p-4")}>
                  <BookOpen className={cn("mx-auto mb-2 text-primary", isMobile ? "h-6 w-6" : "h-8 w-8")} />
                  <p className={cn("font-bold text-foreground", isMobile ? "text-lg" : "text-2xl")}>{userBooks.length}</p>
                  <p className={cn("text-muted-foreground", isMobile ? "text-xs" : "text-sm")}>{isMobile ? "Books" : t('profile.booksInLibrary')}</p>
                </div>
                <div className={cn("text-center rounded-lg bg-muted/30", isMobile ? "p-3" : "p-4")}>
                  <Clock className={cn("mx-auto mb-2 text-primary", isMobile ? "h-6 w-6" : "h-8 w-8")} />
                  <p className={cn("font-bold text-foreground", isMobile ? "text-sm" : "text-2xl")}>
                    {profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : "-"}
                  </p>
                  <p className={cn("text-muted-foreground", isMobile ? "text-xs" : "text-sm")}>{isMobile ? "Joined" : t('profile.memberSince')}</p>
                </div>
                <div className={cn("text-center rounded-lg bg-muted/30", isMobile ? "p-3" : "p-4")}>
                  <Award className={cn("mx-auto mb-2 text-primary", isMobile ? "h-6 w-6" : "h-8 w-8")} />
                  <p className={cn("font-bold text-foreground capitalize", isMobile ? "text-lg" : "text-2xl")}>
                    {profile?.plan || "Free"}
                  </p>
                  <p className={cn("text-muted-foreground", isMobile ? "text-xs" : "text-sm")}>{isMobile ? "Plan" : t('profile.currentPlan')}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="books" className="space-y-4">
          <Card className="bg-gradient-card border-border/50">
            <CardHeader className={isMobile ? "pb-2" : ""}>
              <CardTitle className={isMobile ? "text-base" : ""}>{t('profile.generatedBooks')}</CardTitle>
              {!isMobile && <CardDescription>{t('profile.booksCreated')}</CardDescription>}
            </CardHeader>
            <CardContent>
              {userBooks.length === 0 ? (
                <div className={cn("text-center", isMobile ? "py-8" : "py-12")}>
                  <BookOpen className={cn("mx-auto mb-4 text-muted-foreground", isMobile ? "h-10 w-10" : "h-12 w-12")} />
                  <p className="text-muted-foreground mb-4">{t('profile.noBooks')}</p>
                  <Button onClick={() => navigate("/generate")}>
                    {t('profile.generateFirst')}
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {userBooks.map((book) => (
                    <div
                      key={book.id}
                      className={cn(
                        "flex items-center gap-3 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer",
                        isMobile ? "p-3" : "gap-4 p-4"
                      )}
                      onClick={() => navigate(`/book/${book.id}`)}
                    >
                      <div className={cn(
                        "bg-gradient-gold rounded flex items-center justify-center flex-shrink-0",
                        isMobile ? "w-10 h-14" : "w-12 h-16"
                      )}>
                        <BookOpen className={cn("text-primary-foreground", isMobile ? "h-5 w-5" : "h-6 w-6")} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className={cn("font-medium text-foreground truncate", isMobile ? "text-sm" : "")}>{book.title}</h3>
                        <p className={cn("text-muted-foreground capitalize", isMobile ? "text-xs" : "text-sm")}>
                          {book.category.replace(/_/g, " ")}
                        </p>
                      </div>
                      <Button variant="ghost" size="icon" className={isMobile ? "h-8 w-8" : ""}>
                        <Download className={isMobile ? "h-3 w-3" : "h-4 w-4"} />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <Card className="bg-gradient-card border-border/50">
            <CardHeader className={isMobile ? "pb-2" : ""}>
              <CardTitle className={isMobile ? "text-base" : ""}>{t('profile.readingHistory')}</CardTitle>
              {!isMobile && <CardDescription>{t('profile.readingActivity')}</CardDescription>}
            </CardHeader>
            <CardContent>
              <div className={cn("text-center", isMobile ? "py-8" : "py-12")}>
                <History className={cn("mx-auto mb-4 text-muted-foreground", isMobile ? "h-10 w-10" : "h-12 w-12")} />
                <p className="text-muted-foreground">{t('profile.historyWillAppear')}</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </motion.div>
  );

  // Mobile uses MobileLayout, desktop uses traditional layout
  if (isMobile) {
    return <MobileLayout>{ProfileContent}</MobileLayout>;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 pt-24 pb-16">
        <div className="container mx-auto px-4 max-w-4xl">
          {ProfileContent}
        </div>
      </main>
      <Footer />
    </div>
  );
}