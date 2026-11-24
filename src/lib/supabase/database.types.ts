/**
 * Tipos de la base de datos.
 *
 * Escritos a mano siguiendo el formato de `supabase gen types typescript`.
 * Si cambias el esquema, puedes regenerarlos con:
 *   npx supabase gen types typescript --project-id <id> > src/lib/supabase/database.types.ts
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          display_name: string;
          color: string;
          created_at: string;
        };
        Insert: {
          id: string;
          email: string;
          display_name: string;
          color?: string;
          created_at?: string;
        };
        Update: {
          display_name?: string;
          color?: string;
        };
        Relationships: [];
      };
      documents: {
        Row: {
          id: string;
          owner_id: string;
          title: string;
          content_preview: string;
          link_access: Database["public"]["Enums"]["link_access"];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          title?: string;
          content_preview?: string;
          link_access?: Database["public"]["Enums"]["link_access"];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          link_access?: Database["public"]["Enums"]["link_access"];
        };
        Relationships: [
          {
            foreignKeyName: "documents_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      document_members: {
        Row: {
          document_id: string;
          user_id: string;
          role: Database["public"]["Enums"]["document_role"];
          created_at: string;
        };
        Insert: {
          document_id: string;
          user_id: string;
          role: Database["public"]["Enums"]["document_role"];
          created_at?: string;
        };
        Update: {
          role?: Database["public"]["Enums"]["document_role"];
        };
        Relationships: [
          {
            foreignKeyName: "document_members_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "document_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      document_states: {
        Row: {
          document_id: string;
          /** bytea: PostgREST lo devuelve como texto hexadecimal `\x…` */
          state: string;
          updated_at: string;
        };
        Insert: {
          document_id: string;
          state: string;
          updated_at?: string;
        };
        Update: {
          state?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "document_states_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: true;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      create_document: {
        Args: { p_title?: string };
        Returns: string;
      };
      open_document: {
        Args: { p_document_id: string };
        Returns: {
          id: string;
          title: string;
          owner_id: string;
          link_access: Database["public"]["Enums"]["link_access"];
          role: Database["public"]["Enums"]["document_role"];
        }[];
      };
      add_document_member: {
        Args: {
          p_document_id: string;
          p_email: string;
          p_role: Database["public"]["Enums"]["document_role"];
        };
        Returns: string;
      };
      save_document_snapshot: {
        Args: {
          p_document_id: string;
          p_state: string;
          p_title: string;
          p_preview: string;
        };
        Returns: boolean;
      };
      document_role_for: {
        Args: { p_document_id: string };
        Returns: Database["public"]["Enums"]["document_role"];
      };
      shares_document_with: {
        Args: { p_user_id: string };
        Returns: boolean;
      };
    };
    Enums: {
      document_role: "owner" | "editor" | "viewer";
      link_access: "none" | "view" | "edit";
    };
    CompositeTypes: { [_ in never]: never };
  };
};

type PublicSchema = Database["public"];
export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"];
export type Enums<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T];
