import type { LessonNode, Exercise } from './lesson-format';

/**
 * Parses raw text or imported workbook HTML/text and detects:
 * 1. Workbook top banners (e.g. "Kapitel 5 – Berlinmuren", "Språkvägen s. 184–186")
 * 2. Section headers ("E Substantiv", "A Ordföljd – huvudsats", "B Konjunktioner", "HÖRA")
 * 3. Word bank boxes ("[och | så | men | för]" or "Välj bland orden i rutan...")
 * 4. Example callouts ("Exempel: ...")
 * 5. Fill-in-the-blank / Gap lines ("1 en gräns ____ flera gränser" or embedded "[ans|facit]")
 * 6. Choice / Checkbox lists ("1 Varför... [ ] ...")
 * 7. Vocabulary tables ("Ord | Översättning | Uttal | Skriv")
 */

export function parseWorkbookTextToNodes(rawText: string): LessonNode[] {
  const lines = rawText.split(/\r?\n/).map(l => l.trimEnd());
  const nodes: LessonNode[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) {
      i++;
      continue;
    }

    // 1. Check for Workbook header / banner (e.g., "Kapitel 5 – Berlinmuren")
    const chapterMatch = line.match(/^Kapitel\s+\d+[\s–—-]+(.+)$/i);
    if (chapterMatch) {
      let pageRef = '';
      if (i + 1 < lines.length && /^(?:Språkvägen\s+)?(?:s\.|sidorna)\s*\d+/i.test(lines[i + 1].trim())) {
        pageRef = lines[i + 1].trim();
        i++;
      } else if (i + 2 < lines.length && /^(?:Språkvägen\s+)?(?:s\.|sidorna)\s*\d+/i.test(lines[i + 2].trim())) {
        pageRef = lines[i + 2].trim();
      }

      nodes.push({
        tag: 'div',
        children: [
          {
            tag: 'div',
            children: [
              {
                tag: 'span',
                children: [{ tag: '#text', text: line }]
              },
              ...(pageRef ? [{
                tag: 'span',
                children: [{ tag: '#text', text: pageRef }]
              }] : [])
            ]
          }
        ]
      });
      i++;
      continue;
    }

    // 2. Check for Table (e.g. Ordlista with columns: Ord | Översättning | Uttal | Skriv)
    if (line.includes('|') || /^(?:Ord|Word)\s+(?:Översättning|Translation)\s+(?:Uttal|Pronunciation)\s+(?:Skriv|Write)/i.test(line)) {
      const tableLines: string[] = [];
      while (i < lines.length && (lines[i].includes('|') || lines[i].trim().split(/\s{2,}/).length >= 2)) {
        if (lines[i].trim()) tableLines.push(lines[i].trim());
        i++;
      }
      if (tableLines.length >= 2) {
        const tableNode = parseTableExercise(tableLines);
        if (tableNode) {
          nodes.push(tableNode);
          continue;
        }
      }
    }

    // 3. Word bank box: e.g. [och | så | men | för] or single line with box of words
    if (/^\[.+\]$/.test(line) && line.includes('|')) {
      const words = line.slice(1, -1).split('|').map(w => w.trim()).filter(Boolean);
      nodes.push({
        tag: 'div',
        children: words.map(w => ({
          tag: 'span',
          children: [{ tag: '#text', text: w }]
        }))
      });
      i++;
      continue;
    }

    // 4. Example box: "Exempel: ..."
    if (/^Exempel\s*:/i.test(line)) {
      const exampleLines = [line];
      i++;
      while (i < lines.length && lines[i].trim() && !/^\d+[\s.)]/.test(lines[i].trim()) && !/^[A-Z]\s+[A-ZÅÄÖa-zåäö]/.test(lines[i].trim())) {
        exampleLines.push(lines[i].trim());
        i++;
      }
      nodes.push({
        tag: 'blockquote',
        children: exampleLines.map((el) => ({
          tag: 'p',
          children: [{ tag: '#text', text: el }]
        }))
      });
      continue;
    }

    // 5. Section titles: e.g. "E Substantiv", "A Ordföljd – huvudsats", "B Konjunktioner", "HÖRA", "Ordlista"
    if (/^[A-Z]\s+[A-ZÅÄÖa-zåäö\s–—-]+$/.test(line) || /^(?:HÖRA|Hörförståelse|Ordlista|Grammatik)$/i.test(line)) {
      nodes.push({
        tag: 'h2',
        children: [{ tag: '#text', text: line }]
      });
      i++;
      continue;
    }

    // 6. Numbered Gap / Blank exercises: e.g. "1 [en gräns|en gräns] flera gränser" or "1 ... ____ ..."
    if (/^\d+[\s.)]/.test(line) && (line.includes('___') || line.includes('…') || line.includes('/') || line.includes('[blank]') || /\[[^\]|]+\|[^\]]+\]/.test(line))) {
      const gapLines: string[] = [];
      let prompt = '';
      if (nodes.length > 0 && nodes[nodes.length - 1].tag === 'p') {
        const lastP = nodes.pop();
        prompt = lastP?.children?.[0]?.text || '';
      }

      while (i < lines.length) {
        const cur = lines[i].trim();
        if (/^\d+[\s.)]/.test(cur)) {
          gapLines.push(cur);
          i++;
        } else if (gapLines.length > 0 && cur && !/^[A-Z]\s+/.test(cur) && !cur.startsWith('Kapitel') && !cur.startsWith('Exempel:')) {
          gapLines[gapLines.length - 1] += ' ' + cur;
          i++;
        } else {
          break;
        }
      }

      if (gapLines.length > 0) {
        nodes.push({
          tag: 'exercise',
          exercise: {
            id: 'gap-' + Math.random().toString(36).substring(2, 9),
            type: 'gap',
            prompt: prompt || 'Fyll i rätt svar på linjen:',
            options: gapLines,
            correctOptions: extractGapFacit(gapLines)
          }
        });
        continue;
      }
    }

    // 7. Choice / Checkbox exercises: e.g. "1 Varför är kvinnan irriterad?" followed by options
    if (/^\d+[\s.)]/.test(line)) {
      const qPrompt = line;
      i++;
      const opts: string[] = [];
      while (i < lines.length) {
        const cur = lines[i].trim();
        if (/^(?:\[\s*\]|\(\s*\)|[a-d]\)|\-|\*)\s*(.+)/i.test(cur)) {
          const optText = cur.replace(/^(?:\[\s*\]|\(\s*\)|[a-d]\)|\-|\*)\s*/i, '').trim();
          opts.push(optText);
          i++;
        } else if (opts.length > 0 && cur && !/^\d+[\s.)]/.test(cur)) {
          opts[opts.length - 1] += ' ' + cur;
          i++;
        } else {
          break;
        }
      }

      if (opts.length >= 2) {
        nodes.push({
          tag: 'exercise',
          exercise: {
            id: 'choice-' + Math.random().toString(36).substring(2, 9),
            type: 'choice',
            prompt: qPrompt,
            options: opts,
            correctOptions: []
          }
        });
        continue;
      } else {
        nodes.push({
          tag: 'p',
          children: [{ tag: '#text', text: qPrompt }]
        });
        continue;
      }
    }

    // Default: normal paragraph
    nodes.push({
      tag: 'p',
      children: [{ tag: '#text', text: line }]
    });
    i++;
  }

  return nodes;
}

