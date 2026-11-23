// Language: Japanese first, Korean second.
export let lang = 'ja';
try { const s = localStorage.getItem('sc_lang'); if (s === 'ko' || s === 'ja') lang = s; } catch {}
export function setLang(l) { lang = l; try { localStorage.setItem('sc_lang', l); } catch {} document.documentElement.lang = l; }
export const L = (ja, ko) => lang === 'ko' ? ko : ja;
export const WD = () => lang === 'ko' ? ['일', '월', '화', '수', '목', '금', '토'] : ['日', '月', '火', '水', '木', '金', '土'];
