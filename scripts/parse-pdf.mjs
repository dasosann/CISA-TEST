import fs from 'fs';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { UNMATCHED_KO_MAP } from './unmatched-ko.js';

async function loadRawLines() {
  if (fs.existsSync('scripts/pdf-lines.json')) {
    return JSON.parse(fs.readFileSync('scripts/pdf-lines.json', 'utf8'));
  }
  const pdfPath = './CISA덤프_영어한글_V3.0.pdf-20231223231603.pdf';
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await pdfjsLib.getDocument({ data, standardFontDataUrl: './node_modules/pdfjs-dist/standard_fonts/' }).promise;
  const allLines = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    let line = '';
    for (const item of content.items) {
      line += item.str;
      if (item.hasEOL) {
        if (line.trim()) allLines.push({ page: p, text: line.trim() });
        line = '';
      } else {
        line += ' ';
      }
    }
    if (line.trim()) allLines.push({ page: p, text: line.trim() });
  }
  return allLines;
}

const lines = await loadRawLines();

function preprocessLines(rawLines) {
  const result = [];
  for (const item of rawLines) {
    let text = item.text.replace(/^[\uF0B7\u2022\u25AA\u25CF•]\s*/, '').trim();
    if (!text) continue;
    // Also fix inline "O Web application firewall" -> "D. Web application firewall"
    text = text.replace(/\s+O\s+(?=Web application firewall)/g, ' D. ');
    const inlineSplit = text.split(/(?<=\S)\s*(?=[A-D]\.\s+[A-Za-z가-힣])/);
    if (inlineSplit.length > 1) {
      for (const part of inlineSplit) {
        result.push({ page: item.page, text: part.trim() });
      }
    } else {
      result.push({ page: item.page, text });
    }
  }
  return result;
}

const cleanLines = preprocessLines(lines);
const extraStartIdx = cleanLines.findIndex(l => l.page >= 670 && l.text.includes('++추가 문제'));
const mainLines = cleanLines.slice(0, extraStartIdx);
const extraLines = cleanLines.slice(extraStartIdx + 1);

const koStartIdx = mainLines.findIndex(l => l.page >= 296 && /^새로운\s*질문\s*\d+/.test(l.text));
const enMainLines = mainLines.slice(0, koStartIdx);
const koMainLines = mainLines.slice(koStartIdx);

