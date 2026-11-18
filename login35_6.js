/* Turnstile is enforced by Supabase Auth, not by this browser counter.
 * The account counter below is a local UX delay, NOT a server account lock.
 * Managed Supabase Free has no password-attempt hook for a global failure count.
 */
(function (g) {
  'use strict';
  const API = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  const WINDOW = 10 * 60 * 1000, ACCOUNT_WAIT = 60 * 1000, SERVER_WAIT = 60 * 1000;
  const tokenLimit = 4 * 60 * 1000;
  function create({project,onChange=()=>{}}) {
    const $ = id => document.getElementById(id);
    const prefix = 'ga.login35.6:' + new URL(project).host + ':';
    const sitekey = String(g.LOGIN_GA?.siteKeyTurnstile || '').trim();
    const configured = /^[A-Za-z0-9_-]{15,128}$/.test(sitekey) && !/^(?:[123]x0|ISI_|YOUR_)/i.test(sitekey);
    const memory = new Map();
    let active=false, destroyed=false, account='', key='', accountVersion=0;
    let state='idle', note='', token='', tokenAt=0, widget=null, widgetVersion=0;
    let loader=null, script=null, timer=null, loadVersion=0, retryVisible=false;
    const now = () => Date.now();
    function read(k) {
      if(k.startsWith('memory:'))return memory.get(k);
      try { const value=g.localStorage.getItem(k); return value ? JSON.parse(value) : memory.get(k); }
      catch { return memory.get(k); }
    }
    function write(k,value) {
      memory.set(k,value);
      if(k.startsWith('memory:'))return;
      try { g.localStorage.setItem(k,JSON.stringify(value)); } catch { /* Private storage may be unavailable. */ }
    }
    function remove(k) { memory.delete(k); if(k.startsWith('memory:'))return;try { g.localStorage.removeItem(k); } catch {} }
    function record(k=key) {
      if (!k) return {count:0,first:now(),until:0};
      const r=read(k), time=now();
      if (!r || !Number.isInteger(r.count) || r.count<0 || r.count>5 || !Number.isFinite(r.first) || !Number.isFinite(r.until) || r.first>time || time-r.first>=WINDOW || r.until>time+ACCOUNT_WAIT) {
        if(r)remove(k);return {count:0,first:time,until:0};
      }
      if(r.until && r.until<=time){remove(k);return {count:0,first:time,until:0};}
      return r;
    }
    function serverUntil() {
      const value=read(prefix+'request-wait');
      if(!Number.isFinite(value)||value<=now()||value>now()+5*60*1000){if(value)remove(prefix+'request-wait');return 0;}
      return value;
    }
    function remaining() { return Math.max(0,Math.ceil((Math.max(record().until,serverUntil())-now())/1000)); }
    function duration(seconds) { return String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0'); }
    function currentToken() {
      if(token && now()-tokenAt>=tokenLimit){token='';tokenAt=0;state='expired';note='Verifikasi kedaluwarsa. Ulangi verifikasi untuk melanjutkan.';retryVisible=true;}
      return token;
    }
    function sync() {
      if(destroyed)return;
      currentToken();
      const wait=remaining(), panel=$('auth-verification'), status=$('auth-verification-status'), warning=$('auth-wait'), retry=$('auth-verification-retry');
      if(panel)panel.hidden=!active;
      if(status){status.textContent=note;status.hidden=!note;status.dataset.state=state;}
      if(retry)retry.hidden=!active||!retryVisible||wait>0;
      if(warning){warning.hidden=!active||wait===0;warning.textContent=wait?(serverUntil()?'Terlalu banyak permintaan. Tunggu '+duration(wait)+' sebelum mencoba lagi.':'Percobaan berulang pada akun ini. Tunggu '+duration(wait)+' sebelum mencoba lagi.') : '';}
      onChange();
    }
    async function setAccount(email) {
      const value=String(email||'').trim().toLowerCase(), seq=++accountVersion;
      account=value;key='';sync();
      if(!value)return;
      // Persist only a digest and short-lived counter. Never email/password/token.
      let digest;
      try {
        const bytes=await g.crypto.subtle.digest('SHA-256',new g.TextEncoder().encode(value));
        digest=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
      } catch { digest='memory:'+value; }
      if(seq!==accountVersion||destroyed)return;
      key=prefix+digest;
      // With no Web Crypto, the account identifier stays in memory only.
      if(digest.startsWith('memory:'))key='memory:'+key;
      sync();
    }
    function removeWidget() {
      widgetVersion++;token='';tokenAt=0;
      if(widget!==null){try{g.turnstile?.remove(widget);}catch{}widget=null;}
      $('auth-turnstile')?.replaceChildren();
    }
    function captchaError(message) {
      token='';tokenAt=0;state='error';note=message||'Verifikasi belum berhasil. Periksa koneksi lalu ulangi verifikasi.';retryVisible=true;sync();
    }
    function load() {
      if(g.turnstile?.render)return Promise.resolve();
      if(loader)return loader;
      const seq=++loadVersion;
      loader=new Promise((resolve,reject)=>{
        let done=false;
        const finish=error=>{
          if(done)return;done=true;g.clearTimeout(timeout);
          if(seq!==loadVersion){reject(new Error('Verifikasi dibatalkan.'));return;}
          if(error){script?.remove();script=null;loader=null;reject(error);}else resolve();
        };
        const timeout=g.setTimeout(()=>finish(new Error('Verifikasi belum dapat dimuat. Periksa koneksi lalu coba lagi.')),15000);
        script=document.createElement('script');script.src=API;script.async=true;script.defer=true;script.referrerPolicy='same-origin';
        script.onload=()=>finish(g.turnstile?.render?null:new Error('Verifikasi belum dapat dimuat. Ulangi verifikasi.'));
        script.onerror=()=>finish(new Error('Verifikasi belum dapat dimuat. Periksa koneksi lalu coba lagi.'));
        document.head.append(script);
      });
      return loader;
    }
    async function render() {
      if(!active||destroyed)return;
      removeWidget();const seq=widgetVersion;
      retryVisible=false;
      if(!configured){state='unconfigured';note='Verifikasi keamanan belum disiapkan. Hubungi Administrator.';sync();return;}
      state='loading';note='Menyiapkan verifikasi keamanan…';sync();
      try {
        await load();if(!active||destroyed||seq!==widgetVersion)return;
        const callbacksCurrent=()=>active&&!destroyed&&seq===widgetVersion;
        widget=g.turnstile.render($('auth-turnstile'),{
          sitekey,theme:'auto',size:'flexible',appearance:record().count>=3?'always':'interaction-only',
          action:'portal_login',retry:'never','refresh-expired':'manual','refresh-timeout':'manual',
          callback:value=>{
            if(!callbacksCurrent())return;
            if(typeof value!=='string'||!value||value.length>4096){captchaError();return;}
            token=value;tokenAt=now();state='verified';note='';retryVisible=false;sync();
          },
          'expired-callback':()=>{if(callbacksCurrent()){token='';tokenAt=0;state='expired';note='Verifikasi kedaluwarsa. Ulangi verifikasi untuk melanjutkan.';retryVisible=true;sync();}},
          'timeout-callback':()=>{if(callbacksCurrent())captchaError('Waktu verifikasi habis. Ulangi verifikasi untuk melanjutkan.');},
          'error-callback':()=>{if(callbacksCurrent())captchaError();return true;},
          'before-interactive-callback':()=>{if(callbacksCurrent()){state='challenge';note='Selesaikan verifikasi keamanan di bawah ini.';sync();}}
        });
        if(state==='loading'){state='checking';note='Memeriksa keamanan koneksi…';sync();}
      } catch(error){if(active&&!destroyed&&seq===widgetVersion)captchaError(error.message);}
    }
    function activate() {
      if(destroyed)return;
      if(!active){active=true;timer=g.setInterval(sync,1000);void render();}
      sync();
    }
    function deactivate() {
      active=false;g.clearInterval(timer);timer=null;removeWidget();state='idle';note='';retryVisible=false;sync();
    }
    async function begin(email) {
      const value=String(email||'').trim().toLowerCase();
      if(value!==account||!key)await setAccount(value);
      sync();
      if(!active||!configured)throw new Error('Verifikasi keamanan belum siap. Hubungi Administrator.');
      if(remaining())throw new Error('Tunggu hingga jeda percobaan selesai.');
      if(!currentToken())throw new Error('Selesaikan verifikasi keamanan sebelum masuk.');
      const ticket={key,email:value,captchaToken:token};
      // Consume the token before sending: double submit cannot reuse it.
      token='';tokenAt=0;state='submitting';note='';sync();
      return ticket;
    }
    async function failure(ticket,error) {
      if(error?.code==='invalid_credentials'){
        const r=record(ticket.key),count=Math.min(5,r.count+1);
        write(ticket.key,{count,first:r.first,until:count>=5?now()+ACCOUNT_WAIT:0});
      }
      if(error?.status===429||error?.code==='over_request_rate_limit'){
        const seconds=Number(error?.retryAfter), wait=Number.isFinite(seconds)&&seconds>0?Math.min(300,Math.max(1,Math.ceil(seconds)))*1000:SERVER_WAIT;
        write(prefix+'request-wait',Math.max(serverUntil(),now()+wait));
      }
      if(active)await render();sync();
    }
    function success(ticket) {remove(ticket.key);deactivate();}
    function storage(event) {if(event.key===null||event.key?.startsWith(prefix))sync();}
    const retry=()=>{if(active&&!remaining())void render();};
    $('auth-verification-retry')?.addEventListener('click',retry);
    g.addEventListener('storage',storage);
    return Object.freeze({activate,deactivate,setAccount,begin,failure,success,
      get canSubmit(){return active&&configured&&!!currentToken()&&!remaining();},
      get waitSeconds(){return remaining();},get status(){return state;},
      destroy(){deactivate();destroyed=true;accountVersion++;g.removeEventListener('storage',storage);$('auth-verification-retry')?.removeEventListener('click',retry);}
    });
  }
  g.GALogin = Object.freeze({create});
})(window);
