/** Pick a student, with their score and blank count in the list. */
import type { ReactNode } from 'react';
import type { Attempt, Student } from '../data/types';
import { percent } from '../analysis/stats';

export function StudentPicker({
  students,
  attempts,
  selectedId,
  onChange,
}: {
  students: readonly Student[];
  attempts: readonly Attempt[];
  selectedId: string;
  onChange: (studentId: string) => void;
}): ReactNode {
  const index = students.findIndex((student) => student.id === selectedId);
  const step = (delta: number): void => {
    if (students.length === 0) return;
    const next = students[(index + delta + students.length) % students.length];
    if (next !== undefined) onChange(next.id);
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button type="button" className="button" onClick={() => step(-1)} aria-label="Previous student">
        ‹
      </button>
      <select
        aria-label="Student"
        value={selectedId}
        onChange={(event) => onChange(event.currentTarget.value)}
        style={{ minWidth: 220 }}
      >
        {students.map((student) => {
          const attempt = attempts.find((candidate) => candidate.studentId === student.id);
          const blanks =
            attempt === undefined
              ? 0
              : [...attempt.byQuestion.values()].filter(
                  (outcome) => outcome.visits[0]?.leftBlank === true,
                ).length;
          return (
            <option key={student.id} value={student.id}>
              {student.label} — {percent(attempt?.score ?? 0, 0)} correct, {blanks} skipped
            </option>
          );
        })}
      </select>
      <button type="button" className="button" onClick={() => step(1)} aria-label="Next student">
        ›
      </button>
    </div>
  );
}