function parseMainSection(secLines, isKo = false) {
  const headerRegex = isKo ? /^새로운\s*질문\s*(\d+)/ : /^NEW QUESTION\s+(\d+)/i;
  const answerRegex = isKo ? /^(?:정답|답변|대답|해답|답|Answer)\s*:\s*([A-Z가-하]+)/i : /^Answer\s*:\s*([A-Z]+)/i;
  const explRegex = isKo ? /^(?:설명|해설|Explanation)\s*:(.*)/i : /^Explanation\s*:(.*)/i;
  const topicRegex = /^-\s*\((?:Topic|주제)\s*(\d+)\)/i;

  const rawQuestions = [];
  let current = null;
  let batchIdx = 1;
  let prevQNum = 0;

  for (let i = 0; i < secLines.length; i++) {
    const line = secLines[i].text;
    const page = secLines[i].page;
    const hMatch = line.match(headerRegex);
    if (hMatch) {
      if (current) rawQuestions.push(current);
      const qNum = Number(hMatch[1]);
      if (rawQuestions.length > 0 && qNum < prevQNum && qNum < 50 && prevQNum > 100) {
        batchIdx++;
      }
      prevQNum = qNum;
      current = {
        batch: batchIdx,
        qNum,
        topic: null,
        page,
        bodyLines: [],
      };
      continue;
    }
    if (!current) continue;
    const tMatch = line.match(topicRegex);
    if (tMatch && current.bodyLines.length === 0) {
      current.topic = Number(tMatch[1]);
      continue;
    }
    current.bodyLines.push(line);
  }
  if (current) rawQuestions.push(current);

  const occCounter = {};
  return rawQuestions.map(q => {
    const occKey = `${q.batch}-${q.qNum}`;
    occCounter[occKey] = (occCounter[occKey] || 0) + 1;
    const occ = occCounter[occKey];

    const bLines = q.bodyLines;
    let ansIdx = bLines.findIndex(l => answerRegex.test(l));
    if (ansIdx === -1) {
      ansIdx = bLines.findIndex(l => /^(?:정답|Answer)/i.test(l));
    }

    const beforeAns = ansIdx !== -1 ? bLines.slice(0, ansIdx) : bLines;
    const ansLine = ansIdx !== -1 ? bLines[ansIdx] : '';
    const afterAns = ansIdx !== -1 ? bLines.slice(ansIdx + 1) : [];

    let rawAnswer = '';
    const aMatch = ansLine.match(answerRegex);
    if (aMatch) rawAnswer = aMatch[1].trim().toUpperCase();

    const explLines = [];
    for (const l of afterAns) {
      const eMatch = l.match(explRegex);
      if (eMatch) {
        if (eMatch[1].trim()) explLines.push(eMatch[1].trim());
      } else {
        explLines.push(l);
      }
    }

    const optRegex = /^([A-Z]{1,2})\.\s*(.*)/;
    const qTextLines = [];
    const options = [];
    for (const l of beforeAns) {
      const oMatch = l.match(optRegex);
      if (oMatch && (options.length > 0 || qTextLines.length > 0)) {
        options.push({ origKey: oMatch[1], text: oMatch[2].trim() });
      } else if (options.length > 0) {
        options[options.length - 1].text += ' ' + l;
      } else {
        qTextLines.push(l);
      }
    }

    const stdKeys = ['A', 'B', 'C', 'D', 'E', 'F'];
    let mappedAnswer = rawAnswer;
    const origKeyIndex = options.findIndex(o => o.origKey === rawAnswer);
    if (origKeyIndex !== -1 && origKeyIndex < stdKeys.length) {
      mappedAnswer = stdKeys[origKeyIndex];
    } else if (!['A', 'B', 'C', 'D'].includes(mappedAnswer) && options.length > 0) {
      mappedAnswer = 'A';
    }

    const normalizedOptions = options.slice(0, 4).map((o, idx) => ({
      key: stdKeys[idx],
      text: o.text.trim(),
    }));

    return {
      matchKey: `${q.batch}-${q.qNum}-${occ}`,
      batch: q.batch,
      qNum: q.qNum,
      occ,
      topic: q.topic,
      page: q.page,
      question: qTextLines.join(' ').trim(),
      options: normalizedOptions,
      answer: mappedAnswer,
      explanation: explLines.join(' ').trim(),
    };
  });
}

function parseExtraSection(secLines) {
  const domain1Indices = [];
  secLines.forEach((l, idx) => {
    if (/^\[\[Domain\s*01\]\]/i.test(l.text)) domain1Indices.push(idx);
  });
  const enExtraLines = secLines.slice(0, domain1Indices[1]);
  const koExtraLines = secLines.slice(domain1Indices[1]);

  function parseHalf(hLines) {
    const list = [];
    let domain = 1;
    let current = null;
    for (const item of hLines) {
      const l = item.text;
      const dMatch = l.match(/^\[\[Domain\s*0*(\d+)\]\]/i);
      if (dMatch) {
        domain = Number(dMatch[1]);
        continue;
      }
      const qMatch = l.match(/^(\d+)\.\s+(.*)/);
      if (qMatch) {
        if (current) list.push(current);
        current = {
          domain,
          qNum: Number(qMatch[1]),
          page: item.page,
          qLines: [qMatch[2].trim()],
          optLines: [],
          ansLines: [],
          inAns: false,
        };
        continue;
      }
      if (!current) continue;
      if (/^(?:Answer|정답|답변|답)\s*:/i.test(l)) {
        current.inAns = true;
        current.ansLines.push(l);
      } else if (current.inAns) {
        current.ansLines.push(l);
      } else if (/^(?:\([a-d]\)|[a-d]\)|[가-라]\))\s*/i.test(l)) {
        current.optLines.push(l.replace(/\*\*/g, ''));
      } else if (current.optLines.length > 0) {
        current.optLines[current.optLines.length - 1] += ' ' + l.replace(/\*\*/g, '');
      } else {
        current.qLines.push(l);
      }
    }
    if (current) list.push(current);

    const stdKeys = ['A', 'B', 'C', 'D'];
    return list.map(q => {
      const options = q.optLines.slice(0, 4).map((ol, idx) => ({
        key: stdKeys[idx],
        text: ol.replace(/^(?:\([a-d]\)|[a-d]\)|[가-라]\))\s*/i, '').trim(),
      }));
      const fullAns = q.ansLines.join(' ');
      const aMatch = fullAns.match(/^(?:Answer|정답|답변|답)\s*:\s*(?:\(?([a-dA-D])\)?)/i);
      const answer = aMatch ? aMatch[1].toUpperCase() : 'A';
      const explanation = fullAns
        .replace(/^(?:Answer|정답|답변|답)\s*:\s*(?:\(?[a-dA-D]\)?)\s*/i, '')
        .replace(/^(?:Explanation|설명|해설)\s*:\s*/i, '')
        .trim();
      return {
        matchKey: `extra-${q.domain}-${q.qNum}`,
        domain: q.domain,
        qNum: q.qNum,
        page: q.page,
        question: q.qLines.join(' ').trim(),
        options,
        answer,
        explanation,
      };
    });
  }

  return {
    enExtra: parseHalf(enExtraLines),
    koExtra: parseHalf(koExtraLines),
  };
}

