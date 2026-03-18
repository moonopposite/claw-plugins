# 自定义 Skills 清单

## 用户信息
- **GitHub 账号**：moonopposite
- **主仓库**：claw-plugins（https://github.com/moonopposite/claw-plugins）
- **仓库类型**：公开 (public)
- **主要用途**：Spider 插件 + 自定义 Skills 备份

---

## 1. ai-daily-newsletter

### 基本信息
- **类型**：Skill（自动化任务）
- **触发词**：
  - 「AI 日报」
  - 「今日 AI 新闻」
  - 「AI daily」
  
### 功能描述
聚合 20+ AI 信息源，每日自动生成结构化 AI 日报，包括：
- 重大发布（产品、模型、公告）
- 研究论文（HF Papers、Arxiv、MIT Tech Review）
- 行业商业（融资、收购、市场趋势）
- 工具应用（开源项目、框架、实际应用）
- 政策伦理（监管、安全讨论）
- 社区热议（Hacker News）

### 文件位置

| 位置 | 说明 |
|------|------|
| 本地安装 | `C:\Users\HW\.workbuddy\skills-marketplace\skills\ai-daily-newsletter\` |
| GitHub 备份 | `skills/ai-daily-newsletter/` in claw-plugins |
| 输出目录 | `c:\Users\HW\WorkBuddy\Claw\reports\{YYYY-MM-DD}\ai-daily.md` |

### 文件清单
```
skills/ai-daily-newsletter/
├── SKILL.md                    # Skill 定义文档（工作流、规则、信息源）
├── requirements.txt            # Python 依赖列表
└── scripts/
    ├── fetch_ai_news.py        # 数据抓取（RSS、HN、GitHub Trending、HF Papers）
    ├── fetch_hf_papers.py      # HuggingFace 每日论文抓取
    └── render_html.py          # Markdown → HTML + 截图（按 section 分割）
```

### 依赖信息
```
feedparser              # RSS 解析
requests              # HTTP 请求
beautifulsoup4        # HTML 解析
markdown              # Markdown 转 HTML
playwright            # 浏览器自动化 & 截图
Pillow                # 图片处理
```

### 工作流
1. **获取数据** → `fetch_ai_news.py` 聚合 20+ 源 → JSON 输出
2. **分类总结** → 用 subagent 并行处理各分类（重大发布、论文、行业等）
3. **生成日报** → 汇总结果到 `ai-daily.md`
4. **渲染截图** → `render_html.py` 生成 HTML + PNG（按 section 切割）

### 使用示例
```bash
# 安装依赖（首次）
pip install feedparser requests beautifulsoup4 markdown playwright Pillow
python -m playwright install chromium

# 生成日报（由 Skill 自动触发，无需手动运行）
# 当用户说"AI 日报"或"今日 AI 新闻"时自动执行

# 手动运行（调试用）
python3 skills/ai-daily-newsletter/scripts/fetch_ai_news.py --hours 24
python3 skills/ai-daily-newsletter/scripts/render_html.py reports/2026-03-18/ai-daily.md --screenshot --split-by-section
```

### 安全审计结果
- **审计时间**：2026-03-18
- **审计级别**：P1（需关注）
- **发现问题**：全局依赖安装风险（建议虚拟环境隔离）
- **恶意行为**：无
- **结论**：可安装使用

### 最后更新
- **时间**：2026-03-18
- **操作**：从 GitHub (bozhouDev/bozhou-skills) 安装，备份到 claw-plugins
- **Commit**：96d0918

---

## Skills 管理说明

### 恢复步骤（如果本地 Skill 被删除）
1. 从 GitHub 拉取最新代码：
   ```bash
   cd c:\Users\HW\WorkBuddy\Claw
   git pull origin master
   ```
2. 复制到 WorkBuddy Skills 目录：
   ```bash
   xcopy skills\ai-daily-newsletter C:\Users\HW\.workbuddy\skills-marketplace\skills\ai-daily-newsletter\ /E /Y
   ```
3. 安装依赖（如需要）：
   ```bash
   pip install -r skills/ai-daily-newsletter/requirements.txt
   python -m playwright install chromium
   ```
4. WorkBuddy 重启后自动识别

### 添加新 Skill 的流程
1. 安装/创建 Skill
2. 更新本文档（功能、触发词、路径、依赖等）
3. 提交到 GitHub 备份：
   ```bash
   git add SKILLS.md skills/{skill-name}/
   git commit -m "add: {skill-name} skill"
   git push
   ```
4. 更新我的 update_memory（可选）

---

## 备注
- 所有 Skill 源代码在 GitHub 有备份，本地删除不影响使用
- SKILLS.md 作为单一真实来源 (SSOT)，我每轮对话都会参考
- 新增 Skill 时请及时补充本文档
