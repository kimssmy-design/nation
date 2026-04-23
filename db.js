// db.js — Firestore CRUD 공통 함수

import { db } from "./firebase.js";
import {
  doc, getDoc, setDoc, updateDoc, addDoc,
  collection, query, where, getDocs, orderBy, serverTimestamp
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

// 거래
export async function addTransaction(name, amount, type, memo, by) {
  await addDoc(collection(db, "transactions"), {
    name, amount, type, memo, by, createdAt: serverTimestamp(),
  });
  const student = await getStudentByName(name);
  if (!student) throw new Error("학생을 찾을 수 없어요");
  await updateDoc(doc(db, "students", name), { balance: (student.balance || 0) + amount });
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
export async function updateReport(reportId, status, result, fine) {
  await updateDoc(doc(db, "reports", reportId), { status, result, fine });
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
