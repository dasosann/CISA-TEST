import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Calendar,
  BookOpen,
  AlertTriangle,
  Star,
  CheckCircle2,
  XCircle,
  Search,
  Settings,
  Download,
  Upload,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Play,
  Shuffle,
  Award,
  Globe,
  HelpCircle,
  Trash2,
  Plus,
  Filter,
} from 'lucide-react';
import {
  generateStudySchedule,
  getTodayStr,
  getDayOfWeekKo,
  getHolidayName,
  isWeekend,
} from './utils/scheduler.js';

const STORAGE_KEY = 'cisa_study_state_v1';

const DEFAULT_SETTINGS = {
  startDate: getTodayStr(),
  dailyCount: 50,
  customHolidays: [],
  langMode: 'both', // 'both' | 'ko' | 'en'
  quizMode: 'study', // 'study' (즉시 채점) | 'exam' (일괄 채점)
  autoResolveOnCorrect: false,
};

function loadSavedState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to load state from localStorage:', e);
    return null;
  }
}

export default function App() {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('schedule'); // 'schedule' | 'quiz' | 'wrong' | 'browse' | 'backup'

  // Persisted state
  const saved = useMemo(() => loadSavedState(), []);
  const [settings, setSettings] = useState(() => ({
    ...DEFAULT_SETTINGS,
    ...(saved?.settings || {}),
  }));
  // history: { [questionId]: { selected: 'A', isCorrect: true, solvedAt: ISOString, attempts: number } }
  const [history, setHistory] = useState(() => saved?.history || {});
  // wrongNote: { [questionId]: { wrongCount: number, lastWrongSelected: 'B', lastWrongAt: ISOString, resolved: boolean } }
  const [wrongNote, setWrongNote] = useState(() => saved?.wrongNote || {});
  // bookmarks: { [questionId]: true }
  const [bookmarks, setBookmarks] = useState(() => saved?.bookmarks || {});

  // Schedule UI state
  const [showScheduleConfig, setShowScheduleConfig] = useState(false);
  const [newHolidayInput, setNewHolidayInput] = useState('');
  const [scheduleFilter, setScheduleFilter] = useState('all'); // 'all' | 'incomplete' | 'completed'

  // Active Quiz Session state
  const [quizSession, setQuizSession] = useState({
    title: 'Day 1 학습',
    modeType: 'day', // 'day' | 'wrong' | 'bookmark' | 'custom'
    dayIndex: 1,
    questionIds: [],
    currentIndex: 0,
    sessionAnswers: {}, // { [qId]: 'A' }
    revealedIds: {}, // { [qId]: true }
    peekLang: {}, // { [qId]: true }
    examSubmitted: false,
  });

  // Wrong Note filter state
  const [wrongFilter, setWrongFilter] = useState('unresolved'); // 'unresolved' | 'repeated' | 'bookmarked' | 'resolved' | 'all'
  const [wrongCategory, setWrongCategory] = useState('all');
  const [wrongSearch, setWrongSearch] = useState('');

  // All Questions Browse state
  const [browseSearch, setBrowseSearch] = useState('');
  const [browseCategory, setBrowseCategory] = useState('all');
  const [browsePage, setBrowsePage] = useState(1);

  // Load questions.json
  useEffect(() => {
    fetch('/questions.json')
      .then(res => res.json())
      .then(data => {
        setQuestions(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load questions.json:', err);
        setLoading(false);
      });
  }, []);

  // Save state to LocalStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          settings,
          history,
          wrongNote,
          bookmarks,
          updatedAt: new Date().toISOString(),
        })
      );
    } catch (e) {
      console.error('Failed to save state to localStorage:', e);
    }
  }, [settings, history, wrongNote, bookmarks]);

  const questionMap = useMemo(() => {
    const map = new Map();
    for (const q of questions) {
      map.set(q.id, q);
    }
    return map;
  }, [questions]);

  // Compute weekday schedule (Mon-Fri excluding Korean holidays + custom holidays)
  const scheduleData = useMemo(() => {
    const total = questions.length || 1480;
    return generateStudySchedule({
      totalQuestions: total,
      startDate: settings.startDate,
      dailyCount: settings.dailyCount,
      customHolidays: settings.customHolidays,
    });
  }, [questions.length, settings.startDate, settings.dailyCount, settings.customHolidays]);

  const todayStr = getTodayStr();

  // Enhance schedule items with progress stats
  const enrichedSchedule = useMemo(() => {
    return scheduleData.schedule.map(day => {
      let solved = 0;
      let correct = 0;
      let wrongIds = [];
      const ids = [];
      for (let qId = day.startQ; qId <= day.endQ; qId++) {
        ids.push(qId);
        const h = history[qId];
        if (h) {
          solved++;
          if (h.isCorrect) correct++;
          else wrongIds.push(qId);
        }
      }
      const isCompleted = solved === day.count && day.count > 0;
      const isToday = day.date === todayStr;
      return {
        ...day,
        questionIds: ids,
        solved,
        correct,
        wrongIds,
        progressPct: day.count > 0 ? Math.round((solved / day.count) * 100) : 0,
        accuracyPct: solved > 0 ? Math.round((correct / solved) * 100) : 0,
        isCompleted,
        isToday,
      };
    });
  }, [scheduleData.schedule, history, todayStr]);

  // Find today's target schedule or the first incomplete schedule
  const todayTargetDay = useMemo(() => {
    const exactToday = enrichedSchedule.find(d => d.date === todayStr);
    if (exactToday) return exactToday;
    const firstIncomplete = enrichedSchedule.find(d => !d.isCompleted);
    return firstIncomplete || enrichedSchedule[0] || null;
  }, [enrichedSchedule, todayStr]);

  // Global stats
  const globalStats = useMemo(() => {
    const total = questions.length;
    const solvedIds = Object.keys(history);
    const solvedCount = solvedIds.length;
    let correctCount = 0;
    for (const id of solvedIds) {
      if (history[id]?.isCorrect) correctCount++;
    }
  const unresolvedWrongIds = Object.keys(wrongNote).filter(
      id =>
        wrongNote[id] &&
        !wrongNote[id].resolved &&
        (wrongNote[id].wrongCount > 0 || Boolean(wrongNote[id].reason?.trim()))
    );
    const repeatedWrongIds = Object.keys(wrongNote).filter(
      id => wrongNote[id] && !wrongNote[id].resolved && wrongNote[id].wrongCount >= 2
    );
    const reasonIds = Object.keys(wrongNote).filter(id =>
      Boolean(wrongNote[id]?.reason?.trim())
    );
    const bookmarkIds = Object.keys(bookmarks).filter(id => bookmarks[id]);

    return {
      total,
      solvedCount,
      solvedPct: total > 0 ? Math.round((solvedCount / total) * 100) : 0,
      correctCount,
      accuracyPct: solvedCount > 0 ? Math.round((correctCount / solvedCount) * 100) : 0,
      unresolvedWrongCount: unresolvedWrongIds.length,
      repeatedWrongCount: repeatedWrongIds.length,
      reasonCount: reasonIds.length,
      bookmarkCount: bookmarkIds.length,
    };
  }, [questions.length, history, wrongNote, bookmarks]);

  // Start a quiz session
  const startQuizSession = useCallback(
    ({ title, modeType = 'day', dayIndex = null, questionIds, startAtUnanswered = true }) => {
      if (!questionIds || questionIds.length === 0) return;

      let initialIndex = 0;
      if (startAtUnanswered && modeType === 'day') {
        const firstUnsolvedIdx = questionIds.findIndex(id => !history[id]);
        if (firstUnsolvedIdx !== -1) initialIndex = firstUnsolvedIdx;
      }

      const initialAnswers = {};
      const initialRevealed = {};
      if (modeType === 'day') {
        for (const id of questionIds) {
          if (history[id]) {
            initialAnswers[id] = history[id].selected;
            initialRevealed[id] = true;
          }
        }
      }

      setQuizSession({
        title,
        modeType,
        dayIndex,
        questionIds,
        currentIndex: initialIndex,
        sessionAnswers: initialAnswers,
        revealedIds: initialRevealed,
        peekLang: {},
        examSubmitted: false,
      });
      setActiveTab('quiz');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [history]
  );

  // Initialize default quiz session once questions are loaded
  useEffect(() => {
    if (questions.length > 0 && quizSession.questionIds.length === 0 && todayTargetDay) {
      setQuizSession(prev => ({
        ...prev,
        title: `Day ${todayTargetDay.dayIndex} (${todayTargetDay.date} ${todayTargetDay.dayName})`,
        modeType: 'day',
        dayIndex: todayTargetDay.dayIndex,
        questionIds: todayTargetDay.questionIds,
      }));
    }
  }, [questions.length, quizSession.questionIds.length, todayTargetDay]);

  const currentQuestionId = quizSession.questionIds[quizSession.currentIndex];
  const currentQuestion = questionMap.get(currentQuestionId);

  // Record an answer for a question
  const handleSelectOption = useCallback(
    (qId, optionKey) => {
      const q = questionMap.get(qId);
      if (!q) return;

      const isStudyMode = settings.quizMode === 'study';

      setQuizSession(prev => ({
        ...prev,
        sessionAnswers: { ...prev.sessionAnswers, [qId]: optionKey },
        revealedIds: isStudyMode ? { ...prev.revealedIds, [qId]: true } : prev.revealedIds,
      }));

      if (isStudyMode) {
        const isCorrect = optionKey === q.answer;
        const now = new Date().toISOString();

        setHistory(prev => ({
          ...prev,
          [qId]: {
            selected: optionKey,
            isCorrect,
            solvedAt: now,
            attempts: (prev[qId]?.attempts || 0) + 1,
          },
        }));

        if (!isCorrect) {
          setWrongNote(prev => {
            const existing = prev[qId];
            return {
              ...prev,
              [qId]: {
                ...existing,
                wrongCount: (existing?.wrongCount || 0) + 1,
                lastWrongSelected: optionKey,
                lastWrongAt: now,
                resolved: false, // Re-open if missed again!
              },
            };
          });
        } else if (
          quizSession.modeType === 'wrong' &&
          settings.autoResolveOnCorrect &&
          wrongNote[qId]
        ) {
          setWrongNote(prev => ({
            ...prev,
            [qId]: {
              ...prev[qId],
              resolved: true,
            },
          }));
        }
      }
    },
    [questionMap, settings.quizMode, settings.autoResolveOnCorrect, quizSession.modeType, wrongNote]
  );

  // Submit all answers in Exam Mode
  const handleExamSubmit = () => {
    const now = new Date().toISOString();
    const newHistory = { ...history };
    const newWrongNote = { ...wrongNote };
    const newRevealed = {};

    for (const qId of quizSession.questionIds) {
      newRevealed[qId] = true;
      const selected = quizSession.sessionAnswers[qId];
      if (!selected) continue;
      const q = questionMap.get(qId);
      if (!q) continue;
      const isCorrect = selected === q.answer;

      newHistory[qId] = {
        selected,
        isCorrect,
        solvedAt: now,
        attempts: (newHistory[qId]?.attempts || 0) + 1,
      };

      if (!isCorrect) {
        const existing = newWrongNote[qId];
        newWrongNote[qId] = {
          ...existing,
          wrongCount: (existing?.wrongCount || 0) + 1,
          lastWrongSelected: selected,
          lastWrongAt: now,
          resolved: false,
        };
      }
    }

    setHistory(newHistory);
    setWrongNote(newWrongNote);
    setQuizSession(prev => ({
      ...prev,
      revealedIds: newRevealed,
      examSubmitted: true,
    }));
  };

  // Toggle Bookmark
  const toggleBookmark = useCallback(qId => {
    setBookmarks(prev => {
      const next = { ...prev };
      if (next[qId]) delete next[qId];
      else next[qId] = true;
      return next;
    });
  }, []);

  // Toggle Resolved status in Wrong Note
  const toggleWrongResolved = useCallback(qId => {
    setWrongNote(prev => {
      if (!prev[qId]) return prev;
      return {
        ...prev,
        [qId]: {
          ...prev[qId],
          resolved: !prev[qId].resolved,
        },
      };
    });
  }, []);

  // Update Wrong Reason / Memo for a question
  const handleUpdateWrongReason = useCallback((qId, reasonText) => {
    const now = new Date().toISOString();
    setWrongNote(prev => {
      const existing = prev[qId];
      if (!existing && !reasonText.trim()) return prev;
      return {
        ...prev,
        [qId]: {
          wrongCount: existing?.wrongCount || 0,
          lastWrongSelected: existing?.lastWrongSelected || null,
          lastWrongAt: existing?.lastWrongAt || now,
          resolved: existing?.resolved ?? false,
          ...existing,
          reason: reasonText,
          reasonUpdatedAt: now,
        },
      };
    });
  }, []);

  const removeWrongItem = useCallback(qId => {
    setWrongNote(prev => {
      const next = { ...prev };
      delete next[qId];
      return next;
    });
  }, []);

  // Filtered Wrong Note Questions
  const filteredWrongQuestions = useMemo(() => {
    const list = [];
    for (const q of questions) {
      const w = wrongNote[q.id];
      const isBookmarked = !!bookmarks[q.id];
      const hasReason = Boolean(w?.reason?.trim());

      let matchesTab = false;
      if (wrongFilter === 'unresolved') {
        matchesTab = !!w && !w.resolved && (w.wrongCount > 0 || hasReason);
      } else if (wrongFilter === 'repeated') {
        matchesTab = !!w && !w.resolved && w.wrongCount >= 2;
      } else if (wrongFilter === 'has_reason') {
        matchesTab = hasReason;
      } else if (wrongFilter === 'bookmarked') {
        matchesTab = isBookmarked;
      } else if (wrongFilter === 'resolved') {
        matchesTab = !!w && w.resolved;
      } else if (wrongFilter === 'all') {
        matchesTab = !!w || isBookmarked;
      }

      if (!matchesTab) continue;
      if (wrongCategory !== 'all' && q.category !== wrongCategory) continue;

      if (wrongSearch.trim()) {
        const kw = wrongSearch.trim().toLowerCase();
        const inKo = q.questionKo.toLowerCase().includes(kw);
        const inEn = q.questionEn.toLowerCase().includes(kw);
        const inReason = (w?.reason || '').toLowerCase().includes(kw);
        const inId = String(q.id) === kw.replace('#', '');
        if (!inKo && !inEn && !inReason && !inId) continue;
      }

      list.push({
        question: q,
        wrongInfo: w || null,
        isBookmarked,
      });
    }

    // Sort by wrongCount desc, then id asc
    return list.sort((a, b) => {
      const countA = a.wrongInfo?.wrongCount || 0;
      const countB = b.wrongInfo?.wrongCount || 0;
      if (countB !== countA) return countB - countA;
      return a.question.id - b.question.id;
    });
  }, [questions, wrongNote, bookmarks, wrongFilter, wrongCategory, wrongSearch]);

  // Distinct categories for filter dropdown
  const categories = useMemo(() => {
    const set = new Set(questions.map(q => q.category));
    return Array.from(set);
  }, [questions]);

  // Filtered Browse Questions
  const filteredBrowseQuestions = useMemo(() => {
    return questions.filter(q => {
      if (browseCategory !== 'all' && q.category !== browseCategory) return false;
      if (browseSearch.trim()) {
        const kw = browseSearch.trim().toLowerCase();
        if (kw.startsWith('#')) {
          return String(q.id) === kw.slice(1);
        }
        return (
          q.questionKo.toLowerCase().includes(kw) ||
          q.questionEn.toLowerCase().includes(kw) ||
          q.code.toLowerCase().includes(kw) ||
          String(q.id) === kw
        );
      }
      return true;
    });
  }, [questions, browseCategory, browseSearch]);

  // Reset current quiz session answers (for re-solving a Day)
  const handleResetSessionAnswers = () => {
    setQuizSession(prev => ({
      ...prev,
      sessionAnswers: {},
      revealedIds: {},
      examSubmitted: false,
      currentIndex: 0,
    }));
  };

  // Export JSON Backup
  const handleExportBackup = () => {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      settings,
      history,
      wrongNote,
      bookmarks,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cisa-study-backup-${getTodayStr()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Import JSON Backup
  const handleImportBackup = e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const parsed = JSON.parse(ev.target.result);
        if (parsed.settings) setSettings(prev => ({ ...prev, ...parsed.settings }));
        if (parsed.history) setHistory(parsed.history);
        if (parsed.wrongNote) setWrongNote(parsed.wrongNote);
        if (parsed.bookmarks) setBookmarks(parsed.bookmarks);
        alert('학습 데이터 및 오답 노트를 성공적으로 복원했습니다!');
      } catch (err) {
        alert('올바른 백업 JSON 파일이 아닙니다.');
      }
    };
    reader.readAsText(file);
  };

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.75rem',
        }}
      >
        <div className="brand-badge" style={{ fontSize: '1rem', padding: '0.5rem 1rem' }}>
          CISA PASS
        </div>
        <p style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
          한글/영문 기출문제 데이터를 불러오는 중입니다...
        </p>
      </div>
    );
  }

  const todayHoliday = getHolidayName(todayStr, settings.customHolidays);
  const todayIsWeekend = isWeekend(todayStr);

  return (
    <div className="app-shell">
      {/* Top Navigation */}
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand" onClick={() => setActiveTab('schedule')}>
            <span className="brand-badge">
              <Award size={16} /> CISA 마스터
            </span>
            <span>한/영 기출 평일 스케줄러 & 오답노트</span>
          </div>

          <nav className="nav-tabs">
            <button
              className={`nav-tab ${activeTab === 'schedule' ? 'active' : ''}`}
              onClick={() => setActiveTab('schedule')}
            >
              <Calendar size={16} />
              평일 학습 스케줄
            </button>
            <button
              className={`nav-tab ${activeTab === 'quiz' ? 'active' : ''}`}
              onClick={() => setActiveTab('quiz')}
            >
              <BookOpen size={16} />
              문제 풀기
            </button>
            <button
              className={`nav-tab ${activeTab === 'wrong' ? 'active' : ''}`}
              onClick={() => setActiveTab('wrong')}
            >
              <AlertTriangle size={16} />
              오답 노트
              {globalStats.unresolvedWrongCount > 0 && (
                <span className="tab-count">{globalStats.unresolvedWrongCount}</span>
              )}
            </button>
            <button
              className={`nav-tab ${activeTab === 'browse' ? 'active' : ''}`}
              onClick={() => setActiveTab('browse')}
            >
              <Search size={16} />
              전체 문제 검색
            </button>
            <button
              className={`nav-tab ${activeTab === 'backup' ? 'active' : ''}`}
              onClick={() => setActiveTab('backup')}
            >
              <Download size={16} />
              데이터 백업/관리
            </button>
          </nav>
        </div>
      </header>

      <main className="main-container">
        {/* ==================== TAB 1: SCHEDULE & DASHBOARD ==================== */}
        {activeTab === 'schedule' && (
          <>
            {/* Today Hero Banner */}
            {todayTargetDay && (
              <div className="today-hero">
                <div className="today-hero-info">
                  <h2>
                    <span>
                      📅 오늘 ({todayStr} {getDayOfWeekKo(todayStr)}요일)
                    </span>
                    {todayHoliday ? (
                      <span
                        style={{
                          fontSize: '0.82rem',
                          background: 'rgba(255,255,255,0.2)',
                          padding: '0.2rem 0.65rem',
                          borderRadius: '999px',
                        }}
                      >
                        🎌 {todayHoliday} (휴무일 제외됨)
                      </span>
                    ) : todayIsWeekend ? (
                      <span
                        style={{
                          fontSize: '0.82rem',
                          background: 'rgba(255,255,255,0.2)',
                          padding: '0.2rem 0.65rem',
                          borderRadius: '999px',
                        }}
                      >
                        🏖️ 주말 휴무 (월~금 스케줄)
                      </span>
                    ) : (
                      <span
                        style={{
                          fontSize: '0.82rem',
                          background: 'rgba(255,255,255,0.2)',
                          padding: '0.2rem 0.65rem',
                          borderRadius: '999px',
                        }}
                      >
                        🔥 평일 집중 학습일
                      </span>
                    )}
                  </h2>
                  <p>
                    이번 추천 학습: <strong>Day {todayTargetDay.dayIndex}</strong> (
                    {todayTargetDay.date} {todayTargetDay.dayName}) · 문항{' '}
                    <strong>
                      #{todayTargetDay.startQ} ~ #{todayTargetDay.endQ}
                    </strong>{' '}
                    ({todayTargetDay.solved}/{todayTargetDay.count} 완료, 정답률{' '}
                    {todayTargetDay.accuracyPct}%)
                  </p>
                </div>

                <div className="today-hero-actions">
                  <button
                    className="btn btn-white"
                    onClick={() =>
                      startQuizSession({
                        title: `Day ${todayTargetDay.dayIndex} (${todayTargetDay.date} ${todayTargetDay.dayName})`,
                        modeType: 'day',
                        dayIndex: todayTargetDay.dayIndex,
                        questionIds: todayTargetDay.questionIds,
                      })
                    }
                  >
                    <Play size={16} />
                    Day {todayTargetDay.dayIndex} 바로 풀기
                  </button>
                  {globalStats.unresolvedWrongCount > 0 && (
                    <button
                      className="btn"
                      style={{
                        background: 'rgba(255,255,255,0.14)',
                        color: '#fff',
                        borderColor: 'rgba(255,255,255,0.35)',
                      }}
                      onClick={() => {
                        const wrongIds = Object.keys(wrongNote)
                          .filter(id => !wrongNote[id].resolved)
                          .map(Number);
                        startQuizSession({
                          title: `미해결 오답 복습 (${wrongIds.length}문항)`,
                          modeType: 'wrong',
                          questionIds: wrongIds,
                          startAtUnanswered: false,
                        });
                      }}
                    >
                      <AlertTriangle size={16} />
                      미해결 오답 풀기 ({globalStats.unresolvedWrongCount})
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Summary Stat Cards */}
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-header">
                  <span>전체 학습 진도율</span>
                  <BookOpen size={16} />
                </div>
                <div className="stat-value">
                  {globalStats.solvedCount} / {globalStats.total}
                  <span style={{ fontSize: '0.95rem', color: 'var(--primary)', marginLeft: '6px' }}>
                    ({globalStats.solvedPct}%)
                  </span>
                </div>
                <div className="progress-track">
                  <div
                    className="progress-fill"
                    style={{ width: `${globalStats.solvedPct}%` }}
                  />
                </div>
                <div className="stat-sub">PDF 수록 전체 문제 (영/한 완벽 매칭)</div>
              </div>

              <div className="stat-card">
                <div className="stat-header">
                  <span>누적 정답률</span>
                  <CheckCircle2 size={16} color="var(--success)" />
                </div>
                <div className="stat-value" style={{ color: 'var(--success)' }}>
                  {globalStats.accuracyPct}%
                </div>
                <div className="progress-track">
                  <div
                    className="progress-fill success"
                    style={{ width: `${globalStats.accuracyPct}%` }}
                  />
                </div>
                <div className="stat-sub">
                  맞힌 문제 {globalStats.correctCount}문항 / 풀이 {globalStats.solvedCount}문항
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-header">
                  <span>미해결 오답 노트</span>
                  <AlertTriangle size={16} color="var(--danger)" />
                </div>
                <div className="stat-value" style={{ color: 'var(--danger)' }}>
                  {globalStats.unresolvedWrongCount}문항
                </div>
                <div className="stat-sub">
                  2회 이상 반복 오답: <strong>{globalStats.repeatedWrongCount}문항</strong> · ⭐ 북마크:{' '}
                  <strong>{globalStats.bookmarkCount}문항</strong>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-header">
                  <span>평일 완주 스케줄 (월~금)</span>
                  <Calendar size={16} color="var(--primary)" />
                </div>
                <div className="stat-value">{scheduleData.totalDays}일 과정</div>
                <div className="stat-sub">
                  {scheduleData.startDate} ~ {scheduleData.endDate} (하루 {scheduleData.dailyCount}문항)
                </div>
              </div>
            </div>

            {/* Schedule Settings Panel */}
            <div className="card">
              <div className="card-header" style={{ marginBottom: showScheduleConfig ? '1rem' : 0 }}>
                <div className="card-title">
                  <Settings size={18} color="var(--primary)" />
                  <span>월~금 평일 스케줄 설정 (한국 공휴일 자동 제외)</span>
                </div>
                <button
                  className="btn btn-sm"
                  onClick={() => setShowScheduleConfig(prev => !prev)}
                >
                  {showScheduleConfig ? '설정 접기' : '스케줄 변경 / 휴무일 설정'}
                </button>
              </div>

              {showScheduleConfig && (
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                  <div className="form-grid" style={{ marginBottom: '1rem' }}>
                    <div className="form-group">
                      <label>학습 시작일 (오늘 기본값)</label>
                      <input
                        type="date"
                        className="input"
                        value={settings.startDate}
                        onChange={e =>
                          setSettings(prev => ({
                            ...prev,
                            startDate: e.target.value || getTodayStr(),
                          }))
                        }
                      />
                    </div>

                    <div className="form-group">
                      <label>하루 목표 문제 수 (월~금 평일 배정)</label>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <input
                          type="number"
                          min="5"
                          max="500"
                          className="input"
                          style={{ width: '100px' }}
                          value={settings.dailyCount}
                          onChange={e =>
                            setSettings(prev => ({
                              ...prev,
                              dailyCount: Number(e.target.value) || 50,
                            }))
                          }
                        />
                        {[30, 50, 60, 80, 100].map(cnt => (
                          <button
                            key={cnt}
                            className={`btn btn-sm ${
                              Number(settings.dailyCount) === cnt ? 'btn-primary' : ''
                            }`}
                            onClick={() => setSettings(prev => ({ ...prev, dailyCount: cnt }))}
                          >
                            {cnt}제
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="form-group">
                      <label>개인 휴무일 추가 (연차, 시험일 등 스케줄 제외)</label>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <input
                          type="date"
                          className="input"
                          value={newHolidayInput}
                          onChange={e => setNewHolidayInput(e.target.value)}
                        />
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => {
                            if (!newHolidayInput) return;
                            if (!settings.customHolidays.includes(newHolidayInput)) {
                              setSettings(prev => ({
                                ...prev,
                                customHolidays: [...prev.customHolidays, newHolidayInput].sort(),
                              }));
                            }
                            setNewHolidayInput('');
                          }}
                        >
                          <Plus size={14} /> 추가
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Skipped Holidays Display */}
                  <div style={{ marginTop: '0.75rem' }}>
                    <div
                      style={{
                        fontSize: '0.82rem',
                        fontWeight: 700,
                        color: 'var(--text-secondary)',
                        marginBottom: '0.4rem',
                      }}
                    >
                      🎌 학습 기간 중 자동 제외된 평일 공휴일 및 개인 휴무일 (
                      {scheduleData.skippedHolidays.length}일):
                    </div>
                    {scheduleData.skippedHolidays.length === 0 ? (
                      <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                        해당 기간 내 평일 공휴일이 없습니다 (주말 토/일은 기본 제외됨).
                      </span>
                    ) : (
                      <div className="chip-list">
                        {scheduleData.skippedHolidays.map(h => (
                          <span key={h.date} className="chip holiday">
                            {h.date} ({h.dayName}) · {h.holidayName}
                            {settings.customHolidays.includes(h.date) && (
                              <button
                                style={{
                                  border: 'none',
                                  background: 'transparent',
                                  color: 'inherit',
                                  cursor: 'pointer',
                                  fontWeight: 800,
                                  marginLeft: '4px',
                                }}
                                onClick={() =>
                                  setSettings(prev => ({
                                    ...prev,
                                    customHolidays: prev.customHolidays.filter(d => d !== h.date),
                                  }))
                                }
                              >
                                ×
                              </button>
                            )}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Schedule List Header & Filters */}
            <div className="card">
              <div className="card-header">
                <div className="card-title">
                  <Calendar size={18} color="var(--primary)" />
                  <span>일자별 학습 계획표 (총 {enrichedSchedule.length}일 · 월~금 평일)</span>
                </div>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  <button
                    className={`btn btn-sm ${scheduleFilter === 'all' ? 'btn-primary' : ''}`}
                    onClick={() => setScheduleFilter('all')}
                  >
                    전체 ({enrichedSchedule.length})
                  </button>
                  <button
                    className={`btn btn-sm ${scheduleFilter === 'incomplete' ? 'btn-primary' : ''}`}
                    onClick={() => setScheduleFilter('incomplete')}
                  >
                    미완료 ({enrichedSchedule.filter(d => !d.isCompleted).length})
                  </button>
                  <button
                    className={`btn btn-sm ${scheduleFilter === 'completed' ? 'btn-primary' : ''}`}
                    onClick={() => setScheduleFilter('completed')}
                  >
                    완료 ({enrichedSchedule.filter(d => d.isCompleted).length})
                  </button>
                </div>
              </div>

              <div className="schedule-grid">
                {enrichedSchedule
                  .filter(day => {
                    if (scheduleFilter === 'incomplete') return !day.isCompleted;
                    if (scheduleFilter === 'completed') return day.isCompleted;
                    return true;
                  })
                  .map(day => {
                    let statusLabel = '예정';
                    let statusClass = 'upcoming';
                    if (day.isCompleted) {
                      statusLabel = '학습 완료';
                      statusClass = 'done';
                    } else if (day.isToday) {
                      statusLabel = '오늘의 학습';
                      statusClass = 'today';
                    } else if (day.solved > 0) {
                      statusLabel = '진행중';
                      statusClass = 'progress';
                    }

                    return (
                      <div
                        key={day.dayIndex}
                        className={`day-card ${day.isToday ? 'is-today' : ''} ${
                          day.isCompleted ? 'is-completed' : ''
                        }`}
                      >
                        <div className="day-card-top">
                          <div className="day-badge">
                            <span>Day {day.dayIndex}</span>
                            <span
                              style={{
                                fontSize: '0.84rem',
                                fontWeight: 600,
                                color: 'var(--text-secondary)',
                              }}
                            >
                              {day.date} ({day.dayName})
                            </span>
                          </div>
                          <span className={`status-pill ${statusClass}`}>{statusLabel}</span>
                        </div>

                        <div
                          style={{
                            fontSize: '0.88rem',
                            color: 'var(--text-secondary)',
                            display: 'flex',
                            justifyContent: 'space-between',
                          }}
                        >
                          <span>
                            범위: <strong>#{day.startQ} ~ #{day.endQ}</strong> ({day.count}문항)
                          </span>
                          <span>
                            <strong>{day.solved}</strong>/{day.count} 풀이
                          </span>
                        </div>

                        <div className="progress-track">
                          <div
                            className={`progress-fill ${day.isCompleted ? 'success' : ''}`}
                            style={{ width: `${day.progressPct}%` }}
                          />
                        </div>

                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            fontSize: '0.78rem',
                            color: 'var(--text-muted)',
                          }}
                        >
                          <span>
                            정답률: <strong>{day.accuracyPct}%</strong> ({day.correct}/{day.solved})
                          </span>
                          {day.wrongIds.length > 0 && (
                            <span style={{ color: 'var(--danger)', fontWeight: 700 }}>
                              오답 {day.wrongIds.length}건
                            </span>
                          )}
                        </div>

                        <div style={{ display: 'flex', gap: '0.45rem', marginTop: '0.25rem' }}>
                          <button
                            className="btn btn-primary btn-sm"
                            style={{ flex: 1 }}
                            onClick={() =>
                              startQuizSession({
                                title: `Day ${day.dayIndex} (${day.date} ${day.dayName})`,
                                modeType: 'day',
                                dayIndex: day.dayIndex,
                                questionIds: day.questionIds,
                              })
                            }
                          >
                            <Play size={14} />
                            {day.solved === 0
                              ? '학습 시작'
                              : day.isCompleted
                              ? '다시 보기'
                              : '이어 풀기'}
                          </button>
                          {day.wrongIds.length > 0 && (
                            <button
                              className="btn btn-danger-soft btn-sm"
                              title="이 날짜에 틀린 문제만 다시 풀기"
                              onClick={() =>
                                startQuizSession({
                                  title: `Day ${day.dayIndex} 오답 다시 풀기 (${day.wrongIds.length}문항)`,
                                  modeType: 'wrong',
                                  dayIndex: day.dayIndex,
                                  questionIds: day.wrongIds,
                                  startAtUnanswered: false,
                                })
                              }
                            >
                              오답 ({day.wrongIds.length})
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </>
        )}

        {/* ==================== TAB 2: QUIZ SOLVER ==================== */}
        {activeTab === 'quiz' && currentQuestion && (
          <div className="quiz-layout">
            {/* Left Main Question Card */}
            <div className="quiz-card">
              {/* Top Controls Bar */}
              <div className="quiz-meta-bar">
                <div>
                  <span
                    style={{
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      color: 'var(--primary)',
                      background: 'var(--primary-soft)',
                      padding: '0.2rem 0.55rem',
                      borderRadius: '6px',
                      marginRight: '0.5rem',
                    }}
                  >
                    {quizSession.title}
                  </span>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                    문항 {quizSession.currentIndex + 1} / {quizSession.questionIds.length}{' '}
                    <span style={{ color: 'var(--text-muted)' }}>
                      (전체 #{currentQuestion.id} · {currentQuestion.code})
                    </span>
                  </span>
                </div>

                {/* Language & Mode toggles */}
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  <div
                    style={{
                      display: 'inline-flex',
                      border: '1px solid var(--border-strong)',
                      borderRadius: '8px',
                      overflow: 'hidden',
                    }}
                  >
                    {[
                      { id: 'both', label: '한+영 동시' },
                      { id: 'ko', label: '한글만' },
                      { id: 'en', label: '영어만' },
                    ].map(m => (
                      <button
                        key={m.id}
                        style={{
                          padding: '0.32rem 0.65rem',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          border: 'none',
                          cursor: 'pointer',
                          background:
                            settings.langMode === m.id ? 'var(--primary)' : 'var(--surface)',
                          color: settings.langMode === m.id ? '#fff' : 'var(--text-secondary)',
                        }}
                        onClick={() => setSettings(prev => ({ ...prev, langMode: m.id }))}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>

                  <div
                    style={{
                      display: 'inline-flex',
                      border: '1px solid var(--border-strong)',
                      borderRadius: '8px',
                      overflow: 'hidden',
                    }}
                  >
                    {[
                      { id: 'study', label: '학습모드(즉시채점)' },
                      { id: 'exam', label: '실전모드(일괄채점)' },
                    ].map(m => (
                      <button
                        key={m.id}
                        style={{
                          padding: '0.32rem 0.65rem',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          border: 'none',
                          cursor: 'pointer',
                          background:
                            settings.quizMode === m.id ? 'var(--text)' : 'var(--surface)',
                          color: settings.quizMode === m.id ? '#fff' : 'var(--text-secondary)',
                        }}
                        onClick={() => setSettings(prev => ({ ...prev, quizMode: m.id }))}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>

                  <button
                    className="btn btn-sm"
                    style={{
                      background: bookmarks[currentQuestion.id] ? 'var(--warning-soft)' : undefined,
                      borderColor: bookmarks[currentQuestion.id]
                        ? 'var(--warning-border)'
                        : undefined,
                      color: bookmarks[currentQuestion.id] ? 'var(--warning)' : undefined,
                    }}
                    onClick={() => toggleBookmark(currentQuestion.id)}
                  >
                    <Star
                      size={15}
                      fill={bookmarks[currentQuestion.id] ? 'var(--warning)' : 'none'}
                    />
                    {bookmarks[currentQuestion.id] ? '북마크됨' : '헷갈림 별표'}
                  </button>
                </div>
              </div>

              {/* Wrong count badge if previously missed */}
              {wrongNote[currentQuestion.id] && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.45rem',
                    padding: '0.6rem 0.85rem',
                    marginBottom: '1rem',
                    borderRadius: '8px',
                    background: wrongNote[currentQuestion.id].resolved
                      ? 'var(--success-soft)'
                      : 'var(--danger-soft)',
                    border: `1px solid ${
                      wrongNote[currentQuestion.id].resolved
                        ? 'var(--success-border)'
                        : 'var(--danger-border)'
                    }`,
                    fontSize: '0.82rem',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '0.5rem',
                      flexWrap: 'wrap',
                    }}
                  >
                    <span
                      style={{
                        fontWeight: 700,
                        color: wrongNote[currentQuestion.id].resolved
                          ? 'var(--success)'
                          : 'var(--danger)',
                      }}
                    >
                      {wrongNote[currentQuestion.id].resolved
                        ? `✅ 오답 노트 졸업 완료 (이전 누적 오답 ${wrongNote[currentQuestion.id].wrongCount}회)`
                        : wrongNote[currentQuestion.id].wrongCount > 0
                        ? `⚠️ 오답 노트 등록 문항 (누적 ${wrongNote[currentQuestion.id].wrongCount}회 틀림 · 마지막 오답: ${wrongNote[currentQuestion.id].lastWrongSelected})`
                        : `📝 오답 이유 메모가 등록된 문항`}
                    </span>
                    <button
                      className="btn btn-sm"
                      style={{ padding: '0.2rem 0.55rem', fontSize: '0.76rem' }}
                      onClick={() => toggleWrongResolved(currentQuestion.id)}
                    >
                      {wrongNote[currentQuestion.id].resolved
                        ? '미해결 상태로 되돌리기'
                        : '✅ 오답 노트 졸업(해결) 처리'}
                    </button>
                  </div>
                  {wrongNote[currentQuestion.id].reason?.trim() && (
                    <div
                      style={{
                        background: 'rgba(255, 255, 255, 0.75)',
                        padding: '0.45rem 0.65rem',
                        borderRadius: '6px',
                        color: 'var(--text)',
                        fontSize: '0.82rem',
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      <strong>📝 내가 적어둔 오답 이유:</strong> {wrongNote[currentQuestion.id].reason}
                    </div>
                  )}
                </div>
              )}

              {/* Question Stem */}
              <div className="question-box">
                {(settings.langMode === 'both' ||
                  settings.langMode === 'ko' ||
                  quizSession.peekLang[currentQuestion.id]) && (
                  <div className="question-ko">
                    Q{quizSession.currentIndex + 1}. {currentQuestion.questionKo}
                  </div>
                )}

                {(settings.langMode === 'both' ||
                  settings.langMode === 'en' ||
                  quizSession.peekLang[currentQuestion.id]) && (
                  <div
                    className={settings.langMode === 'en' ? 'question-ko' : 'question-en'}
                  >
                    {settings.langMode === 'en' && `Q${quizSession.currentIndex + 1}. `}
                    {currentQuestion.questionEn}
                  </div>
                )}

                {settings.langMode !== 'both' && (
                  <button
                    className="btn btn-sm"
                    style={{ marginTop: '0.45rem', fontSize: '0.76rem' }}
                    onClick={() =>
                      setQuizSession(prev => ({
                        ...prev,
                        peekLang: {
                          ...prev.peekLang,
                          [currentQuestion.id]: !prev.peekLang[currentQuestion.id],
                        },
                      }))
                    }
                  >
                    <Globe size={13} />
                    {quizSession.peekLang[currentQuestion.id]
                      ? '보조 언어 숨기기'
                      : settings.langMode === 'ko'
                      ? '영문 원문 함께 보기'
                      : '한글 번역 함께 보기'}
                  </button>
                )}
              </div>

              {/* Options List (Mouse Click Only) */}
              <div className="options-list">
                {currentQuestion.optionsEn.map((optEn, idx) => {
                  const optKo = currentQuestion.optionsKo[idx] || optEn;
                  const key = optEn.key;
                  const selectedKey = quizSession.sessionAnswers[currentQuestion.id];
                  const isSelected = selectedKey === key;
                  const isRevealed = !!quizSession.revealedIds[currentQuestion.id];
                  const isCorrectAnswer = currentQuestion.answer === key;

                  let itemClass = 'option-item';
                  if (isRevealed) {
                    if (isCorrectAnswer) itemClass += ' correct';
                    else if (isSelected && !isCorrectAnswer) itemClass += ' wrong';
                  } else if (isSelected) {
                    itemClass += ' selected';
                  }

                  const showKo =
                    settings.langMode === 'both' ||
                    settings.langMode === 'ko' ||
                    quizSession.peekLang[currentQuestion.id];
                  const showEn =
                    settings.langMode === 'both' ||
                    settings.langMode === 'en' ||
                    quizSession.peekLang[currentQuestion.id];

                  return (
                    <button
                      key={key}
                      type="button"
                      tabIndex={-1}
                      onKeyDown={e => e.preventDefault()}
                      className={itemClass}
                      onClick={() => handleSelectOption(currentQuestion.id, key)}
                    >
                      <span className="option-key">{key}</span>
                      <div className="option-content">
                        {showKo && <div className="option-ko">{optKo.text}</div>}
                        {showEn && (
                          <div className={settings.langMode === 'en' ? 'option-ko' : 'option-en'}>
                            {optEn.text}
                          </div>
                        )}
                      </div>
                      {isRevealed && isCorrectAnswer && (
                        <CheckCircle2 size={20} color="var(--success)" style={{ flexShrink: 0 }} />
                      )}
                      {isRevealed && isSelected && !isCorrectAnswer && (
                        <XCircle size={20} color="var(--danger)" style={{ flexShrink: 0 }} />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Prev / Next / Reveal Navigation Bar */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.75rem',
                  flexWrap: 'wrap',
                  paddingTop: '0.5rem',
                }}
              >
                <button
                  className="btn"
                  disabled={quizSession.currentIndex === 0}
                  onClick={() =>
                    setQuizSession(prev => ({
                      ...prev,
                      currentIndex: Math.max(0, prev.currentIndex - 1),
                    }))
                  }
                >
                  <ChevronLeft size={16} /> 이전 문제
                </button>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {!quizSession.revealedIds[currentQuestion.id] && (
                    <button
                      className="btn btn-sm"
                      onClick={() =>
                        setQuizSession(prev => ({
                          ...prev,
                          revealedIds: { ...prev.revealedIds, [currentQuestion.id]: true },
                        }))
                      }
                    >
                      <HelpCircle size={15} /> 정답 및 해설 먼저 확인
                    </button>
                  )}

                  {settings.quizMode === 'exam' && !quizSession.examSubmitted && (
                    <button className="btn btn-primary" onClick={handleExamSubmit}>
                      <CheckCircle2 size={16} /> 현재 세트 일괄 채점하기
                    </button>
                  )}
                </div>

                <button
                  className="btn btn-primary"
                  disabled={quizSession.currentIndex >= quizSession.questionIds.length - 1}
                  onClick={() =>
                    setQuizSession(prev => ({
                      ...prev,
                      currentIndex: Math.min(
                        prev.questionIds.length - 1,
                        prev.currentIndex + 1
                      ),
                    }))
                  }
                >
                  다음 문제 <ChevronRight size={16} />
                </button>
              </div>

              {/* Explanation Box (when revealed) */}
              {quizSession.revealedIds[currentQuestion.id] && (
                <div
                  className={`explanation-box ${
                    quizSession.sessionAnswers[currentQuestion.id] === currentQuestion.answer
                      ? 'is-correct'
                      : 'is-wrong'
                  }`}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '0.6rem',
                      flexWrap: 'wrap',
                      gap: '0.5rem',
                    }}
                  >
                    <div style={{ fontWeight: 800, fontSize: '1rem' }}>
                      {quizSession.sessionAnswers[currentQuestion.id] === currentQuestion.answer ? (
                        <span style={{ color: 'var(--success)' }}>
                          ⭕ 정답입니다! (정답: {currentQuestion.answer})
                        </span>
                      ) : quizSession.sessionAnswers[currentQuestion.id] ? (
                        <span style={{ color: 'var(--danger)' }}>
                          ❌ 오답입니다! (내 선택: {quizSession.sessionAnswers[currentQuestion.id]}{' '}
                          → 정답: {currentQuestion.answer})
                        </span>
                      ) : (
                        <span style={{ color: 'var(--primary)' }}>
                          💡 정답 확인: {currentQuestion.answer}
                        </span>
                      )}
                    </div>

                    {wrongNote[currentQuestion.id] &&
                      !wrongNote[currentQuestion.id].resolved &&
                      quizSession.sessionAnswers[currentQuestion.id] ===
                        currentQuestion.answer && (
                        <button
                          className="btn btn-success-soft btn-sm"
                          onClick={() => toggleWrongResolved(currentQuestion.id)}
                        >
                          <CheckCircle2 size={14} /> 이해 완료! 오답 노트에서 졸업 처리
                        </button>
                      )}
                  </div>

                  {currentQuestion.explanationKo || currentQuestion.explanationEn ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {currentQuestion.explanationKo && (
                        <div style={{ fontSize: '0.94rem', color: 'var(--text)' }}>
                          <strong>[한글 해설]</strong> {currentQuestion.explanationKo}
                        </div>
                      )}
                      {currentQuestion.explanationEn && (
                        <div style={{ fontSize: '0.86rem', color: 'var(--text-secondary)' }}>
                          <strong>[영문 해설]</strong> {currentQuestion.explanationEn}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
                      이 문항은 덤프 원본에 별도 텍스트 해설이 기재되어 있지 않습니다. 정답 보기를 중심으로 숙지해 주세요.
                    </div>
                  )}
                </div>
              )}

              {/* Wrong Reason / Study Note Box (Always accessible in Quiz Card) */}
              <div className="wrong-reason-box">
                <div className="wrong-reason-header">
                  <label htmlFor={`reason-input-${currentQuestion.id}`}>
                    📝 오답 이유 / 나만의 복습 메모
                  </label>
                  <span className="wrong-reason-status">
                    {wrongNote[currentQuestion.id]?.reason?.trim()
                      ? '✓ 자동 저장됨 (오답 노트 및 검색에서 언제든 열람 가능)'
                      : '작성 시 즉시 자동 저장되며 오답 노트에서 모아볼 수 있습니다'}
                  </span>
                </div>
                <textarea
                  id={`reason-input-${currentQuestion.id}`}
                  className="wrong-reason-textarea"
                  rows={3}
                  placeholder="왜 틀렸는지, 헷갈린 선지나 핵심 개념(예: FIRST/MOST/PRIMARY 키워드 놓침, 용어 혼동 등)을 적어두세요..."
                  value={wrongNote[currentQuestion.id]?.reason || ''}
                  onChange={e => handleUpdateWrongReason(currentQuestion.id, e.target.value)}
                />
              </div>
            </div>

            {/* Right Sidebar: Session Progress & Question Navigator */}
            <div className="card" style={{ position: 'sticky', top: '4.5rem', marginBottom: 0 }}>
              <div className="card-header" style={{ marginBottom: '0.65rem' }}>
                <div className="card-title" style={{ fontSize: '0.95rem' }}>
                  <span>문항 네비게이터</span>
                </div>
                <button
                  className="btn btn-sm"
                  onClick={handleResetSessionAnswers}
                  title="현재 세트의 답안 선택을 초기화하고 처음부터 다시 풉니다"
                >
                  <RotateCcw size={13} /> 현재 세트 다시 풀기
                </button>
              </div>

              {/* Session Mini Stats */}
              {(() => {
                let answered = 0;
                let correct = 0;
                let wrong = 0;
                for (const id of quizSession.questionIds) {
                  const sel = quizSession.sessionAnswers[id];
                  if (sel) {
                    answered++;
                    if (quizSession.revealedIds[id]) {
                      const q = questionMap.get(id);
                      if (q && sel === q.answer) correct++;
                      else wrong++;
                    }
                  }
                }
                return (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '0.8rem',
                      padding: '0.55rem 0.7rem',
                      background: 'var(--surface-alt)',
                      borderRadius: '8px',
                      marginBottom: '0.75rem',
                    }}
                  >
                    <span>
                      풀이: <strong>{answered}</strong>/{quizSession.questionIds.length}
                    </span>
                    <span style={{ color: 'var(--success)', fontWeight: 700 }}>
                      정답 {correct}
                    </span>
                    <span style={{ color: 'var(--danger)', fontWeight: 700 }}>
                      오답 {wrong}
                    </span>
                  </div>
                );
              })()}

              <div className="q-nav-grid">
                {quizSession.questionIds.map((qId, idx) => {
                  const sel = quizSession.sessionAnswers[qId];
                  const rev = quizSession.revealedIds[qId];
                  const q = questionMap.get(qId);
                  let cls = 'q-nav-btn';
                  if (idx === quizSession.currentIndex) cls += ' current';
                  if (rev && sel && q) {
                    cls += sel === q.answer ? ' correct' : ' wrong';
                  } else if (sel) {
                    cls += ' answered';
                  }
                  return (
                    <button
                      key={qId}
                      className={cls}
                      onClick={() =>
                        setQuizSession(prev => ({
                          ...prev,
                          currentIndex: idx,
                        }))
                      }
                    >
                      {idx + 1}
                      {bookmarks[qId] && (
                        <span
                          style={{
                            position: 'absolute',
                            top: '-3px',
                            right: '1px',
                            fontSize: '0.6rem',
                          }}
                        >
                          ⭐
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ==================== TAB 3: WRONG ANSWER NOTE ==================== */}
        {activeTab === 'wrong' && (
          <>
            <div className="card">
              <div className="card-header">
                <div className="card-title">
                  <AlertTriangle size={20} color="var(--danger)" />
                  <span>오답 노트 & 취약 문제 집중 복습</span>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <label
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      fontSize: '0.82rem',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      marginRight: '0.5rem',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={settings.autoResolveOnCorrect}
                      onChange={e =>
                        setSettings(prev => ({
                          ...prev,
                          autoResolveOnCorrect: e.target.checked,
                        }))
                      }
                    />
                    오답 재풀이 시 정답 맞히면 자동 졸업 처리
                  </label>

                  <button
                    className="btn btn-primary btn-sm"
                    disabled={filteredWrongQuestions.length === 0}
                    onClick={() =>
                      startQuizSession({
                        title: `오답 노트 다시 풀기 (${filteredWrongQuestions.length}문항)`,
                        modeType: 'wrong',
                        questionIds: filteredWrongQuestions.map(item => item.question.id),
                        startAtUnanswered: false,
                      })
                    }
                  >
                    <Play size={14} /> 현재 필터 문항 순서대로 다시 풀기 (
                    {filteredWrongQuestions.length})
                  </button>

                  <button
                    className="btn btn-sm"
                    disabled={filteredWrongQuestions.length === 0}
                    onClick={() => {
                      const shuffled = [...filteredWrongQuestions.map(i => i.question.id)].sort(
                        () => Math.random() - 0.5
                      );
                      startQuizSession({
                        title: `오답 노트 랜덤 셔플 풀기 (${shuffled.length}문항)`,
                        modeType: 'wrong',
                        questionIds: shuffled,
                        startAtUnanswered: false,
                      });
                    }}
                  >
                    <Shuffle size={14} /> 랜덤 셔플로 다시 풀기
                  </button>
                </div>
              </div>

              {/* Filter Bar */}
              <div
                style={{
                  display: 'flex',
                  gap: '0.5rem',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingTop: '0.5rem',
                  borderTop: '1px solid var(--border)',
                }}
              >
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  {[
                    {
                      id: 'unresolved',
                      label: `미해결 오답 (${globalStats.unresolvedWrongCount})`,
                    },
                    {
                      id: 'repeated',
                      label: `2회 이상 반복 오답 (${globalStats.repeatedWrongCount})`,
                    },
                    {
                      id: 'has_reason',
                      label: `📝 오답이유 작성됨 (${globalStats.reasonCount})`,
                    },
                    {
                      id: 'bookmarked',
                      label: `⭐ 북마크 (${globalStats.bookmarkCount})`,
                    },
                    {
                      id: 'resolved',
                      label: `졸업 완료 오답`,
                    },
                    { id: 'all', label: '전체 보기' },
                  ].map(tab => (
                    <button
                      key={tab.id}
                      className={`btn btn-sm ${wrongFilter === tab.id ? 'btn-primary' : ''}`}
                      onClick={() => setWrongFilter(tab.id)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <select
                    className="select"
                    value={wrongCategory}
                    onChange={e => setWrongCategory(e.target.value)}
                  >
                    <option value="all">모든 파트/도메인</option>
                    {categories.map(c => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>

                  <input
                    type="text"
                    className="input"
                    placeholder="오답/오답이유 키워드, 문항번호 검색..."
                    value={wrongSearch}
                    onChange={e => setWrongSearch(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Wrong Questions List */}
            {filteredWrongQuestions.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
                <CheckCircle2
                  size={40}
                  color="var(--success)"
                  style={{ margin: '0 auto 0.75rem' }}
                />
                <h3 style={{ marginBottom: '0.35rem' }}>해당 조건의 오답/북마크 문항이 없습니다!</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  평일 스케줄에 따라 문제를 풀고 틀리거나 오답 이유를 기록한 문항이 이곳에 자동으로 정리됩니다.
                </p>
              </div>
            ) : (
              filteredWrongQuestions.map(({ question: q, wrongInfo, isBookmarked }) => (
                <div key={q.id} className="card">
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '0.5rem',
                      flexWrap: 'wrap',
                      marginBottom: '0.75rem',
                      paddingBottom: '0.65rem',
                      borderBottom: '1px solid var(--border)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <span className="chip" style={{ fontWeight: 800, color: 'var(--primary)' }}>
                        #{q.id} ({q.code})
                      </span>
                      {wrongInfo && (
                        <span
                          className={`status-pill ${wrongInfo.resolved ? 'done' : 'today'}`}
                          style={{
                            background: wrongInfo.resolved
                              ? 'var(--success-soft)'
                              : 'var(--danger)',
                          }}
                        >
                          {wrongInfo.resolved
                            ? `졸업 완료 (오답 ${wrongInfo.wrongCount}회)`
                            : wrongInfo.wrongCount > 0
                            ? `오답 ${wrongInfo.wrongCount}회 누적`
                            : '메모 등록'}
                        </span>
                      )}
                      {wrongInfo?.lastWrongSelected && (
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          내 마지막 오답: <strong>{wrongInfo.lastWrongSelected}</strong> / 정답:{' '}
                          <strong style={{ color: 'var(--success)' }}>{q.answer}</strong>
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button
                        className="btn btn-sm"
                        onClick={() => toggleBookmark(q.id)}
                      >
                        <Star
                          size={14}
                          fill={isBookmarked ? 'var(--warning)' : 'none'}
                          color={isBookmarked ? 'var(--warning)' : 'currentColor'}
                        />
                        {isBookmarked ? '북마크 해제' : '북마크'}
                      </button>

                      {wrongInfo && (
                        <>
                          <button
                            className={`btn btn-sm ${
                              wrongInfo.resolved ? '' : 'btn-success-soft'
                            }`}
                            onClick={() => toggleWrongResolved(q.id)}
                          >
                            <CheckCircle2 size={14} />
                            {wrongInfo.resolved ? '미해결로 복구' : '졸업(해결) 처리'}
                          </button>
                          <button
                            className="btn btn-danger-soft btn-sm"
                            onClick={() => removeWrongItem(q.id)}
                            title="오답 노트에서 삭제"
                          >
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="question-ko" style={{ fontSize: '1.02rem' }}>
                    {q.questionKo}
                  </div>
                  <div className="question-en" style={{ fontSize: '0.9rem', marginBottom: '0.9rem' }}>
                    {q.questionEn}
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                      gap: '0.5rem',
                      marginBottom: '0.85rem',
                    }}
                  >
                    {q.optionsEn.map((optEn, idx) => {
                      const optKo = q.optionsKo[idx] || optEn;
                      const isAns = optEn.key === q.answer;
                      const isLastWrong = wrongInfo?.lastWrongSelected === optEn.key;
                      return (
                        <div
                          key={optEn.key}
                          style={{
                            padding: '0.6rem 0.8rem',
                            borderRadius: '8px',
                            border: `1px solid ${
                              isAns
                                ? 'var(--success-border)'
                                : isLastWrong
                                ? 'var(--danger-border)'
                                : 'var(--border)'
                            }`,
                            background: isAns
                              ? 'var(--success-soft)'
                              : isLastWrong
                              ? 'var(--danger-soft)'
                              : 'var(--surface-alt)',
                            fontSize: '0.86rem',
                          }}
                        >
                          <div style={{ fontWeight: 700 }}>
                            {optEn.key}. {optKo.text}{' '}
                            {isAns && (
                              <span style={{ color: 'var(--success)', fontWeight: 800 }}>
                                [정답]
                              </span>
                            )}
                            {isLastWrong && !isAns && (
                              <span style={{ color: 'var(--danger)', fontWeight: 800 }}>
                                [내가 고른 오답]
                              </span>
                            )}
                          </div>
                          <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                            {optEn.text}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {(q.explanationKo || q.explanationEn) && (
                    <div
                      style={{
                        background: 'var(--surface-alt)',
                        padding: '0.75rem 0.95rem',
                        borderRadius: '8px',
                        fontSize: '0.85rem',
                        border: '1px solid var(--border)',
                        marginBottom: '0.75rem',
                      }}
                    >
                      {q.explanationKo && (
                        <div style={{ marginBottom: q.explanationEn ? '0.3rem' : 0 }}>
                          <strong>해설(한글):</strong> {q.explanationKo}
                        </div>
                      )}
                      {q.explanationEn && (
                        <div style={{ color: 'var(--text-secondary)' }}>
                          <strong>Explanation:</strong> {q.explanationEn}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Wrong Reason View / Edit Box in Wrong Note Card */}
                  <div className="wrong-reason-box">
                    <div className="wrong-reason-header">
                      <label htmlFor={`wrong-card-reason-${q.id}`}>
                        📝 오답 이유 / 복습 메모
                      </label>
                      <span className="wrong-reason-status">
                        {wrongInfo?.reason?.trim() ? '✓ 저장됨' : '오답 이유를 기록해 두세요'}
                      </span>
                    </div>
                    <textarea
                      id={`wrong-card-reason-${q.id}`}
                      className="wrong-reason-textarea"
                      rows={2}
                      placeholder="이 문제를 틀린 이유나 핵심 포인트를 입력하면 자동 저장됩니다..."
                      value={wrongInfo?.reason || ''}
                      onChange={e => handleUpdateWrongReason(q.id, e.target.value)}
                    />
                  </div>
                </div>
              ))
            )}
          </>
        )}

        {/* ==================== TAB 4: BROWSE ALL QUESTIONS ==================== */}
        {activeTab === 'browse' && (
          <div className="card">
            <div className="card-header">
              <div className="card-title">
                <Search size={18} color="var(--primary)" />
                <span>전체 기출문제 통합 검색 ({filteredBrowseQuestions.length}문항)</span>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <select
                  className="select"
                  value={browseCategory}
                  onChange={e => {
                    setBrowseCategory(e.target.value);
                    setBrowsePage(1);
                  }}
                >
                  <option value="all">모든 파트/도메인 ({questions.length})</option>
                  {categories.map(c => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>

                <input
                  type="text"
                  className="input"
                  style={{ minWidth: '260px' }}
                  placeholder="한글/영문 키워드 또는 #문항번호 검색..."
                  value={browseSearch}
                  onChange={e => {
                    setBrowseSearch(e.target.value);
                    setBrowsePage(1);
                  }}
                />

                {filteredBrowseQuestions.length > 0 && (
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() =>
                      startQuizSession({
                        title: `검색 결과 풀기 (${Math.min(
                          100,
                          filteredBrowseQuestions.length
                        )}문항)`,
                        modeType: 'custom',
                        questionIds: filteredBrowseQuestions.slice(0, 100).map(q => q.id),
                        startAtUnanswered: false,
                      })
                    }
                  >
                    <Play size={14} /> 검색된 문제 풀기
                  </button>
                )}
              </div>
            </div>

            {filteredBrowseQuestions
              .slice((browsePage - 1) * 20, browsePage * 20)
              .map(q => (
                <div
                  key={q.id}
                  style={{
                    padding: '1rem',
                    border: '1px solid var(--border)',
                    borderRadius: '10px',
                    marginBottom: '0.75rem',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: '0.4rem',
                      fontSize: '0.82rem',
                    }}
                  >
                    <span style={{ fontWeight: 700, color: 'var(--primary)' }}>
                      #{q.id} · {q.code} ({q.category})
                    </span>
                    <button
                      className="btn btn-sm"
                      onClick={() =>
                        startQuizSession({
                          title: `문항 #${q.id} 바로 풀기`,
                          modeType: 'custom',
                          questionIds: [q.id],
                          startAtUnanswered: false,
                        })
                      }
                    >
                      이 문제 풀기
                    </button>
                  </div>
                  <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>{q.questionKo}</div>
                  <div style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
                    {q.questionEn}
                  </div>
                  {wrongNote[q.id]?.reason?.trim() && (
                    <div
                      style={{
                        marginTop: '0.6rem',
                        padding: '0.5rem 0.75rem',
                        borderRadius: '8px',
                        background: 'var(--warning-soft)',
                        border: '1px solid var(--warning-border)',
                        fontSize: '0.83rem',
                        color: 'var(--text)',
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      <strong style={{ color: 'var(--warning)' }}>📝 내 오답 이유:</strong>{' '}
                      {wrongNote[q.id].reason}
                    </div>
                  )}
                </div>
              ))}

            {/* Pagination */}
            {filteredBrowseQuestions.length > 20 && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: '0.75rem',
                  marginTop: '1rem',
                }}
              >
                <button
                  className="btn btn-sm"
                  disabled={browsePage <= 1}
                  onClick={() => setBrowsePage(p => p - 1)}
                >
                  이전 페이지
                </button>
                <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>
                  {browsePage} / {Math.ceil(filteredBrowseQuestions.length / 20)} 페이지
                </span>
                <button
                  className="btn btn-sm"
                  disabled={browsePage >= Math.ceil(filteredBrowseQuestions.length / 20)}
                  onClick={() => setBrowsePage(p => p + 1)}
                >
                  다음 페이지
                </button>
              </div>
            )}
          </div>
        )}

        {/* ==================== TAB 5: DATA BACKUP & RESET ==================== */}
        {activeTab === 'backup' && (
          <div className="card">
            <div className="card-header">
              <div className="card-title">
                <Download size={18} color="var(--primary)" />
                <span>학습 기록 및 오답 노트 백업 / 복원</span>
              </div>
            </div>

            <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', marginBottom: '1.25rem' }}>
              모든 풀이 기록, 평일 스케줄 설정, 오답 노트 및 북마크는 현재 브라우저의{' '}
              <code>LocalStorage</code>에 자동 저장됩니다. 다른 PC나 브라우저에서도 이어서 학습하려면 아래{' '}
              <strong>JSON 백업 파일 내보내기 / 불러오기</strong>를 이용해 주세요.
            </p>

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={handleExportBackup}>
                <Download size={16} /> 학습 기록 JSON 파일로 백업하기
              </button>

              <label className="btn" style={{ cursor: 'pointer' }}>
                <Upload size={16} /> 백업 JSON 파일 불러오기
                <input
                  type="file"
                  accept="application/json"
                  style={{ display: 'none' }}
                  onChange={handleImportBackup}
                />
              </label>

              <button
                className="btn btn-danger-soft"
                onClick={() => {
                  if (
                    window.confirm(
                      '정말로 모든 풀이 기록과 오답 노트를 초기화하시겠습니까? (이 작업은 되돌릴 수 없습니다)'
                    )
                  ) {
                    setHistory({});
                    setWrongNote({});
                    setBookmarks({});
                    localStorage.removeItem(STORAGE_KEY);
                  }
                }}
              >
                <Trash2 size={16} /> 전체 기록 초기화
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
