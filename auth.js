// auth.js — 로그인 / 세션 관리

import { getStudentByName, getNationConfig } from "./db.js";

// SHA-256 해시 (브라우저 내장 Web Crypto API)
export async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode("sn_salt_" + password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

// ── 세션 저장 (sessionStorage 사용 — 탭 닫으면 자동 로그아웃)
export function saveSession(name, role) {
  sessionStorage.setItem("sn_name", name);
  sessionStorage.setItem("sn_role", role);
}

export function getSession() {
  const name = sessionStorage.getItem("sn_name");
  const role = sessionStorage.getItem("sn_role");
  if (!name) return null;
  return { name, role };
}

export function clearSession() {
  sessionStorage.removeItem("sn_name");
  sessionStorage.removeItem("sn_role");
}

// ── 일반 학생 로그인
export async function loginStudent(name, password) {
  const student = await getStudentByName(name);
  if (!student) throw new Error("등록되지 않은 이름이에요");
  const hashed = await hashPassword(password);
  // 구버전 평문 비번도 호환 (마이그레이션 기간)
  if (student.password !== hashed && student.password !== password) {
    throw new Error("비밀번호가 틀렸어요");
  }
  // 평문으로 저장된 경우 해시로 업그레이드
  if (student.password === password && password !== hashed) {
    const { changePassword } = await import("./db.js");
    await changePassword(name, hashed);
  }
  saveSession(name, student.role);
  return student;
}

// ── 마스터 로그인
export async function loginMaster(password) {
  const config = await getNationConfig();
  const masterPw = config?.masterPassword || "6301";
  if (password !== masterPw) throw new Error("마스터 비밀번호가 틀렸어요");
  saveSession("마스터", "마스터");
}

// ── 공직자 확인 (로그인 후 역할 체크)
export function isOfficial(role) {
  const officialRoles = ["은행원", "세금징수원", "매점지기", "주식중개인", "검사", "기자", "청소원", "국회의장", "감찰관"];
  return officialRoles.includes(role);
}

export function isMaster(role) {
  return role === "마스터";
}

// ── 페이지 접근 보호 (로그인 안 했으면 로그인 페이지로)
export function requireLogin(redirectTo = "../pages/login.html") {
  const session = getSession();
  if (!session) {
    window.location.href = redirectTo;
    return null;
  }
  return session;
}

export function requireMaster(redirectTo = "../pages/login.html") {
  const session = getSession();
  if (!session || !isMaster(session.role)) {
    window.location.href = redirectTo;
    return null;
  }
  return session;
}
