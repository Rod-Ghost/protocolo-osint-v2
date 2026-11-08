"""Encrypted browser vault under Node's Web Crypto, no external network."""
import subprocess
from pathlib import Path


def test_encrypted_browser_vault_roundtrip():
    root=Path(__file__).resolve().parents[2]
    program=r'''
const {webcrypto} = require('node:crypto');
const {createVault,STORAGE_KEY} = require('./apps/web/assets/vault.js');
const data = new Map();
const store = {getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};
const expect=(ok,msg)=>{if(!ok)throw new Error(msg);};
(async()=>{
 const v=createVault(store,webcrypto);
 expect(!v.status().exists,'empty');
 await v.setup('uma-senha-local-muito-forte');
 const original=await v.createCase('Teste fictício','Somente dados de demonstração');
 const evidence=await v.addEvidence(original.id,{title:'Fonte pública',url:'https://example.org',kind:'reference',note:'texto de teste'});
 expect(evidence.sha256.length===64,'hash');
 expect((await v.graph(original.id)).nodes.length===2,'graph');
 expect(!data.get(STORAGE_KEY).includes('Fonte pública'),'ciphertext not plaintext');
 const backup=await v.exportAll();expect(backup.cases[0].evidence.length===1,'backup');
 v.lock();expect(!v.status().unlocked,'locked');
 try{await v.unlock('senha-incorreta');throw new Error('Bad pass accepted')}catch(e){expect(e.message.includes('Senha incorreta'),'bad password');}
 await v.unlock('uma-senha-local-muito-forte');
 expect((await v.getCase(original.id)).evidence[0].title==='Fonte pública','restore');
 const same={sha256:'a'.repeat(64),dhash:'0'.repeat(16),width:90,height:60};
 await v.addImage(original.id,'image1.png',same);
 const second=await v.addImage(original.id,'image2.png',same);
 expect(second.similar_in_case[0].distance===0,'perceptual match');
 console.log('vault roundtrip okay');
})().catch(e=>{console.error(e);process.exitCode=1});
'''
    result=subprocess.run(['node','-e',program],cwd=root,text=True,capture_output=True,timeout=20)
    assert result.returncode==0,(result.stdout,result.stderr)
