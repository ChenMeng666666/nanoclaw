---
name: scrapling
description: Python 网页爬虫框架 - 支持静态/动态网页爬取、CSS/XPath 选择器、反爬虫绕过
trigger: 需要爬取网页内容、采集数据、提取网页信息时自动触发
tools: Bash(curl), Python
---

# Scrapling 网页爬虫技能

## 概述

Scrapling 是一个功能强大的 Python 网页爬虫框架，支持：
- 静态网页爬取（HTTP）
- 动态网页爬取（JavaScript 渲染）
- CSS/XPath 选择器
- 反爬虫绕过（隐身模式）

## 快速开始

### 检查安装

```bash
python3 -c "import scrapling" 2>/dev/null || python3 -m pip install -q scrapling
```

### 使用示例

**简单爬取**：
```python
from scrapling.fetchers import Fetcher

page = Fetcher.get("https://example.com")
print(page.status_code)
print(page.text[:200])
```

**CSS 选择器**：
```python
from scrapling.fetchers import Fetcher

page = Fetcher.get("https://example.com")
title = page.css("title::text").get()
links = page.css("a::attr(href)").getall()
print("Title:", title)
print("Links:", links[:5])
```

**XPath 选择器**：
```python
from scrapling.fetchers import Fetcher

page = Fetcher.get("https://example.com")
title = page.xpath("//title/text()").get()
print("Title:", title)
```

**隐身模式（反爬虫绕过）**：
```python
from scrapling.fetchers import StealthyFetcher

page = StealthyFetcher.get("https://example.com")
print(page.text[:200])
```

---

## 轻量级替代方案（推荐先尝试）

如果 Scrapling 安装有问题，或者只需要简单爬取，使用这两个更稳定的方案：

### 方案 1：使用 requests + BeautifulSoup4（推荐）

```bash
# 检查/安装
python3 -c "import requests, bs4" 2>/dev/null || python3 -m pip install -q requests beautifulsoup4
```

```python
import requests
from bs4 import BeautifulSoup

url = "https://example.com"
response = requests.get(url)
soup = BeautifulSoup(response.content, 'html.parser')

# 获取标题
print("Title:", soup.title.string)

# 获取所有链接
for link in soup.find_all('a', href=True):
    print(link['href'])

# 获取文本
print(soup.get_text()[:200])
```

### 方案 2：使用 requests + lxml（更快）

```bash
python3 -c "import requests, lxml" 2>/dev/null || python3 -m pip install -q requests lxml
```

```python
import requests
from lxml import html

url = "https://example.com"
response = requests.get(url)
tree = html.fromstring(response.content)

# XPath 选择器
title = tree.xpath("//title/text()")[0]
links = tree.xpath("//a/@href")
print("Title:", title)
print("Links:", links[:5])
```

### 方案 3：仅使用 cURL（最简单）

```bash
# 获取网页内容
curl -s "https://example.com" | head -n 20

# 提取标题（使用 grep/sed）
curl -s "https://example.com" | grep -o "<title>.*</title>" | sed 's/<title>\(.*\)<\/title>/\1/'
```

---

## 技能触发

当 agent 识别到以下场景时会自动触发：
- 需要收集网页数据
- 提取网页信息
- 解析 HTML/XML 内容

**提示词示例**：
> "帮我获取 example.com 的所有链接"
> "提取这个网页的标题和文本内容"
> "看看这个页面有什么内容"

---

## 推荐用法

**优先使用轻量级方案**：对于 99% 的场景，使用 **requests + BeautifulSoup** 就足够了，它更稳定、更易调试。

```bash
# 使用 Bash 方式快速调用
python3 - << 'EOF'
import requests
from bs4 import BeautifulSoup

url = "https://example.com"
response = requests.get(url)
soup = BeautifulSoup(response.content, 'html.parser')

print("=== Title ===")
print(soup.title.string)
print("\n=== Links ===")
for link in soup.find_all('a', href=True)[:10]:
    print(f"- {link['href']}")
print("\n=== Text ===")
print(soup.get_text()[:300])
EOF
```
