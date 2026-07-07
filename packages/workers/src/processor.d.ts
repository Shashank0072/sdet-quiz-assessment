export type QuizSubmissionJob = {
    submissionId: string;
    userId: string;
    quizId: string;
    answers: string[];
};
export declare function processQuizSubmission(job: QuizSubmissionJob): Promise<{
    score: number;
    correctCount: number;
    totalScore: number;
}>;
//# sourceMappingURL=processor.d.ts.map