# 把 Questhand 放到 questhand.com 上

整体结构：

```
学生和老师的浏览器
   │  https://questhand.com
   ▼
Cloudflare（域名、HTTPS、Tunnel）
   │  加密隧道，服务器不用开任何端口
   ▼
一台小服务器：Questhand 网站 + SQLite 数据库
   │  数据库每秒备份一次（Litestream）
   ▼
Cloudflare R2：学生的视频、录音、图片、文件，以及数据库备份
   ▲
   └─ 浏览器上传文件时直接传到这里，不经过服务器
```

一共四步，大约 30 分钟。涉及付款和密钥的操作都由你在 Cloudflare 和服务器商的网站上完成。密钥不要发到聊天里，直接填到服务器上的 `.env.local` 文件中。

## 1. 开通 R2，建一个存储桶

1. Cloudflare 控制台 → **Storage & databases → R2** → 开通。需要绑一张卡；每月 10 GB 以内免费，看视频的流量免费。
2. **Create bucket**，名字填 `questhand`，位置选 Automatic。
3. 打开这个桶 → **Settings → CORS policy → Add CORS policy**，把 [`deploy/r2-cors.json`](../deploy/r2-cors.json) 的内容整段贴进去，保存。没有这一步，浏览器不能直接上传。
4. 回到 R2 首页 → **Manage API tokens → Create API token**：
   - 权限选 **Object Read & Write**
   - 范围选 **Apply to specific buckets only → questhand**
   - 创建后会显示 **Access Key ID** 和 **Secret Access Key**。Secret 只显示一次，先存到你的密码管理器里。
5. 记下 R2 首页右侧的 **Account ID**。

## 2. 开一台服务器

推荐 Hetzner Cloud 最便宜的一档（2 核 4 GB），每月大约 4–5 欧元。其他能装 Ubuntu 24.04 的服务器也可以。

- 系统选 **Ubuntu 24.04**
- 加上你电脑的 SSH 公钥（`~/.ssh/id_ed25519.pub`）
- 创建后记下 IP，在终端里登录：`ssh root@<IP>`

## 3. 安装 Questhand

在服务器上运行：

```bash
curl -fsSL https://raw.githubusercontent.com/lovejzzz/Classdeck/main/deploy/setup.sh | bash
```

第一次运行会生成 `/opt/questhand/.env.local`，然后停下。打开它：

```bash
nano /opt/questhand/.env.local
```

填这几行（去掉行首的 `#`）：

```
PUBLIC_URL=https://questhand.com
R2_ACCOUNT_ID=<第 1 步的 Account ID>
R2_ACCESS_KEY_ID=<第 1 步的 Access Key ID>
R2_SECRET_ACCESS_KEY=<第 1 步的 Secret Access Key>
R2_BUCKET=questhand
```

想用 AI 助教，就把 `ANTHROPIC_API_KEY` 也填上。保存后再运行一次：

```bash
bash /opt/questhand/deploy/setup.sh
```

它会安装 Node.js、构建网站、启动网站和数据库备份。最后一行显示 `Site on this machine: HTTP 200` 就说明网站已经在服务器上跑起来了。

## 4. 把 questhand.com 接到服务器（Cloudflare Tunnel）

1. Cloudflare 控制台 → **Zero Trust → Networks → Tunnels → Create a tunnel** → 选 **Cloudflared** → 名字填 `questhand`。
2. 下一页的安装命令里，`--token` 或 `service install` 后面那一长串就是 token。只复制 token。
3. 在服务器上运行：

   ```bash
   TUNNEL_TOKEN=<token> bash /opt/questhand/deploy/setup.sh
   ```

4. 回到 Cloudflare，在这个 tunnel 的 **Public hostnames** 里加一条：
   - Domain：`questhand.com`
   - Service：`HTTP` → `localhost:3000`

   想让 www 也能打开，就再加一条 `www.questhand.com`，指向同一个地址。Cloudflare 会自动建好 DNS 记录。

打开 https://questhand.com 就能看到网站了。

## 上线后检查一遍

- 注册一个老师账号，建一门课。
- **设置 → Students joining → Show to the class**，用手机扫二维码加入。
- 在学生端录一段视频交上去，再在老师端打开看看能不能播放。
- R2 的桶里应该能看到 `uploads/` 和 `backup/` 两个文件夹。

## 以后更新网站

我把新代码推到 GitHub 后，在服务器上运行：

```bash
bash /opt/questhand/deploy/update.sh
```

## 如果服务器坏了

数据库每秒都会备份到 R2，文件本来就存在 R2 里。换一台新服务器，重做第 2–4 步就行：安装脚本发现本机没有数据库时，会自动从 R2 恢复最新的备份。

## 每月费用

| 项目 | 费用 |
|---|---|
| questhand.com | 每年 $11.17（已买） |
| 服务器 | 约 4–5 欧元/月 |
| R2 | 10 GB 以内免费，超出部分约 $0.015/GB/月；看视频的流量免费 |
| Tunnel、HTTPS、DNS | 免费 |

上传有上限，可以在 `.env.local` 里调整：单个文件 200 MB，每个学生 500 MB，每位老师 5 GB。网站录的视频大约每分钟 7 MB。
