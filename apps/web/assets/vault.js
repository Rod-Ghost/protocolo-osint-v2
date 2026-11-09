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
