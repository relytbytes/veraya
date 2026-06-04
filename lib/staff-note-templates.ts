// Structured prompts for staff documentation (#14). Positive (commendation) and
// disciplinary (corrective action) reports follow a consistent format so the
// record is clear and defensible — important for liability.

export type StaffNoteType = "GENERAL" | "POSITIVE" | "DISCIPLINARY";

export const STAFF_NOTE_TYPES: { value: StaffNoteType; label: string; hint: string }[] = [
  { value: "GENERAL", label: "General note", hint: "An everyday observation or reminder." },
  { value: "POSITIVE", label: "Positive action report", hint: "Recognize great work — builds a balanced record." },
  { value: "DISCIPLINARY", label: "Disciplinary / corrective action", hint: "Document an issue, the conversation, and next steps." },
];

export const STAFF_NOTE_TEMPLATES: Record<StaffNoteType, string> = {
  GENERAL: "",
  POSITIVE: [
    "POSITIVE ACTION REPORT",
    "",
    "Date of incident: ",
    "What happened: ",
    "Why it stood out (impact on guests / team): ",
    "Recognition given: ",
  ].join("\n"),
  DISCIPLINARY: [
    "CORRECTIVE ACTION REPORT",
    "",
    "Date of incident: ",
    "Policy / expectation involved: ",
    "What happened (facts, who/what/when): ",
    "Prior conversations or warnings: ",
    "Corrective action / expectation going forward: ",
    "Consequence if not corrected: ",
    "Employee response: ",
  ].join("\n"),
};

export const STAFF_NOTE_BADGE: Record<StaffNoteType, { label: string; cls: string }> = {
  GENERAL: { label: "Note", cls: "bg-gray-100 text-gray-600 border-gray-200" },
  POSITIVE: { label: "Positive", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  DISCIPLINARY: { label: "Disciplinary", cls: "bg-red-100 text-red-700 border-red-200" },
};
