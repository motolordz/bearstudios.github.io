import { ClientRecord, Profile, Transaction, TransactionAnswer } from "./types";

export const MOCK_ORG_ID = "org-demo-1";

export const mockBookkeeper: Profile = {
  id: "user-bk-1",
  full_name: "Sarah Mitchell",
  role: "bookkeeper",
  organisation_id: MOCK_ORG_ID,
  email: "sarah@mitchellbooks.com.au",
};

export const mockClients: ClientRecord[] = [
  {
    id: "client-1",
    organisation_id: MOCK_ORG_ID,
    name: "Dave's Plumbing Pty Ltd",
    email: "dave@davesplumbing.com.au",
    phone: "+61 400 111 222",
    secure_link_token: "demo-dave",
  },
  {
    id: "client-2",
    organisation_id: MOCK_ORG_ID,
    name: "Luna Cafe",
    email: "hello@lunacafe.com.au",
    phone: "+61 400 333 444",
    secure_link_token: "demo-luna",
  },
];

export const mockTransactions: Transaction[] = [
  {
    id: "txn-1", organisation_id: MOCK_ORG_ID, client_id: "client-1",
    date: "2026-06-28", amount: -187.45, merchant: "Bunnings Warehouse", description: "EFTPOS BUNNINGS 4321 BELCONNEN",
    status: "unanswered", bookkeeper_notes: null,
    ai_suggested_category: "Repairs & Maintenance / Materials", ai_confidence: 0.9, final_category: null,
    gst_claimable: true, escalation_stage: "none", question_sent_at: null, answered_at: null,
  },
  {
    id: "txn-2", organisation_id: MOCK_ORG_ID, client_id: "client-1",
    date: "2026-06-27", amount: -95.2, merchant: "Caltex Fyshwick", description: "CALTEX FYSHWICK AUS",
    status: "waiting_client", bookkeeper_notes: null,
    ai_suggested_category: "Motor Vehicle — Fuel", ai_confidence: 0.85, final_category: null,
    gst_claimable: true, escalation_stage: "first_reminder", question_sent_at: "2026-06-29T09:00:00+10:00", answered_at: null,
  },
  {
    id: "txn-3", organisation_id: MOCK_ORG_ID, client_id: "client-1",
    date: "2026-06-25", amount: -1450, merchant: "ATO", description: "ATO PAYMENT 551000123456789",
    status: "reviewed", bookkeeper_notes: "Q4 BAS payment",
    ai_suggested_category: "Tax Payments (ATO)", ai_confidence: 0.95, final_category: "Tax Payments (ATO)",
    gst_claimable: false, escalation_stage: "none", question_sent_at: null, answered_at: null,
  },
  {
    id: "txn-4", organisation_id: MOCK_ORG_ID, client_id: "client-1",
    date: "2026-06-22", amount: -68.5, merchant: "Woolworths Dickson", description: "WOOLWORTHS 1234 DICKSON",
    status: "waiting_client", bookkeeper_notes: null,
    ai_suggested_category: "Groceries — possible personal", ai_confidence: 0.5, final_category: null,
    gst_claimable: null, escalation_stage: "final_reminder", question_sent_at: "2026-06-23T09:00:00+10:00", answered_at: null,
  },
  {
    id: "txn-5", organisation_id: MOCK_ORG_ID, client_id: "client-1",
    date: "2026-06-20", amount: 2200, merchant: "Deposit — J Harris", description: "OSKO DEPOSIT J HARRIS INV 1042",
    status: "answered", bookkeeper_notes: null,
    ai_suggested_category: "Sales Income", ai_confidence: 0.88, final_category: null,
    gst_claimable: null, escalation_stage: "none", question_sent_at: "2026-06-21T09:00:00+10:00", answered_at: "2026-06-21T12:14:00+10:00",
  },
  {
    id: "txn-6", organisation_id: MOCK_ORG_ID, client_id: "client-2",
    date: "2026-06-29", amount: -312.0, merchant: "Ordermentum", description: "ORDERMENTUM SYDNEY",
    status: "unanswered", bookkeeper_notes: null,
    ai_suggested_category: null, ai_confidence: null, final_category: null,
    gst_claimable: null, escalation_stage: "none", question_sent_at: null, answered_at: null,
  },
  {
    id: "txn-7", organisation_id: MOCK_ORG_ID, client_id: "client-2",
    date: "2026-06-26", amount: -129.0, merchant: "Telstra", description: "TELSTRA BILL PAYMENT",
    status: "reconciled", bookkeeper_notes: "Monthly business mobile + NBN",
    ai_suggested_category: "Telephone & Internet", ai_confidence: 0.9, final_category: "Telephone & Internet",
    gst_claimable: true, escalation_stage: "none", question_sent_at: null, answered_at: null,
  },
  {
    id: "txn-8", organisation_id: MOCK_ORG_ID, client_id: "client-2",
    date: "2026-06-24", amount: -84.9, merchant: "Officeworks Braddon", description: "OFFICEWORKS 0421 BRADDON",
    status: "answered", bookkeeper_notes: null,
    ai_suggested_category: "Office Supplies", ai_confidence: 0.9, final_category: null,
    gst_claimable: true, escalation_stage: "none", question_sent_at: "2026-06-25T09:00:00+10:00", answered_at: "2026-06-25T09:41:00+10:00",
  },
  {
    id: "txn-9", organisation_id: MOCK_ORG_ID, client_id: "client-2",
    date: "2026-06-21", amount: -56.7, merchant: "Uber Eats", description: "UBER *EATS SYDNEY",
    status: "waiting_client", bookkeeper_notes: null,
    ai_suggested_category: "Meals — possible entertainment", ai_confidence: 0.5, final_category: null,
    gst_claimable: null, escalation_stage: "second_reminder", question_sent_at: "2026-06-22T09:00:00+10:00", answered_at: null,
  },
  {
    id: "txn-10", organisation_id: MOCK_ORG_ID, client_id: "client-2",
    date: "2026-06-18", amount: -499.0, merchant: "Xero", description: "XERO AUSTRALIA SUBSCRIPTION",
    status: "reconciled", bookkeeper_notes: "Annual plan",
    ai_suggested_category: "Software & Subscriptions — Accounting", ai_confidence: 0.95, final_category: "Software & Subscriptions — Accounting",
    gst_claimable: true, escalation_stage: "none", question_sent_at: null, answered_at: null,
  },
];

export const mockAnswers: TransactionAnswer[] = [
  {
    transaction_id: "txn-5",
    who: "John Harris — customer",
    what: "Payment for invoice 1042, bathroom renovation job",
    why: "Business income",
    business_or_personal: "business",
    receipt_path: null,
    submitted_at: "2026-06-21T12:14:00+10:00",
  },
  {
    transaction_id: "txn-8",
    who: "Officeworks",
    what: "Printer paper and ink for the office",
    why: "Office supplies for the cafe admin",
    business_or_personal: "business",
    receipt_path: "receipts/client-2/txn-8.jpg",
    submitted_at: "2026-06-25T09:41:00+10:00",
  },
];
