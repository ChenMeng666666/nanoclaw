# Scrapling 网页爬虫技能

为 NanoClaw agents 提供网页爬取能力的 container skill。

## 主要特性

- **轻量级优先**：优先推荐使用 requests + BeautifulSoup4（稳定可靠）
- **多重方案**：提供 3 种不同的爬取方式，总有一个适用
- **自动安装**：通过 post-load hook 自动安装依赖

## 快速开始

### 在 agent 中使用

**使用 requests + BeautifulSoup4（推荐）**：

```python
import requests
from bs4 import BeautifulSoup

url = "https://example.com"
response = requests.get(url)
soup = BeautifulSoup(response.content, 'html.parser')

print(soup.title.string)
```

### 技能文件结构

```
scrapling/
├── SKILL.md              # 技能文档（agent 阅读的主要文档）
├── README.md             # 本文件（维护者文档）
├── hooks/
│   └── post-load.sh      # 加载钩子：自动检查/安装依赖
└── scripts/              # （保留，暂未使用）
```
