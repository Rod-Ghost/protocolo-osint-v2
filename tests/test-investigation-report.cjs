'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const model=require('../apps/web/assets/investigation-report.js');
test('observed provider is counted only from returned records',()=>{
 const s=model.normalizeLookup('dns',{provider:'dns',provider_name:'DNS público',query:'example.org',
   status:'observed',count:9999,items:[{type:'A',name:'example.org',data:'192.0.2.10'}],
   observed_at:'2026-11-10T12:00:00Z',source_url:'https://cloudflare-dns.com/dns-query'},'example.org');
 assert.equal(s.status,'observed');assert.equal(s.count,1);
 assert.equal(s.items.length,1);
 assert.equal(s.source_url,'https://cloudflare-dns.com/dns-query');
 const empty=model.normalizeLookup('certificates',{provider:'certificates',query:'example.org',
   status:'no_result',items:[],count:0,source_url:'https://crt.sh/?q=example.org'},'example.org');
 const error=model.failure('github','GitHub',new Error('HTTP 503'));
 assert.deepEqual(model.summary({sources:[s,empty,error]}),
  {sources:3,checked:2,with_records:1,no_records:1,failed:1,pending:0,returned:1});
});
test('fail closed for mismatched provider, query and unsupported status',()=>{
 const base={provider:'github',query:'some-user',status:'observed',items:[{login:'some-user'}]};
 assert.throws(()=>model.normalizeLookup('dns',base,'some-user'),/Resposta inesperada/);
 assert.throws(()=>model.normalizeLookup('github',base,'other'),/Resposta inesperada/);
 assert.throws(()=>model.normalizeLookup('github',{...base,status:'ok'},'some-user'),/Resposta inesperada/);
 assert.equal(model.safeLink('javascript:alert(1)'),'');
 assert.equal(model.safeLink('http://example.org'),'');
});
test('completed worker outputs are unverified records, not identity proofs',()=>{
 const job={engine:'subfinder',job_id:'a'.repeat(32)};
 const result=model.normalizeEngine(job,{status:'completed',records:['a.example.org','b.example.org'],
   completed_at:'2026-11-10T12:00:00Z'});
 assert.equal(result.status,'completed');assert.equal(result.count,2);
 assert.match(result.notice,/não verificadas/i);
 assert.equal(model.normalizeEngine(job,{status:'pending'}).count,null);
});
test('PDF bytes have valid objects, cross-reference and clickable source URL',()=>{
 const source=model.normalizeLookup('dns',{provider:'dns',provider_name:'DNS público',query:'example.org',
   status:'observed',items:[{type:'A',data:'192.0.2.9'}],
   observed_at:'2026-11-10T12:00:00Z',source_url:'https://cloudflare-dns.com/dns-query'},'example.org');
 const bytes=model.pdfBytes({target:'example.org',kind:'domain',
   observed_at:'2026-11-10T12:00:00Z',sources:[source]});
 const pdf=Buffer.from(bytes).toString('latin1');
 assert(pdf.startsWith('%PDF-1.4\n'));
 assert.match(pdf,/\/Type \/Catalog/);
 assert.match(pdf,/\/Subtype \/Link/);
 assert.match(pdf,/\/URI \(https:\/\/cloudflare-dns\.com\/dns-query\)/);
 assert.match(pdf,/\/Count 1/);
 assert.match(pdf,/%%EOF/);
 const xref=Number(pdf.match(/startxref\n(\d+)/)[1]);
 assert.equal(pdf.slice(xref,xref+4),'xref');
});
test('PDF remains an honest report for failed providers without fictional hits',()=>{
 const bytes=model.pdfBytes({target:'example.org',kind:'domain',
   sources:[model.failure('dns','DNS público','HTTP 502')]});
 const pdf=Buffer.from(bytes).toString('latin1');
 assert.match(pdf,/sem contagem confirmada/);
 assert.match(pdf,/Falhas: 1/);
 assert.throws(()=>model.pdfBytes({sources:Array(66).fill({})}),/inválido/);
});

test('48+ catalogue sources fit PDF without inventing API counts',()=>{
 const sources=Array.from({length:49},(_,i)=>({
   id:'manual-'+i,label:'Fonte manual '+i,status:'not_queried',count:null,
   items:[],query_url:'https://example.org/search?q=s'+i,
   notice:'Não foi realizada nenhuma consulta externa nesta fonte.'
 }));
 const bytes=model.pdfBytes({target:'Test Person',kind:'free_text',sources});
 const pdf=Buffer.from(bytes).toString('latin1');
 assert.match(pdf,/49 entradas/);
 assert.match(pdf,/NAO CONSULTADA/);
 assert.match(pdf,/0 efetivamente consultadas/);
 assert.match(pdf,/\/URI \(https:\/\/example\.org\/search\?q=s0\)/);
 assert.match(pdf,/\/Count [2-9]/);
});