function parseTableExercise(lines: string[]): LessonNode | null {
  const firstLine = lines[0];
  const headers = firstLine.includes('|')
    ? firstLine.split('|').map(s => s.trim()).filter(Boolean)
    : firstLine.split(/\s{2,}/).map(s => s.trim()).filter(Boolean);

  if (headers.length < 2) return null;

  const rows: { cells: string[]; editable: boolean[] }[] = [];
  const startIdx = lines[1] && /^[\s|:-]+$/.test(lines[1]) ? 2 : 1;

  for (let i = startIdx; i < lines.length; i++) {
    const rawRow = lines[i];
    let cols = rawRow.includes('|')
      ? rawRow.split('|').map(s => s.trim())
      : rawRow.split(/\s{2,}/).map(s => s.trim());
    if (rawRow.startsWith('|') && cols[0] === '') cols.shift();
    if (rawRow.endsWith('|') && cols[cols.length - 1] === '') cols.pop();

    if (cols.length === 0) continue;

    while (cols.length < headers.length) cols.push('');
    if (cols.length > headers.length) cols = cols.slice(0, headers.length);

    const editable = headers.map((h, colIdx) => {
      const hLower = h.toLowerCase();
      if (hLower.includes('översätt') || hLower.includes('skriv') || hLower.includes('svar') || hLower.includes('egen')) {
        return true;
      }
      return cols[colIdx] === '' || cols[colIdx] === '____';
    });

    rows.push({
      cells: cols.map(c => (c === '____' ? '' : c)),
      editable
    });
  }

  if (rows.length === 0) return null;

  return {
    tag: 'exercise',
    exercise: {
      id: 'table-' + Math.random().toString(36).substring(2, 9),
      type: 'table',
      prompt: 'Fyll i tabellens tomma kolumner:',
      options: headers,
      tableData: {
        headers,
        rows
      }
    }
  };
}

function extractGapFacit(lines: string[]): string[] {
  return lines.map(line => {
    const match = line.match(/\[([^\]|]+)\|([^\]]+)\]/);
    if (match) return match[2].trim();
    return '';
  });
}
