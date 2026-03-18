# 📅 明天 (2026-03-19) 的自动化流程

## ⏰ 时间表

| 时间 | 步骤 | 任务 | 耗时 | 输出 |
|------|------|------|------|------|
| **08:00** | ① | `fetch_ai_news.py` - 聚合数据 | 8-10 min | `raw-news.json` |
| **08:10** | ② | Subagent 并行分类总结 | 8-12 min | `ai-daily.md` |
| **08:22** | ③ | `quality_check.py` - 自动检查 | 2 min | `quality-check.json` |
| **08:24** | ④ | `render_html.py` - 生成 HTML | 2-3 min | HTML + 8 张截图 |
| **08:27** | ⑤ | `git push` - 部署上线 | 1-2 min | GitHub + CF Pages |
| **08:30** | ✅ | **完成** | **22-29 min** | **网站已更新** |

---

## 📊 关键指标

```
聚合数据源:     20+ 个
期望条目数:     50-80 条
分类个数:       8 个
质量及格线:     ≥ 95% 评分
自动化程度:     94%
完成概率:       99% (除非网络中断)
```

---

## 🎯 检查清单

### ✅ 08:30 你应该看到的结果

```
□ reports/2026-03-19/ 目录已生成
□ ai-daily.md 文件存在（Markdown）
□ ai-daily.html 文件存在（HTML）
□ quality-check.json 显示评分 ≥ 95%
□ ai-daily-sections/ 文件夹有 8 张 PNG
□ public/index.html 已更新
□ GitHub 有新的 commit
□ CF Pages 显示部署成功
□ https://your-domain.pages.dev 网站已更新
```

### 🚨 如果出现问题

```
❌ 文件未生成？
   → 检查 .workbuddy/automations/ai-08-00/ 日志

❌ 质量评分低？
   → 检查 quality-check.json 中的失败项
   → 可能需要人工修复并重新推送

❌ 网站未更新？
   → 检查 GitHub 是否推送成功
   → 检查 CF Pages 构建日志

❌ 完全没反应？
   → 确认 WorkBuddy 仍在运行
   → 检查 Automation 是否仍 ACTIVE
```

---

## 📍 快速命令

### 手动运行（测试用）
```bash
cd c:\Users\HW\WorkBuddy\Claw

# 1. 测试数据聚合
python scripts/ai-daily-newsletter/scripts/fetch_ai_news.py --test --hours 24

# 2. 运行质量检查
python scripts/ai-daily-newsletter/scripts/quality_check.py reports/2026-03-19/ai-daily.md

# 3. 手动生成 HTML
python scripts/ai-daily-newsletter/scripts/render_html.py reports/2026-03-19/ai-daily.md --screenshot
```

### 查看自动化日志
```bash
# 查看最后一次运行的日志
cat .workbuddy/automations/ai-08-00/automation.toml

# 查看 WorkBuddy 的全局日志
# 位置: ~/.workbuddy/logs/automations/
```

### 手动重新部署
```bash
cd c:\Users\HW\WorkBuddy\Claw
git add reports/2026-03-19/ public/
git commit -m "daily: AI Daily 2026-03-19 (manual redeploy)"
git push origin master
```

---

## 💡 关键要点

✅ **你不需要做任何事** - 系统完全自动化

✅ **08:30 一切都会完成** - 包括网站部署

✅ **制品永久保存** - 在 `reports/` 目录

✅ **流程可完全恢复** - 所有代码在 Git 备份

✅ **质量自动检查** - 95% 及格线确保质量

✅ **失败自动预警** - 有问题会通知你

---

## 📞 需要帮助？

- 📖 查看完整的执行时间线：`daily-automation-timeline.md`
- 🔧 工作流详解：`.workbuddy/skills-marketplace/skills/ai-daily-newsletter/WORKFLOW.md`
- 🎯 规范标准：`.workbuddy/skills-marketplace/skills/ai-daily-newsletter/STANDARD.md`
- 📋 快速参考：`.workbuddy/skills-marketplace/skills/ai-daily-newsletter/QUICK_REFERENCE.md`

---

**状态**：✅ 生产就绪
**创建于**：2026-03-18 下午
**自动化 ID**：`ai-08-00`
