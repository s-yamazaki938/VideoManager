# Video Manager (PWA)

Supabaseをバックエンドに利用し、**ニューモーフィズム（Neumorphism）**デザインを採用したビデオ管理Webアプリケーションです。

---

## 📋 概要
動画URLにタイトル、出演者、カテゴリーなどのメタデータを紐付けて一元管理するためのツールです。**PWA（Progressive Web App）**に対応しており、スマートフォンやPCのホーム画面に追加してネイティブアプリのように利用可能です。

## ✨ 主な機能
- **ダッシュボード**: ビデオ、出演者、カテゴリーの登録総数と、直近に登録された5件のデータを素早く確認。
- **ビデオ管理**: タイトル、URL、出演者、カテゴリーによる検索・フィルタリング、およびデータのCRUD操作（追加・編集・削除）。
- **出演者マスター管理**: ビデオに紐付ける出演者名の登録・管理。
- **カテゴリーマスター**: カテゴリーの一覧表示、最終更新日および更新者の確認。
- **レスポンシブ・デザイン**: モバイル端末では専用のドロワーメニューに切り替わる最適化されたUI。
- **テーマ切り替え**: 🌓ボタンにより、ライトモードとダークモードを瞬時に切り替え可能。

## 🛠 技術スタック
| レイヤー | 技術 |
| :--- | :--- |
| **Frontend** | HTML5, CSS3, JavaScript (Vanilla JS) |
| **Backend** | Supabase (Database) |
| **Design** | Neumorphism (Soft UI) |
| **PWA** | Service Worker & Web App Manifest |

---

## 🗄 データベース構成 (Supabase)
本アプリの動作には、Supabase上で以下の4つのテーブルが必要です。

### 1. `m_user` (ユーザーマスタ)
| カラム名 | 型 | 説明 |
| :--- | :--- | :--- |
| `id` | UUID / Int | Primary Key |
| `user_id` | Text | ユーザー識別子 (例: "admin") |

### 2. `m_actor` (出演者マスタ)
| カラム名 | 型 | 説明 |
| :--- | :--- | :--- |
| `id` | Int | Primary Key |
| `actor_name` | Text | 出演者名 |
| `created_at` | Timestamp | 作成日時 |
| `updated_at` | Timestamp | 更新日時 |
| `creator_id` | ForeignKey | `m_user.id` |
| `updater_id` | ForeignKey | `m_user.id` |

### 3. `m_category` (カテゴリマスタ)
| カラム名 | 型 | 説明 |
| :--- | :--- | :--- |
| `id` | Int | Primary Key |
| `category_name` | Text | カテゴリ名 |
| `updated_at` | Timestamp | 更新日時 |
| `updater_id` | ForeignKey | `m_user.id` |

### 4. `url` (ビデオデータ)
| カラム名 | 型 | 説明 |
| :--- | :--- | :--- |
| `id` | Int | Primary Key |
| `video_title` | Text | 動画タイトル |
| `url` | Text | 動画URL |
| `actor_id` | ForeignKey | `m_actor.id` |
| `category_id` | ForeignKey | `m_category.id` |
| `created_at` | Timestamp | 作成日時 |
| `updated_at` | Timestamp | 更新日時 |
| `creator_id` | ForeignKey | `m_user.id` |
| `updater_id` | ForeignKey | `m_user.id` |

---

## 🚀 セットアップ

### 1. 環境設定
`index.html` 内の以下の定数を、自身のSupabaseプロジェクトの情報に書き換えてください。

```javascript
const SB_URL = '[https://your-project.supabase.co](https://your-project.supabase.co)';
const SB_KEY = 'your-anon-key';
```

### 2. 認証について
本アプリはセキュリティ簡略化のため、初期化時に `m_user` テーブルから `user_id` が `admin` であるレコードを自動的に取得し、そのユーザーとして操作を行う仕様になっています。

> **重要**: 利用を開始する前に、必ず `m_user` テーブルに `user_id = 'admin'` のデータを手動で1件作成してください。

## 📁 ファイル構成
- `index.html`: アプリケーションのメインロジック、スタイル、UI構造。
- `manifest.json`: アプリ名、アイコン、テーマカラーなどのPWA構成定義。

## 📲 PWAとしての利用
1. 対応ブラウザ（Chrome/Edge/Safari等）でアプリを開きます。
2. アドレスバーの「インストール」ボタン、またはブラウザメニューの「ホーム画面に追加」を選択します。
3. デスクトップやホーム画面からネイティブアプリのように起動できます。
