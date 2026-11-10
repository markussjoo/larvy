import type { LessonNode, Exercise } from './lesson-format';

/**
 * AI / OCR Workbook Data Structure matching the requested JSON specification:
 * {
 *   "title": "Kapitel-rubrik",
 *   "section": "Underrubrik eller sektion (t.ex. E Substantiv)",
 *   "source": "Källhänvisning (t.ex. Språkvägen s. 184-186)",
 *   "exercises": [
 *     { "id": 1, "type": "plural", "prompt": "ett land → flera", "answer": "länder" },
 *     { "id": 6, "type": "fill_in", "prefix": "Efter", "answer": "kriget", "suffix": "delade man Tyskland i två delar." },
 *     { "id": 2, "type": "multiple_choice", "question": "Varför är kvinnan irriterad?", "options": [...], "answer": "..." }
 *   ]
 * }
 */

export type AiExerciseItem = {
  id: number | string;
  type: 'plural' | 'fill_in' | 'multiple_choice' | 'gap' | 'table';
  prompt?: string;
  prefix?: string;
  suffix?: string;
  answer?: string;
  question?: string;
  options?: string[];
  correctOptions?: string[];
};

export type AiWorkbookData = {
  title: string;
  section: string;
  source: string;
  exercises: AiExerciseItem[];
};

/**
 * System prompt to send to LLM (e.g. Gemini) when calling via API:
 */
export const AI_PDF_SYSTEM_PROMPT = `Du är en AI som analyserar svenska grammatikövningar från läroböcker. 
Läs den extraherade texten från PDF:en och strukturera om den till ett exakt JSON-format.

Följ denna JSON-struktur:
{
  "title": "Kapitel-rubrik",
  "section": "Underrubrik eller sektion (t.ex. E Substantiv)",
  "source": "Källhänvisning (t.ex. Språkvägen s. 184-186)",
  "exercises": [
    {
      "id": 1,
      "type": "plural", 
      "prompt": "ett land → flera",
      "answer": "länder"
    },
    {
      "id": 6,
      "type": "fill_in",
      "prefix": "Efter",
      "answer": "kriget",
      "suffix": "delade man Tyskland i två delar."
    },
    {
      "id": 2,
      "type": "multiple_choice",
      "question": "Varför är kvinnan irriterad?",
      "options": ["Alternativ A", "Alternativ B", "Alternativ C", "Alternativ D"],
      "answer": "Alternativ B"
    }
  ]
}

Returnera ENDAST giltig JSON utan markdown-omslutningar eller förklarande text.`;

/**
 * Converts structured AI workbook JSON data into Lärvy LessonNode format.
 */
export function convertAiJsonToLessonNodes(data: AiWorkbookData): LessonNode[] {
  const nodes: LessonNode[] = [];

  // 1. Workbook top banner with Title + Source
  if (data.title || data.source) {
    nodes.push({
      tag: 'div',
      children: [
        {
          tag: 'div',
          children: [
            {
              tag: 'span',
              children: [{ tag: '#text', text: data.title || 'Kapitel' }]
            },
            ...(data.source ? [{
              tag: 'span',
              children: [{ tag: '#text', text: data.source }]
            }] : [])
          ]
        }
      ]
    });
  }

  // 2. Section title (e.g. "E Substantiv")
  if (data.section) {
    nodes.push({
      tag: 'h2',
      children: [{ tag: '#text', text: data.section }]
    });
  }

  // 3. Process exercises
  if (Array.isArray(data.exercises) && data.exercises.length > 0) {
    // Group adjacent fill_in and plural items into cohesive gap exercises
    const gapLines: string[] = [];
    const gapAnswers: string[] = [];

    const flushGap = () => {
      if (gapLines.length > 0) {
        nodes.push({
          tag: 'exercise',
          exercise: {
            id: 'ai-gap-' + Math.random().toString(36).substring(2, 9),
            type: 'gap',
            prompt: 'Fyll i rätt svar:',
            options: [...gapLines],
            correctOptions: [...gapAnswers]
          }
        });
        gapLines.length = 0;
        gapAnswers.length = 0;
      }
    };

    data.exercises.forEach(ex => {
      if (ex.type === 'plural') {
        const lineStr = `${ex.id}. ${ex.prompt || ''} ____`;
        gapLines.push(lineStr);
        gapAnswers.push(ex.answer || '');
      } else if (ex.type === 'fill_in') {
        const prefix = ex.prefix ? ex.prefix.trim() + ' ' : '';
        const suffix = ex.suffix ? ' ' + ex.suffix.trim() : '';
        const lineStr = `${ex.id}. ${prefix}____${suffix}`;
        gapLines.push(lineStr);
        gapAnswers.push(ex.answer || '');
      } else if (ex.type === 'multiple_choice') {
        flushGap();
        const opts = Array.isArray(ex.options) ? ex.options : [];
        const correct = ex.answer ? [ex.answer] : [];
        nodes.push({
          tag: 'exercise',
          exercise: {
            id: 'ai-choice-' + Math.random().toString(36).substring(2, 9),
            type: 'choice',
            prompt: `${ex.id}. ${ex.question || ex.prompt || 'Välj rätt alternativ:'}`,
            options: opts,
            correctOptions: correct
          }
        });
      } else {
        // Fallback gap
        const lineStr = `${ex.id}. ${ex.prefix || ex.prompt || ''} ____ ${ex.suffix || ''}`.trim();
        gapLines.push(lineStr);
        gapAnswers.push(ex.answer || '');
      }
    });

    flushGap();
  }

  return nodes;
}

