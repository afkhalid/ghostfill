import type { DetectedField, FieldFillData } from "./types";

const FIRST_NAMES = ["James", "Sarah", "Michael", "Emma", "Robert", "Olivia", "David", "Sophia", "Daniel", "Isabella", "Ahmed", "Fatima", "Carlos", "Yuki", "Priya"];
const LAST_NAMES = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Wilson", "Anderson", "Taylor", "Thomas", "Moore", "Martin", "Lee"];
const COMPANIES = ["Acme Corp", "TechVault Inc", "Nexus Solutions", "Blue Ridge Systems", "Summit Digital", "CloudPeak Ltd", "DataForge Labs", "Apex Industries"];
const CITIES = ["New York", "San Francisco", "Chicago", "Austin", "Seattle", "Boston", "Denver", "Portland"];
const STREETS = ["123 Oak Street", "456 Maple Ave", "789 Pine Road", "321 Elm Blvd", "654 Cedar Lane", "987 Birch Drive"];
const DOMAINS = ["gmail.com", "outlook.com", "yahoo.com", "company.com", "example.com"];
const LOREM = ["Project planning and requirements gathering", "Implementation of core features", "Stakeholder review session", "Technical design workshop", "Sprint retrospective and planning", "Customer onboarding process", "Data migration strategy", "Integration testing phase"];
const TITLES = ["Discovery Workshop", "Requirements Review", "Design Sprint", "Technical Assessment", "Strategy Session", "Kick-off Meeting", "UAT Planning", "Go-Live Preparation"];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randDate(futureMonths = 6): string {
  const now = new Date();
  const future = new Date(now.getTime() + randInt(1, futureMonths * 30) * 86400000);
  return future.toISOString().slice(0, 10);
}

function randDateTime(futureMonths = 6): string {
  const now = new Date();
  const future = new Date(now.getTime() + randInt(1, futureMonths * 30) * 86400000);
  future.setHours(randInt(8, 18), randInt(0, 3) * 15, 0);
  return future.toISOString().slice(0, 16);
}

function generateForField(field: DetectedField, context: { firstName: string; lastName: string; email: string; company: string }): string {
  const label = field.label.toLowerCase();

  // Select — pick a random option, or signal "pick first" if no options known
  if (field.type === "select") {
    if (field.options?.length) return pick(field.options);
    return "__FIRST__";
  }

  // Dates
  if (field.type === "date") return randDate();
  if (field.type === "datetime-local") return randDateTime();
  if (field.type === "time") return `${String(randInt(8, 18)).padStart(2, "0")}:${String(randInt(0, 3) * 15).padStart(2, "0")}`;
  if (field.type === "month") {
    const d = new Date();
    d.setMonth(d.getMonth() + randInt(0, 6));
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  // Email
  if (field.type === "email" || label.includes("email")) {
    return context.email;
  }

  // Phone
  if (field.type === "tel" || label.includes("phone") || label.includes("mobile")) {
    return `+1${randInt(200, 999)}${randInt(100, 999)}${randInt(1000, 9999)}`;
  }

  // URL
  if (field.type === "url" || label.includes("website") || label.includes("url")) {
    return `https://www.${context.company.toLowerCase().replace(/\s+/g, "")}.com`;
  }

  // Number
  if (field.type === "number" || field.type === "range") {
    const min = field.min ? parseInt(field.min) : 1;
    const max = field.max ? parseInt(field.max) : 100;
    return String(randInt(min, max));
  }

  // Name fields
  if (label.includes("first name") || label.includes("firstname")) return context.firstName;
  if (label.includes("last name") || label.includes("lastname") || label.includes("surname")) return context.lastName;
  if (label.includes("full name") || label === "name") return `${context.firstName} ${context.lastName}`;

  // Company
  if (label.includes("company") || label.includes("organization") || label.includes("business")) return context.company;

  // Address
  if (label.includes("address") || label.includes("street")) return pick(STREETS);
  if (label.includes("city")) return pick(CITIES);
  if (label.includes("state")) return pick(["California", "New York", "Texas", "Florida", "Washington"]);
  if (label.includes("zip") || label.includes("postal")) return String(randInt(10000, 99999));
  if (label.includes("country")) return "United States";

  // Title-like
  if (label.includes("title") || label.includes("subject") || label.includes("name")) {
    return pick(TITLES);
  }

  // Job
  if (label.includes("job") || label.includes("role") || label.includes("position")) {
    return pick(["Software Engineer", "Product Manager", "Business Analyst", "Solution Architect", "Project Manager"]);
  }

  // Location / Channel
  if (label.includes("location") || label.includes("channel") || label.includes("venue")) {
    return pick(["Microsoft Teams", "Zoom", "Google Meet", "On-site", "Conference Room A"]);
  }

  // Description / Notes / Objective / Goal
  if (field.type === "textarea" || label.includes("description") || label.includes("note") || label.includes("comment") || label.includes("objective") || label.includes("goal")) {
    return pick(LOREM);
  }

  // Password
  if (field.type === "password") return "P@ssw0rd123!";

  // Generic text fallback
  return pick([context.firstName, context.company, pick(TITLES)]);
}

/** Generate fake data for all fields without calling an API */
export function generateFakeData(fields: DetectedField[]): FieldFillData[] {
  // Create a coherent identity for this fill
  const firstName = pick(FIRST_NAMES);
  const lastName = pick(LAST_NAMES);
  const company = pick(COMPANIES);
  const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${pick(DOMAINS)}`;
  const context = { firstName, lastName, email, company };

  return fields.map((field, index) => {
    if (field.type === "checkbox") {
      return { index, value: "true", checked: true };
    }

    const value = generateForField(field, context);
    return { index, value };
  });
}
