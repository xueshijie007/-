# 题库练习独立站（GitHub Pages）

## 1. 生成题库数据
在项目根目录执行：

```powershell
python quiz_site/tools/build_questions_json.py
```

会从 `高校教师资格_两科合并_按题型` 读取题目并生成：

- `quiz_site/data/questions.json`

## 2. 本地预览
在项目根目录执行：

```powershell
python -m http.server 8000
```

浏览器打开：

- `http://localhost:8000/quiz_site/`

## 3. 发布到 GitHub Pages
1. 把 `quiz_site` 目录内容推到仓库根目录（或 `docs` 目录）。
2. 仓库 `Settings -> Pages` 选择对应分支和目录。
3. 等待发布完成，访问生成的 URL。

## 4. 功能
- 题型/科目筛选
- 随机出题
- 客观题点选、填空题输入
- 提交后立即显示对错和标准答案
- 上一题 / 下一题
- 统计：已答、答对、正确率
