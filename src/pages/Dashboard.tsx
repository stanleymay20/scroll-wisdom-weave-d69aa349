import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { 
  BookOpen, Sparkles, Download, Clock, TrendingUp, 
  Library, Plus, ChevronRight, Loader2
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface DashboardStats {
  totalBooks: number;
  totalChapters: number;
  totalWords: number;
  booksInProgress: number;
}

interface RecentBook {
  id: string;
  title: string;
  category: string;
  progress_percent: number;
  cover_image_url: string | null;
}

export default function Dashboard() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [stats, setStats] = useState<DashboardStats>({ totalBooks: 0, totalChapters: 0, totalWords: 0, booksInProgress: 0 });
  const [recentBooks, setRecentBooks] = useState<RecentBook[]>([]);
  const [isLoading, setIsLoading] = useState(true);
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
    await Promise.all([fetchProfile(user.id), fetchStats(user.id), fetchRecentBooks(user.id)]);
    setIsLoading(false);
  };

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (data) setProfile(data);
  };

  const fetchStats = async (userId: string) => {
    const { data: library } = await supabase.from("user_library").select("book_id, progress_percent").eq("user_id", userId);
    if (!library) return;

    const bookIds = library.map(l => l.book_id);
    if (bookIds.length === 0) return;

    const { data: chapters } = await supabase.from("chapters").select("word_count").in("book_id", bookIds);
    const totalWords = chapters?.reduce((sum, ch) => sum + (ch.word_count || 0), 0) || 0;
    const totalChapters = chapters?.length || 0;
    const booksInProgress = library.filter(l => l.progress_percent > 0 && l.progress_percent < 100).length;

    setStats({ totalBooks: library.length, totalChapters, totalWords, booksInProgress });
  };

  const fetchRecentBooks = async (userId: string) => {
    const { data: library } = await supabase
      .from("user_library")
      .select("book_id, progress_percent")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(4);

    if (!library || library.length === 0) return;

    const bookIds = library.map(l => l.book_id);
    const { data: books } = await supabase.from("books").select("id, title, category, cover_image_url").in("id", bookIds);

    if (books) {
      const booksWithProgress = books.map(book => {
        const libItem = library.find(l => l.book_id === book.id);
        return { ...book, progress_percent: libItem?.progress_percent || 0 };
      });
      setRecentBooks(booksWithProgress);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const statCards = [
    { icon: Library, label: "Books in Library", value: stats.totalBooks, color: "text-scroll-gold" },
    { icon: BookOpen, label: "Total Chapters", value: stats.totalChapters, color: "text-blue-400" },
    { icon: TrendingUp, label: "Words Read", value: stats.totalWords.toLocaleString(), color: "text-green-400" },
    { icon: Clock, label: "In Progress", value: stats.booksInProgress, color: "text-purple-400" },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      
      <main className="flex-1 pt-24 pb-16">
        <div className="container mx-auto px-4 max-w-6xl">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            {/* Welcome Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
              <div>
                <h1 className="text-3xl font-display font-bold text-gradient-gold mb-2">
                  Welcome back, {profile?.full_name?.split(" ")[0] || "Reader"}
                </h1>
                <p className="text-muted-foreground">Here's your reading journey at a glance</p>
              </div>
              <Button variant="hero" className="mt-4 md:mt-0" onClick={() => navigate("/generate")}>
                <Plus className="h-4 w-4 mr-2" />
                Generate New Book
              </Button>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              {statCards.map((stat, index) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <Card className="bg-gradient-card border-border/50">
                    <CardContent className="p-4">
                      <stat.icon className={`h-6 w-6 ${stat.color} mb-2`} />
                      <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                      <p className="text-xs text-muted-foreground">{stat.label}</p>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>

            <div className="grid lg:grid-cols-3 gap-6">
              {/* Recent Books */}
              <div className="lg:col-span-2">
                <Card className="bg-gradient-card border-border/50">
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle>Recent Books</CardTitle>
                      <CardDescription>Continue where you left off</CardDescription>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => navigate("/library")}>
                      View All <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </CardHeader>
                  <CardContent>
                    {recentBooks.length === 0 ? (
                      <div className="text-center py-8">
                        <BookOpen className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                        <p className="text-muted-foreground mb-4">No books yet. Start your journey!</p>
                        <Button onClick={() => navigate("/generate")}>
                          <Sparkles className="h-4 w-4 mr-2" />
                          Generate Your First Book
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {recentBooks.map((book) => (
                          <div
                            key={book.id}
                            className="flex items-center gap-4 p-3 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                            onClick={() => navigate(`/book/${book.id}`)}
                          >
                            <div className="w-12 h-16 bg-gradient-gold rounded flex items-center justify-center flex-shrink-0">
                              <BookOpen className="h-6 w-6 text-primary-foreground" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="font-medium text-foreground truncate">{book.title}</h3>
                              <p className="text-xs text-muted-foreground capitalize mb-2">{book.category.replace(/_/g, " ")}</p>
                              <div className="flex items-center gap-2">
                                <Progress value={book.progress_percent} className="h-1.5 flex-1" />
                                <span className="text-xs text-muted-foreground">{book.progress_percent}%</span>
                              </div>
                            </div>
                            <ChevronRight className="h-5 w-5 text-muted-foreground" />
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Quick Actions */}
              <div className="space-y-6">
                <Card className="bg-gradient-card border-border/50">
                  <CardHeader>
                    <CardTitle className="text-lg">Quick Actions</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Button variant="outline" className="w-full justify-start" onClick={() => navigate("/generate")}>
                      <Sparkles className="h-4 w-4 mr-2" />
                      Generate New Book
                    </Button>
                    <Button variant="outline" className="w-full justify-start" onClick={() => navigate("/explore")}>
                      <Library className="h-4 w-4 mr-2" />
                      Explore Library
                    </Button>
                    <Button variant="outline" className="w-full justify-start" onClick={() => navigate("/library")}>
                      <BookOpen className="h-4 w-4 mr-2" />
                      My Books
                    </Button>
                    <Button variant="outline" className="w-full justify-start" onClick={() => navigate("/settings")}>
                      <Download className="h-4 w-4 mr-2" />
                      Settings
                    </Button>
                  </CardContent>
                </Card>

                <Card className="bg-gradient-card border-border/50">
                  <CardContent className="p-6">
                    <div className="text-center">
                      <div className="bg-primary/10 p-3 rounded-full w-fit mx-auto mb-3">
                        <Sparkles className="h-6 w-6 text-primary" />
                      </div>
                      <h3 className="font-semibold text-foreground mb-1">Pro Tip</h3>
                      <p className="text-sm text-muted-foreground">
                        Generate books with detailed descriptions for better AI-generated content quality.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </motion.div>
        </div>
      </main>

      <Footer />
    </div>
  );
}