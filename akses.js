/* Shared Supabase authentication. Database rules remain the authority. */
(function (g) {
  'use strict';
  const cfg = g.KONFIGURASI || {}, state = { client: null, profile: null, preview: false, configured: false };
  const $ = id => document.getElementById(id);
  const area = document.body.dataset.area || 'portal';
  let generation=0, hydration=0,sessionOwner;
  let loginProtection=null,loginInitialized=false,loginBusy=false;
  function syncLoginButton(){
    const button=$('login-submit');if(!button)return;
    const wait=loginProtection?.waitSeconds||0;
    button.disabled=loginBusy||!loginInitialized||!state.client||!loginProtection?.canSubmit;
    button.textContent=loginBusy?'Memproses…':wait?'Tunggu '+String(Math.floor(wait/60)).padStart(2,'0')+':'+String(wait%60).padStart(2,'0'):'Masuk';
  }
  const signature=profile=>profile?JSON.stringify([profile.id,profile.peran,profile.office_id,profile.aktif,profile.akses_portal,profile.akses_mess]):'';
  const authorized=profile=>!!profile?.aktif&&!(profile.peran==='crew'&&area!=='portal')&&(['administrator','super_admin'].includes(profile.peran)||!!profile[area==='mess'?'akses_mess':'akses_portal']);
  function setProfile(profile){if(signature(profile)!==signature(state.profile))generation++;state.profile=profile;}
  const stale=()=>Object.assign(new Error('Akses akun berubah. Buka kembali halaman dengan akun yang aktif.'),{code:'ACCESS_CHANGED',stale:true});
  function checkContext(seq,key){if(seq!==generation||key!==signature(state.profile)||!authorized(state.profile))throw stale();}
  function deny(message){setProfile(null);document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());$('app-shell').hidden=true;$('auth-screen').hidden=false;loginProtection?.activate();document.dispatchEvent(new CustomEvent('akses:berubah'));if(message)showError(message);}
  const canWrite = () => !!state.profile?.aktif && (['administrator','super_admin'].includes(state.profile.peran) || (state.profile.akses_portal && state.profile.peran === 'admin'));
  const superAdmin = () => state.profile?.aktif && ['administrator','super_admin'].includes(state.profile.peran);
  const administrator = () => !!state.profile?.aktif && state.profile.peran === 'administrator';
  const errorText = error => {
    if(error?.code==='invalid_credentials')return 'Email atau password tidak sesuai.';
    if(error?.code==='captcha_failed')return loginProtection?.turnstileEnabled
      ? 'Verifikasi keamanan belum berhasil. Ulangi verifikasi lalu coba lagi.'
      : 'Supabase masih meminta CAPTCHA. Hubungi Administrator untuk memeriksa pengaturan login.';
    if(error?.status===429||error?.code==='over_request_rate_limit')return 'Terlalu banyak permintaan. Tunggu sebentar sebelum mencoba lagi.';
    if (error?.message?.includes('Failed to fetch') || error?.message?.includes('NetworkError')) return 'Koneksi terputus. Periksa internet lalu coba kembali.';
    if (['PGRST205','42P01','PGRST202'].includes(error?.code)) return 'Database belum lengkap. Jalankan SQL pemasangan pada proyek Supabase baru.';
    return error?.message || 'Data belum dapat dimuat. Coba kembali.';
  };
  function showError(text) { $('auth-error').textContent = text; $('auth-error').hidden = !text; }
  function showApp() {
    loginProtection?.deactivate();
    $('auth-screen').hidden = true; $('app-shell').hidden = false;
    document.body.classList.toggle('read-only', !canWrite());
    document.body.classList.toggle('not-super-admin', !superAdmin());
    document.body.classList.toggle('not-administrator', !administrator());
    document.body.classList.toggle('mode-pratinjau', state.preview);
    document.querySelectorAll('[data-current-user]').forEach(el => { el.textContent = state.profile?.nama || 'Pratinjau tampilan'; });
    document.querySelectorAll('[data-actor-input]').forEach(el => { el.value = state.profile?.nama || ''; });
    document.querySelectorAll('[data-current-role]').forEach(el => { el.textContent = ({administrator:'Administrator',super_admin:'Super Admin',admin:'Admin',pembaca:'Hanya lihat',crew:'Crew'})[state.profile?.peran] || 'Belum terhubung'; });
    document.querySelectorAll('[data-super-admin]').forEach(el => { el.hidden = !superAdmin(); });
    document.querySelectorAll('[data-administrator]').forEach(el => { el.hidden = !administrator(); });
    document.querySelectorAll('[data-preview-notice]').forEach(el => { el.hidden = !state.preview; });
    document.dispatchEvent(new CustomEvent('akses:berubah'));
  }
  async function hydrate(user) {
    const seq=++hydration;
    if(sessionOwner!==undefined&&(user?.id||null)!==sessionOwner)throw stale();
    if (!user) { deny(''); return; }
    const { data, error } = await state.client.from('profil_pengguna').select('*').eq('id',user.id).single();
    if(seq!==hydration||user.id!==sessionOwner)throw stale();
    if (error || data?.id!==user.id || !authorized(data)) {
      const message = error ? errorText(error) : !data ? 'Profil akun belum tersedia. Hubungi Super Admin.' : !data.aktif ? 'Akun belum aktif. Hubungi Super Admin.' : 'Akun ini belum diberi akses ke web ini. Hubungi Super Admin.';
      deny(message);throw new Error(message);
    }
    setProfile(data); state.preview = false; showApp();
  }
  function loadSdk() {
    return new Promise((resolve,reject) => {
      const script = document.createElement('script');
      script.src = 'vendor/supabase.js';script.integrity='sha384-qafw21c/iciq0VXsi9FzkfoQv5I/V0iqE4lSNcKXPnW9/UTJLnv5CcN4FHxVLnKg';script.crossOrigin='anonymous';
      script.onload = () => g.supabase?.createClient ? resolve() : reject(new Error('Komponen login belum dapat dimuat. Muat ulang halaman.'));
      script.onerror = () => reject(new Error('Komponen login belum dapat dimuat. Periksa koneksi internet.'));
      document.head.append(script);
    });
  }
  async function init() {
    if (!cfg.urlSupabase || !cfg.kunciPublishable) {
      $('auth-description').textContent = 'Web siap dihubungkan ke proyek Supabase baru.';
      $('login-form').hidden = true; $('auth-setup').hidden = false; $('auth-preview').hidden = false;
      return;
    }
    let url;
    try { url = new URL(cfg.urlSupabase); } catch { throw new Error('URL Supabase pada konfigurasi.js belum valid.'); }
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.supabase.co') || url.pathname !== '/' || url.username || url.password || url.port || url.search || url.hash) throw new Error('Gunakan Project URL HTTPS Supabase pada konfigurasi.js.');
    if (cfg.kunciPublishable.startsWith('sb_secret_')) throw new Error('Gunakan publishable key, bukan secret key.');
    if (cfg.kunciPublishable.startsWith('eyJ')) {
      try { if (JSON.parse(atob(cfg.kunciPublishable.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).role !== 'anon') throw new Error('unsafe'); }
      catch { throw new Error('Kunci lama harus berjenis anon. Jangan gunakan service_role key.'); }
    }
    state.configured = true;
    if(!g.GALogin?.create)throw new Error('Komponen login belum dapat dimuat. Muat ulang halaman.');
    loginProtection=g.GALogin.create({project:url.origin,onChange:syncLoginButton});
    $('login-email').addEventListener('input',()=>{void loginProtection.setAccount($('login-email').value);});
    $('login-email').addEventListener('change',()=>{void loginProtection.setAccount($('login-email').value);});
    void loginProtection.setAccount($('login-email').value);
    await loadSdk();
    state.client = g.supabase.createClient(url.origin,cfg.kunciPublishable,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
    state.client.auth.onAuthStateChange((event,session) => {
      if (event === 'SIGNED_OUT') {const hadProfile=!!state.profile;sessionOwner=null;hydration++;deny('');if(hadProfile)location.reload();return;}
      if(['INITIAL_SESSION','SIGNED_IN','TOKEN_REFRESHED','USER_UPDATED','PASSWORD_RECOVERY'].includes(event)){
        const next=session?.user?.id||null;
        if(next!==sessionOwner){sessionOwner=next;hydration++;}
        if(state.profile&&next!==state.profile.id){deny('');location.reload();}
      }
    });
    const {data,error} = await state.client.auth.getSession();
    if (error) throw error;
    if(sessionOwner===undefined)sessionOwner=data.session?.user?.id||null;
    try { await hydrate(data.session?.user); } catch (err) { showError(errorText(err)); $('auth-reset').hidden = false; }
    loginInitialized=true;syncLoginButton();
  }
  const ready = init().catch(err => { showError(errorText(err)); });
  async function requireClient(write = false) {
    await ready;
    if (!authorized(state.profile) || state.preview) throw new Error('Masuk dengan akun yang aktif untuk menyimpan data.');
    if (write && !canWrite()) throw new Error('Akun ini hanya memiliki akses melihat.');
    return state.client;
  }
  async function rpc(name,args,write = false) {
    const client = await requireClient(write), controller = new AbortController();
    const seq=generation,key=signature(state.profile);
    let timedOut = false;
    const timer = setTimeout(() => { timedOut=true; controller.abort(); }, 30000);
    let response;
    try {
      let request = client.rpc(name,args);
      // Kiriman punya kunci idempotensi sendiri; SDK tidak mengulang RPC otomatis.
      if (typeof request.retry === 'function') request=request.retry(false);
      if (typeof request.abortSignal === 'function') request=request.abortSignal(controller.signal);
      response = await request;
      if (timedOut) throw Object.assign(new Error('Server belum mengirim konfirmasi. Gunakan Periksa penyimpanan sebelum mengirim ulang.'), {code:'RPC_TIMEOUT'});
    } catch (err) {
      if (timedOut) throw Object.assign(new Error('Server belum mengirim konfirmasi. Gunakan Periksa penyimpanan sebelum mengirim ulang.'), {code:'RPC_TIMEOUT'});
      throw err;
    } finally { clearTimeout(timer); }
    checkContext(seq,key);
    const {data,error} = response;
    if (error) throw Object.assign(new Error(errorText(error)), {code: error.code});
    // PostgREST represents composite row results as arrays, even for one row.
    const rows = ['simpan_office','atur_hak_akses_office','simpan_link_kerja','ubah_nama_akun','simpan_foto_karyawan','atur_masa_extra','simpan_karyawan','simpan_dokumen','catat_perpindahan_dokumen','simpan_perangkat','catat_serah_terima','tambah_skc','ambil_skc','terbitkan_impor_mess','simpan_jabatan','simpan_foto_profil','atur_hak_akses','simpan_tamu','simpan_catatan_admin','ubah_status_catatan','simpan_extra','catat_pemakaian_cuti'];
    if (rows.includes(name) && Array.isArray(data)) {
      if (data.length !== 1) throw new Error('Hasil penyimpanan belum dapat dipastikan. Muat ulang data sebelum mencoba lagi.');
      return data[0];
    }
    return data;
  }
  async function all(table,columns='*',filters={},order='id') {
    await ready; if (!state.profile || state.preview) return [];
    const client = await requireClient(),seq=generation,key=signature(state.profile); let rows = [];
    for (let offset=0;;offset+=500) {
      let query=client.from(table).select(columns).order(order).order('id').range(offset,offset+499);
      for(const [key,value] of Object.entries(filters)) query=query.eq(key,value);
      const {data,error}=await query;checkContext(seq,key); if(error) throw new Error(errorText(error));
      rows.push(...data); if(data.length<500) return rows;
    }
  }
  async function one(table,id,columns='*') {
    const client = await requireClient(),seq=generation,key=signature(state.profile), {data,error}=await client.from(table).select(columns).eq('id',id).single();
    checkContext(seq,key);
    if(error) throw new Error(errorText(error)); return data;
  }
  async function refreshProfile() {
    await ready;
    if (!state.client || state.preview) return;
    const {data,error} = await state.client.auth.getUser();
    if (error) throw new Error(errorText(error));
    await hydrate(data.user);
    return state.profile;
  }
  function acceptProfile(profile) {
    if (profile?.id !== state.profile?.id) return;
    hydration++;
    if(!authorized(profile)){deny('Akses akun berubah. Hubungi Super Admin.');return;}
    setProfile(profile); showApp();
  }
  g.Akses = Object.freeze({ready,canWrite,superAdmin,administrator,rpc,all,one,requireClient,errorText,refreshProfile,acceptProfile,
    get profile(){return state.profile;}, get preview(){return state.preview;}, get configured(){return state.configured;}});
  $('login-form').addEventListener('submit',async event => {
    event.preventDefault(); const button=$('login-submit'); if(button.disabled) return;
    loginBusy=true;syncLoginButton();showError('');
    const email=$('login-email').value.trim(),password=$('login-password').value;
    const controls=[$('login-email'),$('login-password'),$('auth-password-toggle')];controls.forEach(el=>{el.disabled=true;});
    let ticket;
    try {
      await ready; if(!state.client) throw new Error('Koneksi belum siap. Periksa konfigurasi Supabase.');
      ticket=await loginProtection.begin(email);
      const credentials={email,password};
      if(ticket.captchaToken)credentials.options={captchaToken:ticket.captchaToken};
      const {data,error}=await state.client.auth.signInWithPassword(credentials);
      ticket.captchaToken='';
      if(error){await loginProtection.failure(ticket,error);throw error;}
      loginProtection.success(ticket);
      if (area === 'portal') location.hash='link-kerja';
      await hydrate(data.user); $('login-password').value='';
    } catch(err) {
      if(ticket){ticket.captchaToken='';if(loginProtection.status==='submitting')await loginProtection.failure(ticket,err);}
      showError(errorText(err));$('auth-reset').hidden=false;
    }
    finally {loginBusy=false;controls.forEach(el=>{el.disabled=false;});syncLoginButton();}
  });
  $('auth-preview').addEventListener('click',() => { state.preview=true; showApp(); });
  $('auth-password-toggle').addEventListener('click',() => { const field=$('login-password'); field.type=field.type==='password'?'text':'password'; $('auth-password-toggle').textContent=field.type==='password'?'Lihat':'Sembunyikan'; });
  document.querySelectorAll('[data-logout]').forEach(el => el.addEventListener('click',async () => {
    el.disabled=true;
    try { if(state.client) { const {error}=await state.client.auth.signOut({scope:'local'}); if(error) throw error; } location.reload(); }
    catch(err) { el.disabled=false; showError(errorText(err)); g.PortalUI?.showToast(errorText(err)); }
  }));
})(window);
