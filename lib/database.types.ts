// Generated 2026-05-20T12:00:00.000+07:00 from migrations through 0028_ai_summary_opt_in_default_true.sql
// Migrations content hash: 1650638a653a4d1beedc3c59e95390d44d97e3c0d5c2e1b619c2a7cae0f883f0
// Source: supabase gen types typescript --project-id aaiohznsqlqchsoxaqkz (kalori-dev)
// Do not edit by hand. Re-run the supabase types regen + bump the freshness marker.
// Both the `migrations through` filename AND the SHA-256 content hash must
// match the live `supabase/migrations/` directory; isTypesFileFresh enforces
// equality on both. Regenerate via `npx supabase gen types typescript
// --project-id aaiohznsqlqchsoxaqkz --schema public` then bump the markers.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.5';
  };
  public: {
    Tables: {
      alcohol_logs: {
        Row: {
          abv_percent: number;
          alcohol_grams: number;
          consumed_at: string;
          created_at: string;
          entry_id: string;
          id: string;
          user_id: string;
          volume_ml: number;
        };
        Insert: {
          abv_percent: number;
          alcohol_grams: number;
          consumed_at: string;
          created_at?: string;
          entry_id: string;
          id?: string;
          user_id: string;
          volume_ml: number;
        };
        Update: {
          abv_percent?: number;
          alcohol_grams?: number;
          consumed_at?: string;
          created_at?: string;
          entry_id?: string;
          id?: string;
          user_id?: string;
          volume_ml?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'alcohol_logs_entry_id_fkey';
            columns: ['entry_id'];
            isOneToOne: true;
            referencedRelation: 'food_entries';
            referencedColumns: ['id'];
          },
        ];
      };
      ai_call_log: {
        Row: {
          cached_flag: boolean;
          call_type: string;
          client_id: string | null;
          cost_estimate: number;
          created_at: string;
          id: string;
          input_hash: string;
          latency_ms: number;
          tokens: number;
          user_id: string;
        };
        Insert: {
          cached_flag: boolean;
          call_type: string;
          client_id?: string | null;
          cost_estimate?: number;
          created_at?: string;
          id?: string;
          input_hash: string;
          latency_ms: number;
          tokens?: number;
          user_id: string;
        };
        Update: {
          cached_flag?: boolean;
          call_type?: string;
          client_id?: string | null;
          cost_estimate?: number;
          created_at?: string;
          id?: string;
          input_hash?: string;
          latency_ms?: number;
          tokens?: number;
          user_id?: string;
        };
        Relationships: [];
      };
      ai_response_cache: {
        Row: {
          call_type: string;
          created_at: string;
          expires_at: string;
          input_hash: string;
          parsed_payload: Json;
          user_id: string;
        };
        Insert: {
          call_type: string;
          created_at?: string;
          expires_at: string;
          input_hash: string;
          parsed_payload: Json;
          user_id: string;
        };
        Update: {
          call_type?: string;
          created_at?: string;
          expires_at?: string;
          input_hash?: string;
          parsed_payload?: Json;
          user_id?: string;
        };
        Relationships: [];
      };
      food_library_recipes: {
        Row: {
          created_at: string;
          id: string;
          input_hash: string;
          library_item_id: string;
          model: string;
          prompt_version: string;
          recipe: Json;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          input_hash: string;
          library_item_id: string;
          model: string;
          prompt_version: string;
          recipe: Json;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          input_hash?: string;
          library_item_id?: string;
          model?: string;
          prompt_version?: string;
          recipe?: Json;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'food_library_recipes_library_item_owner_fk';
            columns: ['library_item_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'food_library_items';
            referencedColumns: ['id', 'user_id'];
          },
        ];
      };
      food_entries: {
        Row: {
          ai_reasoning: string | null;
          client_id: string;
          created_at_server: string;
          id: string;
          items: Json;
          library_item_id: string | null;
          logged_at: string;
          meal_category: string;
          source: string;
          user_id: string;
        };
        Insert: {
          ai_reasoning?: string | null;
          client_id: string;
          created_at_server?: string;
          id?: string;
          items: Json;
          library_item_id?: string | null;
          logged_at: string;
          meal_category: string;
          source: string;
          user_id: string;
        };
        Update: {
          ai_reasoning?: string | null;
          client_id?: string;
          created_at_server?: string;
          id?: string;
          items?: Json;
          library_item_id?: string | null;
          logged_at?: string;
          meal_category?: string;
          source?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'food_entries_library_item_id_fkey';
            columns: ['library_item_id'];
            isOneToOne: false;
            referencedRelation: 'food_library_items';
            referencedColumns: ['id'];
          },
        ];
      };
      food_library_items: {
        Row: {
          client_id: string;
          created_at: string;
          created_from: string;
          default_portion: number | null;
          default_unit: string | null;
          deleted_at: string | null;
          display_name: string;
          id: string;
          last_used_at: string | null;
          log_count: number;
          normalized_name: string;
          nutrition: Json;
          recipe_eligibility: string;
          recipe_eligibility_checked_at: string | null;
          recipe_eligibility_reason: string | null;
          sketch_attempt_count: number;
          sketch_generated_at: string | null;
          sketch_last_error: string | null;
          thumbnail_kind: string | null;
          thumbnail_url: string | null;
          user_edited_flag: boolean;
          user_id: string;
        };
        Insert: {
          client_id: string;
          created_at?: string;
          created_from: string;
          default_portion?: number | null;
          default_unit?: string | null;
          deleted_at?: string | null;
          display_name: string;
          id?: string;
          last_used_at?: string | null;
          log_count?: number;
          normalized_name: string;
          nutrition: Json;
          recipe_eligibility?: string;
          recipe_eligibility_checked_at?: string | null;
          recipe_eligibility_reason?: string | null;
          sketch_attempt_count?: number;
          sketch_generated_at?: string | null;
          sketch_last_error?: string | null;
          thumbnail_kind?: string | null;
          thumbnail_url?: string | null;
          user_edited_flag?: boolean;
          user_id: string;
        };
        Update: {
          client_id?: string;
          created_at?: string;
          created_from?: string;
          default_portion?: number | null;
          default_unit?: string | null;
          deleted_at?: string | null;
          display_name?: string;
          id?: string;
          last_used_at?: string | null;
          log_count?: number;
          normalized_name?: string;
          nutrition?: Json;
          recipe_eligibility?: string;
          recipe_eligibility_checked_at?: string | null;
          recipe_eligibility_reason?: string | null;
          sketch_attempt_count?: number;
          sketch_generated_at?: string | null;
          sketch_last_error?: string | null;
          thumbnail_kind?: string | null;
          thumbnail_url?: string | null;
          user_edited_flag?: boolean;
          user_id?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          activity_level: string;
          age: number;
          ai_summary_opt_in: boolean;
          allergens: string[];
          birthday: string | null;
          bio_sex: string;
          bmr: number | null;
          calorie_target: number | null;
          created_at: string;
          current_weight_kg: number;
          deleting_at: string | null;
          dietary_prefs: string[];
          goal_pace: string | null;
          goal_weight_kg: number | null;
          height_cm: number;
          id: string;
          last_dashboard_visit_at: string | null;
          last_target_recalc_at: string | null;
          manual_override_value: number | null;
          onboarding_completed_at: string | null;
          recalc_threshold_pct: number;
          region: string | null;
          target_mode: string;
          tdee: number | null;
          timezone: string;
          unit_pref: string;
          updated_at: string;
        };
        Insert: {
          activity_level: string;
          age: number;
          ai_summary_opt_in?: boolean;
          allergens?: string[];
          birthday?: string | null;
          bio_sex: string;
          bmr?: number | null;
          calorie_target?: number | null;
          created_at?: string;
          current_weight_kg: number;
          deleting_at?: string | null;
          dietary_prefs?: string[];
          goal_pace?: string | null;
          goal_weight_kg?: number | null;
          height_cm: number;
          id: string;
          last_dashboard_visit_at?: string | null;
          last_target_recalc_at?: string | null;
          manual_override_value?: number | null;
          onboarding_completed_at?: string | null;
          recalc_threshold_pct?: number;
          region?: string | null;
          target_mode?: string;
          tdee?: number | null;
          timezone?: string;
          unit_pref?: string;
          updated_at?: string;
        };
        Update: {
          activity_level?: string;
          age?: number;
          ai_summary_opt_in?: boolean;
          allergens?: string[];
          birthday?: string | null;
          bio_sex?: string;
          bmr?: number | null;
          calorie_target?: number | null;
          created_at?: string;
          current_weight_kg?: number;
          deleting_at?: string | null;
          dietary_prefs?: string[];
          goal_pace?: string | null;
          goal_weight_kg?: number | null;
          height_cm?: number;
          id?: string;
          last_dashboard_visit_at?: string | null;
          last_target_recalc_at?: string | null;
          manual_override_value?: number | null;
          onboarding_completed_at?: string | null;
          recalc_threshold_pct?: number;
          region?: string | null;
          target_mode?: string;
          tdee?: number | null;
          timezone?: string;
          unit_pref?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      water_log: {
        Row: {
          client_id: string;
          count: number;
          created_at: string;
          date: string;
          id: string;
          unit: string;
          user_id: string;
        };
        Insert: {
          client_id: string;
          count: number;
          created_at?: string;
          date: string;
          id?: string;
          unit: string;
          user_id: string;
        };
        Update: {
          client_id?: string;
          count?: number;
          created_at?: string;
          date?: string;
          id?: string;
          unit?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      weekly_reviews: {
        Row: {
          expires_at: string;
          generated_at: string;
          id: string;
          insights: Json;
          user_id: string;
          week_start_on: string;
        };
        Insert: {
          expires_at: string;
          generated_at?: string;
          id?: string;
          insights: Json;
          user_id: string;
          week_start_on: string;
        };
        Update: {
          expires_at?: string;
          generated_at?: string;
          id?: string;
          insights?: Json;
          user_id?: string;
          week_start_on?: string;
        };
        Relationships: [];
      };
      weight_log: {
        Row: {
          client_id: string;
          created_at: string;
          date: string;
          id: string;
          note: string | null;
          user_id: string;
          weight_kg: number;
        };
        Insert: {
          client_id: string;
          created_at?: string;
          date: string;
          id?: string;
          note?: string | null;
          user_id: string;
          weight_kg: number;
        };
        Update: {
          client_id?: string;
          created_at?: string;
          date?: string;
          id?: string;
          note?: string | null;
          user_id?: string;
          weight_kg?: number;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      delete_user_data: { Args: { p_user_id: string }; Returns: undefined };
      library_merge_atomic: {
        Args: {
          p_client_id: string;
          p_fields: Json;
          p_loser_id: string;
          p_winner_id: string;
        };
        Returns: Json;
      };
      log_water_with_cap: {
        Args: {
          p_client_id: string;
          p_count: number;
          p_date: string;
          p_unit: string;
        };
        Returns: Json;
      };
      set_account_deleting: { Args: { p_user_id: string }; Returns: undefined };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
