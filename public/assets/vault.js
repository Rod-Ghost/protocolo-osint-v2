/* Protocolo OSINT V2 · independent encrypted browser vault.
   AES-GCM with PBKDF2. Does not synchronize or send case data to a server.
   Requires a secure browser context. For storage limited to one device/profile.
*/
(function (root) {
  'use strict';
  const STORAGE_KEY = 'protocolo-osint:vault:1';
  const ITERATIONS = 310000;
  const MAX_DATA_BYTES = 1_000_000;
  const coder = new TextEncoder(), decoder = new TextDecoder();
  const base64 = bytes => {
    let text = ''; for (const byte of bytes) text += String.fromCharCode(byte);
    if (typeof btoa === 'function') return btoa(text);
    return Buffer.from(bytes).toString('base64');
  };
  const unbase64 = data => {
    const binary = typeof atob === 'function' ? atob(data) : Buffer.from(data, 'base64').toString('binary');
    return Uint8Array.from(binary, c => c.charCodeAt(0));
  };
  function createVault(storage, cryptoApi) {
    if (!cryptoApi || !cryptoApi.subtle || typeof cryptoApi.getRandomValues !== 'function') {
      throw new Error('O cofre requer Web Crypto em HTTPS.');
    }
    let key = null, state = null, lastRaw = null;
    const fresh = () => ({schema:1,cases:[]});
    const getRaw = () => storage.getItem(STORAGE_KEY);
    const random = length => cryptoApi.getRandomValues(new Uint8Array(length));
    const id = () => cryptoApi.randomUUID ? cryptoApi.randomUUID() : base64(random(16)).replace(/[^\w]/g,'');
    const clone = item => JSON.parse(JSON.stringify(item));
    const now = () => new Date().toISOString();
    // Notify same-tab UI without ever including decrypted case content in event payload.
    const changed = () => {
      if(typeof root.dispatchEvent === 'function' && typeof root.Event === 'function')
        root.dispatchEvent(new root.Event('protocolo:vault-change'));
    };
    const assertUnlocked = () => {
      if (!state || !key) throw new Error('Desbloqueie o cofre primeiro.');
    };
    const digest = async bytes => Array.from(new Uint8Array(await cryptoApi.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
    async function derive(passphrase,salt) {
      if (passphrase.length < 10) throw new Error('Use uma senha de pelo menos 10 caracteres.');
      const raw = await cryptoApi.subtle.importKey('raw',coder.encode(passphrase),'PBKDF2',false,['deriveKey']);
      return cryptoApi.subtle.deriveKey({name:'PBKDF2',salt,iterations:ITERATIONS,hash:'SHA-256'},raw,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
    }
    async function save(salt) {
      assertUnlocked();
      const current = getRaw();
      if (lastRaw !== current) throw new Error('Este cofre foi alterado em outra aba. Recarregue antes de salvar.');
      const bytes = coder.encode(JSON.stringify(state));
      if (bytes.length > MAX_DATA_BYTES) throw new Error('Cofre atingiu o limite local. Exporte um backup e reduza os registros.');
      const iv = random(12);
      const cipher = new Uint8Array(await cryptoApi.subtle.encrypt({name:'AES-GCM',iv},key,bytes));
      const record = JSON.stringify({version:1,iterations:ITERATIONS,salt:base64(salt),iv:base64(iv),data:base64(cipher)});
      storage.setItem(STORAGE_KEY,record);lastRaw=record;changed();
    }
    let vaultSalt = null;
    return {
      status() {return {exists:!!getRaw(),unlocked:!!state,localOnly:true};},
      async setup(passphrase) {
        if (getRaw()) throw new Error('O cofre já existe. Desbloqueie com sua senha.');
        vaultSalt=random(16);key=await derive(passphrase,vaultSalt);state=fresh();lastRaw=null;await save(vaultSalt);return this.status();
      },
      async unlock(passphrase) {
        const raw=getRaw();if (!raw) throw new Error('Ainda não existe um cofre neste navegador.');
        let record;try{record=JSON.parse(raw);}catch{throw new Error('Dados do cofre inválidos.');}
        if (record.version!==1 || record.iterations!==ITERATIONS)throw new Error('Versão de cofre incompatível.');
        const candidate=await derive(passphrase,unbase64(record.salt));
        try {
          const decrypted=await cryptoApi.subtle.decrypt({name:'AES-GCM',iv:unbase64(record.iv)},candidate,unbase64(record.data));
          const payload=JSON.parse(decoder.decode(decrypted));
          if (payload.schema!==1||!Array.isArray(payload.cases))throw new Error('Formato inválido.');
          state=payload;key=candidate;vaultSalt=unbase64(record.salt);lastRaw=raw;
        } catch{state=null;key=null;vaultSalt=null;throw new Error('Senha incorreta ou conteúdo do cofre corrompido.');}
        changed();return this.status();
      },
      lock(){key=null;state=null;vaultSalt=null;lastRaw=null;changed();return this.status();},
      async summary(){assertUnlocked();return {cases:state.cases.length,evidence:state.cases.reduce((n,c)=>n+c.evidence.length,0)};},
      async listCases(){assertUnlocked();return state.cases.map(c=>({id:c.id,title:c.title,description:c.description,created_at:c.created_at,evidence_count:c.evidence.length})).reverse();},
      async getCase(caseId){assertUnlocked();const c=state.cases.find(c=>c.id===caseId);return c?clone(c):null;},
      async createCase(title,description=''){
        assertUnlocked();title=title.trim();if(title.length<2||title.length>120)throw new Error('Título deve ter 2 a 120 caracteres.');
        const item={id:id(),title,description:description.trim().slice(0,1500),created_at:now(),evidence:[],images:[],search_plans:[]};
        state.cases.push(item);await save(vaultSalt);return clone(item);
      },
      async saveSearchPlan(caseId,entry){
        assertUnlocked();
        const c=state.cases.find(c=>c.id===caseId);
        if(!c)throw new Error('Caso não encontrado.');
        if(!entry||typeof entry!=='object')throw new Error('Plano de busca inválido.');
        const title=String(entry.title||'').trim(),query=String(entry.query||'').trim();
        if(title.length<2||title.length>120||query.length<2||query.length>240)
          throw new Error('Título ou termo do plano inválido.');
        if(!Array.isArray(entry.source_ids)||!entry.source_ids.length||entry.source_ids.length>60)
          throw new Error('Escolha entre 1 e 60 fontes por plano.');
        const sourceIds=[...new Set(entry.source_ids)];
        if(sourceIds.some(x=>typeof x!=='string'||!/^[a-z0-9-]{1,60}$/.test(x)))
          throw new Error('Identificador de fonte inválido.');
        const interval=Number(entry.interval_days||0);
        if(![0,7,30].includes(interval))throw new Error('Frequência de revisão inválida.');
        const filters=entry.filters||{};
        if(typeof filters!=='object'||Array.isArray(filters))
          throw new Error('Filtros inválidos.');
        const safeFilters={exact:filters.exact===true,site:String(filters.site||'').slice(0,120),
          filetype:String(filters.filetype||'').slice(0,10),exclude:String(filters.exclude||'').slice(0,100)};
        if(!Array.isArray(c.search_plans))c.search_plans=[];
        const previous=entry.id?c.search_plans.find(p=>p.id===entry.id):null;
        if(entry.id&&!previous)throw new Error('Plano anterior não encontrado.');
        const item={id:previous?.id||id(),title,query,
          kind:String(entry.kind||'auto').slice(0,40),source_ids:sourceIds,
          filters:safeFilters,interval_days:interval,
          created_at:previous?.created_at||now(),updated_at:now(),
          reviews:previous?.reviews||[]};
        if(previous)Object.assign(previous,item);
        else{
          if(c.search_plans.length>=30)throw new Error('Limite de 30 planos por caso.');
          c.search_plans.push(item);
        }
        await save(vaultSalt);
        return clone(item);
      },
      async reviewSearchPlan(caseId,planId,entry={}){
        assertUnlocked();
        const c=state.cases.find(c=>c.id===caseId);
        const plan=c?.search_plans?.find(p=>p.id===planId);
        if(!plan)throw new Error('Plano não encontrado.');
        const count=entry.count==null||entry.count===''?null:Number(entry.count);
        if(count!==null&&(!Number.isSafeInteger(count)||count<0||count>1000000000))
          throw new Error('Contagem manual inválida.');
        const note=String(entry.note||'').trim();
        if(note.length>500)throw new Error('Anotação longa demais.');
        const reviews=plan.reviews||[];
        const previous=reviews.length?reviews[reviews.length-1]:null;
        const review={id:id(),observed_at:now(),count,note,
          delta:count!==null&&previous?.count!==null&&previous?.count!==undefined
            ?count-previous.count:null,
          count_origin:'manual_unverified'};
        plan.reviews=[...reviews,review].slice(-20);
        plan.updated_at=now();
        await save(vaultSalt);
        return clone(review);
      },
      async saveEngineFindings(caseId,entries,{reviewNote=''}={}){
        // Explicit, local-only import of selected records after operator review.
        // Nothing is sent to the worker, Vercel, or any third-party provider.
        assertUnlocked();
        const c=state.cases.find(item=>item.id===caseId);
        if(!c)throw new Error('Caso não encontrado.');
        if(!Array.isArray(entries)||entries.length<1||entries.length>25)
          throw new Error('Selecione entre 1 e 25 observações por lote.');
        if(typeof reviewNote!=='string'||reviewNote.trim().length>1000)
          throw new Error('Anotação de revisão inválida (até 1.000 caracteres).');
        const engines=new Set(['sherlock','maigret','subfinder','amass','spiderfoot']);
        const jobPattern=/^[a-f0-9]{32}$/;
        const allowedKinds=new Set(['','auto','username','domain','url','email','ip','cidr','asn','phone','name','bitcoin']);
        const original=clone(c.evidence);
        const imported=[],duplicates=[],batchKeys=new Set();
        try{
          for(const item of entries){
            if(!item||typeof item!=='object'||!engines.has(item.engine)||
               typeof item.job_id!=='string'||!jobPattern.test(item.job_id)||
               typeof item.target!=='string'||item.target.length<2||item.target.length>253||
               typeof item.raw_record!=='string'||!item.raw_record.trim()||
               item.raw_record.length>400||
               !allowedKinds.has(item.target_kind||'')||
               item.verification!=='unverified'||item.capture_method!=='daemon-output')
              throw new Error('Resultado do motor inválido ou sem procedência.');
            const raw=item.raw_record.trim();
            const rawSha=await digest(coder.encode(raw));
            const unique=item.job_id+':'+rawSha;
            if(batchKeys.has(unique)||c.evidence.some(e=>e.provenance?.type==='engine_observation'&&
              e.provenance?.job_id===item.job_id&&e.provenance?.raw_sha256===rawSha)){
              duplicates.push(unique);continue;
            }
            batchKeys.add(unique);
            if(c.evidence.length>=250)throw new Error('Limite de 250 registros por caso. Exporte antes de ampliar.');
            let observedAt=null;
            if(item.observed_at!=null){
              if(typeof item.observed_at!=='string'||!Number.isFinite(Date.parse(item.observed_at)))
                throw new Error('Data observada inválida.');
              observedAt=new Date(item.observed_at).toISOString();
            }
            const at=now();
            const note=reviewNote.trim();
            const record={
              id:id(),case_id:caseId,kind:'note',
              title:('Achado '+item.engine+': '+raw).slice(0,180),
              url:null,
              note:'Registro bruto do motor, salvo após seleção explícita. '+
                'Identidade, autoria e origem remota NÃO verificadas.'+
                (note?' Observação: '+note:''),
              created_at:at,
              provenance:{
                type:'engine_observation',
                engine:item.engine,job_id:item.job_id,target:item.target,
                target_kind:item.target_kind||'auto',
                raw_record:raw,raw_sha256:rawSha,
                tool_reference:typeof item.tool_source==='string'?item.tool_source.slice(0,240):'',
                observed_at:observedAt,saved_at:at,
                capture_method:'daemon-output',
                verification_status:'unverified',
                review_status:'manually_selected_not_verified',
                review_note:note
              }
            };
            record.sha256=await digest(coder.encode(JSON.stringify(record)));
            c.evidence.push(record);imported.push({id:record.id,sha256:record.sha256});
          }
          if(imported.length)await save(vaultSalt);
        }catch(error){
          c.evidence=original;
          throw error;
        }
        return {saved:imported,duplicates:duplicates.length,case_id:caseId};
      },
      async addEvidence(caseId,entry){
        assertUnlocked();const c=state.cases.find(c=>c.id===caseId);if(!c)throw new Error('Caso não encontrado.');
        const title=String(entry.title||'').trim(),kind=entry.kind||'note';
        if(title.length<2||title.length>180)throw new Error('Título do registro inválido.');
        if (!['note','reference'].includes(kind))throw new Error('Tipo de registro inválido.');
        const url=entry.url?String(entry.url).trim():null;
        if (url){let parsed;try{parsed=new URL(url);}catch{throw new Error('URL inválida.');}
          if(parsed.protocol!=='https:'||parsed.username||parsed.password)throw new Error('Use URL HTTPS sem credenciais.');}
        const evidence={id:id(),case_id:caseId,kind,title,url,note:String(entry.note||'').slice(0,5000),created_at:now()};
        evidence.sha256=await digest(coder.encode(JSON.stringify(evidence)));
        c.evidence.push(evidence);await save(vaultSalt);return clone(evidence);
      },
      async addCapture(caseId,entry){
        // A browser-created snapshot of BYTES, not a notarized source or trusted time.
        assertUnlocked();
        const c=state.cases.find(item=>item.id===caseId);
        if(!c)throw new Error('Caso não encontrado.');
        if(!entry||typeof entry!=='object'||!(entry.bytes instanceof Uint8Array)||
           entry.bytes.length<1||entry.bytes.length>192*1024)
          throw new Error('Captura deve conter de 1 byte a 192 KiB.');
        const mime=String(entry.mime_type||'').toLowerCase().split(';')[0].trim();
        const allowed=new Set(['text/html','text/plain','text/csv','text/xml',
          'application/xml','application/json','application/pdf','image/png',
          'image/jpeg','image/webp']);
        if(!allowed.has(mime))throw new Error('Formato de captura não suportado.');
        const filename=String(entry.filename||'').trim();
        if(!filename||filename.length>140||/[\x00-\x1f\x7f/\\]/.test(filename))
          throw new Error('Nome do arquivo inválido.');
        const method=entry.method;
        if(!['user-file','cors-https'].includes(method))
          throw new Error('Método de captura inválido.');
        const note=String(entry.note||'').trim();
        if(note.length>1200)throw new Error('Observação longa demais.');
        const source=entry.source_url==null?'':String(entry.source_url).trim();
        if(source){
          let u;
          try{u=new URL(source)}catch{throw new Error('Fonte HTTPS inválida.')}
          const host=u.hostname.toLowerCase().replace(/\.$/,'');
          if(u.protocol!=='https:'||u.username||u.password||
             (u.port&&u.port!=='443')||
             !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{1,62}$/i.test(host)||
             source.length>1800||u.hash||/\.(?:local|test|internal|invalid|localhost)$/i.test(host))
            throw new Error('Fonte deve ser HTTPS pública sem credenciais, fragmentos ou porta especial.');
        }
        if(method==='cors-https'&&(!source||entry.http_status!==200))
          throw new Error('A resposta CORS deve ter origem pública e status HTTP 200.');
        if(c.evidence.length>=250)throw new Error('Caso atingiu o limite de 250 registros.');
        const raw=new Uint8Array(entry.bytes);
        const rawHash=await digest(raw);
        const existing=c.evidence.find(e=>e.capture?.sha256_bytes===rawHash);
        if(existing)return {saved:false,duplicate_id:existing.id,sha256_bytes:rawHash};
        const at=now();
        const capture={
          format:'protocolo-osint/capture-v1',
          filename,mime_type:mime,byte_count:raw.length,sha256_bytes:rawHash,
          bytes_base64:base64(raw),method,
          source_url:source||null,
          source_url_declared:method==='user-file'&&!!source,
          http_status:method==='cors-https'?200:null,
          acquired_at_device:at,integrity_status:'not_independently_verified'
        };
        const evidence={
          id:id(),case_id:caseId,kind:'capture',
          title:('Captura de arquivo: '+filename).slice(0,180),
          url:source||null,note,
          created_at:at,capture
        };
        // Metadata hash and binary hash serve different purposes.
        evidence.sha256=await digest(coder.encode(JSON.stringify(evidence)));
        const original=clone(c.evidence);
        c.evidence.push(evidence);
        try{await save(vaultSalt)}catch(error){c.evidence=original;throw error}
        return {saved:true,evidence_id:evidence.id,sha256_bytes:rawHash,
          byte_count:raw.length,method};
      },
      async verifyCapture(caseId,evidenceId){
        assertUnlocked();
        const c=state.cases.find(item=>item.id===caseId);
        const e=c?.evidence?.find(item=>item.id===evidenceId);
        if(!e||e.kind!=='capture'||e.capture?.format!=='protocolo-osint/capture-v1')
          throw new Error('Captura não encontrada.');
        const meta=e.capture;
        if(typeof meta.bytes_base64!=='string'||!/^[a-zA-Z0-9+/]+={0,2}$/.test(meta.bytes_base64)||
           typeof meta.sha256_bytes!=='string'||!/^[a-f0-9]{64}$/.test(meta.sha256_bytes))
          return {valid:false,reason:'Metadados de captura inconsistentes.'};
        let raw;
        try{raw=unbase64(meta.bytes_base64)}catch{
          return {valid:false,reason:'Bytes codificados inválidos.'};
        }
        if(raw.length<1||raw.length>192*1024||raw.length!==meta.byte_count)
          return {valid:false,reason:'Tamanho dos bytes diverge do manifesto.'};
        const actual=await digest(raw);
        if(actual!==meta.sha256_bytes)
          return {valid:false,reason:'SHA-256 dos bytes não corresponde ao manifesto.',
            expected:meta.sha256_bytes,actual};
        return {valid:true,sha256_bytes:actual,byte_count:raw.length,
          filename:meta.filename,mime_type:meta.mime_type,method:meta.method};
      },
      async getCaptureBytes(caseId,evidenceId){
        const result=await this.verifyCapture(caseId,evidenceId);
        if(!result.valid)throw new Error('Integridade da captura falhou: '+result.reason);
        const c=state.cases.find(item=>item.id===caseId);
        const e=c.evidence.find(item=>item.id===evidenceId);
        return {...result,bytes:unbase64(e.capture.bytes_base64)};
      },
      async addImage(caseId,filename,result){
        assertUnlocked();const c=state.cases.find(c=>c.id===caseId);if(!c)throw new Error('Caso não encontrado.');
        const distance = (x,y) => {
          let diff=BigInt('0x'+x)^BigInt('0x'+y),count=0;while(diff){count++;diff&=diff-1n;}return count;
        };
        const matches=c.images.map(img=>({title:img.title,distance:distance(img.dhash,result.dhash)})).filter(x=>x.distance<=10).sort((a,b)=>a.distance-b.distance).slice(0,10);
        const record=await this.addEvidence(caseId,{kind:'note',title:'Análise de imagem: '+filename.slice(0,100),note:`SHA-256: ${result.sha256} | dHash: ${result.dhash} | ${result.width}×${result.height}`});
        c.images.push({id:id(),title:filename.slice(0,120),sha256:result.sha256,dhash:result.dhash,created_at:now()});
        await save(vaultSalt);
        return {similar_in_case:matches,evidence_id:record.id,registered_in_case:true};
      },
      async graph(caseId){
        const c=await this.getCase(caseId);if(!c)return null;
        return {nodes:[{id:c.id,label:c.title,kind:'case'},...c.evidence.map(e=>({id:e.id,label:e.title,kind:e.kind}))],
                edges:c.evidence.map(e=>({source:c.id,target:e.id}))};
      },
      async exportCase(caseId){const c=await this.getCase(caseId);if(!c)throw new Error('Caso não encontrado.');return {format:'protocolo-osint/v2-case-export',case:c,notice:'Backup JSON NÃO criptografado. Armazene em local seguro.'};},
      async exportAll(){assertUnlocked();return {format:'protocolo-osint/v2-vault-backup',exported_at:now(),cases:clone(state.cases),notice:'Backup JSON NÃO criptografado. Armazene em local seguro.'};}
    };
  }
  const api={createVault,STORAGE_KEY};
  root.ProtocoloVault=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
