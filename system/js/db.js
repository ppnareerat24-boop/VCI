// db.js — API client to the backend store (/faceapi).

const DB = (() => {
  // point this at your backend (api/server.js). default: same origin /faceapi
  const API = window.FACE_API || '/faceapi';
  const TOKEN_KEY = 'faceAdminToken';
  const token = () => localStorage.getItem(TOKEN_KEY) || '';

  async function api(path, opts = {}) {
    const res = await fetch(API + path, {
      ...opts,
      headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token(), ...(opts.headers || {}) },
    });
    if (!res.ok) throw new Error('API ' + res.status);
    return res.status === 204 ? null : res.json();
  }

  const addUser = (name, descriptors, type) =>
    api('/users', { method: 'POST', body: JSON.stringify({ name, descriptors: descriptors.map((d) => Array.from(d)), type }) });
  const getUsers = () => api('/users');
  const deleteUser = (id) => api('/users/' + id, { method: 'DELETE' });
  const checkIn = (userId, name, type = '', ts = Date.now()) =>
    api('/checkin', { method: 'POST', body: JSON.stringify({ userId, name, type, ts }) });
  const updateAttendanceReason = (id, reason) =>
    api('/attendance/' + id, { method: 'PATCH', body: JSON.stringify({ reason }) });
  const getAttendance = () => api('/attendance');
  const clearAttendance = () => api('/attendance/clear', { method: 'POST' });

  function dateKeyOf(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  async function login(username, password) {
    const res = await fetch(API + '/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) return false;
    const { token } = await res.json();
    localStorage.setItem(TOKEN_KEY, token);
    return true;
  }
  const logout = () => localStorage.removeItem(TOKEN_KEY);
  const isLoggedIn = () => !!token();

  return {
    addUser, getUsers, deleteUser, checkIn, updateAttendanceReason,
    getAttendance, clearAttendance, dateKeyOf, login, logout, isLoggedIn,
  };
})();