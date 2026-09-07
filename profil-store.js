(function (g) {
  'use strict';
  const A = g.Akses, bucket = 'foto_profil';
  const roles = Object.freeze({ super_admin: 'Super Admin', admin: 'Admin', pembaca: 'Pembaca' });
  function validatePassword(password, confirm) {
    if (password !== confirm) throw new Error('Konfirmasi password belum sama.');
    if (password.length < 8) throw new Error('Gunakan password minimal 8 karakter.');
    if (password.length > 128) throw new Error('Password maksimal 128 karakter.');
  }
  async function changePassword(password, confirm, nonce = '') {
    validatePassword(password, confirm);
    const client = await A.requireClient();
    const { error } = await client.auth.updateUser({ password, ...(nonce.trim() ? { nonce: nonce.trim() } : {}) });
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
  }
  async function sendCode() {
    const client = await A.requireClient(), { error } = await client.auth.reauthenticate();
    if (error) throw new Error(error.message);
  }
  async function signedPhoto(path) {
    if (!path) return '';
    const client = await A.requireClient(), { data, error } = await client.storage.from(bucket).createSignedUrl(path, 3600);
    if (error) throw new Error('Foto profil belum dapat dimuat. Coba buka Profil kembali.');
    return data.signedUrl;
  }
  function preparePhoto(file) {
    if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) {
      return Promise.reject(new Error('Pilih foto JPG, PNG, atau WebP maksimal 2 MB.'));
    }
    return new Promise((resolve, reject) => {
      const image = new Image(), url = URL.createObjectURL(file);
      const fail = () => { URL.revokeObjectURL(url); reject(new Error('Berkas tidak dapat dibaca sebagai foto. Pilih foto lain.')); };
      image.onerror = fail;
      image.onload = () => {
        try {
          const scale = Math.min(1, 1024 / Math.max(image.naturalWidth, image.naturalHeight));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
          canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
          const context = canvas.getContext('2d');
          context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(blob => { URL.revokeObjectURL(url); blob ? resolve(blob) : reject(new Error('Foto belum dapat disiapkan.')); }, 'image/jpeg', .88);
        } catch { fail(); }
      };
      image.src = url;
    });
  }
  async function savePhoto(blob, expectedVersion) {
    const client = await A.requireClient(), owner = A.profile.id, oldPath = A.profile.foto_path || '';
    let path = '';
    if (blob) {
      path = owner + '/' + crypto.randomUUID() + '.jpg';
      const { error } = await client.storage.from(bucket).upload(path, blob, { contentType: 'image/jpeg', upsert: false });
      if (error) throw new Error(A.errorText(error));
    }
    let profile;
    try { profile = await A.rpc('simpan_foto_profil', { p_path: path, p_versi: expectedVersion }); }
    catch (error) {
      // Do not delete a new file when its association might have committed.
      const code = String(error.code || ''), definite = /^[0-9A-Z]{5}$/.test(code) && !code.startsWith('08') && code !== '40003';
      if (path && definite) { try { await client.storage.from(bucket).remove([path]); } catch {} }
      if (!definite) throw new Error('Status penyimpanan foto belum dapat dipastikan. Buka Profil kembali sebelum mencoba lagi.');
      throw error;
    }
    A.acceptProfile(profile);
    if (oldPath && oldPath !== path) { try { await client.storage.from(bucket).remove([oldPath]); } catch {} }
    return profile;
  }
  async function users(query = '', offset = 0) {
    if (!A.superAdmin()) throw new Error('Hanya Super Admin yang boleh mengatur pengguna.');
    return A.rpc('daftar_pengguna', { p_cari: query, p_offset: offset });
  }
  async function setAccess(person, values) {
    if (!A.superAdmin()) throw new Error('Hanya Super Admin yang boleh mengatur hak akses.');
    return A.rpc('atur_hak_akses', { p_id: person.id, p_versi: person.versi, p_peran: values.peran, p_aktif: values.aktif, p_akses_portal: values.aksesPortal, p_akses_mess: values.aksesMess });
  }
  g.ProfilStore = Object.freeze({ roles, validatePassword, changePassword, sendCode, signedPhoto, preparePhoto, savePhoto, users, setAccess });
})(window);
