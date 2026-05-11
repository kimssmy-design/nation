// db.js — Firestore CRUD 공통 함수

import { db } from "./firebase.js";
import {
  doc, getDoc, setDoc, updateDoc, addDoc, deleteDoc,
  collection, query, where, getDocs, orderBy, serverTimestamp,
  runTransaction, increment
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// 국가 설정
export async function getNationConfig() {
  const snap = await getDoc(doc(db, "config", "nation"));
  return snap.exists() ? snap.data() : null;
}
export async function setNationConfig(data) {
  await setDoc(doc(db, "config", "nation"), data, { merge: true });
}

// 학생 조회
export async function getStudentByName(name) {
  const snap = await getDoc(doc(db, "students", name));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}
export async function getAllStudents() {
  const snap = await getDocs(collection(db, "students"));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// 전체 학생 문서 미리 생성 (마스터용)
export async function initAllStudents(studentNames) {
  let created = 0;
  for (const name of studentNames) {
    const existing = await getStudentByName(name);
    if (!existing) {
      await setDoc(doc(db, "students", name), {
        name, password: "", role: "국민",
        balance: 0, couponCount: 0, stockKey: "",
        preCreated: true, createdAt: serverTimestamp(),
      });
      created++;
    }
  }
  return created;
}

// 학생 등록 (국민되기)
export async function registerStudent(name, password) {
  const existing = await getStudentByName(name);
  if (existing && existing.preCreated) {
    await updateDoc(doc(db, "students", name), { password, preCreated: false });
    return;
  }
  if (existing && !existing.preCreated) throw new Error("이미 등록된 이름이에요");
  await setDoc(doc(db, "students", name), {
    name, password, role: "국민",
    balance: 0, couponCount: 0, stockKey: "",
    createdAt: serverTimestamp(),
  });
}

export async function changePassword(name, newPassword) {
  await updateDoc(doc(db, "students", name), { password: newPassword });
}
export async function changeRole(name, role) {
  await updateDoc(doc(db, "students", name), { role });
}

// 거래 (원자적 트랜잭션 — 동시 접근 시 잔액 오류 방지)
export async function addTransaction(name, amount, type, memo, by) {
  const studentRef = doc(db, "students", name);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(studentRef);
    if (!snap.exists()) throw new Error("학생을 찾을 수 없어요");
    const currentBalance = snap.data().balance || 0;
    const newBalance = currentBalance + amount;
    if (newBalance < 0) throw new Error("잔고가 부족해요");
    tx.update(studentRef, { balance: newBalance });
  });

  // 거래 기록은 트랜잭션 밖에서 (실패해도 잔액은 이미 반영됨)
  await addDoc(collection(db, "transactions"), {
    name, amount, type, memo, by, createdAt: serverTimestamp(),
  });
}
export async function getTransactions(name) {
  const q = query(
    collection(db, "transactions"),
    where("name", "==", name),
    orderBy("createdAt", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// 공지
export async function getNotices() {
  const snap = await getDocs(collection(db, "notices"));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
}
export async function addNotice(title, content, by) {
  await addDoc(collection(db, "notices"), { title, content, by, confirmedBy: [], createdAt: serverTimestamp() });
}
export async function confirmNotice(noticeId, studentName) {
  const ref = doc(db, "notices", noticeId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const confirmed = snap.data().confirmedBy || [];
  if (!confirmed.includes(studentName)) {
    await updateDoc(ref, { confirmedBy: [...confirmed, studentName] });
  }
}

// 신고
export async function addReport(reporterName, type, content) {
  await addDoc(collection(db, "reports"), {
    reporterName, type, content, status: "접수됨", result: "", fine: 0, createdAt: serverTimestamp(),
  });
}
export async function getAllReports() {
  const snap = await getDocs(collection(db, "reports"));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
}
export async function getPublicReports() {
  const reports = await getAllReports();
  return reports.map(r => ({ id: r.id, type: r.type, content: r.content, status: r.status, result: r.result, createdAt: r.createdAt }));
}
export async function updateReport(reportId, status, result, fine, reward = 0) {
  await updateDoc(doc(db, "reports", reportId), { status, result, fine, reward });
}

// 고지서
export async function issueFine(targetName, amount, reason, by) {
  await addDoc(collection(db, "fines"), { targetName, amount, reason, by, paid: false, createdAt: serverTimestamp() });
}
export async function getFines(name) {
  const q = query(
    collection(db, "fines"),
    where("targetName", "==", name),
    orderBy("createdAt", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function payFine(fineId, studentName, amount, by) {
  await updateDoc(doc(db, "fines", fineId), { paid: true });
  await addTransaction(studentName, -amount, "벌금", "벌금 납부", by);
}

// ══════════════════════════════
// 매점 판매 로그
// ══════════════════════════════

// 판매 기록 추가 (payType: "앱결제" | "현금")
export async function addShopLog(buyer, amount, item, by, payType = "앱결제") {
  await addDoc(collection(db, "shopLogs"), {
    buyer, amount, item, by, payType,
    createdAt: serverTimestamp(),
  });
}

// 전체 판매 로그 조회
export async function getShopLogs() {
  // orderBy 없이 가져와서 JS에서 정렬 (인덱스 오류 방지)
  const snap = await getDocs(collection(db, "shopLogs"));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
}

// ══════════════════════════════
// 시민일지
// ══════════════════════════════

export async function addDiary(name, content) {
  await addDoc(collection(db, "diaries"), {
    name, content,
    week: getWeekKey(),
    createdAt: serverTimestamp(),
  });
}

export async function getMyDiaries(name) {
  const snap = await getDocs(collection(db, "diaries"));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(d => d.name === name)
    .sort((a, b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0));
}

export async function getWeekDiaryCount(name) {
  const week = getWeekKey();
  const snap = await getDocs(collection(db, "diaries"));
  return snap.docs
    .map(d => d.data())
    .filter(d => d.name === name && d.week === week).length;
}

// 이번 주 일지 전체 조회 (마스터 일지 관리용 — 한 번만 호출해서 학생별 그룹핑)
export async function getThisWeekDiaries() {
  const week = getWeekKey();
  const snap = await getDocs(collection(db, "diaries"));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(d => d.week === week)
    .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
}

function getWeekKey() {
  const now = new Date();
  const year = now.getFullYear();
  const start = new Date(year, 0, 1);
  const week = Math.ceil(((now - start) / 86400000 + start.getDay() + 1) / 7);
  return `${year}-W${week}`;
}

// ══════════════════════════════
// 미션
// ══════════════════════════════

export async function addMission(title, desc, condition, reward, by) {
  await addDoc(collection(db, "missions"), {
    title, desc, condition, reward, by,
    active: true,
    createdAt: serverTimestamp(),
  });
}

export async function getMissions() {
  const snap = await getDocs(collection(db, "missions"));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(d => d.active)
    .sort((a, b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0));
}

export async function applyMission(missionId, studentName, missionTitle, reward) {
  await addDoc(collection(db, "missionApps"), {
    missionId, studentName, missionTitle, reward,
    status: "신청",
    createdAt: serverTimestamp(),
  });
}

export async function getMissionApps() {
  const snap = await getDocs(collection(db, "missionApps"));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0));
}

export async function approveMission(appId, studentName, reward, by) {
  await updateDoc(doc(db, "missionApps", appId), { status: "승인" });
  await addTransaction(studentName, reward, "이벤트", "미션 보상", by);
}

export async function rejectMission(appId) {
  await updateDoc(doc(db, "missionApps", appId), { status: "반려" });
}

export async function closeMission(missionId) {
  await updateDoc(doc(db, "missions", missionId), { active: false });
}

// ══════════════════════════════
// 자유게시판 (포스트잇 보드)
// ══════════════════════════════

export async function addBoardPost(content, color) {
  await addDoc(collection(db, "board"), {
    content, color,
    createdAt: serverTimestamp(),
  });
}

export async function getBoardPosts() {
  const snap = await getDocs(collection(db, "board"));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
}

export async function deleteBoardPost(postId) {
  await deleteDoc(doc(db, "board", postId));
}

// ══════════════════════════════
// 국가 일정
// ══════════════════════════════

export async function addSchedule(startDate, endDate, title, by) {
  await addDoc(collection(db, "schedules"), {
    startDate, endDate, title, by,
    createdAt: serverTimestamp(),
  });
}

export async function getSchedules() {
  const snap = await getDocs(collection(db, "schedules"));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.startDate || "").localeCompare(b.startDate || ""));
}

export async function deleteSchedule(scheduleId) {
  await deleteDoc(doc(db, "schedules", scheduleId));
}
