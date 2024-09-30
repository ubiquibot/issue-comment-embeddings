import { SupabaseClient } from "@supabase/supabase-js";
import { Context } from "../types";
import { VoyageAIClient } from "voyageai";
import { Embeddings } from "./supabase/helpers/embeddings";

export function createAdapters(supabaseClient: SupabaseClient, voyage: VoyageAIClient, context: Context) {
  return {
    supabase: {
      embeddings: new Embeddings(voyage, supabaseClient, context),
    },
  };
}
