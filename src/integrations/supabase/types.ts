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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          created_at: string
          id: string
          key: string
          knowledge_base_file_id: string | null
          knowledge_base_file_name: string | null
          knowledge_base_updated_at: string | null
          updated_at: string
          value: Json
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          knowledge_base_file_id?: string | null
          knowledge_base_file_name?: string | null
          knowledge_base_updated_at?: string | null
          updated_at?: string
          value?: Json
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          knowledge_base_file_id?: string | null
          knowledge_base_file_name?: string | null
          knowledge_base_updated_at?: string | null
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      call_analyses: {
        Row: {
          created_at: string
          customer_name: string | null
          customer_number: string | null
          decision_maker_name: string | null
          decision_maker_phone: string | null
          duration_seconds: number | null
          email_collected: string | null
          ended_reason: string | null
          forwarded_at: string | null
          forwarded_to_make: boolean | null
          gatekeeper_detected: boolean
          id: string
          intent: string | null
          is_interested: boolean | null
          meeting_confirmed: boolean | null
          meeting_datetime: string | null
          meeting_notes: string | null
          needs_recall: boolean
          raw_analysis: Json | null
          recall_action_summary: string | null
          recall_handled: boolean
          recall_handled_at: string | null
          recall_number: string | null
          recall_reason: string | null
          recording_url: string | null
          sms_sent: boolean
          sms_sent_at: string | null
          summary: string | null
          summary_email_sent_at: string | null
          tone: string | null
          tone_reason: string | null
          transcript: string | null
          updated_at: string
          vapi_call_id: string
        }
        Insert: {
          created_at?: string
          customer_name?: string | null
          customer_number?: string | null
          decision_maker_name?: string | null
          decision_maker_phone?: string | null
          duration_seconds?: number | null
          email_collected?: string | null
          ended_reason?: string | null
          forwarded_at?: string | null
          forwarded_to_make?: boolean | null
          gatekeeper_detected?: boolean
          id?: string
          intent?: string | null
          is_interested?: boolean | null
          meeting_confirmed?: boolean | null
          meeting_datetime?: string | null
          meeting_notes?: string | null
          needs_recall?: boolean
          raw_analysis?: Json | null
          recall_action_summary?: string | null
          recall_handled?: boolean
          recall_handled_at?: string | null
          recall_number?: string | null
          recall_reason?: string | null
          recording_url?: string | null
          sms_sent?: boolean
          sms_sent_at?: string | null
          summary?: string | null
          summary_email_sent_at?: string | null
          tone?: string | null
          tone_reason?: string | null
          transcript?: string | null
          updated_at?: string
          vapi_call_id: string
        }
        Update: {
          created_at?: string
          customer_name?: string | null
          customer_number?: string | null
          decision_maker_name?: string | null
          decision_maker_phone?: string | null
          duration_seconds?: number | null
          email_collected?: string | null
          ended_reason?: string | null
          forwarded_at?: string | null
          forwarded_to_make?: boolean | null
          gatekeeper_detected?: boolean
          id?: string
          intent?: string | null
          is_interested?: boolean | null
          meeting_confirmed?: boolean | null
          meeting_datetime?: string | null
          meeting_notes?: string | null
          needs_recall?: boolean
          raw_analysis?: Json | null
          recall_action_summary?: string | null
          recall_handled?: boolean
          recall_handled_at?: string | null
          recall_number?: string | null
          recall_reason?: string | null
          recording_url?: string | null
          sms_sent?: boolean
          sms_sent_at?: string | null
          summary?: string | null
          summary_email_sent_at?: string | null
          tone?: string | null
          tone_reason?: string | null
          transcript?: string | null
          updated_at?: string
          vapi_call_id?: string
        }
        Relationships: []
      }
      call_jobs: {
        Row: {
          attempts: number
          contact_id: string
          created_at: string
          id: string
          last_error: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          priority: number
          scheduled_at: string
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          contact_id: string
          created_at?: string
          id?: string
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          priority?: number
          scheduled_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          contact_id?: string
          created_at?: string
          id?: string
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          priority?: number
          scheduled_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      campaigns: {
        Row: {
          assistant_id: string | null
          called_count: number
          created_at: string
          delay_seconds: number
          id: string
          max_attempts: number
          name: string
          phone_number_id: string | null
          script: string | null
          status: string
          total_contacts: number
          updated_at: string
        }
        Insert: {
          assistant_id?: string | null
          called_count?: number
          created_at?: string
          delay_seconds?: number
          id?: string
          max_attempts?: number
          name: string
          phone_number_id?: string | null
          script?: string | null
          status?: string
          total_contacts?: number
          updated_at?: string
        }
        Update: {
          assistant_id?: string | null
          called_count?: number
          created_at?: string
          delay_seconds?: number
          id?: string
          max_attempts?: number
          name?: string
          phone_number_id?: string | null
          script?: string | null
          status?: string
          total_contacts?: number
          updated_at?: string
        }
        Relationships: []
      }
      contacts: {
        Row: {
          attempt_count: number
          business_type: string | null
          campaign_id: string | null
          company: string | null
          created_at: string
          decision_maker_contact_id: string | null
          decision_maker_name: string | null
          decision_maker_phone: string | null
          email: string | null
          email_collected: string | null
          id: string
          interest: string | null
          is_gatekeeper: boolean
          last_call_at: string | null
          last_failure_reason: string | null
          last_vapi_call_id: string | null
          name: string
          needs_approval_reason: string | null
          next_call_at: string | null
          notes: string | null
          phone: string
          priority: number
          recall_number: string | null
          recall_number_acknowledged: boolean
          source: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          business_type?: string | null
          campaign_id?: string | null
          company?: string | null
          created_at?: string
          decision_maker_contact_id?: string | null
          decision_maker_name?: string | null
          decision_maker_phone?: string | null
          email?: string | null
          email_collected?: string | null
          id?: string
          interest?: string | null
          is_gatekeeper?: boolean
          last_call_at?: string | null
          last_failure_reason?: string | null
          last_vapi_call_id?: string | null
          name: string
          needs_approval_reason?: string | null
          next_call_at?: string | null
          notes?: string | null
          phone: string
          priority?: number
          recall_number?: string | null
          recall_number_acknowledged?: boolean
          source?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          business_type?: string | null
          campaign_id?: string | null
          company?: string | null
          created_at?: string
          decision_maker_contact_id?: string | null
          decision_maker_name?: string | null
          decision_maker_phone?: string | null
          email?: string | null
          email_collected?: string | null
          id?: string
          interest?: string | null
          is_gatekeeper?: boolean
          last_call_at?: string | null
          last_failure_reason?: string | null
          last_vapi_call_id?: string | null
          name?: string
          needs_approval_reason?: string | null
          next_call_at?: string | null
          notes?: string | null
          phone?: string
          priority?: number
          recall_number?: string | null
          recall_number_acknowledged?: boolean
          source?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_campaign_fk"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      email_tokens: {
        Row: {
          call_id: string
          created_at: string
          email: string | null
          expires_at: string
          id: string
          phone: string
          token: string
          used: boolean
        }
        Insert: {
          call_id: string
          created_at?: string
          email?: string | null
          expires_at: string
          id?: string
          phone: string
          token?: string
          used?: boolean
        }
        Update: {
          call_id?: string
          created_at?: string
          email?: string | null
          expires_at?: string
          id?: string
          phone?: string
          token?: string
          used?: boolean
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      system_events: {
        Row: {
          contact_id: string | null
          created_at: string
          event_type: string
          id: string
          job_id: string | null
          message: string | null
          metadata: Json
          severity: string
          vapi_call_id: string | null
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          job_id?: string | null
          message?: string | null
          metadata?: Json
          severity?: string
          vapi_call_id?: string | null
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          job_id?: string | null
          message?: string | null
          metadata?: Json
          severity?: string
          vapi_call_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_call_jobs: {
        Args: { p_limit: number; p_worker: string }
        Returns: {
          attempts: number
          contact_id: string
          created_at: string
          id: string
          last_error: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          priority: number
          scheduled_at: string
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "call_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