const enMain = parseMainSection(enMainLines, false);
const koMain = parseMainSection(koMainLines, true);
const koMap = new Map(koMain.map(q => [q.matchKey, q]));

const { enExtra, koExtra } = parseExtraSection(extraLines);
const koExtraMap = new Map(koExtra.map(q => [q.matchKey, q]));

const finalQuestions = [];

// 1. Main questions (1,422 questions)
for (const enQ of enMain) {
  const koQ = koMap.get(enQ.matchKey) || UNMATCHED_KO_MAP[enQ.matchKey];
  const id = finalQuestions.length + 1;
  finalQuestions.push({
    id,
    code: `Set ${enQ.batch} - Q${enQ.qNum}`,
    category: `Part ${enQ.batch}`,
    topic: enQ.topic || 1,
    questionEn: enQ.question,
    questionKo: koQ ? koQ.question : enQ.question,
    optionsEn: enQ.options,
    optionsKo: koQ && koQ.options && koQ.options.length === enQ.options.length
      ? koQ.options
      : enQ.options,
    answer: enQ.answer,
    explanationEn: enQ.explanation || '',
    explanationKo: koQ ? (koQ.explanation || '') : '',
  });
}

// 2. Extra questions (++추가 문제, 58 questions)
for (const enX of enExtra) {
  const koX = koExtraMap.get(enX.matchKey);
  const id = finalQuestions.length + 1;
  finalQuestions.push({
    id,
    code: `Domain ${enX.domain} - Q${enX.qNum}`,
    category: `추가문제 (Domain ${enX.domain})`,
    topic: enX.domain,
    questionEn: enX.question,
    questionKo: koX ? koX.question : enX.question,
    optionsEn: enX.options,
    optionsKo: koX && koX.options && koX.options.length === enX.options.length
      ? koX.options
      : enX.options,
    answer: enX.answer,
    explanationEn: enX.explanation || '',
    explanationKo: koX ? (koX.explanation || '') : '',
  });
}

// Check quality
const missingKoQ = finalQuestions.filter(q => !q.questionKo || q.questionKo === q.questionEn);
const nonTFEn = finalQuestions.filter(q => q.optionsEn.length < 4 && !(q.optionsEn.length === 2 && /^(true|false|yes|no)$/i.test(q.optionsEn[0]?.text)));
const nonTFKo = finalQuestions.filter(q => q.optionsKo.length !== q.optionsEn.length);

console.log('Total questions generated:', finalQuestions.length);
console.log('Missing KO question count:', missingKoQ.length);
console.log('Non-T/F <4 EN options count:', nonTFEn.length);
console.log('Mismatched KO/EN option count:', nonTFKo.length);
if (nonTFEn.length > 0) {
  console.log('Sample non-T/F <4 EN:', nonTFEn.map(q => ({ id: q.id, code: q.code, len: q.optionsEn.length, opts: q.optionsEn })));
}

fs.mkdirSync('public', { recursive: true });
fs.writeFileSync('public/questions.json', JSON.stringify(finalQuestions, null, 2), 'utf8');
console.log('Saved public/questions.json successfully!');
