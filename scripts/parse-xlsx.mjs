import { readFileSync } from 'node:fs';

const base = process.argv[2];
const shared = readFileSync(`${base}/xl/sharedStrings.xml`, 'utf8');
const sheet = readFileSync(`${base}/xl/worksheets/sheet1.xml`, 'utf8');

const siRe = /<si>([\s\S]*?)<\/si>/g;
const strings = [];
let m;
while ((m = siRe.exec(shared))) {
  const inner = m[1];
  const tRe = /<t[^>]*>([\s\S]*?)<\/t>/g;
  let t;
  let acc = '';
  while ((t = tRe.exec(inner))) acc += t[1];
  strings.push(acc.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
}

const colToNum = (c) => {
  let n = 0;
  for (const ch of c) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
};

const rowRe = /<row r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
const rows = [];
while ((m = rowRe.exec(sheet))) {
  const rn = Number(m[1]);
  const cellRe = /<c r="([A-Z]+)(\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  let c;
  const row = {};
  while ((c = cellRe.exec(m[2]))) {
    const col = c[1];
    const attrs = c[3] || '';
    const body = c[4] || '';
    let val = '';
    const isStr = /t="s"/.test(attrs);
    const vMatch = /<v>([\s\S]*?)<\/v>/.exec(body);
    const isMatch = /<is>([\s\S]*?)<\/is>/.exec(body);
    if (isStr && vMatch) val = strings[Number(vMatch[1])] ?? '';
    else if (isMatch) val = isMatch[1].replace(/<[^>]+>/g, '');
    else if (vMatch) val = vMatch[1];
    if (val !== '') row[colToNum(col)] = val;
  }
  if (Object.keys(row).length) rows.push({ rn, row });
}

for (const { rn, row } of rows) {
  const keys = Object.keys(row).map(Number).sort((a, b) => a - b);
  console.log(`R${rn}: ` + keys.map((k) => `[${k}]${row[k]}`).join(' | '));
}
