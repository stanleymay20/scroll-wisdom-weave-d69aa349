export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      assessment_integrity_logs: {
        Row: {
          book_id: string | null
          chapter_id: string | null
          created_at: string
          details: Json | null
          id: string
          integrity_score: number | null
          user_id: string
          violation_type: string | null
        }
        Insert: {
          book_id?: string | null
          chapter_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          integrity_score?: number | null
          user_id: string
          violation_type?: string | null
        }
        Update: {
          book_id?: string | null
          chapter_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          integrity_score?: number | null
          user_id?: string
          violation_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assessment_integrity_logs_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_integrity_logs_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      book_audits: {
        Row: {
          academic_findings: Json
          academic_score: number
          audit_model: string
          audit_prompt_version: string
          book_id: string
          certification_blockers: string[]
          certification_eligible: boolean
          chapter_suggestions: Json
          created_at: string
          evidence_citations: Json
          flagged_sections: Json
          id: string
          improvements_applied: boolean
          improvements_applied_at: string | null
          overall_score: number
          pedagogical_findings: Json
          pedagogical_score: number
          penalty_log: Json
          pre_penalty_scores: Json
          status: string
          structural_findings: Json
          structural_score: number
          updated_at: string
          user_id: string
        }
        Insert: {
          academic_findings?: Json
          academic_score?: number
          audit_model?: string
          audit_prompt_version?: string
          book_id: string
          certification_blockers?: string[]
          certification_eligible?: boolean
          chapter_suggestions?: Json
          created_at?: string
          evidence_citations?: Json
          flagged_sections?: Json
          id?: string
          improvements_applied?: boolean
          improvements_applied_at?: string | null
          overall_score?: number
          pedagogical_findings?: Json
          pedagogical_score?: number
          penalty_log?: Json
          pre_penalty_scores?: Json
          status?: string
          structural_findings?: Json
          structural_score?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          academic_findings?: Json
          academic_score?: number
          audit_model?: string
          audit_prompt_version?: string
          book_id?: string
          certification_blockers?: string[]
          certification_eligible?: boolean
          chapter_suggestions?: Json
          created_at?: string
          evidence_citations?: Json
          flagged_sections?: Json
          id?: string
          improvements_applied?: boolean
          improvements_applied_at?: string | null
          overall_score?: number
          pedagogical_findings?: Json
          pedagogical_score?: number
          penalty_log?: Json
          pre_penalty_scores?: Json
          status?: string
          structural_findings?: Json
          structural_score?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "book_audits_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      book_citations: {
        Row: {
          author: string | null
          book_id: string
          chapter_id: string | null
          citation_text: string
          citation_type: string | null
          created_at: string
          id: string
          publication_date: string | null
          source_url: string | null
        }
        Insert: {
          author?: string | null
          book_id: string
          chapter_id?: string | null
          citation_text: string
          citation_type?: string | null
          created_at?: string
          id?: string
          publication_date?: string | null
          source_url?: string | null
        }
        Update: {
          author?: string | null
          book_id?: string
          chapter_id?: string | null
          citation_text?: string
          citation_type?: string | null
          created_at?: string
          id?: string
          publication_date?: string | null
          source_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "book_citations_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "book_citations_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      bookmarks: {
        Row: {
          book_id: string
          chapter_id: string | null
          chapter_number: number | null
          created_at: string
          id: string
          title: string | null
          user_id: string
        }
        Insert: {
          book_id: string
          chapter_id?: string | null
          chapter_number?: number | null
          created_at?: string
          id?: string
          title?: string | null
          user_id: string
        }
        Update: {
          book_id?: string
          chapter_id?: string | null
          chapter_number?: number | null
          created_at?: string
          id?: string
          title?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookmarks_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookmarks_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      books: {
        Row: {
          academic_level: string | null
          author_ai_agent: string | null
          book_type: string | null
          category: string
          cover_image_url: string | null
          created_at: string
          creator_id: string | null
          description: string | null
          id: string
          is_featured: boolean | null
          is_published: boolean | null
          language: string | null
          source_document_name: string | null
          source_document_url: string | null
          source_type: string | null
          target_audience: string | null
          title: string
          total_chapters: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          academic_level?: string | null
          author_ai_agent?: string | null
          book_type?: string | null
          category?: string
          cover_image_url?: string | null
          created_at?: string
          creator_id?: string | null
          description?: string | null
          id?: string
          is_featured?: boolean | null
          is_published?: boolean | null
          language?: string | null
          source_document_name?: string | null
          source_document_url?: string | null
          source_type?: string | null
          target_audience?: string | null
          title: string
          total_chapters?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          academic_level?: string | null
          author_ai_agent?: string | null
          book_type?: string | null
          category?: string
          cover_image_url?: string | null
          created_at?: string
          creator_id?: string | null
          description?: string | null
          id?: string
          is_featured?: boolean | null
          is_published?: boolean | null
          language?: string | null
          source_document_name?: string | null
          source_document_url?: string | null
          source_type?: string | null
          target_audience?: string | null
          title?: string
          total_chapters?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      chapters: {
        Row: {
          academic_mode: boolean | null
          audit_id: string | null
          book_id: string
          chapter_number: number
          chapter_references: Json | null
          citation_style: string | null
          comic_metadata: Json | null
          content: string | null
          content_ownership: Json | null
          created_at: string
          id: string
          is_generated: boolean | null
          last_ai_content: string | null
          previous_content: string | null
          research_metadata: Json | null
          title: string
          updated_at: string
          user_locked: boolean | null
          version_number: number
          word_count: number | null
        }
        Insert: {
          academic_mode?: boolean | null
          audit_id?: string | null
          book_id: string
          chapter_number: number
          chapter_references?: Json | null
          citation_style?: string | null
          comic_metadata?: Json | null
          content?: string | null
          content_ownership?: Json | null
          created_at?: string
          id?: string
          is_generated?: boolean | null
          last_ai_content?: string | null
          previous_content?: string | null
          research_metadata?: Json | null
          title: string
          updated_at?: string
          user_locked?: boolean | null
          version_number?: number
          word_count?: number | null
        }
        Update: {
          academic_mode?: boolean | null
          audit_id?: string | null
          book_id?: string
          chapter_number?: number
          chapter_references?: Json | null
          citation_style?: string | null
          comic_metadata?: Json | null
          content?: string | null
          content_ownership?: Json | null
          created_at?: string
          id?: string
          is_generated?: boolean | null
          last_ai_content?: string | null
          previous_content?: string | null
          research_metadata?: Json | null
          title?: string
          updated_at?: string
          user_locked?: boolean | null
          version_number?: number
          word_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "chapters_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "book_audits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chapters_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      competency_certificates: {
        Row: {
          ai_evaluation_summary: string | null
          average_application_score: number | null
          average_competency_score: number | null
          average_reflection_score: number | null
          book_id: string
          book_version_hash: string | null
          certificate_number: string
          chapters_completed: number | null
          competency_level: Database["public"]["Enums"]["competency_level"]
          competency_summary: string | null
          created_at: string
          id: string
          issued_at: string
          metadata: Json | null
          overall_competency_score: number | null
          revoked_at: string | null
          revoked_reason: string | null
          skills_validated: string[] | null
          total_chapters: number | null
          updated_at: string
          user_id: string
          verification_hash: string | null
        }
        Insert: {
          ai_evaluation_summary?: string | null
          average_application_score?: number | null
          average_competency_score?: number | null
          average_reflection_score?: number | null
          book_id: string
          book_version_hash?: string | null
          certificate_number: string
          chapters_completed?: number | null
          competency_level?: Database["public"]["Enums"]["competency_level"]
          competency_summary?: string | null
          created_at?: string
          id?: string
          issued_at?: string
          metadata?: Json | null
          overall_competency_score?: number | null
          revoked_at?: string | null
          revoked_reason?: string | null
          skills_validated?: string[] | null
          total_chapters?: number | null
          updated_at?: string
          user_id: string
          verification_hash?: string | null
        }
        Update: {
          ai_evaluation_summary?: string | null
          average_application_score?: number | null
          average_competency_score?: number | null
          average_reflection_score?: number | null
          book_id?: string
          book_version_hash?: string | null
          certificate_number?: string
          chapters_completed?: number | null
          competency_level?: Database["public"]["Enums"]["competency_level"]
          competency_summary?: string | null
          created_at?: string
          id?: string
          issued_at?: string
          metadata?: Json | null
          overall_competency_score?: number | null
          revoked_at?: string | null
          revoked_reason?: string | null
          skills_validated?: string[] | null
          total_chapters?: number | null
          updated_at?: string
          user_id?: string
          verification_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "competency_certificates_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      competency_progress: {
        Row: {
          application_ai_evaluation: Json | null
          application_response: string | null
          application_score: number | null
          application_submitted: boolean | null
          application_submitted_at: string | null
          book_id: string
          chapter_number: number
          competency_check_passed: boolean | null
          competency_checked_at: string | null
          competency_responses: Json | null
          competency_score: number | null
          concept_completed: boolean | null
          concept_completed_at: string | null
          created_at: string
          current_phase: string | null
          id: string
          overall_score: number | null
          reflection_ai_feedback: string | null
          reflection_quality_score: number | null
          reflection_submitted: boolean | null
          reflection_submitted_at: string | null
          reflection_text: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          application_ai_evaluation?: Json | null
          application_response?: string | null
          application_score?: number | null
          application_submitted?: boolean | null
          application_submitted_at?: string | null
          book_id: string
          chapter_number: number
          competency_check_passed?: boolean | null
          competency_checked_at?: string | null
          competency_responses?: Json | null
          competency_score?: number | null
          concept_completed?: boolean | null
          concept_completed_at?: string | null
          created_at?: string
          current_phase?: string | null
          id?: string
          overall_score?: number | null
          reflection_ai_feedback?: string | null
          reflection_quality_score?: number | null
          reflection_submitted?: boolean | null
          reflection_submitted_at?: string | null
          reflection_text?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          application_ai_evaluation?: Json | null
          application_response?: string | null
          application_score?: number | null
          application_submitted?: boolean | null
          application_submitted_at?: string | null
          book_id?: string
          chapter_number?: number
          competency_check_passed?: boolean | null
          competency_checked_at?: string | null
          competency_responses?: Json | null
          competency_score?: number | null
          concept_completed?: boolean | null
          concept_completed_at?: string | null
          created_at?: string
          current_phase?: string | null
          id?: string
          overall_score?: number | null
          reflection_ai_feedback?: string | null
          reflection_quality_score?: number | null
          reflection_submitted?: boolean | null
          reflection_submitted_at?: string | null
          reflection_text?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "competency_progress_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_submissions: {
        Row: {
          created_at: string
          email: string
          id: string
          message: string
          name: string
          status: string | null
          subject: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          message: string
          name: string
          status?: string | null
          subject?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          message?: string
          name?: string
          status?: string | null
          subject?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      content_reports: {
        Row: {
          book_id: string | null
          chapter_id: string | null
          content_id: string | null
          content_type: string | null
          created_at: string
          description: string | null
          id: string
          reason: string
          reporter_id: string | null
          status: string | null
        }
        Insert: {
          book_id?: string | null
          chapter_id?: string | null
          content_id?: string | null
          content_type?: string | null
          created_at?: string
          description?: string | null
          id?: string
          reason: string
          reporter_id?: string | null
          status?: string | null
        }
        Update: {
          book_id?: string | null
          chapter_id?: string | null
          content_id?: string | null
          content_type?: string | null
          created_at?: string
          description?: string | null
          id?: string
          reason?: string
          reporter_id?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_reports_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_reports_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      faqs: {
        Row: {
          answer: string
          category: string | null
          created_at: string
          id: string
          is_published: boolean | null
          question: string
          sort_order: number | null
        }
        Insert: {
          answer: string
          category?: string | null
          created_at?: string
          id?: string
          is_published?: boolean | null
          question: string
          sort_order?: number | null
        }
        Update: {
          answer?: string
          category?: string | null
          created_at?: string
          id?: string
          is_published?: boolean | null
          question?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      highlights: {
        Row: {
          book_id: string
          chapter_id: string | null
          color: string | null
          content: string
          created_at: string
          end_offset: number | null
          id: string
          note: string | null
          start_offset: number | null
          user_id: string
        }
        Insert: {
          book_id: string
          chapter_id?: string | null
          color?: string | null
          content: string
          created_at?: string
          end_offset?: number | null
          id?: string
          note?: string | null
          start_offset?: number | null
          user_id: string
        }
        Update: {
          book_id?: string
          chapter_id?: string | null
          color?: string | null
          content?: string
          created_at?: string
          end_offset?: number | null
          id?: string
          note?: string | null
          start_offset?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "highlights_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "highlights_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_queue: {
        Row: {
          book_id: string | null
          chapter_id: string | null
          content_id: string
          content_type: string
          created_at: string
          flagged_reason: string | null
          id: string
          moderator_id: string | null
          notes: string | null
          resolved_at: string | null
          severity: string | null
          status: string | null
        }
        Insert: {
          book_id?: string | null
          chapter_id?: string | null
          content_id: string
          content_type: string
          created_at?: string
          flagged_reason?: string | null
          id?: string
          moderator_id?: string | null
          notes?: string | null
          resolved_at?: string | null
          severity?: string | null
          status?: string | null
        }
        Update: {
          book_id?: string | null
          chapter_id?: string | null
          content_id?: string
          content_type?: string
          created_at?: string
          flagged_reason?: string | null
          id?: string
          moderator_id?: string | null
          notes?: string | null
          resolved_at?: string | null
          severity?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "moderation_queue_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_queue_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      pmf_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          metadata: Json | null
          user_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json | null
          user_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          ai_voice_preference: string | null
          animations_enabled: boolean | null
          avatar_url: string | null
          bio: string | null
          complexity_level: string | null
          country: string | null
          course_reminders: boolean | null
          created_at: string
          daily_book_count: number | null
          email_updates: boolean | null
          font_size: string | null
          full_name: string | null
          id: string
          last_book_date: string | null
          learning_preferences: Json | null
          new_book_alerts: boolean | null
          plan: string | null
          reader_theme: string | null
          spiritual_strictness: string | null
          study_speed: string | null
          theme_preference: string | null
          tts_enabled: boolean | null
          updated_at: string
          user_id: string
          writing_tone: string | null
        }
        Insert: {
          ai_voice_preference?: string | null
          animations_enabled?: boolean | null
          avatar_url?: string | null
          bio?: string | null
          complexity_level?: string | null
          country?: string | null
          course_reminders?: boolean | null
          created_at?: string
          daily_book_count?: number | null
          email_updates?: boolean | null
          font_size?: string | null
          full_name?: string | null
          id?: string
          last_book_date?: string | null
          learning_preferences?: Json | null
          new_book_alerts?: boolean | null
          plan?: string | null
          reader_theme?: string | null
          spiritual_strictness?: string | null
          study_speed?: string | null
          theme_preference?: string | null
          tts_enabled?: boolean | null
          updated_at?: string
          user_id: string
          writing_tone?: string | null
        }
        Update: {
          ai_voice_preference?: string | null
          animations_enabled?: boolean | null
          avatar_url?: string | null
          bio?: string | null
          complexity_level?: string | null
          country?: string | null
          course_reminders?: boolean | null
          created_at?: string
          daily_book_count?: number | null
          email_updates?: boolean | null
          font_size?: string | null
          full_name?: string | null
          id?: string
          last_book_date?: string | null
          learning_preferences?: Json | null
          new_book_alerts?: boolean | null
          plan?: string | null
          reader_theme?: string | null
          spiritual_strictness?: string | null
          study_speed?: string | null
          theme_preference?: string | null
          tts_enabled?: boolean | null
          updated_at?: string
          user_id?: string
          writing_tone?: string | null
        }
        Relationships: []
      }
      publishing_certificates: {
        Row: {
          book_id: string
          certificate_number: string
          certificate_type: string | null
          created_at: string
          id: string
          issued_at: string
          metadata: Json | null
          revocation_reason: string | null
          revoked_at: string | null
          revoked_reason: string | null
          user_id: string
          verification_hash: string | null
        }
        Insert: {
          book_id: string
          certificate_number: string
          certificate_type?: string | null
          created_at?: string
          id?: string
          issued_at?: string
          metadata?: Json | null
          revocation_reason?: string | null
          revoked_at?: string | null
          revoked_reason?: string | null
          user_id: string
          verification_hash?: string | null
        }
        Update: {
          book_id?: string
          certificate_number?: string
          certificate_type?: string | null
          created_at?: string
          id?: string
          issued_at?: string
          metadata?: Json | null
          revocation_reason?: string | null
          revoked_at?: string | null
          revoked_reason?: string | null
          user_id?: string
          verification_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "publishing_certificates_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_attempts: {
        Row: {
          answers: Json | null
          book_id: string
          chapter_id: string | null
          created_at: string
          id: string
          score: number | null
          total_questions: number | null
          user_id: string
        }
        Insert: {
          answers?: Json | null
          book_id: string
          chapter_id?: string | null
          created_at?: string
          id?: string
          score?: number | null
          total_questions?: number | null
          user_id: string
        }
        Update: {
          answers?: Json | null
          book_id?: string
          chapter_id?: string | null
          created_at?: string
          id?: string
          score?: number | null
          total_questions?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_attempts_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_attempts_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      reading_goals: {
        Row: {
          created_at: string
          daily_pages_goal: number | null
          id: string
          updated_at: string
          user_id: string
          weekly_minutes_goal: number | null
        }
        Insert: {
          created_at?: string
          daily_pages_goal?: number | null
          id?: string
          updated_at?: string
          user_id: string
          weekly_minutes_goal?: number | null
        }
        Update: {
          created_at?: string
          daily_pages_goal?: number | null
          id?: string
          updated_at?: string
          user_id?: string
          weekly_minutes_goal?: number | null
        }
        Relationships: []
      }
      reading_sessions: {
        Row: {
          book_id: string
          chapter_number: number | null
          created_at: string
          duration_seconds: number | null
          ended_at: string | null
          id: string
          started_at: string
          user_id: string
        }
        Insert: {
          book_id: string
          chapter_number?: number | null
          created_at?: string
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          started_at?: string
          user_id: string
        }
        Update: {
          book_id?: string
          chapter_number?: number | null
          created_at?: string
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          started_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reading_sessions_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      reading_streaks: {
        Row: {
          created_at: string
          current_streak: number | null
          id: string
          last_read_date: string | null
          longest_streak: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_streak?: number | null
          id?: string
          last_read_date?: string | null
          longest_streak?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_streak?: number | null
          id?: string
          last_read_date?: string | null
          longest_streak?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      saved_decks: {
        Row: {
          book_id: string | null
          cards: Json
          chapter_id: string | null
          created_at: string
          deck_type: string | null
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          book_id?: string | null
          cards?: Json
          chapter_id?: string | null
          created_at?: string
          deck_type?: string | null
          id?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          book_id?: string | null
          cards?: Json
          chapter_id?: string | null
          created_at?: string
          deck_type?: string | null
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_decks_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_decks_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_learning_decks: {
        Row: {
          book_id: string
          chapters_covered: number[] | null
          created_at: string
          deck_data: Json
          generated_at: string | null
          id: string
          last_viewed_at: string | null
          scope: string | null
          slide_count: number | null
          target_audience: string | null
          tier: string | null
          title: string
          tone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          book_id: string
          chapters_covered?: number[] | null
          created_at?: string
          deck_data?: Json
          generated_at?: string | null
          id?: string
          last_viewed_at?: string | null
          scope?: string | null
          slide_count?: number | null
          target_audience?: string | null
          tier?: string | null
          title: string
          tone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          book_id?: string
          chapters_covered?: number[] | null
          created_at?: string
          deck_data?: Json
          generated_at?: string | null
          id?: string
          last_viewed_at?: string | null
          scope?: string | null
          slide_count?: number | null
          target_audience?: string | null
          tier?: string | null
          title?: string
          tone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_learning_decks_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      study_notes: {
        Row: {
          book_id: string | null
          chapter_id: string | null
          content: string
          created_at: string
          id: string
          note_type: string | null
          updated_at: string
          user_id: string
          user_id_new: string | null
        }
        Insert: {
          book_id?: string | null
          chapter_id?: string | null
          content: string
          created_at?: string
          id?: string
          note_type?: string | null
          updated_at?: string
          user_id: string
          user_id_new?: string | null
        }
        Update: {
          book_id?: string | null
          chapter_id?: string | null
          content?: string
          created_at?: string
          id?: string
          note_type?: string | null
          updated_at?: string
          user_id?: string
          user_id_new?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "study_notes_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_notes_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          status: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          tier: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          status?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tier?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          status?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tier?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tts_usage: {
        Row: {
          created_at: string
          id: string
          minutes_used: number | null
          month: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          minutes_used?: number | null
          month: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          minutes_used?: number | null
          month?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_library: {
        Row: {
          book_id: string
          created_at: string
          id: string
          last_read_chapter: number | null
          progress_percent: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          book_id: string
          created_at?: string
          id?: string
          last_read_chapter?: number | null
          progress_percent?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          book_id?: string
          created_at?: string
          id?: string
          last_read_chapter?: number | null
          progress_percent?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_library_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      competency_level:
        | "knowledge_verified"
        | "applied_competency"
        | "professional_integration"
        | "mastery"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
      competency_level: [
        "knowledge_verified",
        "applied_competency",
        "professional_integration",
        "mastery",
      ],
    },
  },
} as const
