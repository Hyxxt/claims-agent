import data from "@/data/policy.json";

export type PolicySection = {
  heading: string;
  text: string;
};

export type PolicyDocument = {
  title: string;
  sections: PolicySection[];
};

export type ClaimGuide = {
  claimType: string;
  title: string;
  steps: string[];
  materials: string[];
  tips: string;
};

export type PolicyData = {
  product: string;
  disclaimer: string;
  documents: PolicyDocument[];
  guides: ClaimGuide[];
};

export const POLICY_DATA = data as PolicyData;

/** 每一条条款 → 一个 chunk（标题 + 正文一起建索引，检索时能带回条款号） */
export function policySections(): { title: string; chunks: string[] }[] {
  return POLICY_DATA.documents.map((document) => ({
    title: document.title,
    chunks: document.sections.map(
      (section) => `${section.heading}\n${section.text}`,
    ),
  }));
}
