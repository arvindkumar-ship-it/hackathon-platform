export type RankedSubmission = {
  submissionId: string;
  averageScore: number;
  innovationScore: number | null;
  usabilityScore: number | null;
  submittedAt: Date | null;
};