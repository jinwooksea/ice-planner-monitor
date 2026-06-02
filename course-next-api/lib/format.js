export const fmt = (v) =>
  !v && v !== 0 ? "-" : v === 0 ? "무료" : Number(v).toLocaleString("ko-KR") + "원";

export const orDash = (v) => v || "-";

export const fmtDate = (iso) =>
  !iso
    ? "-"
    : new Date(iso).toLocaleString("ko-KR", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });

// registrationDateTime 또는 sortDate 기준 7일 이내 → isNew=true
export function markNewCourses(rawCourses) {
  const now = Date.now();

  return rawCourses.map((c) => {
    const baseDate = c.sortDate || c.registrationDateTime || "";
    const dt = new Date(baseDate);
    const valid = baseDate && !isNaN(dt.getTime());
    if (!valid) return { ...c, isNew: false };
    const diffDays = (now - dt.getTime()) / (1000 * 60 * 60 * 24);
    return { ...c, isNew: diffDays >= 0 && diffDays <= 7 };
  });
}
