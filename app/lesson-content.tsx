import LessonFileLink from './lesson-file-link';
import { createElement, useState } from 'react';
import { parseLesson, type LessonNode, type Answers, type Exercise } from './lesson-format';

export default function LessonContent({
  body,
  answers = {},
  onAnswer,
  readOnly = false,
  showGrading = false
}: {
  body: string;
  answers?: Answers;
  onAnswer?: (id: string, value: string | string[]) => void;
  readOnly?: boolean;
  showGrading?: boolean;
}) {
  const nodes = parseLesson(body);
  // Local checking state when user clicks "Kontrollera svar" in student view
  const [localChecked, setLocalChecked] = useState<Record<string, boolean>>({});

  const render = (n: LessonNode, key: number): any => {
    if (n.tag === 'exercise' && n.exercise) {
      const q = n.exercise;
      const v = answers[q.id];
      const isGraded = showGrading || !!localChecked[q.id];

      // 1. GAP / FILL-IN-THE-BLANK EXERCISE (PDF Worksheets 1, 2, 4)
      if (q.type === 'gap') {
        const rowAnswers: string[] = Array.isArray(v) ? (v as string[]) : [];
        const hasFacit = q.correctOptions && q.correctOptions.some(opt => !!opt.trim());

        return (
          <fieldset className="lesson-exercise workbook-exercise" key={key}>
            <legend className="workbook-legend">
              <span className="workbook-legend-prompt">{q.prompt}</span>
              {isGraded && hasFacit && (
                <span className="badge workbook-badge-grading">
                  {q.correctOptions!.every((exp, idx) => {
                    if (!exp.trim()) return true;
                    const ans = (rowAnswers[idx] || '').trim().toLowerCase();
                    const accepted = exp.split(/[|/]/).map(s => s.trim().toLowerCase());
                    return accepted.includes(ans);
                  })
                    ? '✓ Alla rätt'
                    : 'Kontrollerad'}
                </span>
              )}
            </legend>

            <div className="workbook-gap-list">
              {q.options.map((line, rowIdx) => {
                const userVal = rowAnswers[rowIdx] || '';
                const expected = q.correctOptions?.[rowIdx] || '';
                const acceptedVariants = expected.split(/[|/]/).map(s => s.trim().toLowerCase()).filter(Boolean);
                const isCorrect = acceptedVariants.length > 0 && acceptedVariants.includes(userVal.trim().toLowerCase());
                const isIncorrect = isGraded && acceptedVariants.length > 0 && userVal.trim() && !isCorrect;

                // Split line into parts if it contains blanks '____' or '...'
                // E.g. "1 heter/Berlin/Tysklands huvudstad ____"
                // or "1 Människor kunde passera ... ____ det gick inte ..."
                const parts = line.split(/(?:_{3,}|\[blank\]|\.{3,})/);
                const hasInlineBlank = parts.length > 1;

                const updateAnswer = (newVal: string) => {
                  const nextAnswers = [...rowAnswers];
                  while (nextAnswers.length <= rowIdx) nextAnswers.push('');
                  nextAnswers[rowIdx] = newVal;
                  onAnswer?.(q.id, nextAnswers);
                };

                return (
                  <div key={rowIdx} className={`workbook-gap-row ${isCorrect ? 'is-correct' : ''} ${isIncorrect ? 'is-wrong' : ''}`}>
                    {hasInlineBlank ? (
                      <div className="workbook-gap-inline">
                        <span>{parts[0]}</span>
                        <input
                          type="text"
                          className={`workbook-input ${isCorrect ? 'correct' : ''} ${isIncorrect ? 'wrong' : ''}`}
                          value={userVal}
                          disabled={!onAnswer || readOnly}
                          placeholder="skriv här…"
                          onChange={e => updateAnswer(e.target.value)}
                        />
                        <span>{parts.slice(1).join('')}</span>
                      </div>
                    ) : (
                      <div className="workbook-gap-stacked">
                        <div className="workbook-gap-prompt-line">{line}</div>
                        <input
                          type="text"
                          className={`workbook-input full-width ${isCorrect ? 'correct' : ''} ${isIncorrect ? 'wrong' : ''}`}
                          value={userVal}
                          disabled={!onAnswer || readOnly}
                          placeholder="Skriv meningen här…"
                          onChange={e => updateAnswer(e.target.value)}
                        />
                      </div>
                    )}

                    {isGraded && acceptedVariants.length > 0 && (
                      <div className="workbook-feedback">
                        {isCorrect ? (
                          <span className="badge" style={{ background: '#275c49', color: '#fff' }}>✓ Rätt</span>
                        ) : (
                          <span className="badge" style={{ background: '#a33232', color: '#fff' }}>
                            Facit: {expected}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {!readOnly && onAnswer && hasFacit && (
              <div className="workbook-actions">
                <button
                  type="button"
                  className="light"
                  onClick={() => setLocalChecked(prev => ({ ...prev, [q.id]: !prev[q.id] }))}
                >
                  {localChecked[q.id] ? 'Dölj rättning' : 'Kontrollera svar'}
                </button>
                <button
                  type="button"
                  className="light"
                  onClick={() => onAnswer(q.id, q.options.map(() => ''))}
                >
                  Rensa fält
                </button>
              </div>
            )}
          </fieldset>
        );
      }

      // 2. TABLE EXERCISE (PDF Worksheet 5: Ordlista)
      if (q.type === 'table' && q.tableData) {
        const table = q.tableData;
        const cellAnswers: string[] = Array.isArray(v) ? (v as string[]) : [];
        const hasFacit = q.correctOptions && q.correctOptions.some(opt => !!opt.trim());

        const getCellIndex = (row: number, col: number) => row * table.headers.length + col;

        const updateCell = (row: number, col: number, text: string) => {
          const idx = getCellIndex(row, col);
          const next = [...cellAnswers];
          while (next.length <= idx) next.push('');
          next[idx] = text;
          onAnswer?.(q.id, next);
        };

        return (
          <fieldset className="lesson-exercise workbook-exercise" key={key}>
            <legend className="workbook-legend">{q.prompt}</legend>
            <div className="workbook-table-container">
              <table className="workbook-table">
                <thead>
                  <tr>
                    {table.headers.map((h, hIdx) => (
                      <th key={hIdx}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {table.rows.map((row, rIdx) => (
                    <tr key={rIdx}>
                      {row.cells.map((cellText, cIdx) => {
                        const isEditable = row.editable[cIdx];
                        const cellIdx = getCellIndex(rIdx, cIdx);
                        const cellVal = cellAnswers[cellIdx] || '';
                        const expected = q.correctOptions?.[cellIdx] || '';
                        const accepted = expected.split(/[|/]/).map(s => s.trim().toLowerCase()).filter(Boolean);
                        const isCorrect = accepted.length > 0 && accepted.includes(cellVal.trim().toLowerCase());

                        return (
                          <td key={cIdx}>
                            {isEditable ? (
                              <input
                                type="text"
                                className={`workbook-table-input ${isCorrect ? 'correct' : ''}`}
                                value={cellVal}
                                disabled={!onAnswer || readOnly}
                                placeholder="skriv…"
                                onChange={e => updateCell(rIdx, cIdx, e.target.value)}
                              />
                            ) : (
                              <span>{cellText}</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {!readOnly && onAnswer && hasFacit && (
              <div className="workbook-actions">
                <button
                  type="button"
                  className="light"
                  onClick={() => setLocalChecked(prev => ({ ...prev, [q.id]: !prev[q.id] }))}
                >
                  {localChecked[q.id] ? 'Dölj rättning' : 'Kontrollera svar'}
                </button>
              </div>
            )}
          </fieldset>
        );
      }

      // 3. CHOICE / CHECKBOX EXERCISE (PDF Worksheet 3: Höra/Frågor)
      if (q.type === 'choice') {
        const hasKey = (showGrading || !!localChecked[q.id]) && q.correctOptions && q.correctOptions.length > 0;
        const given = Array.isArray(v) ? v : [];
        const isCorrect = hasKey && given.length === q.correctOptions!.length && q.correctOptions!.every(opt => given.includes(opt));

        return (
          <fieldset className="lesson-exercise workbook-choice-box" key={key}>
            <legend>
              {q.prompt}
              {hasKey && (
                <span className="badge" style={{ marginLeft: 8, background: isCorrect ? '#275c49' : '#a33232', color: '#fff' }}>
                  {isCorrect ? '✓ Rätt' : '✗ Fel'}
                </span>
              )}
            </legend>
            <div className="workbook-options-list">
              {q.options.map(option => {
                const checked = Array.isArray(v) && v.includes(option);
                const isExpected = hasKey && q.correctOptions!.includes(option);
                return (
                  <label className="lesson-option workbook-option-item" key={option}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!onAnswer || readOnly}
                      onChange={e => {
                        const selected = Array.isArray(v) ? v : [];
                        onAnswer?.(q.id, e.target.checked ? [...selected, option] : selected.filter(x => x !== option));
                      }}
                    />
                    <span>
                      {option}
                      {hasKey && isExpected && (
                        <span className="badge" style={{ marginLeft: 8, background: '#2d5c40', color: '#fff' }}>
                          Rätt svar
                        </span>
                      )}
                      {hasKey && checked && !isExpected && (
                        <span className="badge" style={{ marginLeft: 8, background: '#a33232', color: '#fff' }}>
                          Ditt val
                        </span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
            {!readOnly && onAnswer && q.correctOptions && q.correctOptions.length > 0 && (
              <div className="workbook-actions">
                <button
                  type="button"
                  className="light"
                  onClick={() => setLocalChecked(prev => ({ ...prev, [q.id]: !prev[q.id] }))}
                >
                  {localChecked[q.id] ? 'Dölj facit' : 'Kontrollera svar'}
                </button>
              </div>
            )}
          </fieldset>
        );
      }

      // 4. FREE TEXT EXERCISE
      return (
        <fieldset className="lesson-exercise" key={key}>
          <legend>{q.prompt}</legend>
          <textarea
            aria-label={q.prompt}
            placeholder={onAnswer ? 'Skriv ditt svar här…' : 'Textfält för elevens svar'}
            maxLength={20000}
            value={typeof v === 'string' ? v : ''}
            disabled={!onAnswer || readOnly}
            onChange={e => onAnswer?.(q.id, e.target.value)}
          />
        </fieldset>
      );
    }

    return n.tag === '#text'
      ? n.text
      : n.tag === 'file'
      ? <LessonFileLink key={key} file={n.file!} />
      : n.tag === 'img'
      ? <img key={key} src={n.src} alt={n.alt || ''} />
      : createElement(
          n.tag === 'font' ? 'span' : n.tag,
          {
            key,
            ...(n.hand !== undefined ? { className: n.hand ? 'lesson-handwriting' : 'lesson-normal' } : {})
          },
          n.tag === 'br' ? undefined : n.children?.map(render)
        );
  };

  return <div className="lesson-content workbook-content">{nodes ? nodes.map(render) : body}</div>;
}
