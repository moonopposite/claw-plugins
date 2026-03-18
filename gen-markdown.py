#!/usr/bin/env python3
"""从 JSON 生成 AI 日报 Markdown"""
import json
from pathlib import Path
from datetime import datetime

# 读取 JSON
json_file = Path(r"C:\Users\HW\WorkBuddy\Claw\reports\2026-03-18\ai-news-2026-03-18.json")
news = json.loads(json_file.read_text(encoding='utf-8'))

# 按分类分组
categories = {
    'releases': [],
    'research': [],
    'industry': [],
    'tools': [],
    'policy': [],
    'community': []
}

category_names = {
    'releases': '🔥 重大发布',
    'research': '🔬 研究论文',
    'industry': '💰 行业商业',
    'tools': '🛠️ 工具应用',
    'policy': '🌍 政策伦理',
    'community': '🔥 社区热议（Hacker News）'
}

for item in news:
    cat = item.get('category', 'tools')
    if cat in categories:
        categories[cat].append(item)

# 生成 Markdown
md = f"""# 🤖 AI 日报 | 2026-03-18

> 聚合 20+ AI 信息源，每日精选

---

## 📰 今日头条

"""

# 前 5 条热点
top_items = []
for cat in ['releases', 'research', 'industry']:
    top_items.extend(categories[cat][:2])

for i, item in enumerate(top_items[:5], 1):
    title = item.get('title', '')
    summary = item.get('summary', '')
    if not summary:
        summary = item.get('readme', '')[:200] if item.get('readme') else ''
    md += f"{i}. **{title}** — {summary[:150]}...\n"

md += "\n---\n"

# 各分类详细内容
for cat_key in ['releases', 'research', 'industry', 'tools', 'policy', 'community']:
    if not categories[cat_key]:
        continue
    
    md += f"\n## {category_names[cat_key]}\n\n"
    
    for item in categories[cat_key]:
        title = item.get('title', '')
        url = item.get('url') or item.get('hn_url') or item.get('github_url', '#')
        
        if cat_key == 'community':
            # HN 格式
            heat = item.get('heat', '0')
            md += f"- **{title}** — 热度：{heat}\n"
            md += f"  - [HN 讨论]({url})\n\n"
        else:
            # 其他格式
            summary = item.get('summary', '')[:100]
            md += f"- **{title}** — {summary}\n"
            md += f"  - [原文链接]({url})\n\n"

md += "\n---\n\n"
md += f"统计: {len(set(item['source'] for item in news))} 源 | {len(news)} 条 | 生成于 {datetime.now().strftime('%H:%M')}\n"

# 保存
output_file = Path(r"C:\Users\HW\WorkBuddy\Claw\reports\2026-03-18\ai-daily.md")
output_file.write_text(md, encoding='utf-8')
print(f"[OK] Markdown generated: {output_file}")
