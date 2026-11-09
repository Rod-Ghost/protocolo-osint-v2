/* Protocolo OSINT V2 · private dashboard read-model.
 * Pure functions: all numbers describe encrypted LOCAL records, never remote
 * search matches, real-time monitoring, or confirmed identities.
 */
(function (root) {
  'use strict';
  const DAY = 86400000;
  const timestamp = value => {
    const n = Date.parse(value || '');
    return Number.isFinite(n) ? n : null;
  };
  const safeString = value => typeof value === 'string' ? value.slice(0, 240) : '';
  const safeArray = value => Array.isArray(value) ? value : [];

  function summarize(cases, now = Date.now()) {
    if (!Array.isArray(cases)) throw new TypeError('Cases must be an array.');
    const clock = Number.isFinite(now) ? now : Date.now();
    const items = [], timeline = [], due = [];
    let evidenceCount = 0, planCount = 0, reviewedPlans = 0;

    for (const c of cases) {
      if (!c || typeof c !== 'object') continue;
      const caseId = safeString(c.id);
      const caseTitle = safeString(c.title) || 'Caso sem título';
      const evidence = safeArray(c.evidence);
      const plans = safeArray(c.search_plans);
      evidenceCount += evidence.length;
      planCount += plans.length;
      let pending = 0;
      let lastActivity = timestamp(c.created_at) || 0;
      const created = timestamp(c.created_at);
      if (created !== null) timeline.push({
        type: 'case', caseId, caseTitle, label: 'Caso criado',
        title: caseTitle, time: created
      });
      for (const e of evidence) {
        const ts = timestamp(e?.created_at);
        if (ts === null) continue;
        lastActivity = Math.max(lastActivity, ts);
        timeline.push({type: 'evidence',caseId,caseTitle,
          label: 'Registro documentado', title:safeString(e.title) || 'Registro', time:ts});
      }
      for (const p of plans) {
        if (!p || typeof p !== 'object') continue;
        const reviews = safeArray(p.reviews);
        if (reviews.length) reviewedPlans++;
        const planId = safeString(p.id), planTitle=safeString(p.title) || 'Plano sem título';
        const changed = timestamp(p.updated_at) || timestamp(p.created_at);
        if (changed !== null) {
          lastActivity = Math.max(lastActivity,changed);
          timeline.push({type:'plan',caseId,caseTitle,planId,
            label:'Plano atualizado',title:planTitle,time:changed});
        }
        let lastReview = null;
        for (const r of reviews) {
          const time = timestamp(r?.observed_at);
          if (time === null) continue;
          if (lastReview === null || time > lastReview) lastReview=time;
        }
        if (lastReview !== null) {
          lastActivity=Math.max(lastActivity,lastReview);
          timeline.push({type:'review',caseId,caseTitle,planId,
            label:'Revisão manual registrada',title:planTitle,time:lastReview});
        }
        const interval = Number(p.interval_days);
        // Due indicators are LOCAL reminders, never notifications from the web.
        if (interval===7 || interval===30) {
          const baseline = lastReview ?? timestamp(p.created_at);
          if (baseline !== null && baseline + interval * DAY <= clock) {
            pending++;
            due.push({caseId,caseTitle,planId,title:planTitle,
              dueAt:baseline+interval*DAY,intervalDays:interval});
          }
        }
      }
      items.push({id:caseId,title:caseTitle,evidence:evidence.length,plans:plans.length,
        pending,lastActivity});
    }
    timeline.sort((a,b)=>b.time-a.time);
    due.sort((a,b)=>a.dueAt-b.dueAt);
    items.sort((a,b)=>b.lastActivity-a.lastActivity);
    return {
      caseCount:items.length,evidenceCount,planCount,reviewedPlans,
      dueCount:due.length,reviewRate:planCount?Math.round(reviewedPlans/planCount*100):0,
      cases:items,events:timeline.slice(0,12),due:due.slice(0,12),
      generatedAt:clock,scope:'local-browser-data',externalRequests:0
    };
  }
  const api={summarize};
  root.ProtocoloDashboardModel=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
