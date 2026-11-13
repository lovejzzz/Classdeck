# Questhand

把一门课做成一副卡牌：老师按周发牌，每个学生拿到自己的一手牌。网站界面是英文的。

示范课程是 CaPS 演讲表达课（第 0 到 6 周），内容来自《CaPS Padlet Week 0–6 Course Plan》。

## 上线

见 [docs/deploy.md](docs/deploy.md)：一台小服务器 + Cloudflare R2（文件和数据库备份）+ Cloudflare Tunnel。

## 运行

```bash
npm run dev
```

打开 http://localhost:3000。

- 老师端：`/teach/demo`
- 学生端：首页输入班级码 `CAPS26`，或直接打开 `/learn/demo/s2`（Leo）
- 学生个人练习板：`/learn/demo/s1/board`（Mia）

数据存在 `.data/questhand.db`（SQLite，Node 22.13 以上自带，不需要另装）；旧版的 `.data/db.json` 第一次启动时会自动迁移，原文件改名为 `db.json.migrated`。老师端右上角的箭头图标可以恢复示范数据。AI 助教需要在 `.env.local` 里设置 `ANTHROPIC_API_KEY`（见 `.env.example`）。

## 账号

- 老师：在 `/login` 用邮箱和密码注册（scrypt 加密存储），只能打开自己的课程。会话是 HttpOnly cookie，数据库只存 token 的哈希。
- 学生：首页输入班级码 → 选名字 → 第一次自己设 4 位 PIN，之后用 PIN 登录；忘了 PIN 由老师在设置的名单里重置。
- CaPS 示范课（`demo`）对所有人开放，当作沙盒，不需要登录。
- 有账号之前建的课程没有主人：老师登录后在首页点 “Claim” 认领。

## 为 CaPS 课程加的功能

- 学生录音、录像、上传文件或贴链接作答，每次尝试单独保存，可以并排比较。
- Collab Studio：按组发帖（受众、目的、想要反馈的技能、问题），同组按“观察 / 影响 / 下次试试”模板互评，每人至少评两位，评满自动完成。
- 六项技能的四级自评；之后的自评会显示与第 0 周的差距。
- 每周一组可选路径（Guided / Stretch），由学生自己选，老师可以推荐。
- 个人练习板：技能变化、三件代表作、各周作品与收到的反馈，可打印或存为 PDF。
- 每张卡的用时、提交位置、完成标准和练习的技能。
- 小组课计时器：分段议程、环形倒计时、轮流展示的发言队列和随手笔记。
- 课堂页显示每人给出的反馈数，可以导出 CSV；设置里可以分组。

## 课堂互动与工具

- 实时更新：服务器保存数据时通过 server-sent events 通知所有打开的页面（`/api/course/[id]/stream`），轮询保留为后备。
- 共享墙：点赞或投票、评论、匿名发帖、发帖前审核、置顶；可附带任意素材；按得票或时间排序。
- 放映：把墙上的帖子或小组本周的作品逐条投屏，新帖会实时加入。
- 素材：录音、录像、录屏、拍照、手绘、找图（Openverse，自带授权署名）、上传、链接；链接显示网页预览，YouTube / Vimeo 直接嵌入，可以指定观看片段。
- 访问：接受新学生开关、加入密码、换新班级码、只读访客链接（`/guest/[id]?t=…`）。
- 模板：8 个卡牌模板、“标准 CaPS 周”模板；一键复制一周或一节课。
- 导出：整门课 JSON（可导入为新的周）、当前课 / 所有周进度 CSV、全部互评 CSV、共享墙 CSV、练习板打印。
- 快捷键：按 `?` 查看。学生 `N` 下一张卡、`B` 练习板、`[` `]` 切换周、`⌘↵` 完成；老师 `1` `2` `3` 切换页面、`N` 新卡、`R` 运行小组课、编辑器里 `⌘D` 复制。

## 结构

- `lib/seed.ts`：CaPS 课程数据和示范进度。
- `lib/types.ts`：数据模型（课程 → 周 → 课 → 卡牌）。
- `lib/profile.ts`：学段设置，以及“某个学生能看到哪些卡”（含学生自选路径）。
- `lib/spring.ts`、`components/cards/`：卡牌的弹簧物理、卡面、牌桌布局、展开动画。
- `components/student/`：卡牌详情、作答区、自评、Collab Studio、牌堆。
- `components/teacher/`：卡组编辑、卡牌编辑器、录音、小组课计时器、课堂、设置。
- `lib/connectors/`、`app/api/connectors/invoke/route.ts`：外部 API 连接器和网关。
- `public/samples/caps/`：示范素材。录音由 macOS 语音合成生成，图是手写的 SVG。

## 原型的边界

- 账号没有找回密码和邮箱验证；登录限流在内存里，重启后清零。
- 数据库是单机 SQLite，适合一台服务器；多台服务器需要换成 Postgres 之类。
- 第 4 周“Connect movement with meaning”需要一段真实的肢体语言示例视频，目前只有文字说明。
