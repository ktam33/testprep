import { CategoryDefinition, Section } from '@/types';

// The full 57-category PreACT 9 Secure skill taxonomy.
// Mirrors plan/PreACT_Master_Skill_Categories.md — keep the two in sync if that doc changes.
export const CATEGORIES: CategoryDefinition[] = [
  // ---- English (16) ----
  { section: 'english', groupName: 'Grammar & Usage', name: 'Subject-Verb Agreement', sortOrder: 0 },
  { section: 'english', groupName: 'Grammar & Usage', name: 'Pronouns', sortOrder: 1 },
  { section: 'english', groupName: 'Grammar & Usage', name: 'Verb Tense & Consistency', sortOrder: 2 },
  { section: 'english', groupName: 'Grammar & Usage', name: 'Modifiers', sortOrder: 3 },
  { section: 'english', groupName: 'Grammar & Usage', name: 'Parallel Structure', sortOrder: 4 },
  { section: 'english', groupName: 'Punctuation', name: 'Commas', sortOrder: 5 },
  { section: 'english', groupName: 'Punctuation', name: 'Apostrophes', sortOrder: 6 },
  { section: 'english', groupName: 'Punctuation', name: 'Semicolons & Colons', sortOrder: 7 },
  { section: 'english', groupName: 'Punctuation', name: 'End Punctuation & Quotation Marks', sortOrder: 8 },
  { section: 'english', groupName: 'Sentence Structure', name: 'Sentence Fragments', sortOrder: 9 },
  { section: 'english', groupName: 'Sentence Structure', name: 'Run-ons & Comma Splices', sortOrder: 10 },
  { section: 'english', groupName: 'Sentence Structure', name: 'Sentence Combining & Transitions', sortOrder: 11 },
  { section: 'english', groupName: 'Rhetorical Skills', name: 'Organization & Paragraph Structure', sortOrder: 12 },
  { section: 'english', groupName: 'Rhetorical Skills', name: 'Main Idea & Supporting Details', sortOrder: 13 },
  { section: 'english', groupName: 'Rhetorical Skills', name: 'Style, Tone & Conciseness', sortOrder: 14 },
  { section: 'english', groupName: 'Rhetorical Skills', name: 'Purpose & Audience', sortOrder: 15 },

  // ---- Math (18) ----
  { section: 'math', groupName: 'Number Sense', name: 'Operations with Integers, Fractions & Decimals', sortOrder: 0 },
  { section: 'math', groupName: 'Number Sense', name: 'Ratios, Rates & Proportions', sortOrder: 1 },
  { section: 'math', groupName: 'Number Sense', name: 'Percents', sortOrder: 2 },
  { section: 'math', groupName: 'Number Sense', name: 'Exponents & Square Roots', sortOrder: 3 },
  { section: 'math', groupName: 'Algebra', name: 'Simplifying Expressions', sortOrder: 4 },
  { section: 'math', groupName: 'Algebra', name: 'Linear Equations', sortOrder: 5 },
  { section: 'math', groupName: 'Algebra', name: 'Inequalities', sortOrder: 6 },
  { section: 'math', groupName: 'Algebra', name: 'Functions & Function Notation', sortOrder: 7 },
  { section: 'math', groupName: 'Algebra', name: 'Patterns & Sequences', sortOrder: 8 },
  { section: 'math', groupName: 'Coordinate Geometry', name: 'Coordinate Plane & Graphing', sortOrder: 9 },
  { section: 'math', groupName: 'Coordinate Geometry', name: 'Slope & Linear Relationships', sortOrder: 10 },
  { section: 'math', groupName: 'Geometry', name: 'Angles & Triangles', sortOrder: 11 },
  { section: 'math', groupName: 'Geometry', name: 'Quadrilaterals & Polygons', sortOrder: 12 },
  { section: 'math', groupName: 'Geometry', name: 'Circles', sortOrder: 13 },
  { section: 'math', groupName: 'Geometry', name: 'Area & Perimeter', sortOrder: 14 },
  { section: 'math', groupName: 'Geometry', name: 'Surface Area & Volume', sortOrder: 15 },
  { section: 'math', groupName: 'Data Analysis', name: 'Statistics & Probability', sortOrder: 16 },
  { section: 'math', groupName: 'Modeling', name: 'Word Problems & Mathematical Modeling', sortOrder: 17 },

  // ---- Reading (12) ----
  { section: 'reading', groupName: 'Comprehension', name: 'Main Idea', sortOrder: 0 },
  { section: 'reading', groupName: 'Comprehension', name: 'Supporting Details', sortOrder: 1 },
  { section: 'reading', groupName: 'Comprehension', name: 'Sequence & Organization', sortOrder: 2 },
  { section: 'reading', groupName: 'Vocabulary', name: 'Vocabulary in Context', sortOrder: 3 },
  { section: 'reading', groupName: 'Vocabulary', name: 'Phrase Meaning', sortOrder: 4 },
  { section: 'reading', groupName: 'Reasoning', name: 'Inference', sortOrder: 5 },
  { section: 'reading', groupName: 'Reasoning', name: "Author's Purpose", sortOrder: 6 },
  { section: 'reading', groupName: 'Reasoning', name: 'Tone & Point of View', sortOrder: 7 },
  { section: 'reading', groupName: 'Analysis', name: 'Compare & Contrast', sortOrder: 8 },
  { section: 'reading', groupName: 'Analysis', name: 'Evidence-Based Questions', sortOrder: 9 },
  { section: 'reading', groupName: 'Analysis', name: 'Drawing Conclusions', sortOrder: 10 },
  { section: 'reading', groupName: 'Analysis', name: 'Passage Relationships & Structure', sortOrder: 11 },

  // ---- Science (11) ----
  { section: 'science', groupName: 'Data Interpretation', name: 'Tables', sortOrder: 0 },
  { section: 'science', groupName: 'Data Interpretation', name: 'Graphs', sortOrder: 1 },
  { section: 'science', groupName: 'Data Interpretation', name: 'Trends & Data Comparison', sortOrder: 2 },
  { section: 'science', groupName: 'Experimental Design', name: 'Variables & Controls', sortOrder: 3 },
  { section: 'science', groupName: 'Experimental Design', name: 'Procedures & Experimental Design', sortOrder: 4 },
  { section: 'science', groupName: 'Experimental Design', name: 'Conclusions from Experiments', sortOrder: 5 },
  { section: 'science', groupName: 'Scientific Reasoning', name: 'Predictions', sortOrder: 6 },
  { section: 'science', groupName: 'Scientific Reasoning', name: 'Evidence & Reasoning', sortOrder: 7 },
  { section: 'science', groupName: 'Conflicting Viewpoints', name: 'Compare Scientific Claims', sortOrder: 8 },
  { section: 'science', groupName: 'Conflicting Viewpoints', name: 'Agreements & Disagreements', sortOrder: 9 },
  { section: 'science', groupName: 'Conflicting Viewpoints', name: 'Evaluating Evidence', sortOrder: 10 },
];

export function categoriesForSection(section: Section): CategoryDefinition[] {
  return CATEGORIES.filter((c) => c.section === section).sort((a, b) => a.sortOrder - b.sortOrder);
}
