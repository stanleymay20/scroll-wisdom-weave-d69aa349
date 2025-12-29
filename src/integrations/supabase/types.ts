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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      books: {
        Row: {
          author_ai_agent: string | null
          book_type: string
          category: Database["public"]["Enums"]["book_category"]
          character_sheet: Json | null
          comic_style_id: string | null
          cover_image_url: string | null
          created_at: string | null
          creator_id: string | null
          description: string | null
          id: string
          is_featured: boolean | null
          is_published: boolean | null
          language: string | null
          layout_template: number | null
          line_weight_hint: string | null
          palette_hint: string | null
          scenes_per_panel: number | null
          text_in_image: boolean | null
          title: string
          total_chapters: number | null
          updated_at: string | null
          workbook_density: string | null
        }
        Insert: {
          author_ai_agent?: string | null
          book_type?: string
          category: Database["public"]["Enums"]["book_category"]
          character_sheet?: Json | null
          comic_style_id?: string | null
          cover_image_url?: string | null
          created_at?: string | null
          creator_id?: string | null
          description?: string | null
          id?: string
          is_featured?: boolean | null
          is_published?: boolean | null
          language?: string | null
          layout_template?: number | null
          line_weight_hint?: string | null
          palette_hint?: string | null
          scenes_per_panel?: number | null
          text_in_image?: boolean | null
          title: string
          total_chapters?: number | null
          updated_at?: string | null
          workbook_density?: string | null
        }
        Update: {
          author_ai_agent?: string | null
          book_type?: string
          category?: Database["public"]["Enums"]["book_category"]
          character_sheet?: Json | null
          comic_style_id?: string | null
          cover_image_url?: string | null
          created_at?: string | null
          creator_id?: string | null
          description?: string | null
          id?: string
          is_featured?: boolean | null
          is_published?: boolean | null
          language?: string | null
          layout_template?: number | null
          line_weight_hint?: string | null
          palette_hint?: string | null
          scenes_per_panel?: number | null
          text_in_image?: boolean | null
          title?: string
          total_chapters?: number | null
          updated_at?: string | null
          workbook_density?: string | null
        }
        Relationships: []
      }
      chapters: {
        Row: {
          academic_mode: boolean | null
          book_id: string
          chapter_number: number
          chapter_references: Json | null
          citation_style: string | null
          content: string | null
          created_at: string | null
          id: string
          is_generated: boolean | null
          research_metadata: Json | null
          title: string
          updated_at: string | null
          word_count: number | null
        }
        Insert: {
          academic_mode?: boolean | null
          book_id: string
          chapter_number: number
          chapter_references?: Json | null
          citation_style?: string | null
          content?: string | null
          created_at?: string | null
          id?: string
          is_generated?: boolean | null
          research_metadata?: Json | null
          title: string
          updated_at?: string | null
          word_count?: number | null
        }
        Update: {
          academic_mode?: boolean | null
          book_id?: string
          chapter_number?: number
          chapter_references?: Json | null
          citation_style?: string | null
          content?: string | null
          created_at?: string | null
          id?: string
          is_generated?: boolean | null
          research_metadata?: Json | null
          title?: string
          updated_at?: string | null
          word_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "chapters_book_id_fkey"
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
          subject: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          message: string
          name: string
          status?: string | null
          subject: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          message?: string
          name?: string
          status?: string | null
          subject?: string
          user_id?: string | null
        }
        Relationships: []
      }
      content_reports: {
        Row: {
          action_taken: string | null
          content_id: string
          content_type: string
          created_at: string
          description: string | null
          id: string
          reason: string
          reporter_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
        }
        Insert: {
          action_taken?: string | null
          content_id: string
          content_type: string
          created_at?: string
          description?: string | null
          id?: string
          reason: string
          reporter_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Update: {
          action_taken?: string | null
          content_id?: string
          content_type?: string
          created_at?: string
          description?: string | null
          id?: string
          reason?: string
          reporter_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Relationships: []
      }
      data_export_requests: {
        Row: {
          completed_at: string | null
          download_url: string | null
          expires_at: string | null
          id: string
          requested_at: string
          status: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          download_url?: string | null
          expires_at?: string | null
          id?: string
          requested_at?: string
          status?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          download_url?: string | null
          expires_at?: string | null
          id?: string
          requested_at?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      faqs: {
        Row: {
          answer: string
          category: string | null
          created_at: string
          id: string
          is_published: boolean | null
          order_index: number | null
          question: string
          updated_at: string
        }
        Insert: {
          answer: string
          category?: string | null
          created_at?: string
          id?: string
          is_published?: boolean | null
          order_index?: number | null
          question: string
          updated_at?: string
        }
        Update: {
          answer?: string
          category?: string | null
          created_at?: string
          id?: string
          is_published?: boolean | null
          order_index?: number | null
          question?: string
          updated_at?: string
        }
        Relationships: []
      }
      highlights: {
        Row: {
          chapter_id: string
          created_at: string | null
          excerpt: string
          id: string
          note: string | null
          user_id: string
        }
        Insert: {
          chapter_id: string
          created_at?: string | null
          excerpt: string
          id?: string
          note?: string | null
          user_id: string
        }
        Update: {
          chapter_id?: string
          created_at?: string | null
          excerpt?: string
          id?: string
          note?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "highlights_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_consents: {
        Row: {
          consent_type: string
          consented: boolean
          consented_at: string
          id: string
          ip_address: string | null
          user_id: string
          version: string
        }
        Insert: {
          consent_type: string
          consented?: boolean
          consented_at?: string
          id?: string
          ip_address?: string | null
          user_id: string
          version: string
        }
        Update: {
          consent_type?: string
          consented?: boolean
          consented_at?: string
          id?: string
          ip_address?: string | null
          user_id?: string
          version?: string
        }
        Relationships: []
      }
      moderation_queue: {
        Row: {
          action: string | null
          auto_flagged: boolean | null
          content_id: string
          content_type: string
          created_at: string
          flagged_reason: string
          id: string
          moderated_at: string | null
          moderator_id: string | null
          notes: string | null
          severity: string
          status: string
        }
        Insert: {
          action?: string | null
          auto_flagged?: boolean | null
          content_id: string
          content_type: string
          created_at?: string
          flagged_reason: string
          id?: string
          moderated_at?: string | null
          moderator_id?: string | null
          notes?: string | null
          severity?: string
          status?: string
        }
        Update: {
          action?: string | null
          auto_flagged?: boolean | null
          content_id?: string
          content_type?: string
          created_at?: string
          flagged_reason?: string
          id?: string
          moderated_at?: string | null
          moderator_id?: string | null
          notes?: string | null
          severity?: string
          status?: string
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
          created_at: string | null
          daily_book_count: number | null
          email_updates: boolean | null
          font_size: string | null
          full_name: string | null
          id: string
          last_book_date: string | null
          learning_preferences: Json | null
          new_book_alerts: boolean | null
          plan: Database["public"]["Enums"]["user_plan"] | null
          reader_theme: string | null
          spiritual_strictness: string | null
          study_speed: string | null
          theme_preference: string | null
          tts_enabled: boolean | null
          tts_minutes_used: number | null
          tts_month: string | null
          updated_at: string | null
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
          created_at?: string | null
          daily_book_count?: number | null
          email_updates?: boolean | null
          font_size?: string | null
          full_name?: string | null
          id: string
          last_book_date?: string | null
          learning_preferences?: Json | null
          new_book_alerts?: boolean | null
          plan?: Database["public"]["Enums"]["user_plan"] | null
          reader_theme?: string | null
          spiritual_strictness?: string | null
          study_speed?: string | null
          theme_preference?: string | null
          tts_enabled?: boolean | null
          tts_minutes_used?: number | null
          tts_month?: string | null
          updated_at?: string | null
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
          created_at?: string | null
          daily_book_count?: number | null
          email_updates?: boolean | null
          font_size?: string | null
          full_name?: string | null
          id?: string
          last_book_date?: string | null
          learning_preferences?: Json | null
          new_book_alerts?: boolean | null
          plan?: Database["public"]["Enums"]["user_plan"] | null
          reader_theme?: string | null
          spiritual_strictness?: string | null
          study_speed?: string | null
          theme_preference?: string | null
          tts_enabled?: boolean | null
          tts_minutes_used?: number | null
          tts_month?: string | null
          updated_at?: string | null
          writing_tone?: string | null
        }
        Relationships: []
      }
      publishing_certificates: {
        Row: {
          book_id: string
          certificate_number: string
          id: string
          isbn: string | null
          issued_at: string
          metadata: Json | null
          rights_granted: string[] | null
          user_id: string
        }
        Insert: {
          book_id: string
          certificate_number: string
          id?: string
          isbn?: string | null
          issued_at?: string
          metadata?: Json | null
          rights_granted?: string[] | null
          user_id: string
        }
        Update: {
          book_id?: string
          certificate_number?: string
          id?: string
          isbn?: string | null
          issued_at?: string
          metadata?: Json | null
          rights_granted?: string[] | null
          user_id?: string
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
      study_notes: {
        Row: {
          book_id: string
          chapter_id: string | null
          content: Json
          created_at: string
          highlighted_text: string | null
          id: string
          note_type: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          book_id: string
          chapter_id?: string | null
          content?: Json
          created_at?: string
          highlighted_text?: string | null
          id?: string
          note_type?: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          book_id?: string
          chapter_id?: string | null
          content?: Json
          created_at?: string
          highlighted_text?: string | null
          id?: string
          note_type?: string
          title?: string | null
          updated_at?: string
          user_id?: string
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
      tts_usage: {
        Row: {
          created_at: string | null
          id: string
          minutes_used: number | null
          month: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          minutes_used?: number | null
          month: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          minutes_used?: number | null
          month?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_library: {
        Row: {
          book_id: string
          created_at: string | null
          id: string
          last_read_chapter: number | null
          progress_percent: number | null
          user_id: string
        }
        Insert: {
          book_id: string
          created_at?: string | null
          id?: string
          last_read_chapter?: number | null
          progress_percent?: number | null
          user_id: string
        }
        Update: {
          book_id?: string
          created_at?: string | null
          id?: string
          last_read_chapter?: number | null
          progress_percent?: number | null
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
      book_category:
        | "theology"
        | "prophecy"
        | "science"
        | "technology"
        | "business"
        | "finance"
        | "economics"
        | "medicine"
        | "law"
        | "governance"
        | "history"
        | "african_studies"
        | "culture"
        | "philosophy"
        | "arts"
        | "fiction"
        | "non_fiction"
        | "poetry"
      user_plan: "free" | "premium" | "prophet_tier" | "student"
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
      book_category: [
        "theology",
        "prophecy",
        "science",
        "technology",
        "business",
        "finance",
        "economics",
        "medicine",
        "law",
        "governance",
        "history",
        "african_studies",
        "culture",
        "philosophy",
        "arts",
        "fiction",
        "non_fiction",
        "poetry",
      ],
      user_plan: ["free", "premium", "prophet_tier", "student"],
    },
  },
} as const
