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
      bot_files: {
        Row: {
          bot_id: string
          created_at: string
          id: string
          mime_type: string | null
          name: string
          owner_id: string | null
          size_bytes: number | null
          status: string | null
          url: string | null
        }
        Insert: {
          bot_id: string
          created_at?: string
          id?: string
          mime_type?: string | null
          name: string
          owner_id?: string | null
          size_bytes?: number | null
          status?: string | null
          url?: string | null
        }
        Update: {
          bot_id?: string
          created_at?: string
          id?: string
          mime_type?: string | null
          name?: string
          owner_id?: string | null
          size_bytes?: number | null
          status?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bot_files_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
        ]
      }
      bots: {
        Row: {
          appearance: Json | null
          avatar: string | null
          bubble_user_id: string | null
          config: Json
          created_at: string | null
          id: string
          installed: boolean
          model: string | null
          name: string | null
          owner_id: string | null
          prompt_mode: string
          public_id: string | null
          status: string | null
          system_prompt: string | null
          temperature: number | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          appearance?: Json | null
          avatar?: string | null
          bubble_user_id?: string | null
          config?: Json
          created_at?: string | null
          id?: string
          installed?: boolean
          model?: string | null
          name?: string | null
          owner_id?: string | null
          prompt_mode?: string
          public_id?: string | null
          status?: string | null
          system_prompt?: string | null
          temperature?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          appearance?: Json | null
          avatar?: string | null
          bubble_user_id?: string | null
          config?: Json
          created_at?: string | null
          id?: string
          installed?: boolean
          model?: string | null
          name?: string | null
          owner_id?: string | null
          prompt_mode?: string
          public_id?: string | null
          status?: string | null
          system_prompt?: string | null
          temperature?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      chat_sessions: {
        Row: {
          bot_id: string
          context: Json
          history: Json
          session_id: string
          updated_at: string | null
        }
        Insert: {
          bot_id: string
          context?: Json
          history?: Json
          session_id: string
          updated_at?: string | null
        }
        Update: {
          bot_id?: string
          context?: Json
          history?: Json
          session_id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      conversations: {
        Row: {
          bot_id: string
          created_at: string
          id: string
          last_message_at: string | null
          last_message_preview: string | null
          messages_count: number
          updated_at: string
          visitor_id: string
        }
        Insert: {
          bot_id: string
          created_at?: string
          id?: string
          last_message_at?: string | null
          last_message_preview?: string | null
          messages_count?: number
          updated_at?: string
          visitor_id: string
        }
        Update: {
          bot_id?: string
          created_at?: string
          id?: string
          last_message_at?: string | null
          last_message_preview?: string | null
          messages_count?: number
          updated_at?: string
          visitor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_bot_fk"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
        ]
      }
      embeddings: {
        Row: {
          bot_id: string
          content: string
          created_at: string | null
          embedding: string | null
          file_id: string
          id: string
        }
        Insert: {
          bot_id: string
          content: string
          created_at?: string | null
          embedding?: string | null
          file_id: string
          id?: string
        }
        Update: {
          bot_id?: string
          content?: string
          created_at?: string | null
          embedding?: string | null
          file_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_bot"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_file"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "bot_files"
            referencedColumns: ["id"]
          },
        ]
      }
      files: {
        Row: {
          bot_id: string
          created_at: string | null
          file_name: string
          id: string
          mime_type: string | null
          name: string | null
          processed: boolean | null
          size_bytes: number | null
          status: string | null
          storage_path: string
          url: string | null
        }
        Insert: {
          bot_id: string
          created_at?: string | null
          file_name: string
          id?: string
          mime_type?: string | null
          name?: string | null
          processed?: boolean | null
          size_bytes?: number | null
          status?: string | null
          storage_path: string
          url?: string | null
        }
        Update: {
          bot_id?: string
          created_at?: string | null
          file_name?: string
          id?: string
          mime_type?: string | null
          name?: string | null
          processed?: boolean | null
          size_bytes?: number | null
          status?: string | null
          storage_path?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_bot"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          metadata: Json | null
          role: string
          sender: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          metadata?: Json | null
          role: string
          sender: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          role?: string
          sender?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          avatar_allowed: boolean | null
          bots_limit: number | null
          branding_allowed: boolean | null
          embed_allowed: boolean | null
          files_limit: number | null
          id: string
          messages_limit: number | null
          price: number | null
        }
        Insert: {
          avatar_allowed?: boolean | null
          bots_limit?: number | null
          branding_allowed?: boolean | null
          embed_allowed?: boolean | null
          files_limit?: number | null
          id: string
          messages_limit?: number | null
          price?: number | null
        }
        Update: {
          avatar_allowed?: boolean | null
          bots_limit?: number | null
          branding_allowed?: boolean | null
          embed_allowed?: boolean | null
          files_limit?: number | null
          id?: string
          messages_limit?: number | null
          price?: number | null
        }
        Relationships: []
      }
      users: {
        Row: {
          created_at: string
          email: string
          id: string
          messages_used: number | null
          plan_id: string
          plan_status: string | null
          trial_ends_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id: string
          messages_used?: number | null
          plan_id?: string
          plan_status?: string | null
          trial_ends_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          messages_used?: number | null
          plan_id?: string
          plan_status?: string | null
          trial_ends_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_bots_limit: { Args: { u_id: string }; Returns: boolean }
      check_files_limit: { Args: { u_id: string }; Returns: boolean }
      check_messages_limit: { Args: { u_id: string }; Returns: boolean }
      consume_credits_for_user: {
        Args: { in_amount: number; in_user_id: string }
        Returns: boolean
      }
      create_bot: {
        Args: { p_bubble_user_id: string; p_config: Json; p_name: string }
        Returns: {
          appearance: Json | null
          avatar: string | null
          bubble_user_id: string | null
          config: Json
          created_at: string | null
          id: string
          installed: boolean
          model: string | null
          name: string | null
          owner_id: string | null
          prompt_mode: string
          public_id: string | null
          status: string | null
          system_prompt: string | null
          temperature: number | null
          updated_at: string | null
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "bots"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      downgrade_expired_trials: { Args: never; Returns: undefined }
      finish_bot: { Args: { p_bot_id: string }; Returns: undefined }
      get_bot_by_id: {
        Args: { p_bot_id: string }
        Returns: {
          appearance: Json | null
          avatar: string | null
          bubble_user_id: string | null
          config: Json
          created_at: string | null
          id: string
          installed: boolean
          model: string | null
          name: string | null
          owner_id: string | null
          prompt_mode: string
          public_id: string | null
          status: string | null
          system_prompt: string | null
          temperature: number | null
          updated_at: string | null
          user_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "bots"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      increment_messages_used: { Args: { u_id: string }; Returns: undefined }
      match_embeddings: {
        Args: {
          p_bot_id: string
          p_match_count?: number
          p_query_embedding: string
        }
        Returns: {
          content: string
          file_id: string
          similarity: number
        }[]
      }
      start_standard_trial: { Args: { u_id: string }; Returns: undefined }
      update_bot_appearance: {
        Args: { p_appearance: Json; p_bot_id: string }
        Returns: undefined
      }
      use_credits: {
        Args: { p_amount: number; p_user_id: string }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
