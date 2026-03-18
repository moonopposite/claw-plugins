#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AI 日报质量检查工具
检查生成的日报是否符合标准
用法: python3 quality_check.py reports/YYYY-MM-DD/ai-daily.md
"""

import sys
import re
import json
from pathlib import Path
from typing import Dict, List, Tuple

class QualityChecker:
    def __init__(self, md_file):
        self.md_file = Path(md_file)
        self.content = self.md_file.read_text(encoding='utf-8')
        self.issues = []
        self.warnings = []
        self.stats = {}
        
    def run_all_checks(self):
        """运行所有检查"""
        print(f"📋 开始检查: {self.md_file}")
        print("-" * 60)
        
        self.check_file_exists()
        self.check_structure()
        self.check_content_volume()
        self.check_link_validity()
        self.check_formatting()
        self.check_accuracy()
        self.check_date_timestamp()
        
        self.print_report()
        
    def check_file_exists(self):
        """检查文件是否存在"""
        if not self.md_file.exists():
            self.issues.append(f"❌ 文件不存在: {self.md_file}")
        else:
            print(f"✅ 文件存在: {self.md_file}")
            
    def check_structure(self):
        """检查文档结构"""
        print("\n📐 检查文档结构...")
        
        required_sections = {
            "📰 今日头条": False,
            "🔬 研究论文": False,
            "💰 行业商业": False,
            "🛠️ 工具应用": False,
            "📊 趋势洞察": False,
        }
        
        for section in required_sections:
            if section in self.content:
                required_sections[section] = True
        
        missing = [s for s, found in required_sections.items() if not found]
        
        if missing:
            self.warnings.append(f"⚠️  缺少版块: {', '.join(missing)}")
        else:
            print(f"✅ 所有必需版块齐全")
            
        # 检查重大发布和政策伦理
        optional_sections = {
            "🔥 重大发布": "重大发布",
            "🌍 政策伦理": "政策伦理",
        }
        
        for section, name in optional_sections.items():
            if section in self.content:
                print(f"✅ 包含 {name}")
            else:
                self.warnings.append(f"⚠️  缺少可选版块: {name}")
                
    def check_content_volume(self):
        """检查内容数量"""
        print("\n📊 检查内容数量...")
        
        # 计算各分类条目数
        sections = {
            "📰 今日头条": (3, 5),
            "🔥 重大发布": (3, 6),
            "🔬 研究论文": (8, 12),
            "💰 行业商业": (5, 8),
            "🛠️ 工具应用": (4, 7),
            "🌍 政策伦理": (2, 4),
            "🔥 社区热议": (8, 12),
        }
        
        total_items = 0
        
        for section, (min_count, max_count) in sections.items():
            # 提取该版块的内容
            pattern = rf"## {re.escape(section)}\n(.*?)(?=##|$)"
            match = re.search(pattern, self.content, re.DOTALL)
            
            if not match:
                continue
            
            section_content = match.group(1)
            
            # 计数列表项（以 "- **" 或 "1. **" 开头）
            item_count = len(re.findall(r'^\s*[-1-9]\.\s*\*\*', section_content, re.MULTILINE))
            
            self.stats[section] = item_count
            total_items += item_count
            
            status = "✅" if min_count <= item_count <= max_count else "⚠️"
            print(f"{status} {section}: {item_count} 条 (目标: {min_count}-{max_count})")
            
            if not (min_count <= item_count <= max_count):
                self.warnings.append(f"{section} 篇数不符范围: {item_count} (期望 {min_count}-{max_count})")
        
        print(f"\n📈 总条目数: {total_items} 条")
        
        if 45 <= total_items <= 88:  # 50±10%
            print("✅ 总条目数符合范围 (50±10%)")
            self.stats['total_items'] = total_items
        else:
            self.issues.append(f"❌ 总条目数 {total_items} 不符范围 (期望 50-80)")
            
    def check_link_validity(self):
        """检查链接有效性"""
        print("\n🔗 检查链接...")
        
        links = re.findall(r'\[([^\]]+)\]\(([^)]+)\)', self.content)
        
        invalid_links = []
        for text, url in links:
            # 基础验证
            if not url.startswith(('http://', 'https://', 'file://')):
                invalid_links.append(f"'{text}' -> '{url}'")
        
        if invalid_links:
            self.warnings.append(f"⚠️  发现可疑链接: {invalid_links[:3]}")
        else:
            print(f"✅ 检查了 {len(links)} 条链接，格式正确")
            self.stats['total_links'] = len(links)
            
    def check_formatting(self):
        """检查格式一致性"""
        print("\n🎨 检查格式一致性...")
        
        checks = [
            ("标题格式", r'^## [🔥📰🔬💰🛠️🌍📊]\s+', "## [emoji] title"),
            ("列表格式", r'^- \*\*', "- **title**"),
            ("链接格式", r'\[[^\]]+\]\([^)]+\)', "[text](url)"),
        ]
        
        for check_name, pattern, expected_format in checks:
            matches = len(re.findall(pattern, self.content, re.MULTILINE))
            if matches > 0:
                print(f"✅ {check_name}: 发现 {matches} 处")
            else:
                self.warnings.append(f"⚠️  未找到标准 {check_name}: {expected_format}")
        
        # 检查是否有不匹配的括号或引号
        mismatched = self.find_mismatched_brackets()
        if mismatched:
            self.issues.append(f"❌ 发现不匹配的括号/引号: {mismatched}")
        else:
            print("✅ 括号/引号匹配正确")
            
    def find_mismatched_brackets(self) -> List[str]:
        """查找不匹配的括号"""
        issues = []
        
        # 简单检查：每行的 [ 和 ] 是否成对
        for i, line in enumerate(self.content.split('\n'), 1):
            if line.count('[') != line.count(']'):
                issues.append(f"第 {i} 行: [ {line.count('[')} vs ] {line.count(']')}")
        
        return issues[:3]  # 只返回前 3 个
    
    def check_accuracy(self):
        """检查准确性（示例检查）"""
        print("\n✔️  检查准确性...")
        
        # 检查是否有"[链接]"而不是"[文字](url)"的格式
        broken_links = re.findall(r'\[([^\]]+)\](?!\()', self.content)
        
        if broken_links:
            self.warnings.append(f"⚠️  发现 {len(broken_links)} 处可能的链接错误")
        else:
            print("✅ 链接格式检查通过")
        
        # 检查是否包含"[暂时无内容]"等占位符
        placeholders = re.findall(r'\[(暂|待|TODO|FIXME|未|XXX)\w*\]', self.content)
        if placeholders:
            self.issues.append(f"❌ 发现占位符: {placeholders}")
        else:
            print("✅ 无占位符")
    
    def check_date_timestamp(self):
        """检查日期和时间戳"""
        print("\n📅 检查日期和时间戳...")
        
        # 检查文件名和标题中的日期是否一致
        filename_date = re.search(r'(\d{4})-(\d{2})-(\d{2})', str(self.md_file))
        title_date = re.search(r'(\d{4})-(\d{2})-(\d{2})', self.content)
        
        if filename_date and title_date:
            if filename_date.group(0) == title_date.group(0):
                print(f"✅ 日期一致: {filename_date.group(0)}")
                self.stats['date'] = filename_date.group(0)
            else:
                self.issues.append(f"❌ 日期不一致: 文件名 {filename_date.group(0)} vs 标题 {title_date.group(0)}")
        
        # 检查统计行
        stats_line = re.search(r'统计:\s*(.+)', self.content)
        if stats_line:
            print(f"✅ 包含统计行: {stats_line.group(1)[:40]}...")
        else:
            self.warnings.append("⚠️  缺少统计行")
    
    def print_report(self):
        """打印最终报告"""
        print("\n" + "=" * 60)
        print("📊 检查报告总结")
        print("=" * 60)
        
        if self.issues:
            print(f"\n❌ 错误 ({len(self.issues)}):")
            for issue in self.issues:
                print(f"  {issue}")
        else:
            print("\n✅ 无关键错误")
        
        if self.warnings:
            print(f"\n⚠️  警告 ({len(self.warnings)}):")
            for warning in self.warnings:
                print(f"  {warning}")
        else:
            print("\n✅ 无警告")
        
        print(f"\n📈 统计信息:")
        for key, value in self.stats.items():
            print(f"  {key}: {value}")
        
        print("\n" + "=" * 60)
        
        if self.issues:
            print("❌ 检查失败，请修正错误后重试")
            sys.exit(1)
        elif self.warnings:
            print("⚠️  检查通过但有警告，建议检查")
            sys.exit(0)
        else:
            print("✅ 检查全部通过！可以发布")
            sys.exit(0)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("用法: python3 quality_check.py <path/to/ai-daily.md>")
        sys.exit(1)
    
    checker = QualityChecker(sys.argv[1])
    checker.run_all_checks()
