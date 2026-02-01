# Inspection App

## 專案簡介
Inspection App 為內部檢驗系統，建置於 Supabase，採用 DB-centric 架構（所有權限由 Supabase RLS 控制，前端僅為 UX）。

## Security Model
- Authentication：Supabase Auth
- Authorization：Supabase RLS（唯一權限來源）
- 前端 admin 判斷僅為介面顯示，不構成安全邊界

## Core Tables
- profiles：第一次登入 INSERT，其後只允許 SELECT，不允許 UPDATE / DELETE，使用者無法自行升權為 admin
- processes：所有人可讀，僅 admin 可新增 / 修改 / 刪除
- reports：authenticated 可新增 / 編輯 / 讀取，僅 admin 可刪除
- audit_logs：僅允許 INSERT（append-only）
- user_login_lock：以 session.id 實作單一登入，RLS 限制只能操作自己的 row

## Storage（photos）
- private bucket
- authenticated 才能存取
- 圖片以短時效 signed URL（約 10 分鐘）讀取
- 即使知道路徑也無法直接存取實體檔案

## Summary
- profiles 不可更新 → 無自升 admin
- processes admin-only 修改
- reports 受 RLS 控制
- audit_logs append-only
- user_login_lock 僅限本人
- photos private + signed URL
- 所有權限由 Supabase RLS 強制控管，前端僅為 UX
