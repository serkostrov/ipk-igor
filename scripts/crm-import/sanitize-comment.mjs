/** Strip Bitrix import markers and BBCode; keep human-readable content. */
export function sanitizeImportedComment(raw) {
  let s = String(raw ?? "");
  if (!s) return "";

  s = s.replace(/\[bitrix:\d+\]/gi, "");
  s = s.replace(/\[url=(?:[^\]]*)\]([\s\S]*?)\[\/url\]/gi, "$1");
  s = s.replace(/\[url\]([\s\S]*?)\[\/url\]/gi, "$1");
  s = s.replace(/\[\*\]/gi, "• ");
  s = s.replace(
    /\[\/?(?:p|b|i|u|s|list|left|right|center|justify|br|code|quote|color|size|font|img)(?:=[^\]]*)?\]/gi,
    "",
  );
  s = s.replace(/\[[a-zA-Z\/#][^\]\n]{0,120}\]/g, "");
  s = s.replace(/[ \t]+\n/g, "\n");
  s = s.replace(/\n{3,}/g, "\n\n");
  return s.trim();
}
