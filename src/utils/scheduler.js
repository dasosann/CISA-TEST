// 대한민국 법정공휴일 및 대체공휴일 데이터 (2025 ~ 2027)
export const KOREAN_HOLIDAYS = {
  // 2025년
  '2025-01-01': '신정',
  '2025-01-27': '임시공휴일(설날 연휴)',
  '2025-01-28': '설날 연휴',
  '2025-01-29': '설날',
  '2025-01-30': '설날 연휴',
  '2025-03-01': '삼일절',
  '2025-03-03': '대체공휴일(삼일절)',
  '2025-05-05': '어린이날·부처님오신날',
  '2025-05-06': '대체공휴일(어린이날)',
  '2025-06-03': '대통령 선거일',
  '2025-06-06': '현충일',
  '2025-08-15': '광복절',
  '2025-10-03': '개천절',
  '2025-10-05': '추석 연휴',
  '2025-10-06': '추석',
  '2025-10-07': '추석 연휴',
  '2025-10-08': '대체공휴일(추석)',
  '2025-10-09': '한글날',
  '2025-12-25': '성탄절',

  // 2026년
  '2026-01-01': '신정',
  '2026-02-16': '설날 연휴',
  '2026-02-17': '설날',
  '2026-02-18': '설날 연휴',
  '2026-03-01': '삼일절',
  '2026-03-02': '대체공휴일(삼일절)',
  '2026-05-01': '근로자의 날',
  '2026-05-05': '어린이날',
  '2026-05-24': '부처님오신날',
  '2026-05-25': '대체공휴일(부처님오신날)',
  '2026-06-03': '전국동시지방선거',
  '2026-06-06': '현충일',
  '2026-08-15': '광복절',
  '2026-08-17': '대체공휴일(광복절)',
  '2026-09-24': '추석 연휴',
  '2026-09-25': '추석',
  '2026-09-26': '추석 연휴',
  '2026-10-03': '개천절',
  '2026-10-05': '대체공휴일(개천절)',
  '2026-10-09': '한글날',
  '2026-12-25': '성탄절',

  // 2027년
  '2027-01-01': '신정',
  '2027-02-06': '설날 연휴',
  '2027-02-07': '설날',
  '2027-02-08': '설날 연휴',
  '2027-02-09': '대체공휴일(설날)',
  '2027-03-01': '삼일절',
  '2027-05-01': '근로자의 날',
  '2027-05-05': '어린이날',
  '2027-05-13': '부처님오신날',
  '2027-06-06': '현충일',
  '2027-08-15': '광복절',
  '2027-08-16': '대체공휴일(광복절)',
  '2027-09-14': '추석 연휴',
  '2027-09-15': '추석',
  '2027-09-16': '추석 연휴',
  '2027-10-03': '개천절',
  '2027-10-04': '대체공휴일(개천절)',
  '2027-10-09': '한글날',
  '2027-10-11': '대체공휴일(한글날)',
  '2027-12-25': '성탄절',
  '2027-12-27': '대체공휴일(성탄절)',
};

const DAY_NAMES_KO = ['일', '월', '화', '수', '목', '금', '토'];

export function formatDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getTodayStr() {
  return formatDateStr(new Date());
}

export function parseDateStr(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function getDayOfWeekKo(dateStr) {
  const d = parseDateStr(dateStr);
  return DAY_NAMES_KO[d.getDay()];
}

export function isWeekend(dateStr) {
  const d = parseDateStr(dateStr);
  const day = d.getDay();
  return day === 0 || day === 6;
}

export function getHolidayName(dateStr, customHolidays = []) {
  if (customHolidays.includes(dateStr)) {
    return '개인 휴무일';
  }
  return KOREAN_HOLIDAYS[dateStr] || null;
}

/**
 * 시작일로부터 평일(월~금, 한국 공휴일 및 사용자 지정 휴무일 제외)만 계산하여
 * 전체 문제를 일일 할당량(dailyCount) 단위로 배분한 스케줄 배열을 반환합니다.
 */
export function generateStudySchedule({
  totalQuestions = 1600,
  startDate = getTodayStr(),
  dailyCount = 50,
  customHolidays = [],
}) {
  const safeDailyCount = Math.max(1, Math.min(totalQuestions, Number(dailyCount) || 50));
  const totalDaysNeeded = Math.ceil(totalQuestions / safeDailyCount);

  const schedule = [];
  const skippedHolidays = [];
  let current = parseDateStr(startDate);
  let assignedDays = 0;

  // 안전장치: 최대 2000일 탐색
  let guard = 0;
  while (assignedDays < totalDaysNeeded && guard < 2000) {
    guard++;
    const dateStr = formatDateStr(current);
    const dayOfWeek = current.getDay();
    const dayName = DAY_NAMES_KO[dayOfWeek];
    const holidayName = getHolidayName(dateStr, customHolidays);

    if (dayOfWeek !== 0 && dayOfWeek !== 6 && !holidayName) {
      const startQ = assignedDays * safeDailyCount + 1;
      const endQ = Math.min(totalQuestions, (assignedDays + 1) * safeDailyCount);
      assignedDays++;

      schedule.push({
        dayIndex: assignedDays, // Day 1, Day 2...
        date: dateStr,
        dayName, // 월, 화, 수, 목, 금
        startQ,
        endQ,
        count: endQ - startQ + 1,
      });
    } else if (dayOfWeek !== 0 && dayOfWeek !== 6 && holidayName) {
      // 평일인데 공휴일이라 제외된 날짜 기록
      skippedHolidays.push({
        date: dateStr,
        dayName,
        holidayName,
      });
    }

    current.setDate(current.getDate() + 1);
  }

  return {
    schedule,
    skippedHolidays,
    totalDays: schedule.length,
    startDate,
    endDate: schedule.length > 0 ? schedule[schedule.length - 1].date : startDate,
    dailyCount: safeDailyCount,
  };
}
