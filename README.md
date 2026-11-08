# revi

在本機 git worktree 裡用網頁 review 目前分支的變更，像 GitHub 一樣在 diff 行上留言，按 Submit 後把留言和程式碼位置打包成一則 prompt，送給同一個 worktree 裡的 [herdr](https://herdr.dev) agent。Agent 用 `revi reply` 回覆，網頁即時更新。

規格：[`doc/plan/cli-code-review-2026-11-07.md`](doc/plan/cli-code-review-2026-11-07.md)

## 安裝

需要 Node 26 以上與 git。在這個 repo 的資料夾裡執行（`nvm use` 會依 `.nvmrc` 切到 Node 26）：

```bash
nvm use
npm install
npm run build
npm link
```

`npm link` 把 `revi` 裝成全域指令。之後改了程式碼，只要再跑 `npm run build`。

## 使用

在任一 worktree 裡：

```bash
revi
```

- `--base <ref>`：指定比較的 base（預設依序偵測 `origin/HEAD`、`main`、`master`）
- `--port <n>`：固定 port（預設隨機）
- `--no-open`：不自動開瀏覽器
- `--herdr-socket <path>`：herdr socket（預設 `$HERDR_SOCKET_PATH` 或 `~/.config/herdr/herdr.sock`）
- `--prompt-template <path>`：改用指定的 prompt 範本（見下方「自訂 prompt」）

只能用 `revi` 印出的連結開啟網頁：連結裡的 token 會換成 HttpOnly cookie，server 只綁 `127.0.0.1`。

### 檢視

- **全部變更**：merge-base → 工作目錄，含未提交與 untracked 檔案
- **未提交變更**：HEAD → 工作目錄
- **單一 commit**：與第一個 parent 比較；root commit 與 empty tree 比較

### Agent 回覆

送出的 prompt 會告訴 agent 用這個指令回覆每個留言串：

```bash
revi reply <threadId> --status addressed --body-file - <<'EOF'
已改用 NotFoundError。
EOF
```

`--status` 可以是 `addressed`（已修改程式碼）、`answered`（只回答問題，沒改程式碼）、`wontfix`（不同意修改）、`question`（需要使用者說明）；只有使用者能 Resolve / Reopen。Prompt 會請 agent 先判斷每則留言是要求修改還是單純發問，發問就只回答、不改程式碼。Server 開著時走 HTTP（reply token 存在權限 0600 的 registry 檔），沒開時直接寫入 `<git-common-dir>/revi/revi.db`。

**Claude Code 使用者**：沒把 `revi reply` 加進允許清單時，agent 每次回覆都會停下來等批准（revi 會顯示「agent 等待批准」）。在專案的 `.claude/settings.json` 加入：

```json
{ "permissions": { "allow": ["Bash(revi reply:*)"] } }
```

### 自訂 prompt

送給 agent 的 prompt 來自範本檔 [`templates/review-prompt.md`](templates/review-prompt.md)，語法是 [Mustache](https://mustache.github.io/mustache.5.html)。檔案開頭的註解列出所有可用的變數。

要改 prompt，在 revi 專案資料夾裡把它複製到使用者設定目錄，再編輯那份：

```bash
mkdir -p ~/.config/revi && cp templates/review-prompt.md ~/.config/revi/review-prompt.md
```

revi 依序找第一個存在的範本：`--prompt-template <path>` → `$XDG_CONFIG_HOME/revi/review-prompt.md`（預設 `~/.config/revi/`）→ 內建範本。每次投遞都重新讀檔，改完下一次 Submit 就生效，不用重開 revi。啟動時會印出目前用的範本；範本語法錯誤（例如區段沒關）會直接啟動失敗並指出位置。

注意：變數名稱拼錯會變成空字串，不會報錯；範本裡的「How to respond」段落是 agent 回覆的方式，刪掉的話 agent 就不知道要用 `revi reply` 回覆。

## 開發

```bash
npm test          # Vitest：domain 單元測試、git / SQLite / herdr / HTTP 整合測試
npm run typecheck
npm run lint
npm run dev:web   # vite build --watch
npm run dev:server
```

分層與慣例見 [`CLAUDE.md`](CLAUDE.md)。
