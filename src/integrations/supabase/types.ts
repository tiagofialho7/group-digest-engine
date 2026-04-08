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
      agent_message_templates: {
        Row: {
          created_at: string
          description: string | null
          id: string
          org_id: string
          template_key: string
          template_text: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          org_id: string
          template_key: string
          template_text: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          org_id?: string
          template_key?: string
          template_text?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_message_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_messages: {
        Row: {
          created_at: string
          delivered: boolean
          id: string
          message_text: string
          message_type: string
          org_id: string
          prospection_group_id: string
          sent_at: string
          whatsapp_message_id: string | null
        }
        Insert: {
          created_at?: string
          delivered?: boolean
          id?: string
          message_text: string
          message_type?: string
          org_id: string
          prospection_group_id: string
          sent_at?: string
          whatsapp_message_id?: string | null
        }
        Update: {
          created_at?: string
          delivered?: boolean
          id?: string
          message_text?: string
          message_type?: string
          org_id?: string
          prospection_group_id?: string
          sent_at?: string
          whatsapp_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_messages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_messages_prospection_group_id_fkey"
            columns: ["prospection_group_id"]
            isOneToOne: false
            referencedRelation: "prospection_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_pending_followups: {
        Row: {
          created_at: string
          followup_type: string
          id: string
          message_template: string | null
          org_id: string
          prospection_group_id: string
          resolved_at: string | null
          scheduled_for: string
          status: string
        }
        Insert: {
          created_at?: string
          followup_type: string
          id?: string
          message_template?: string | null
          org_id: string
          prospection_group_id: string
          resolved_at?: string | null
          scheduled_for: string
          status?: string
        }
        Update: {
          created_at?: string
          followup_type?: string
          id?: string
          message_template?: string | null
          org_id?: string
          prospection_group_id?: string
          resolved_at?: string | null
          scheduled_for?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_pending_followups_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_pending_followups_prospection_group_id_fkey"
            columns: ["prospection_group_id"]
            isOneToOne: false
            referencedRelation: "prospection_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_schedule_config: {
        Row: {
          agent_instructions: string | null
          check_time_1: string
          check_time_2: string
          check_time_3: string
          created_at: string
          friday: boolean
          id: string
          is_active: boolean
          monday: boolean
          org_id: string
          saturday: boolean
          sunday: boolean
          thursday: boolean
          tuesday: boolean
          updated_at: string
          wednesday: boolean
        }
        Insert: {
          agent_instructions?: string | null
          check_time_1?: string
          check_time_2?: string
          check_time_3?: string
          created_at?: string
          friday?: boolean
          id?: string
          is_active?: boolean
          monday?: boolean
          org_id: string
          saturday?: boolean
          sunday?: boolean
          thursday?: boolean
          tuesday?: boolean
          updated_at?: string
          wednesday?: boolean
        }
        Update: {
          agent_instructions?: string | null
          check_time_1?: string
          check_time_2?: string
          check_time_3?: string
          created_at?: string
          friday?: boolean
          id?: string
          is_active?: boolean
          monday?: boolean
          org_id?: string
          saturday?: boolean
          sunday?: boolean
          thursday?: boolean
          tuesday?: boolean
          updated_at?: string
          wednesday?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "agent_schedule_config_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      analyses: {
        Row: {
          created_at: string
          created_by: string | null
          group_id: string
          id: string
          period_end: string
          period_start: string
          status: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          group_id: string
          id?: string
          period_end: string
          period_start: string
          status?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          group_id?: string
          id?: string
          period_end?: string
          period_start?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "analyses_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "monitored_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      analysis_rules: {
        Row: {
          created_at: string
          group_id: string | null
          id: string
          org_id: string
          rule_text: string
        }
        Insert: {
          created_at?: string
          group_id?: string | null
          id?: string
          org_id: string
          rule_text: string
        }
        Update: {
          created_at?: string
          group_id?: string | null
          id?: string
          org_id?: string
          rule_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "analysis_rules_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "monitored_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analysis_rules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      app_secrets: {
        Row: {
          created_at: string | null
          description: string | null
          encrypted_value: string
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          encrypted_value: string
          id?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          encrypted_value?: string
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          role: string
          session_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          role: string
          session_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          role?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_sessions: {
        Row: {
          context_block_id: string
          created_at: string
          id: string
          model: string
          user_id: string
        }
        Insert: {
          context_block_id: string
          created_at?: string
          id?: string
          model?: string
          user_id: string
        }
        Update: {
          context_block_id?: string
          created_at?: string
          id?: string
          model?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_sessions_context_block_id_fkey"
            columns: ["context_block_id"]
            isOneToOne: false
            referencedRelation: "context_blocks"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          fetched_at: string | null
          id: string
          org_id: string
          phone_number: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          fetched_at?: string | null
          id?: string
          org_id: string
          phone_number: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          fetched_at?: string | null
          id?: string
          org_id?: string
          phone_number?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      context_blocks: {
        Row: {
          analysis_id: string
          answer_summary: string | null
          answered_by: string | null
          created_at: string
          id: string
          is_answered: boolean
          message_count: number
          message_ids: string[] | null
          summary: string
          title: string
        }
        Insert: {
          analysis_id: string
          answer_summary?: string | null
          answered_by?: string | null
          created_at?: string
          id?: string
          is_answered?: boolean
          message_count?: number
          message_ids?: string[] | null
          summary: string
          title: string
        }
        Update: {
          analysis_id?: string
          answer_summary?: string | null
          answered_by?: string | null
          created_at?: string
          id?: string
          is_answered?: boolean
          message_count?: number
          message_ids?: string[] | null
          summary?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "context_blocks_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_summaries: {
        Row: {
          content: Json
          created_at: string
          created_by: string | null
          group_id: string
          id: string
          summary_date: string
          updated_at: string
        }
        Insert: {
          content?: Json
          created_at?: string
          created_by?: string | null
          group_id: string
          id?: string
          summary_date: string
          updated_at?: string
        }
        Update: {
          content?: Json
          created_at?: string
          created_by?: string | null
          group_id?: string
          id?: string
          summary_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_summaries_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "monitored_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      evolution_api_configs: {
        Row: {
          api_key: string
          api_url: string
          created_at: string
          id: string
          is_connected: boolean
          org_id: string
          tested_at: string | null
          updated_at: string
        }
        Insert: {
          api_key: string
          api_url: string
          created_at?: string
          id?: string
          is_connected?: boolean
          org_id: string
          tested_at?: string | null
          updated_at?: string
        }
        Update: {
          api_key?: string
          api_url?: string
          created_at?: string
          id?: string
          is_connected?: boolean
          org_id?: string
          tested_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "evolution_api_configs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      group_knowledge_bases: {
        Row: {
          created_at: string
          group_id: string
          id: string
          knowledge_base_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          knowledge_base_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          knowledge_base_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_knowledge_bases_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "monitored_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_knowledge_bases_knowledge_base_id_fkey"
            columns: ["knowledge_base_id"]
            isOneToOne: false
            referencedRelation: "knowledge_bases"
            referencedColumns: ["id"]
          },
        ]
      }
      instance_configs: {
        Row: {
          api_key: string
          created_at: string
          id: string
          instance_name: string
          instance_type: string
          is_connected: boolean
          org_id: string
          server_url: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          api_key?: string
          created_at?: string
          id?: string
          instance_name?: string
          instance_type: string
          is_connected?: boolean
          org_id: string
          server_url?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          api_key?: string
          created_at?: string
          id?: string
          instance_name?: string
          instance_type?: string
          is_connected?: boolean
          org_id?: string
          server_url?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "instance_configs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_bases: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          name: string
          org_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          name: string
          org_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          name?: string
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_bases_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_chunks: {
        Row: {
          chunk_index: number
          content: string
          created_at: string
          embedding: string | null
          id: string
          knowledge_base_id: string
          knowledge_file_id: string
        }
        Insert: {
          chunk_index?: number
          content: string
          created_at?: string
          embedding?: string | null
          id?: string
          knowledge_base_id: string
          knowledge_file_id: string
        }
        Update: {
          chunk_index?: number
          content?: string
          created_at?: string
          embedding?: string | null
          id?: string
          knowledge_base_id?: string
          knowledge_file_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_chunks_knowledge_base_id_fkey"
            columns: ["knowledge_base_id"]
            isOneToOne: false
            referencedRelation: "knowledge_bases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_chunks_knowledge_file_id_fkey"
            columns: ["knowledge_file_id"]
            isOneToOne: false
            referencedRelation: "knowledge_files"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_files: {
        Row: {
          content_text: string | null
          created_at: string
          file_name: string
          file_path: string
          file_size: number
          file_type: string
          id: string
          knowledge_base_id: string
        }
        Insert: {
          content_text?: string | null
          created_at?: string
          file_name: string
          file_path: string
          file_size?: number
          file_type?: string
          id?: string
          knowledge_base_id: string
        }
        Update: {
          content_text?: string | null
          created_at?: string
          file_name?: string
          file_path?: string
          file_size?: number
          file_type?: string
          id?: string
          knowledge_base_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_files_knowledge_base_id_fkey"
            columns: ["knowledge_base_id"]
            isOneToOne: false
            referencedRelation: "knowledge_bases"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          created_at: string
          group_id: string
          id: string
          image_url: string | null
          message_type: string
          quoted_content: string | null
          quoted_sender: string | null
          reply_to_whatsapp_id: string | null
          sender_name: string
          sender_phone: string | null
          sent_at: string
          whatsapp_message_id: string | null
        }
        Insert: {
          content: string
          created_at?: string
          group_id: string
          id?: string
          image_url?: string | null
          message_type?: string
          quoted_content?: string | null
          quoted_sender?: string | null
          reply_to_whatsapp_id?: string | null
          sender_name: string
          sender_phone?: string | null
          sent_at?: string
          whatsapp_message_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          group_id?: string
          id?: string
          image_url?: string | null
          message_type?: string
          quoted_content?: string | null
          quoted_sender?: string | null
          reply_to_whatsapp_id?: string | null
          sender_name?: string
          sender_phone?: string | null
          sent_at?: string
          whatsapp_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "monitored_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      monitored_groups: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          org_id: string
          participant_count: number
          picture_url: string | null
          whatsapp_group_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          org_id: string
          participant_count?: number
          picture_url?: string | null
          whatsapp_group_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string
          participant_count?: number
          picture_url?: string | null
          whatsapp_group_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "monitored_groups_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_api_keys: {
        Row: {
          api_key: string
          created_at: string
          id: string
          is_valid: boolean
          org_id: string
          provider: string
          updated_at: string
        }
        Insert: {
          api_key: string
          created_at?: string
          id?: string
          is_valid?: boolean
          org_id: string
          provider: string
          updated_at?: string
        }
        Update: {
          api_key?: string
          created_at?: string
          id?: string
          is_valid?: boolean
          org_id?: string
          provider?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_api_keys_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_invites: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          org_id: string
          role: Database["public"]["Enums"]["app_role"]
          status: string
          token: string
        }
        Insert: {
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          org_id: string
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          token?: string
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          org_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_invites_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_members: {
        Row: {
          can_clone_instance: boolean
          created_at: string
          id: string
          org_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          can_clone_instance?: boolean
          created_at?: string
          id?: string
          org_id: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          can_clone_instance?: boolean
          created_at?: string
          id?: string
          org_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          logo_url: string | null
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          logo_url?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      prospection_groups: {
        Row: {
          assigned_consultants: string[] | null
          created_at: string
          current_stage: string
          group_name: string
          id: string
          is_active: boolean
          last_activity_at: string | null
          last_agent_check_at: string | null
          monitored_group_id: string | null
          notes: string | null
          org_id: string
          priority: string
          prospect_company: string | null
          prospect_name: string | null
          updated_at: string
          whatsapp_group_id: string
        }
        Insert: {
          assigned_consultants?: string[] | null
          created_at?: string
          current_stage?: string
          group_name: string
          id?: string
          is_active?: boolean
          last_activity_at?: string | null
          last_agent_check_at?: string | null
          monitored_group_id?: string | null
          notes?: string | null
          org_id: string
          priority?: string
          prospect_company?: string | null
          prospect_name?: string | null
          updated_at?: string
          whatsapp_group_id: string
        }
        Update: {
          assigned_consultants?: string[] | null
          created_at?: string
          current_stage?: string
          group_name?: string
          id?: string
          is_active?: boolean
          last_activity_at?: string | null
          last_agent_check_at?: string | null
          monitored_group_id?: string | null
          notes?: string | null
          org_id?: string
          priority?: string
          prospect_company?: string | null
          prospect_name?: string | null
          updated_at?: string
          whatsapp_group_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prospection_groups_monitored_group_id_fkey"
            columns: ["monitored_group_id"]
            isOneToOne: false
            referencedRelation: "monitored_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospection_groups_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      prospection_stage_history: {
        Row: {
          changed_by: string | null
          created_at: string
          from_stage: string | null
          id: string
          prospection_group_id: string
          reason: string | null
          to_stage: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          from_stage?: string | null
          id?: string
          prospection_group_id: string
          reason?: string | null
          to_stage: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          from_stage?: string | null
          id?: string
          prospection_group_id?: string
          reason?: string | null
          to_stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "prospection_stage_history_prospection_group_id_fkey"
            columns: ["prospection_group_id"]
            isOneToOne: false
            referencedRelation: "prospection_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      resend_configs: {
        Row: {
          api_key: string
          created_at: string
          from_email: string
          from_name: string
          id: string
          org_id: string
          updated_at: string
        }
        Insert: {
          api_key: string
          created_at?: string
          from_email: string
          from_name: string
          id?: string
          org_id: string
          updated_at?: string
        }
        Update: {
          api_key?: string
          created_at?: string
          from_email?: string
          from_name?: string
          id?: string
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "resend_configs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings: {
        Row: {
          created_at: string
          id: string
          registration_enabled: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          registration_enabled?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          registration_enabled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      webhook_logs: {
        Row: {
          created_at: string
          event_type: string
          id: string
          instance_name: string | null
          payload: Json
        }
        Insert: {
          created_at?: string
          event_type?: string
          id?: string
          instance_name?: string | null
          payload?: Json
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          instance_name?: string | null
          payload?: Json
        }
        Relationships: []
      }
      whatsapp_instance_secrets: {
        Row: {
          api_key: string
          api_url: string
          created_at: string
          id: string
          instance_id: string
          updated_at: string
          verify_token: string | null
        }
        Insert: {
          api_key?: string
          api_url?: string
          created_at?: string
          id?: string
          instance_id: string
          updated_at?: string
          verify_token?: string | null
        }
        Update: {
          api_key?: string
          api_url?: string
          created_at?: string
          id?: string
          instance_id?: string
          updated_at?: string
          verify_token?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_instance_secrets_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: true
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_instances: {
        Row: {
          created_at: string
          id: string
          instance_name: string
          instance_type: string
          is_active: boolean
          is_default: boolean
          metadata: Json | null
          name: string
          org_id: string
          phone_number: string | null
          provider_type: string
          qr_code: string | null
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          instance_name: string
          instance_type?: string
          is_active?: boolean
          is_default?: boolean
          metadata?: Json | null
          name: string
          org_id: string
          phone_number?: string | null
          provider_type?: string
          qr_code?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          instance_name?: string
          instance_type?: string
          is_active?: boolean
          is_default?: boolean
          metadata?: Json | null
          name?: string
          org_id?: string
          phone_number?: string | null
          provider_type?: string
          qr_code?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_instances_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      delete_vault_secret: { Args: { p_name: string }; Returns: undefined }
      get_vault_secret: { Args: { p_name: string }; Returns: string }
      has_org_role: {
        Args: {
          _org_id: string
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_org_member: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      match_knowledge_chunks: {
        Args: {
          filter_kb_ids?: string[]
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          content: string
          id: string
          knowledge_base_id: string
          knowledge_file_id: string
          similarity: number
        }[]
      }
      store_vault_secret: {
        Args: { p_description?: string; p_name: string; p_secret: string }
        Returns: string
      }
    }
    Enums: {
      app_role: "admin" | "member"
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
      app_role: ["admin", "member"],
    },
  },
} as const
