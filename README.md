# Inspection App

## 專案簡介
Inspection App 是一個用於檢驗拍照與報告管理的應用，協助使用者建立、編輯並追蹤檢驗紀錄。

## 系統架構（高層）
- Frontend：React + Vite（部署於 Vercel）
- Backend / DB / Storage：Supabase
- Auth：Supabase Auth
- Audit：audit_logs

## 主要流程（簡述）
- 使用者登入後進入系統
- 建立檢驗單並開始拍照／補拍
- 編輯與確認內容後完成送出
- 查詢歷史紀錄以追蹤檢驗狀態
- 角色差異：Admin 可管理全域資料，Inspector 以執行與回報為主
- Audit log 記錄 login / create / edit / upload 等操作

## 主要資料表（用途說明即可）
- reports：檢驗報告與結果的主要記錄
- processes：檢驗流程與步驟的管理資料
- profiles：使用者基本資訊與角色設定
- audit_logs：操作行為與關鍵事件的追蹤紀錄

## 專案結構簡介（高層）
- App.tsx：應用的進入點與主要頁面組裝
- services（supabaseClient、auditLogService）：與 Supabase 溝通及審計記錄相關服務
- pages / components：頁面與可重用元件的拆分與管理

## 資安與設計重點（文字）
- Storage 非 public，避免未授權存取
- 透過 signed URL 提供受控檔案存取
- 不提供 bulk download，降低大量外流風險
- 角色控管（admin / inspector）落實權限分級
- 保留 Audit trail（login / report / photo）以利追蹤
