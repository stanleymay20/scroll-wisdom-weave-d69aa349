/**
 * Reading Progress Dashboard Component
 * 
 * Displays comprehensive reading stats: books read, completion %, 
 * quiz scores across all chapters.
 */

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  BookOpen,
  GraduationCap,
  TrendingUp,
  Clock,
  CheckCircle2,
  BarChart3,
  Award,
  BookMarked,
  ChevronRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

interface BookProgress {
  bookId: string;
  bookTitle: string;
  coverUrl: string | null;
  category: string;
  progressPercent: number;
  lastReadChapter: number;
  totalChapters: number;
  quizScores: ChapterQuizScore[];
  averageQuizScore: number;
  isCompleted: boolean;
}

interface ChapterQuizScore {
  chapterNumber: number;
  chapterTitle: string;
  score: number;
  totalQuestions: number;
  passed: boolean;
}

interface OverallStats {
  totalBooksStarted: number;
  totalBooksCompleted: number;
  totalChaptersRead: number;
  totalQuizzesTaken: number;
  averageQuizScore: number;
  totalReadingTimeEstimate: number; // in minutes
}

export function ReadingProgressDashboard({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [bookProgress, setBookProgress] = useState<BookProgress[]>([]);
  const [overallStats, setOverallStats] = useState<OverallStats>({
    totalBooksStarted: 0,
    totalBooksCompleted: 0,
    totalChaptersRead: 0,
    totalQuizzesTaken: 0,
    averageQuizScore: 0,
    totalReadingTimeEstimate: 0,
  });
  const [selectedBook, setSelectedBook] = useState<BookProgress | null>(null);

  useEffect(() => {
    if (userId) {
      fetchProgressData();
    }
  }, [userId]);

  const fetchProgressData = async () => {
    setIsLoading(true);
    try {
      // Fetch user library with progress
      const { data: library } = await supabase
        .from('user_library')
        .select('book_id, progress_percent, last_read_chapter')
        .eq('user_id', userId);

      if (!library || library.length === 0) {
        setIsLoading(false);
        return;
      }

      const bookIds = library.map(l => l.book_id);

      // Fetch books and chapters in parallel
      const [booksResult, chaptersResult, quizResult] = await Promise.all([
        supabase
          .from('books')
          .select('id, title, cover_image_url, category, total_chapters')
          .in('id', bookIds),
        supabase
          .from('chapters')
          .select('id, book_id, chapter_number, title, word_count')
          .in('book_id', bookIds),
        supabase
          .from('quiz_attempts')
          .select('book_id, chapter_id, score, total_questions')
          .eq('user_id', userId)
          .in('book_id', bookIds),
      ]);

      const books = booksResult.data || [];
      const chapters = chaptersResult.data || [];
      const quizAttempts = quizResult.data || [];

      // Build chapter ID to info map
      const chapterMap = new Map(chapters.map(c => [c.id, c]));

      // Build progress data per book
      const progressData: BookProgress[] = books.map(book => {
        const libItem = library.find(l => l.book_id === book.id);
        const bookChapters = chapters.filter(c => c.book_id === book.id);
        const bookQuizzes = quizAttempts.filter(q => q.book_id === book.id);

        // Build quiz scores per chapter
        const quizScoresByChapter = new Map<number, ChapterQuizScore>();
        bookQuizzes.forEach(quiz => {
          const chapter = chapterMap.get(quiz.chapter_id);
          if (chapter) {
            const existing = quizScoresByChapter.get(chapter.chapter_number);
            const scorePercent = quiz.total_questions > 0 
              ? (quiz.score / quiz.total_questions) * 100 
              : 0;
            // Keep highest score
            if (!existing || scorePercent > existing.score) {
              quizScoresByChapter.set(chapter.chapter_number, {
                chapterNumber: chapter.chapter_number,
                chapterTitle: chapter.title,
                score: scorePercent,
                totalQuestions: quiz.total_questions,
                passed: scorePercent >= 70,
              });
            }
          }
        });

        const quizScores = Array.from(quizScoresByChapter.values())
          .sort((a, b) => a.chapterNumber - b.chapterNumber);
        
        const avgScore = quizScores.length > 0
          ? quizScores.reduce((sum, q) => sum + q.score, 0) / quizScores.length
          : 0;

        return {
          bookId: book.id,
          bookTitle: book.title,
          coverUrl: book.cover_image_url,
          category: book.category,
          progressPercent: libItem?.progress_percent || 0,
          lastReadChapter: libItem?.last_read_chapter || 1,
          totalChapters: book.total_chapters || bookChapters.length,
          quizScores,
          averageQuizScore: avgScore,
          isCompleted: (libItem?.progress_percent || 0) >= 100,
        };
      });

      setBookProgress(progressData);

      // Calculate overall stats
      const totalBooksStarted = progressData.length;
      const totalBooksCompleted = progressData.filter(b => b.isCompleted).length;
      const totalChaptersRead = progressData.reduce((sum, b) => {
        const chaptersRead = Math.floor((b.progressPercent / 100) * b.totalChapters);
        return sum + chaptersRead;
      }, 0);
      const allQuizScores = progressData.flatMap(b => b.quizScores);
      const totalQuizzesTaken = allQuizScores.length;
      const averageQuizScore = allQuizScores.length > 0
        ? allQuizScores.reduce((sum, q) => sum + q.score, 0) / allQuizScores.length
        : 0;
      
      // Estimate reading time (avg 250 words/min)
      const totalWords = chapters.reduce((sum, c) => sum + (c.word_count || 0), 0);
      const totalReadingTimeEstimate = Math.round(totalWords / 250);

      setOverallStats({
        totalBooksStarted,
        totalBooksCompleted,
        totalChaptersRead,
        totalQuizzesTaken,
        averageQuizScore,
        totalReadingTimeEstimate,
      });

    } catch (error) {
      console.error('[ReadingProgress] Error fetching data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i} className="bg-gradient-card">
              <CardContent className="p-4">
                <Skeleton className="h-6 w-6 mb-2" />
                <Skeleton className="h-8 w-16 mb-1" />
                <Skeleton className="h-3 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card className="bg-gradient-card">
          <CardContent className="p-6">
            <Skeleton className="h-48 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  const statCards = [
    { 
      icon: BookMarked, 
      label: 'Books Started', 
      value: overallStats.totalBooksStarted, 
      color: 'text-primary' 
    },
    { 
      icon: CheckCircle2, 
      label: 'Completed', 
      value: overallStats.totalBooksCompleted, 
      color: 'text-emerald-500' 
    },
    { 
      icon: BookOpen, 
      label: 'Chapters Read', 
      value: overallStats.totalChaptersRead, 
      color: 'text-blue-400' 
    },
    { 
      icon: GraduationCap, 
      label: 'Avg Quiz Score', 
      value: `${Math.round(overallStats.averageQuizScore)}%`, 
      color: 'text-purple-400' 
    },
  ];

  return (
    <div className="space-y-6">
      {/* Overall Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
          >
            <Card className="bg-gradient-card border-border/50">
              <CardContent className="p-4">
                <stat.icon className={cn('h-6 w-6 mb-2', stat.color)} />
                <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Additional Stats */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card className="bg-gradient-card border-border/50">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-lg bg-amber-500/10">
              <Clock className="h-6 w-6 text-amber-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Est. Reading Time</p>
              <p className="text-xl font-bold">
                {overallStats.totalReadingTimeEstimate > 60 
                  ? `${Math.round(overallStats.totalReadingTimeEstimate / 60)} hours`
                  : `${overallStats.totalReadingTimeEstimate} minutes`}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-card border-border/50">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-lg bg-emerald-500/10">
              <Award className="h-6 w-6 text-emerald-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Quizzes Completed</p>
              <p className="text-xl font-bold">{overallStats.totalQuizzesTaken}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Books Progress List */}
      <Card className="bg-gradient-card border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            Reading Progress by Book
          </CardTitle>
          <CardDescription>
            Track your completion and quiz scores for each book
          </CardDescription>
        </CardHeader>
        <CardContent>
          {bookProgress.length === 0 ? (
            <div className="text-center py-8">
              <BookOpen className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground mb-4">No books in your library yet</p>
              <Button onClick={() => navigate('/explore')}>
                Explore Books
              </Button>
            </div>
          ) : (
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-4">
                {bookProgress.map((book, index) => (
                  <motion.div
                    key={book.bookId}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className={cn(
                      'p-4 rounded-lg border transition-all cursor-pointer',
                      selectedBook?.bookId === book.bookId
                        ? 'bg-primary/10 border-primary/30'
                        : 'bg-muted/30 border-border/50 hover:bg-muted/50'
                    )}
                    onClick={() => setSelectedBook(
                      selectedBook?.bookId === book.bookId ? null : book
                    )}
                  >
                    <div className="flex items-center gap-4">
                      {/* Cover */}
                      <div className="w-12 h-16 bg-gradient-gold rounded flex items-center justify-center flex-shrink-0 overflow-hidden">
                        {book.coverUrl ? (
                          <img 
                            src={book.coverUrl} 
                            alt={book.bookTitle} 
                            className="w-full h-full object-cover" 
                          />
                        ) : (
                          <BookOpen className="h-6 w-6 text-primary-foreground" />
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-medium text-foreground truncate">
                            {book.bookTitle}
                          </h3>
                          {book.isCompleted && (
                            <Badge variant="default" className="bg-emerald-500/20 text-emerald-500 text-xs">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Completed
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground capitalize mb-2">
                          {book.category.replace(/_/g, ' ')} • {book.totalChapters} chapters
                        </p>
                        
                        {/* Progress bar */}
                        <div className="flex items-center gap-2">
                          <Progress value={book.progressPercent} className="h-2 flex-1" />
                          <span className="text-xs text-muted-foreground w-10 text-right">
                            {Math.round(book.progressPercent)}%
                          </span>
                        </div>
                      </div>

                      {/* Quiz Score */}
                      <div className="text-right">
                        <div className="flex items-center gap-1 justify-end">
                          <GraduationCap className="h-4 w-4 text-muted-foreground" />
                          <span className={cn(
                            'text-lg font-bold',
                            book.averageQuizScore >= 70 ? 'text-emerald-500' : 
                            book.averageQuizScore >= 50 ? 'text-amber-500' : 'text-muted-foreground'
                          )}>
                            {book.quizScores.length > 0 
                              ? `${Math.round(book.averageQuizScore)}%`
                              : '—'}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {book.quizScores.length} quiz{book.quizScores.length !== 1 ? 'zes' : ''}
                        </p>
                      </div>

                      <ChevronRight className={cn(
                        'h-5 w-5 text-muted-foreground transition-transform',
                        selectedBook?.bookId === book.bookId && 'rotate-90'
                      )} />
                    </div>

                    {/* Expanded Quiz Scores */}
                    {selectedBook?.bookId === book.bookId && book.quizScores.length > 0 && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="mt-4 pt-4 border-t border-border/50"
                      >
                        <h4 className="text-sm font-medium mb-3">Chapter Quiz Scores</h4>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                          {book.quizScores.map(quiz => (
                            <div 
                              key={quiz.chapterNumber}
                              className={cn(
                                'p-2 rounded-lg text-xs',
                                quiz.passed 
                                  ? 'bg-emerald-500/10 border border-emerald-500/20'
                                  : 'bg-muted/50 border border-border/50'
                              )}
                            >
                              <p className="font-medium truncate">Ch. {quiz.chapterNumber}</p>
                              <p className={cn(
                                'text-lg font-bold',
                                quiz.passed ? 'text-emerald-500' : 'text-muted-foreground'
                              )}>
                                {Math.round(quiz.score)}%
                              </p>
                            </div>
                          ))}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="mt-3"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/book/${book.bookId}`);
                          }}
                        >
                          View Book Details
                          <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                      </motion.div>
                    )}
                  </motion.div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
