export type Role = "owner" | "admin" | "bookkeeper" | "accountant" | "client";

/** Roles allowed to be invited to an organisation's team */
export type TeamRole = "admin" | "bookkeeper" | "accountant";

export type TransactionStatus =
  | "unanswered"
  | "waiting_client"
  | "answered"
  | "reviewed"
  | "reconciled";

export type EscalationStage = "none" | "first_reminder" | "second_reminder" | "final_reminder";

export interface Profile {
  id: string;
  full_name: string;
  role: Role;
  organisation_id: string;
  email: string;
}

export interface ClientRecord {
  id: string;
  organisation_id: string;
  name: string;
  email: string;
  phone: string;
  secure_link_token: string;
  business_name?: string | null;
  contact_person?: string | null;
  abn?: string | null;
  archived?: boolean;
  tags?: string[];
  bookkeeping_status?: string;
  xero_contact_id?: string | null;
}

export interface TeamMember {
  id: string;
  full_name: string;
  email: string;
  role: Role;
}

export interface TeamInvitation {
  id: string;
  email: string;
  role: TeamRole;
  token: string;
  accepted_at: string | null;
  expires_at: string;
  created_at: string;
}

export interface Transaction {
  id: string;
  organisation_id: string;
  client_id: string;
  date: string;
  amount: number;
  merchant: string;
  description: string;
  status: TransactionStatus;
  bookkeeper_notes: string | null;
  ai_suggested_category: string | null;
  ai_confidence: number | null;
  final_category: string | null;
  gst_claimable: boolean | null;
  escalation_stage: EscalationStage;
  question_sent_at: string | null;
  answered_at: string | null;
}

export interface TransactionAnswer {
  transaction_id: string;
  who: string;
  what: string;
  why: string;
  business_or_personal: "business" | "personal" | "mixed";
  receipt_path: string | null;
  submitted_at: string;
}

export interface AiResult {
  suggested_category: string;
  confidence: number; // 0..1
  gst_claimable: boolean;
  needs_more_info: boolean;
  follow_up_question: string | null;
}