/**
 * Robustly parses text into AiWorkbookData structure:
 * - If text is raw JSON from LLM, parses JSON directly.
 * - If JSON is wrapped in ```json ... ```, strips code fences and parses.
 * - If text is OCR text, applies grammar pattern recognition to extract title, section, source, and exercises.
 */
export function parseRawTextToAiWorkbook(rawText: string): AiWorkbookData {
  const trimmed = rawText.trim();

  // Try direct JSON parsing
  let jsonString = trimmed;
  if (jsonString.startsWith('```')) {
    jsonString = jsonString.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  }

  if (jsonString.startsWith('{') && jsonString.endsWith('}')) {
    try {
      const parsed = JSON.parse(jsonString);
      if (parsed && typeof parsed === 'object' && Array.isArray(parsed.exercises)) {
        return {
          title: String(parsed.title || 'Övning'),
          section: String(parsed.section || ''),
          source: String(parsed.source || ''),
          exercises: parsed.exercises
        };
      }
    } catch {
      // Continue to heuristic text analyzer
    }
  }

  // Heuristic rule-based analyzer for Swedish grammar worksheets
  const lines = trimmed.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  let title = 'Kapitel 5 – Berlinmuren';
  let section = 'Grammatik & Substantiv';
  let source = 'Språkvägen';
  const exercises: AiExerciseItem[] = [];

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];

    // Detect chapter banner
    const capMatch = l.match(/^(?:Kapitel|Tema)\s+\d+[\s–—-]+(.+)$/i);
    if (capMatch) {
      title = l;
      continue;
    }
    const srcMatch = l.match(/^(?:Språkvägen|SFI|Sanoma).*(?:s\.|sid|sidorna)\s*\d+[-–—\d]*/i);
    if (srcMatch) {
      source = l;
      continue;
    }
    const secMatch = l.match(/^[A-Z]\s+[A-ZÅÄÖa-zåäö\s–—-]+$/);
    if (secMatch) {
      section = l;
      continue;
    }

    // Numbered line: e.g. "1 [answer] suffix" or "1 prefix ____ suffix" or "1 word1/word2"
    const numMatch = l.match(/^(\d+)[\s.)]\s*(.*)$/);
    if (numMatch) {
      const id = parseInt(numMatch[1], 10) || numMatch[1];
      const rest = numMatch[2];

      // Check if it's a plural/singular pattern: "ett land → flera [länder]"
      const pluralMatch = rest.match(/^(ett\s+\w+|en\s+\w+)\s*(?:→|->|—|-)\s*(?:flera|många)\s*(.*)$/i);
      if (pluralMatch) {
        exercises.push({
          id,
          type: 'plural',
          prompt: `${pluralMatch[1]} → flera`,
          answer: pluralMatch[2].replace(/[_[\]]/g, '').trim() || ''
        });
        continue;
      }

      // Check fill_in with blank
      const parts = rest.split(/(?:_{2,}|\[blank\]|\.{3,}|\[[^\]|]+\|([^\]]+)\])/);
      if (parts.length >= 2) {
        // Extract embedded facit if present
        const facitMatch = rest.match(/\[([^\]|]+)\|([^\]]+)\]/);
        const ans = facitMatch ? facitMatch[2].trim() : '';
        const cleanPrefix = rest.replace(/\[([^\]|]+)\|([^\]]+)\]/g, '____').split('____')[0]?.trim() || '';
        const cleanSuffix = rest.replace(/\[([^\]|]+)\|([^\]]+)\]/g, '____').split('____')[1]?.trim() || '';

        exercises.push({
          id,
          type: 'fill_in',
          prefix: cleanPrefix,
          answer: ans,
          suffix: cleanSuffix
        });
        continue;
      }

      // Check multiple choice with following lines
      if (i + 1 < lines.length && /^(?:\[\s*\]|\(\s*\)|[a-d]\))\s*/i.test(lines[i + 1])) {
        const options: string[] = [];
        let j = i + 1;
        while (j < lines.length && /^(?:\[\s*\]|\(\s*\)|[a-d]\))\s*/i.test(lines[j])) {
          options.push(lines[j].replace(/^(?:\[\s*\]|\(\s*\)|[a-d]\))\s*/i, '').trim());
          j++;
        }
        exercises.push({
          id,
          type: 'multiple_choice',
          question: rest,
          options,
          answer: options[0] || ''
        });
        i = j - 1;
        continue;
      }

      // Default fill_in
      exercises.push({
        id,
        type: 'fill_in',
        prefix: rest,
        answer: '',
        suffix: ''
      });
    }
  }

  return {
    title,
    section,
    source,
    exercises
  };
}
