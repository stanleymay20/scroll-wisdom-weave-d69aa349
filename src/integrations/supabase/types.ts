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
          category: Database["public"]["Enums"]["book_category"]
          cover_image_url: string | null
          created_at: string | null
          description: string | null
          id: string
          is_featured: boolean | null
          is_published: boolean | null
          title: string
          total_chapters: number | null
          updated_at: string | null
        }
        Insert: {
          author_ai_agent?: string | null
          category: Database["public"]["Enums"]["book_category"]
          cover_image_url?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_featured?: boolean | null
          is_published?: boolean | null
          title: string
          total_chapters?: number | null
          updated_at?: string | null
        }
        Update: {
          author_ai_agent?: string | null
          category?: Database["public"]["Enums"]["book_category"]
          cover_image_url?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_featured?: boolean | null
          is_published?: boolean | null
          title?: string
          total_chapters?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      chapters: {
        Row: {
          book_id: string
          chapter_number: number
          content: string | null
          created_at: string | null
          id: string
          is_generated: boolean | null
          title: string
          updated_at: string | null
          word_count: number | null
        }
        Insert: {
          book_id: string
          chapter_number: number
          content?: string | null
          created_at?: string | null
          id?: string
          is_generated?: boolean | null
          title: string
          updated_at?: string | null
          word_count?: number | null
        }
        Update: {
          book_id?: string
          chapter_number?: number
          content?: string | null
          created_at?: string | null
          id?: string
          is_generated?: boolean | null
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
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          full_name: string | null
          id: string
          plan: Database["public"]["Enums"]["user_plan"] | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          full_name?: string | null
          id: string
          plan?: Database["public"]["Enums"]["user_plan"] | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          full_name?: string | null
          id?: string
          plan?: Database["public"]["Enums"]["user_plan"] | null
          updated_at?: string | null
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
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
      user_plan: "free" | "premium" | "prophet_tier"
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
      user_plan: ["free", "premium", "prophet_tier"],
    },
  },
} as const
