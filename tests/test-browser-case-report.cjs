const assert=require('node:assert/strict');
const report=require('../apps/web/assets/browser-case-report.js');
const content=report.markdown({
 id:'case-01',title:'Lab <unsafe> **claim**',created_at:'2026-11-08',
 description:'Somente dados públicos de laboratório',
 evidence:[{id:'e1',title:'Link <tag>',kind:'reference',
  url:'https://example.org',created_at:'2026-11-08',
  sha256:'a'.repeat(64),note:'Fonte não verificada'}]
},'2026-11-08T12:00:00Z');
assert.match(content,/https:\/\/example\.org/);
assert.match(content,/não é laudo pericial/);
assert.ok(!content.includes('**claim**'));
assert.match(content,/\\\\?\*\\\\?\*claim/);
assert.throws(()=>report.markdown({evidence:[{}].concat(Array(200).fill({}))}),/200/);
console.log('browser-case-report: OK');
